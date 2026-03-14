import type {
  PaneConfig,
  PaneState,
  PaneCreateConfig,
  WorkspaceState,
  RestoreMode,
  PaneStatus,
  PaneMeta,
  FileNode,
  FileDiff,
  FileActivity,
  SessionInfo,
} from '../types.ts'
import type { GitDiffResult } from '../git/GitService.ts'
import { PtyManager } from '../pty/PtyManager.ts'
import { ConfigManager } from './ConfigManager.ts'
import { WorktreeManager } from '../git/WorktreeManager.ts'
import { GitService } from '../git/GitService.ts'

let paneCounter = 0

function nextPaneId(): string {
  return `pane-${++paneCounter}`
}

export interface EventHandlers {
  onPaneAdded?: (pane: PaneState) => void
  onPaneRemoved?: (paneId: string) => void
  onPaneStatus?: (paneId: string, status: PaneStatus) => void
  onPaneMeta?: (paneId: string, meta: PaneMeta) => void
  onTerminalData?: (paneId: string, data: string) => void
  onPaneActivity?: (paneId: string, activity: FileActivity) => void
  onFileActivity?: (activity: FileActivity) => void
  onFileTree?: (tree: FileNode[]) => void
  onGitDiff?: (result: GitDiffResult) => void
  onPaneDiff?: (paneId: string, diffs: FileDiff[]) => void
}

type ListenerKey = keyof EventHandlers

export class WorkspaceManager {
  private panes = new Map<string, PaneState>()
  private ptyManager: PtyManager
  private configManager: ConfigManager
  private worktreeManager: WorktreeManager
  private perPaneGitServices = new Map<string, GitService>()
  private wsName = ''
  private wsDescription = ''

  // Multi-client event listener sets
  private listeners: { [K in ListenerKey]: Set<NonNullable<EventHandlers[K]>> } = {
    onPaneAdded: new Set(),
    onPaneRemoved: new Set(),
    onPaneStatus: new Set(),
    onPaneMeta: new Set(),
    onTerminalData: new Set(),
    onPaneActivity: new Set(),
    onFileActivity: new Set(),
    onFileTree: new Set(),
    onGitDiff: new Set(),
    onPaneDiff: new Set(),
  }

  constructor(configManager: ConfigManager) {
    this.configManager = configManager
    this.ptyManager = new PtyManager(configManager)
    this.worktreeManager = new WorktreeManager(configManager.getProjectDir())
  }

  init(): void {
    const wsConfig = this.configManager.initWorkspace()
    this.wsName = wsConfig.name
    this.wsDescription = wsConfig.description || ''
    if (!Array.isArray(wsConfig.panes)) wsConfig.panes = []

    // Sync paneCounter to avoid id collisions with restored panes
    for (const p of wsConfig.panes) {
      const match = p.id.match(/^pane-(\d+)$/)
      if (match) {
        const num = parseInt(match[1], 10)
        if (num >= paneCounter) paneCounter = num
      }
    }

    // Restore panes from config (skip failures — stale panes from previous sessions)
    // Auto-resume: if a pane has a saved sessionId, always use --resume regardless of original restore mode
    let failCount = 0
    for (const paneConfig of wsConfig.panes) {
      if (paneConfig.sessionId && paneConfig.agent !== '__shell__') {
        paneConfig.restore = 'resume'
      }
      try {
        this.spawnPane(paneConfig)
      } catch (err) {
        console.warn(`Skipping stale pane ${paneConfig.id} (${paneConfig.name}):`, (err as Error).message)
        failCount++
      }
    }
    // Clean stale panes from config if any failed
    if (failCount > 0) {
      wsConfig.panes = wsConfig.panes.filter((p) => this.panes.has(p.id))
      this.configManager.saveWorkspaceConfig(wsConfig)
    }
  }

  getState(): WorkspaceState {
    return {
      name: this.wsName,
      description: this.wsDescription,
      projectDir: this.configManager.getProjectDir(),
      panes: Array.from(this.panes.values()),
    }
  }

  getPanes(): PaneState[] {
    return Array.from(this.panes.values())
  }

  async createPane(createConfig: PaneCreateConfig): Promise<PaneState> {
    const isShell = createConfig.agent === '__shell__'
    const id = isShell ? '__shell__' : nextPaneId()
    const isolation = createConfig.isolation || 'shared'

    // Extract cols/rows (transient, not persisted in PaneConfig)
    const { cols, rows, ...rest } = createConfig

    const config: PaneConfig = {
      id,
      ...rest,
      yolo: rest.yolo || false,
      isolation,
      sessionId: rest.sessionId,
    }

    // Create worktree if requested
    if (isolation === 'worktree' && !isShell) {
      try {
        const { worktreePath, branch } = await this.worktreeManager.create(id, createConfig.name)
        config.worktreePath = worktreePath
        config.branch = branch
      } catch (err) {
        console.error(`Failed to create worktree for pane ${id}:`, err)
        throw err
      }
    }

    try {
      const pane = this.spawnPane(config, cols, rows)

      // Start per-pane git service for worktree panes
      if (isolation === 'worktree' && config.worktreePath) {
        await this.startPaneGitService(id, config.worktreePath)
      }

      // Don't persist the bottom shell pane to workspace config
      if (!isShell) {
        this.persistPaneConfig(config)
      }
      return pane
    } catch (err) {
      // Clean up worktree on spawn failure
      if (isolation === 'worktree') {
        await this.worktreeManager.removeWithBranch(id)
      }
      console.error(`Failed to create pane ${id}:`, err)
      throw err
    }
  }

  async closePane(paneId: string): Promise<void> {
    const pane = this.panes.get(paneId)
    this.ptyManager.kill(paneId)

    // Clean up worktree resources
    if (pane?.isolation === 'worktree') {
      this.stopPaneGitService(paneId)
      await this.worktreeManager.remove(paneId)
    }

    this.panes.delete(paneId)
    this.emit('onPaneRemoved', paneId)
    this.removePaneFromConfig(paneId)
  }

  restartPane(paneId: string, mode: RestoreMode, sessionId?: string): void {
    const existingState = this.panes.get(paneId)
    if (!existingState) return

    this.ptyManager.kill(paneId)

    // For resume mode, use the provided sessionId or fall back to the last known one
    const resolvedSessionId = mode === 'resume'
      ? (sessionId || existingState.sessionId || existingState.meta.sessionId)
      : undefined

    const config: PaneConfig = {
      id: paneId,
      name: existingState.name,
      agent: existingState.agent,
      workdir: existingState.workdir,
      task: existingState.task,
      restore: mode,
      isolation: existingState.isolation,
      yolo: existingState.yolo || false,
      worktreePath: existingState.worktreePath,
      branch: existingState.branch,
      sessionId: resolvedSessionId,
    }

    this.spawnPane(config)
    this.updatePaneConfigSessionId(paneId, resolvedSessionId)
  }

  writeToPane(paneId: string, data: string): void {
    this.ptyManager.write(paneId, data)
  }

  resizePane(paneId: string, cols: number, rows: number): void {
    this.ptyManager.resize(paneId, cols, rows)
  }

  getScrollback(paneId: string): string {
    return this.ptyManager.getScrollback(paneId)
  }

  // ─── Event Registration (multi-client safe) ────────────────

  /**
   * Register event handlers for a client. Returns a cleanup function
   * that removes only this client's handlers.
   */
  onEvents(handlers: EventHandlers): () => void {
    const cleanups: Array<() => void> = []

    for (const key of Object.keys(handlers) as ListenerKey[]) {
      const handler = handlers[key]
      if (handler) {
        const set = this.listeners[key] as Set<typeof handler>
        set.add(handler)
        cleanups.push(() => set.delete(handler))
      }
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup()
      }
    }
  }

  // Broadcast events (called by services)
  emitFileTree(tree: FileNode[]): void {
    this.emit('onFileTree', tree)
  }

  emitGitDiff(result: GitDiffResult): void {
    this.emit('onGitDiff', result)
  }

  emitFileActivity(activity: FileActivity): void {
    this.emit('onFileActivity', activity)
  }

  async refreshPaneDiff(paneId: string): Promise<void> {
    const gitService = this.perPaneGitServices.get(paneId)
    if (gitService) {
      await gitService.refresh()
    }
  }

  /**
   * Get current per-pane diffs (for initial sync on WS connect).
   */
  getPaneDiffs(): Map<string, FileDiff[]> {
    const result = new Map<string, FileDiff[]>()
    for (const [paneId, gitService] of this.perPaneGitServices) {
      result.set(paneId, gitService.getCurrentDiffs().unstaged)
    }
    return result
  }

  // ─── Internal ─────────────────────────────────────────────

  private emit<K extends ListenerKey>(key: K, ...args: Parameters<NonNullable<EventHandlers[K]>>): void {
    const set = this.listeners[key] as Set<(...a: typeof args) => void>
    for (const listener of set) {
      listener(...args)
    }
  }

  private spawnPane(config: PaneConfig, cols?: number, rows?: number): PaneState {
    const pid = this.ptyManager.spawn(config.id, config, cols || 80, rows || 24)

    const pane: PaneState = {
      id: config.id,
      name: config.name,
      agent: config.agent,
      workdir: config.workdir,
      task: config.task,
      restore: config.restore,
      isolation: config.isolation || 'shared',
      yolo: config.yolo || false,
      branch: config.branch,
      worktreePath: config.worktreePath,
      sessionId: config.sessionId,
      status: 'running',
      pid,
      meta: {},
      startedAt: new Date().toISOString(),
    }

    this.panes.set(config.id, pane)
    this.emit('onPaneAdded', pane)

    // Wire up PTY events
    this.ptyManager.onData(config.id, (data) => {
      this.emit('onTerminalData', config.id, data)
    })

    this.ptyManager.onStatus(config.id, (status) => {
      const p = this.panes.get(config.id)
      if (p) {
        p.status = status
        this.emit('onPaneStatus', config.id, status)
      }
    })

    this.ptyManager.onMeta(config.id, (meta) => {
      const p = this.panes.get(config.id)
      if (p) {
        p.meta = meta
        // Persist sessionId from statusline to PaneState and config.yaml for auto-resume
        if (meta.sessionId && meta.sessionId !== p.sessionId) {
          p.sessionId = meta.sessionId
          this.updatePaneConfigSessionId(config.id, meta.sessionId)
        }
        this.emit('onPaneMeta', config.id, meta)
      }
    })

    this.ptyManager.onActivity(config.id, (activity) => {
      this.emit('onPaneActivity', config.id, activity)
    })

    return pane
  }

  private async startPaneGitService(paneId: string, worktreePath: string): Promise<void> {
    const gitService = new GitService(worktreePath)
    gitService.onDiffChange((result) => {
      // Tag each unstaged diff with the paneId (worktree panes show unstaged only)
      const tagged = result.unstaged.map((d) => ({ ...d, paneId }))
      this.emit('onPaneDiff', paneId, tagged)
    })
    await gitService.start()
    this.perPaneGitServices.set(paneId, gitService)
  }

  private stopPaneGitService(paneId: string): void {
    const gitService = this.perPaneGitServices.get(paneId)
    if (gitService) {
      gitService.close()
      this.perPaneGitServices.delete(paneId)
    }
  }

  private persistPaneConfig(config: PaneConfig): void {
    const wsConfig = this.configManager.loadWorkspaceConfig()
    if (wsConfig) {
      wsConfig.panes.push(config)
      this.configManager.saveWorkspaceConfig(wsConfig)
    }
  }

  private updatePaneConfigSessionId(paneId: string, sessionId?: string): void {
    const wsConfig = this.configManager.loadWorkspaceConfig()
    if (wsConfig) {
      const paneConfig = wsConfig.panes.find((p) => p.id === paneId)
      if (paneConfig) {
        paneConfig.sessionId = sessionId
        this.configManager.saveWorkspaceConfig(wsConfig)
      }
    }
  }

  getSessionList(paneId?: string): SessionInfo[] {
    const sessions: SessionInfo[] = []
    for (const pane of this.panes.values()) {
      if (pane.agent === '__shell__') continue
      if (paneId && pane.id !== paneId) continue
      if (pane.meta.sessionId || pane.sessionId) {
        sessions.push({
          sessionId: (pane.meta.sessionId || pane.sessionId)!,
          paneId: pane.id,
          paneName: pane.name,
          agent: pane.agent,
          timestamp: pane.startedAt || new Date().toISOString(),
          costUsd: pane.meta.costUsd,
          contextUsedPct: pane.meta.contextUsedPct,
          model: pane.meta.model,
        })
      }
    }
    // Also include sessions from config that aren't currently running
    const wsConfig = this.configManager.loadWorkspaceConfig()
    if (wsConfig) {
      for (const pc of wsConfig.panes) {
        if (pc.sessionId && !sessions.find((s) => s.sessionId === pc.sessionId)) {
          if (paneId && pc.id !== paneId) continue
          sessions.push({
            sessionId: pc.sessionId,
            paneId: pc.id,
            paneName: pc.name,
            agent: pc.agent,
            timestamp: '',
          })
        }
      }
    }
    return sessions
  }

  private removePaneFromConfig(paneId: string): void {
    const wsConfig = this.configManager.loadWorkspaceConfig()
    if (wsConfig) {
      wsConfig.panes = wsConfig.panes.filter((p) => p.id !== paneId)
      this.configManager.saveWorkspaceConfig(wsConfig)
    }
  }

  async shutdown(): Promise<void> {
    this.ptyManager.killAll()
    // Close per-pane git services
    for (const [paneId] of this.perPaneGitServices) {
      this.stopPaneGitService(paneId)
    }
    // Clean up worktrees
    await this.worktreeManager.removeAll()
  }
}

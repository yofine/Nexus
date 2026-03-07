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
} from '../types.ts'
import { PtyManager } from '../pty/PtyManager.ts'
import { ConfigManager } from './ConfigManager.ts'

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
  onFileTree?: (tree: FileNode[]) => void
  onGitDiff?: (diffs: FileDiff[]) => void
}

type ListenerKey = keyof EventHandlers

export class WorkspaceManager {
  private panes = new Map<string, PaneState>()
  private ptyManager: PtyManager
  private configManager: ConfigManager
  private wsName = ''
  private wsDescription = ''

  // Multi-client event listener sets
  private listeners: { [K in ListenerKey]: Set<NonNullable<EventHandlers[K]>> } = {
    onPaneAdded: new Set(),
    onPaneRemoved: new Set(),
    onPaneStatus: new Set(),
    onPaneMeta: new Set(),
    onTerminalData: new Set(),
    onFileTree: new Set(),
    onGitDiff: new Set(),
  }

  constructor(configManager: ConfigManager) {
    this.configManager = configManager
    this.ptyManager = new PtyManager(configManager)
  }

  init(): void {
    const wsConfig = this.configManager.initWorkspace()
    this.wsName = wsConfig.name
    this.wsDescription = wsConfig.description || ''

    // Spawn panes from config
    for (const paneConfig of wsConfig.panes) {
      this.spawnPane(paneConfig)
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

  createPane(createConfig: PaneCreateConfig): PaneState {
    const id = nextPaneId()
    const config: PaneConfig = {
      id,
      ...createConfig,
    }

    const pane = this.spawnPane(config)
    this.persistPaneConfig(config)
    return pane
  }

  closePane(paneId: string): void {
    this.ptyManager.kill(paneId)
    this.panes.delete(paneId)
    this.emit('onPaneRemoved', paneId)
    this.removePaneFromConfig(paneId)
  }

  restartPane(paneId: string, mode: RestoreMode): void {
    const existingState = this.panes.get(paneId)
    if (!existingState) return

    this.ptyManager.kill(paneId)

    const config: PaneConfig = {
      id: paneId,
      name: existingState.name,
      agent: existingState.agent,
      workdir: existingState.workdir,
      task: existingState.task,
      restore: mode,
    }

    this.spawnPane(config)
  }

  writeToPane(paneId: string, data: string): void {
    this.ptyManager.write(paneId, data)
  }

  resizePane(paneId: string, cols: number, rows: number): void {
    this.ptyManager.resize(paneId, cols, rows)
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

  emitGitDiff(diffs: FileDiff[]): void {
    this.emit('onGitDiff', diffs)
  }

  // ─── Internal ─────────────────────────────────────────────

  private emit<K extends ListenerKey>(key: K, ...args: Parameters<NonNullable<EventHandlers[K]>>): void {
    const set = this.listeners[key] as Set<(...a: typeof args) => void>
    for (const listener of set) {
      listener(...args)
    }
  }

  private spawnPane(config: PaneConfig): PaneState {
    const pid = this.ptyManager.spawn(config.id, config)

    const pane: PaneState = {
      id: config.id,
      name: config.name,
      agent: config.agent,
      workdir: config.workdir,
      task: config.task,
      restore: config.restore,
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
        this.emit('onPaneMeta', config.id, meta)
      }
    })

    return pane
  }

  private persistPaneConfig(config: PaneConfig): void {
    const wsConfig = this.configManager.loadWorkspaceConfig()
    if (wsConfig) {
      wsConfig.panes.push(config)
      this.configManager.saveWorkspaceConfig(wsConfig)
    }
  }

  private removePaneFromConfig(paneId: string): void {
    const wsConfig = this.configManager.loadWorkspaceConfig()
    if (wsConfig) {
      wsConfig.panes = wsConfig.panes.filter((p) => p.id !== paneId)
      this.configManager.saveWorkspaceConfig(wsConfig)
    }
  }

  shutdown(): void {
    this.ptyManager.killAll()
  }
}

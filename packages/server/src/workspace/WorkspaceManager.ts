import type {
  PaneConfig,
  PaneState,
  PaneCreateConfig,
  WorkspaceState,
  RestoreMode,
  PaneStatus,
  PaneMeta,
} from '../types.ts'
import { PtyManager } from '../pty/PtyManager.ts'
import { ConfigManager } from './ConfigManager.ts'

let paneCounter = 0

function nextPaneId(): string {
  return `pane-${++paneCounter}`
}

export class WorkspaceManager {
  private panes = new Map<string, PaneState>()
  private ptyManager: PtyManager
  private configManager: ConfigManager
  private wsName = ''
  private wsDescription = ''

  // Event callbacks for broadcasting to WS clients
  private onPaneAdded?: (pane: PaneState) => void
  private onPaneRemoved?: (paneId: string) => void
  private onPaneStatus?: (paneId: string, status: PaneStatus) => void
  private onPaneMeta?: (paneId: string, meta: PaneMeta) => void
  private onTerminalData?: (paneId: string, data: string) => void

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

  createPane(createConfig: PaneCreateConfig): PaneState {
    const id = nextPaneId()
    const config: PaneConfig = {
      id,
      ...createConfig,
    }

    const pane = this.spawnPane(config)

    // Persist to workspace config
    this.persistPaneConfig(config)

    return pane
  }

  closePane(paneId: string): void {
    this.ptyManager.kill(paneId)
    this.panes.delete(paneId)
    this.onPaneRemoved?.(paneId)
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

  // ─── Event Registration ───────────────────────────────────

  onEvents(handlers: {
    onPaneAdded?: (pane: PaneState) => void
    onPaneRemoved?: (paneId: string) => void
    onPaneStatus?: (paneId: string, status: PaneStatus) => void
    onPaneMeta?: (paneId: string, meta: PaneMeta) => void
    onTerminalData?: (paneId: string, data: string) => void
  }): void {
    this.onPaneAdded = handlers.onPaneAdded
    this.onPaneRemoved = handlers.onPaneRemoved
    this.onPaneStatus = handlers.onPaneStatus
    this.onPaneMeta = handlers.onPaneMeta
    this.onTerminalData = handlers.onTerminalData
  }

  // ─── Internal ─────────────────────────────────────────────

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
    this.onPaneAdded?.(pane)

    // Wire up PTY events
    this.ptyManager.onData(config.id, (data) => {
      this.onTerminalData?.(config.id, data)
    })

    this.ptyManager.onStatus(config.id, (status) => {
      const p = this.panes.get(config.id)
      if (p) {
        p.status = status
        this.onPaneStatus?.(config.id, status)
      }
    })

    this.ptyManager.onMeta(config.id, (meta) => {
      const p = this.panes.get(config.id)
      if (p) {
        p.meta = meta
        this.onPaneMeta?.(config.id, meta)
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

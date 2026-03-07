// ─── Pane & Agent Types ─────────────────────────────────────

export type PaneStatus = 'running' | 'waiting' | 'idle' | 'stopped' | 'error'
export type RestoreMode = 'continue' | 'restart' | 'manual'
export type AgentType = 'claudecode' | 'opencode' | 'kimi-cli' | 'qwencode'

export interface PaneMeta {
  model?: string
  contextUsedPct?: number
  costUsd?: number
  sessionId?: string
  cwd?: string
}

export interface PaneState {
  id: string
  name: string
  agent: AgentType
  workdir?: string
  task?: string
  restore: RestoreMode
  status: PaneStatus
  pid?: number
  meta: PaneMeta
  startedAt?: string
}

export interface WorkspaceState {
  name: string
  description?: string
  projectDir: string
  panes: PaneState[]
}

// ─── WebSocket Protocol ─────────────────────────────────────

// Client → Server
export type ClientEvent =
  | { type: 'terminal.input'; paneId: string; data: string }
  | { type: 'terminal.resize'; paneId: string; cols: number; rows: number }
  | { type: 'pane.create'; config: PaneCreateConfig }
  | { type: 'pane.close'; paneId: string }
  | { type: 'pane.restart'; paneId: string; mode: RestoreMode }
  | { type: 'broadcast.send'; groupId: string; message: string }
  | { type: 'task.dispatch'; tasks: TaskItem[] }
  | { type: 'review.comment'; paneId: string; comment: ReviewComment }
  | { type: 'git.refresh' }
  | { type: 'workspace.save' }

// Server → Client
export type ServerEvent =
  | { type: 'terminal.output'; paneId: string; data: string }
  | { type: 'pane.status'; paneId: string; status: PaneStatus }
  | { type: 'pane.meta'; paneId: string; meta: PaneMeta }
  | { type: 'pane.added'; pane: PaneState }
  | { type: 'pane.removed'; paneId: string }
  | { type: 'fs.tree'; tree: FileNode[] }
  | { type: 'git.diff'; diff: FileDiff[] }
  | { type: 'workspace.state'; state: WorkspaceState }

// ─── Supporting Types ───────────────────────────────────────

export interface PaneCreateConfig {
  name: string
  agent: AgentType
  workdir?: string
  task?: string
  restore: RestoreMode
}

export interface ReviewComment {
  file: string
  line: number
  content: string
}

export interface TaskItem {
  agentType: AgentType
  workdir?: string
  task: string
  createNewPane: boolean
  paneId?: string
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

export interface FileDiff {
  file: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  hunks: string
}

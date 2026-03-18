// ─── Pane & Agent Types ─────────────────────────────────────

export type PaneStatus = 'running' | 'waiting' | 'idle' | 'stopped' | 'error'
export type RestoreMode = 'continue' | 'restart' | 'manual' | 'resume'
export type AgentType = 'claudecode' | 'codex' | 'opencode' | 'kimi-cli' | 'qodercli' | '__shell__'
export type IsolationMode = 'shared' | 'worktree'

export interface PaneMeta {
  model?: string
  contextUsedPct?: number
  costUsd?: number
  sessionId?: string
  cwd?: string
}

export type FileAction = 'read' | 'edit' | 'write' | 'create' | 'delete' | 'bash'

export interface FileActivity {
  file: string
  action: FileAction
  timestamp: number
  diff?: string   // unified diff snapshot captured at the moment of change
}

export interface PaneState {
  id: string
  name: string
  agent: AgentType
  workdir?: string
  task?: string
  restore: RestoreMode
  isolation: IsolationMode
  yolo?: boolean
  branch?: string
  worktreePath?: string
  sessionId?: string
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
  | { type: 'pane.restart'; paneId: string; mode: RestoreMode; sessionId?: string }
  | { type: 'broadcast.send'; groupId: string; message: string }
  | { type: 'task.dispatch'; tasks: TaskItem[] }
  | { type: 'review.comment'; paneId: string; comment: ReviewComment }
  | { type: 'git.refresh' }
  | { type: 'git.accept'; file: string }
  | { type: 'git.accept.all' }
  | { type: 'git.discard'; file: string }
  | { type: 'git.discard.all' }
  | { type: 'git.unstage'; file: string }
  | { type: 'git.unstage.all' }
  | { type: 'git.commit'; message: string }
  | { type: 'git.push' }
  | { type: 'pane.merge'; paneId: string }
  | { type: 'pane.discard'; paneId: string }
  | { type: 'pane.diff.refresh'; paneId: string }
  | { type: 'workspace.save' }
  | { type: 'session.list'; paneId?: string }

// Server → Client
export type ServerEvent =
  | { type: 'terminal.output'; paneId: string; data: string }
  | { type: 'pane.status'; paneId: string; status: PaneStatus }
  | { type: 'pane.meta'; paneId: string; meta: PaneMeta }
  | { type: 'pane.added'; pane: PaneState }
  | { type: 'pane.removed'; paneId: string }
  | { type: 'fs.tree'; tree: FileNode[] }
  | { type: 'git.diff'; unstaged: FileDiff[]; staged: FileDiff[] }
  | { type: 'git.result'; action: string; success: boolean; message: string }
  | { type: 'git.branchInfo'; branch: string; remote?: string; ahead: number; behind: number }
  | { type: 'pane.diff'; paneId: string; diffs: FileDiff[] }
  | { type: 'pane.merge.result'; paneId: string; success: boolean; message: string }
  | { type: 'pane.activity'; paneId: string; activity: FileActivity }
  | { type: 'file.activity'; activity: FileActivity }
  | { type: 'workspace.state'; state: WorkspaceState }
  | { type: 'session.list'; paneId?: string; sessions: SessionInfo[] }

// ─── Supporting Types ───────────────────────────────────────

export interface PaneCreateConfig {
  name: string
  agent: AgentType
  workdir?: string
  task?: string
  restore: RestoreMode
  isolation?: IsolationMode
  yolo?: boolean
  sessionId?: string
  cols?: number
  rows?: number
}

export interface DiscoveredSession {
  sessionId: string
  summary?: string
  model?: string
  costUsd?: number
  numTurns?: number
  createdAt?: string
  updatedAt?: string
  projectPath?: string
  source: 'nexus' | 'external'
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
  paneId?: string
}

export interface SessionInfo {
  sessionId: string
  paneId: string
  paneName: string
  agent: AgentType
  timestamp: string
  costUsd?: number
  contextUsedPct?: number
  model?: string
}

export interface AgentAvailability {
  installed: boolean
  bin: string
  installHint: string
}

// ─── Dependency Graph Types ─────────────────────────────────

export interface DepNode {
  id: string        // relative file path
  imports: string[] // resolved relative paths this file imports
}

export interface DepGraph {
  nodes: DepNode[]
  root: string
}

// ─── Config Types ──────────────────────────────────────────

export interface GlobalConfig {
  version: string
  defaults: {
    shell: string
    scrollback_lines: number
    grid_columns: number
    history_retention_days: number
    theme: string
  }
  agents: Record<string, AgentDefinition>
}

export interface AgentDefinition {
  bin: string
  continue_flag: string
  resume_flag?: string
  yolo_flag?: string
  statusline: boolean
  env?: Record<string, string>
}

// ─── Replay Types ────────────────────────────────────────────

export type ReplayEventType = 'terminal' | 'status' | 'meta' | 'activity'

export interface ReplayEvent {
  t: number
  type: ReplayEventType
  paneId: string
  data?: string
  status?: PaneStatus
  meta?: PaneMeta
  activity?: FileActivity
}

export interface ReplayTurn {
  id: string
  paneId: string
  paneName: string
  agent: AgentType
  startedAt: number
  endedAt: number | null
  task?: string
  events: ReplayEvent[]
  summary: {
    filesRead: number
    filesEdited: number
    filesCreated: number
    terminalBytes: number
    durationMs: number
  }
}

export interface ReplaySession {
  id: string
  startedAt: number
  endedAt: number | null
  projectDir: string
  projectName: string
  panes: Array<{
    id: string
    name: string
    agent: AgentType
    task?: string
  }>
  turns: ReplayTurn[]
}

export interface ReplaySessionSummary {
  id: string
  startedAt: number
  endedAt: number | null
  projectName: string
  turnCount: number
  paneCount: number
  totalDurationMs: number
}

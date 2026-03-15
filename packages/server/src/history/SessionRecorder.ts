import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import type {
  PaneState,
  PaneStatus,
  PaneMeta,
  FileActivity,
  AgentType,
  ReplayEvent,
  ReplayTurn,
  ReplaySession,
  ReplaySessionSummary,
} from '../types.ts'

/**
 * SessionRecorder records workspace events into Turn-based replay files.
 *
 * Structure:
 *   .nexus/history/
 *     sessions.json          — array of session summaries (index)
 *     session-<id>/
 *       session.json         — full session metadata (panes, timing)
 *       turn-<id>.json       — one file per turn (events array)
 *
 * A "Turn" is one idle→running→idle cycle of an agent pane.
 * Terminal output is sampled (batched per 200ms) to keep file sizes sane.
 */

const HISTORY_DIR = '.nexus/history'
const SESSIONS_INDEX = 'sessions.json'
const TERMINAL_BATCH_MS = 200
const MAX_TERMINAL_BYTES_PER_TURN = 256 * 1024 // 256KB cap per turn
const MAX_SESSIONS = 50

interface ActiveTurn {
  turn: ReplayTurn
  terminalBuffer: string
  terminalFlushTimer: ReturnType<typeof setTimeout> | null
  terminalBytes: number
  filesRead: Set<string>
  filesEdited: Set<string>
  filesCreated: Set<string>
}

export class SessionRecorder {
  private projectDir: string
  private session: ReplaySession
  private sessionDir: string
  private activeTurns = new Map<string, ActiveTurn>() // paneId -> current turn
  private turnCounter = 0
  private retentionDays: number

  constructor(projectDir: string, projectName: string, retentionDays = 30) {
    this.projectDir = projectDir
    const sessionId = `s-${Date.now()}`
    this.sessionDir = path.join(projectDir, HISTORY_DIR, sessionId)
    fs.mkdirSync(this.sessionDir, { recursive: true })

    this.retentionDays = retentionDays

    this.session = {
      id: sessionId,
      startedAt: Date.now(),
      endedAt: null,
      projectDir,
      projectName,
      panes: [],
      turns: [], // lightweight refs only — full data in turn files
    }
  }

  // ─── Event Hooks (called by WorkspaceManager wiring) ─────

  onPaneAdded(pane: PaneState): void {
    if (pane.agent === '__shell__') return
    const exists = this.session.panes.find((p) => p.id === pane.id)
    if (!exists) {
      this.session.panes.push({
        id: pane.id,
        name: pane.name,
        agent: pane.agent,
        task: pane.task,
      })
    }
    // A new pane in 'running' state starts a turn immediately
    if (pane.status === 'running') {
      this.startTurn(pane.id, pane.name, pane.agent, pane.task)
    }
  }

  onPaneRemoved(paneId: string): void {
    this.endTurn(paneId)
  }

  onPaneStatus(paneId: string, status: PaneStatus, pane?: PaneState): void {
    if (!pane || pane.agent === '__shell__') return

    const active = this.activeTurns.get(paneId)

    if (status === 'running' && !active) {
      // idle → running: start a new turn
      this.startTurn(paneId, pane.name, pane.agent, pane.task)
    } else if ((status === 'idle' || status === 'stopped' || status === 'error') && active) {
      // running → idle/stopped/error: end the turn
      this.recordStatusEvent(paneId, status)
      this.endTurn(paneId)
    } else if (active) {
      // intermediate status change (e.g. running → waiting → running)
      this.recordStatusEvent(paneId, status)
    }
  }

  onPaneMeta(paneId: string, meta: PaneMeta): void {
    const active = this.activeTurns.get(paneId)
    if (!active) return

    const event: ReplayEvent = {
      t: Date.now() - active.turn.startedAt,
      type: 'meta',
      paneId,
      meta,
    }
    active.turn.events.push(event)
  }

  onTerminalData(paneId: string, data: string): void {
    const active = this.activeTurns.get(paneId)
    if (!active) return

    // Cap terminal data per turn
    if (active.terminalBytes >= MAX_TERMINAL_BYTES_PER_TURN) return

    active.terminalBuffer += data
    active.terminalBytes += data.length

    // Batch terminal writes to reduce event count
    if (!active.terminalFlushTimer) {
      active.terminalFlushTimer = setTimeout(() => {
        this.flushTerminalBuffer(paneId)
      }, TERMINAL_BATCH_MS)
    }
  }

  onPaneActivity(paneId: string, activity: FileActivity): void {
    const active = this.activeTurns.get(paneId)
    if (!active) return

    const event: ReplayEvent = {
      t: Date.now() - active.turn.startedAt,
      type: 'activity',
      paneId,
      activity: { ...activity },
    }
    active.turn.events.push(event)

    // Track summary
    switch (activity.action) {
      case 'read':
        active.filesRead.add(activity.file)
        break
      case 'edit':
      case 'write':
        active.filesEdited.add(activity.file)
        break
      case 'create':
        active.filesCreated.add(activity.file)
        break
    }

    // Async capture diff for write operations
    if (activity.action === 'edit' || activity.action === 'write' || activity.action === 'create') {
      this.captureDiff(activity.file).then((diff) => {
        if (diff) {
          event.activity = { ...event.activity!, diff }
        }
      }).catch(() => { /* ignore diff capture failures */ })
    }
  }

  /** Also accept file-level activity (from FsWatcher) attributed to the most recently active pane */
  onFileActivityForReplay(activity: FileActivity): void {
    // Try to attribute to any active turn (prefer most recent)
    if (this.activeTurns.size === 0) return

    // If only one active turn, attribute to it; otherwise skip (ambiguous)
    if (this.activeTurns.size !== 1) return

    const [paneId, active] = [...this.activeTurns.entries()][0]

    // Skip if this file was already recorded by pane activity within 2s
    let recentActivity: ReplayEvent | undefined
    for (let i = active.turn.events.length - 1; i >= 0; i--) {
      const e = active.turn.events[i]
      if (e.type === 'activity' && e.activity?.file === activity.file) {
        recentActivity = e
        break
      }
    }
    if (recentActivity && (Date.now() - active.turn.startedAt - recentActivity.t) < 2000) return

    const event: ReplayEvent = {
      t: Date.now() - active.turn.startedAt,
      type: 'activity',
      paneId,
      activity: { ...activity },
    }
    active.turn.events.push(event)

    // Capture diff
    if (activity.action === 'edit' || activity.action === 'create') {
      this.captureDiff(activity.file).then((diff) => {
        if (diff) {
          event.activity = { ...event.activity!, diff }
        }
      }).catch(() => {})
    }
  }

  // ─── Session Lifecycle ────────────────────────────────────

  /** Flush all active turns and write session index. Called on shutdown. */
  flush(): void {
    // End all active turns
    for (const paneId of [...this.activeTurns.keys()]) {
      this.endTurn(paneId)
    }

    this.session.endedAt = Date.now()
    this.writeSessionFile()
    this.updateSessionsIndex()
  }

  // ─── Query API ────────────────────────────────────────────

  static listSessions(projectDir: string): ReplaySessionSummary[] {
    const indexPath = path.join(projectDir, HISTORY_DIR, SESSIONS_INDEX)
    if (!fs.existsSync(indexPath)) return []
    try {
      const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
      return Array.isArray(data) ? data : []
    } catch {
      return []
    }
  }

  static getSession(projectDir: string, sessionId: string): ReplaySession | null {
    const sessionPath = path.join(projectDir, HISTORY_DIR, sessionId, 'session.json')
    if (!fs.existsSync(sessionPath)) return null
    try {
      return JSON.parse(fs.readFileSync(sessionPath, 'utf-8'))
    } catch {
      return null
    }
  }

  static getTurn(projectDir: string, sessionId: string, turnId: string): ReplayTurn | null {
    const turnPath = path.join(projectDir, HISTORY_DIR, sessionId, `${turnId}.json`)
    if (!fs.existsSync(turnPath)) return null
    try {
      return JSON.parse(fs.readFileSync(turnPath, 'utf-8'))
    } catch {
      return null
    }
  }

  /** Delete a single session and its directory. Returns true if deleted. */
  static deleteSession(projectDir: string, sessionId: string): boolean {
    // Remove session directory
    const sessionDir = path.join(projectDir, HISTORY_DIR, sessionId)
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true })
    }

    // Remove from index
    const indexPath = path.join(projectDir, HISTORY_DIR, SESSIONS_INDEX)
    if (fs.existsSync(indexPath)) {
      try {
        let sessions: ReplaySessionSummary[] = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
        const before = sessions.length
        sessions = sessions.filter(s => s.id !== sessionId)
        if (sessions.length < before) {
          fs.writeFileSync(indexPath, JSON.stringify(sessions, null, 2))
          return true
        }
      } catch { /* ignore */ }
    }
    return false
  }

  /** Delete all sessions. Returns the number of sessions deleted. */
  static deleteAllSessions(projectDir: string): number {
    const sessions = SessionRecorder.listSessions(projectDir)
    let count = 0
    for (const session of sessions) {
      const sessionDir = path.join(projectDir, HISTORY_DIR, session.id)
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true })
        count++
      }
    }
    // Reset index
    const indexPath = path.join(projectDir, HISTORY_DIR, SESSIONS_INDEX)
    fs.writeFileSync(indexPath, JSON.stringify([], null, 2))
    return count
  }

  /**
   * Passive cleanup: prune sessions exceeding max count or older than retentionDays.
   * Called automatically when saving a new session.
   */
  static pruneOldSessions(projectDir: string, retentionDays: number): number {
    const indexPath = path.join(projectDir, HISTORY_DIR, SESSIONS_INDEX)
    if (!fs.existsSync(indexPath)) return 0

    let sessions: ReplaySessionSummary[]
    try {
      sessions = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    } catch { return 0 }

    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    const keep: ReplaySessionSummary[] = []
    const remove: ReplaySessionSummary[] = []

    for (const s of sessions) {
      if (s.startedAt < cutoff || keep.length >= MAX_SESSIONS) {
        remove.push(s)
      } else {
        keep.push(s)
      }
    }

    if (remove.length === 0) return 0

    // Delete session directories
    for (const s of remove) {
      const sessionDir = path.join(projectDir, HISTORY_DIR, s.id)
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true })
      }
    }

    fs.writeFileSync(indexPath, JSON.stringify(keep, null, 2))
    return remove.length
  }

  // ─── Internal ─────────────────────────────────────────────

  private startTurn(paneId: string, paneName: string, agent: AgentType, task?: string): void {
    // End any existing turn for this pane first
    if (this.activeTurns.has(paneId)) {
      this.endTurn(paneId)
    }

    const turnId = `turn-${++this.turnCounter}`
    const turn: ReplayTurn = {
      id: turnId,
      paneId,
      paneName,
      agent,
      startedAt: Date.now(),
      endedAt: null,
      task,
      events: [],
      summary: {
        filesRead: 0,
        filesEdited: 0,
        filesCreated: 0,
        terminalBytes: 0,
        durationMs: 0,
      },
    }

    this.activeTurns.set(paneId, {
      turn,
      terminalBuffer: '',
      terminalFlushTimer: null,
      terminalBytes: 0,
      filesRead: new Set(),
      filesEdited: new Set(),
      filesCreated: new Set(),
    })
  }

  private endTurn(paneId: string): void {
    const active = this.activeTurns.get(paneId)
    if (!active) return

    // Flush any remaining terminal buffer
    this.flushTerminalBuffer(paneId)

    const turn = active.turn
    turn.endedAt = Date.now()
    turn.summary = {
      filesRead: active.filesRead.size,
      filesEdited: active.filesEdited.size,
      filesCreated: active.filesCreated.size,
      terminalBytes: active.terminalBytes,
      durationMs: turn.endedAt - turn.startedAt,
    }

    // Only save turns with meaningful content
    if (turn.events.length > 0) {
      this.writeTurnFile(turn)
      // Store lightweight ref in session (without events)
      this.session.turns.push({
        ...turn,
        events: [], // don't duplicate events in session file
      })
    }

    this.activeTurns.delete(paneId)
  }

  private recordStatusEvent(paneId: string, status: PaneStatus): void {
    const active = this.activeTurns.get(paneId)
    if (!active) return
    active.turn.events.push({
      t: Date.now() - active.turn.startedAt,
      type: 'status',
      paneId,
      status,
    })
  }

  private flushTerminalBuffer(paneId: string): void {
    const active = this.activeTurns.get(paneId)
    if (!active || !active.terminalBuffer) return

    if (active.terminalFlushTimer) {
      clearTimeout(active.terminalFlushTimer)
      active.terminalFlushTimer = null
    }

    active.turn.events.push({
      t: Date.now() - active.turn.startedAt,
      type: 'terminal',
      paneId,
      data: active.terminalBuffer,
    })
    active.terminalBuffer = ''
  }

  /** Capture git diff for a single file. Returns unified diff string or null. */
  private captureDiff(file: string): Promise<string | null> {
    return new Promise((resolve) => {
      // Try git diff first (for tracked files), fall back to git diff --no-index for new files
      execFile('git', ['diff', '--no-color', '-U3', '--', file], {
        cwd: this.projectDir,
        timeout: 3000,
        maxBuffer: 128 * 1024,
      }, (err, stdout) => {
        if (stdout && stdout.trim()) {
          resolve(stdout.trim())
          return
        }
        // For untracked (new) files, show full content as diff
        execFile('git', ['diff', '--no-color', '--no-index', '/dev/null', file], {
          cwd: this.projectDir,
          timeout: 3000,
          maxBuffer: 128 * 1024,
        }, (_err2, stdout2) => {
          resolve(stdout2?.trim() || null)
        })
      })
    })
  }

  private writeTurnFile(turn: ReplayTurn): void {
    const turnPath = path.join(this.sessionDir, `${turn.id}.json`)
    fs.writeFileSync(turnPath, JSON.stringify(turn))
  }

  private writeSessionFile(): void {
    const sessionPath = path.join(this.sessionDir, 'session.json')
    fs.writeFileSync(sessionPath, JSON.stringify(this.session, null, 2))
  }

  private updateSessionsIndex(): void {
    const indexPath = path.join(this.projectDir, HISTORY_DIR, SESSIONS_INDEX)
    let sessions: ReplaySessionSummary[] = []

    if (fs.existsSync(indexPath)) {
      try {
        sessions = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
      } catch { /* start fresh */ }
    }

    const totalDurationMs = this.session.endedAt
      ? this.session.endedAt - this.session.startedAt
      : 0

    sessions.unshift({
      id: this.session.id,
      startedAt: this.session.startedAt,
      endedAt: this.session.endedAt,
      projectName: this.session.projectName,
      turnCount: this.session.turns.length,
      paneCount: this.session.panes.length,
      totalDurationMs,
    })

    fs.writeFileSync(indexPath, JSON.stringify(sessions, null, 2))

    // Passive cleanup: prune sessions exceeding retention or max count
    const pruned = SessionRecorder.pruneOldSessions(this.projectDir, this.retentionDays)
    if (pruned > 0) {
      console.log(`[SessionRecorder] Pruned ${pruned} old session(s)`)
    }
  }
}

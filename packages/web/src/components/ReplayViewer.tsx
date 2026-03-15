import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  History,
  Clock,
  FileText,
  Pencil,
  FilePlus,
  Terminal,
  ChevronRight,
  ChevronDown,
  Gauge,
  Eye,
  Trash2,
  Terminal as TerminalIcon,
} from 'lucide-react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { AgentIcon, getAgentColor } from './AgentIcon'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type {
  ReplaySessionSummary,
  ReplaySession,
  ReplayTurn,
  ReplayEvent,
  AgentType,
} from '@/types'

// ─── Helpers ────────────────────────────────────────────────

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rs = s % 60
  if (m < 60) return `${m}m${rs > 0 ? rs + 's' : ''}`
  const h = Math.floor(m / 60)
  return `${h}h${m % 60}m`
}

function resolveCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000000'
}

const actionIcons: Record<string, typeof FileText> = {
  read: Eye,
  edit: Pencil,
  write: Pencil,
  create: FilePlus,
  delete: Trash2,
  bash: TerminalIcon,
}

const actionColors: Record<string, string> = {
  read: '#58A6FF',
  edit: '#F0883E',
  write: '#F0883E',
  create: '#3FB950',
  delete: '#F85149',
  bash: '#8B949E',
}

// ─── Diff Renderer ──────────────────────────────────────────

function DiffView({ diff }: { diff: string }) {
  const lines = diff.split('\n')

  return (
    <pre className="replay-diff-content">
      {lines.map((line, i) => {
        let cls = 'replay-diff-line'
        if (line.startsWith('+') && !line.startsWith('+++')) cls += ' replay-diff-add'
        else if (line.startsWith('-') && !line.startsWith('---')) cls += ' replay-diff-del'
        else if (line.startsWith('@@')) cls += ' replay-diff-hunk'
        else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) cls += ' replay-diff-meta'
        return <div key={i} className={cls}>{line}</div>
      })}
    </pre>
  )
}

// ─── Session List View ──────────────────────────────────────

function SessionListView({ onSelectSession }: { onSelectSession: (id: string) => void }) {
  const [sessions, setSessions] = useState<ReplaySessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmClearAll, setConfirmClearAll] = useState(false)

  const loadSessions = useCallback(() => {
    setLoading(true)
    fetch('/api/replay/sessions')
      .then(r => r.json())
      .then(setSessions)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadSessions() }, [loadSessions])

  const deleteSession = useCallback(async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    try {
      await fetch(`/api/replay/sessions/${sessionId}`, { method: 'DELETE' })
      setSessions(prev => prev.filter(s => s.id !== sessionId))
    } catch { /* ignore */ }
  }, [])

  const clearAllSessions = useCallback(async () => {
    try {
      await fetch('/api/replay/sessions', { method: 'DELETE' })
      setSessions([])
    } catch { /* ignore */ }
    setConfirmClearAll(false)
  }, [])

  if (loading) {
    return (
      <div className="replay-empty">
        <Clock className="icon-hero" style={{ color: 'var(--text-muted)' }} />
        <span>Loading sessions...</span>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="replay-empty">
        <History className="icon-hero" style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 'var(--font-lg)' }}>No replay history</span>
        <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
          Sessions are recorded automatically when agents run
        </span>
      </div>
    )
  }

  return (
    <div className="replay-session-list">
      <div className="replay-list-header">
        <History className="icon-sm" style={{ color: 'var(--accent-primary)' }} />
        <span>Session History</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)', flex: 1 }}>
          {sessions.length} sessions
        </span>
        {sessions.length > 0 && (
          confirmClearAll ? (
            <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>Clear all?</span>
              <button className="replay-clear-btn replay-clear-btn--danger" onClick={clearAllSessions}>
                Confirm
              </button>
              <button className="replay-clear-btn" onClick={() => setConfirmClearAll(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="replay-clear-btn"
              onClick={() => setConfirmClearAll(true)}
              title="Clear all history"
            >
              <Trash2 size={12} />
              <span>Clear All</span>
            </button>
          )
        )}
      </div>
      {sessions.map(session => (
        <button
          key={session.id}
          className="replay-session-card"
          onClick={() => onSelectSession(session.id)}
        >
          <div className="replay-session-card__main">
            <span className="replay-session-card__name">{session.projectName}</span>
            <span className="replay-session-card__date">{formatDate(session.startedAt)}</span>
          </div>
          <div className="replay-session-card__stats">
            <span>{session.turnCount} turns</span>
            <span>{session.paneCount} agents</span>
            <span>{formatDuration(session.totalDurationMs)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexShrink: 0 }}>
            <button
              className="replay-delete-btn"
              onClick={(e) => deleteSession(e, session.id)}
              title="Delete session"
            >
              <Trash2 size={12} />
            </button>
            <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
          </div>
        </button>
      ))}
    </div>
  )
}

// ─── Session Detail View ────────────────────────────────────

function SessionDetailView({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<ReplaySession | null>(null)
  const [activeTurn, setActiveTurn] = useState<ReplayTurn | null>(null)
  const [loadingTurn, setLoadingTurn] = useState(false)
  const { openReplayTab } = useWorkspaceStore()

  useEffect(() => {
    fetch(`/api/replay/sessions/${sessionId}`)
      .then(r => r.json())
      .then(setSession)
      .catch(() => {})
  }, [sessionId])

  const loadTurn = useCallback(async (turnId: string) => {
    setLoadingTurn(true)
    try {
      const res = await fetch(`/api/replay/sessions/${sessionId}/turns/${turnId}`)
      const turn: ReplayTurn = await res.json()
      setActiveTurn(turn)
    } catch { /* ignore */ }
    setLoadingTurn(false)
  }, [sessionId])

  if (!session) {
    return (
      <div className="replay-empty">
        <Clock className="icon-hero" style={{ color: 'var(--text-muted)' }} />
        <span>Loading session...</span>
      </div>
    )
  }

  return (
    <div className="replay-detail">
      {/* Header */}
      <div className="replay-detail-header">
        <button
          className="replay-back-btn"
          onClick={() => openReplayTab()}
        >
          <SkipBack size={12} />
          <span>All Sessions</span>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 'var(--font-md)' }}>{session.projectName}</div>
          <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
            {formatDate(session.startedAt)}
            {session.endedAt && ` — ${formatDate(session.endedAt)}`}
            {' · '}{session.turns.length} turns · {session.panes.length} agents
          </div>
        </div>
      </div>

      <div className="replay-detail-body">
        {/* Turn list (left) */}
        <div className="replay-turn-list">
          {session.turns.map((turn, idx) => {
            const color = getAgentColor(turn.agent)
            const isActive = activeTurn?.id === turn.id
            return (
              <button
                key={turn.id}
                className={`replay-turn-card ${isActive ? 'replay-turn-card--active' : ''}`}
                onClick={() => loadTurn(turn.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', width: 20 }}>#{idx + 1}</span>
                  <AgentIcon agent={turn.agent} size={14} />
                  <span style={{ fontWeight: 600, fontSize: 'var(--font-sm)', color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {turn.paneName}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-md)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)', paddingLeft: 26 }}>
                  <span>{formatDuration(turn.summary.durationMs)}</span>
                  {turn.summary.filesRead > 0 && <span>{turn.summary.filesRead}R</span>}
                  {turn.summary.filesEdited > 0 && <span style={{ color: '#F0883E' }}>{turn.summary.filesEdited}E</span>}
                  {turn.summary.filesCreated > 0 && <span style={{ color: '#3FB950' }}>{turn.summary.filesCreated}C</span>}
                </div>
                {turn.task && (
                  <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', paddingLeft: 26, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {turn.task}
                  </div>
                )}
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                  background: isActive ? color : 'transparent',
                  borderRadius: '0 2px 2px 0',
                }} />
              </button>
            )
          })}
          {session.turns.length === 0 && (
            <div style={{ padding: 'var(--space-xl)', fontSize: 'var(--font-sm)', color: 'var(--text-muted)', textAlign: 'center' }}>
              No turns recorded in this session
            </div>
          )}
        </div>

        {/* Turn player (right) */}
        <div className="replay-player">
          {loadingTurn ? (
            <div className="replay-empty">
              <span>Loading turn...</span>
            </div>
          ) : activeTurn ? (
            <TurnPlayer turn={activeTurn} />
          ) : (
            <div className="replay-empty">
              <Play className="icon-hero" style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: 'var(--font-md)' }}>Select a turn to replay</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Turn Player ────────────────────────────────────────────

function TurnPlayer({ turn }: { turn: ReplayTurn }) {
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [speed, setSpeed] = useState(4) // 4x default
  const [expandedOp, setExpandedOp] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const termContainerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  // Track how many terminal events have been written so we only write new ones
  const writtenCountRef = useRef(0)

  const totalDuration = turn.endedAt ? turn.endedAt - turn.startedAt : turn.summary.durationMs

  // Precompute terminal events list (stable reference)
  const terminalEvents = useMemo(() => {
    return turn.events.filter(e => e.type === 'terminal')
  }, [turn.events])

  // Initialize xterm instance
  useEffect(() => {
    if (!termContainerRef.current) return

    const term = new XTerm({
      cursorBlink: false,
      fontSize: 13,
      fontFamily: "'Geist Mono', 'JetBrains Mono', monospace",
      scrollback: 5000,
      disableStdin: true,
      theme: {
        background: resolveCssVar('--term-bg'),
        foreground: resolveCssVar('--term-fg'),
        cursor: resolveCssVar('--term-cursor'),
        selectionBackground: resolveCssVar('--term-selection'),
      },
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(termContainerRef.current)

    requestAnimationFrame(() => {
      if (termContainerRef.current && termContainerRef.current.clientHeight > 0) {
        fitAddon.fit()
      }
    })

    xtermRef.current = term
    fitAddonRef.current = fitAddon
    writtenCountRef.current = 0

    // Resize observer
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (fitAddonRef.current && termContainerRef.current && termContainerRef.current.clientHeight > 0) {
          fitAddonRef.current.fit()
        }
      })
    })
    ro.observe(termContainerRef.current)

    return () => {
      ro.disconnect()
      term.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
      writtenCountRef.current = 0
    }
  }, [turn.id]) // re-create on turn change

  // Write terminal data incrementally as currentTime advances
  useEffect(() => {
    const term = xtermRef.current
    if (!term) return

    // Find how many terminal events should be visible at currentTime
    let targetCount = 0
    for (const e of terminalEvents) {
      if (e.t <= currentTime) targetCount++
      else break
    }

    if (targetCount < writtenCountRef.current) {
      // Seeking backwards — must reset and replay from start
      term.reset()
      writtenCountRef.current = 0
    }

    // Write any new events
    for (let i = writtenCountRef.current; i < targetCount; i++) {
      const data = terminalEvents[i].data
      if (data) term.write(data)
    }
    writtenCountRef.current = targetCount

    // Auto-scroll to bottom
    term.scrollToBottom()
  }, [currentTime, terminalEvents])

  // Activity timeline
  const activityEvents = useMemo(() => {
    return turn.events.filter(e => e.type === 'activity' && e.t <= currentTime)
  }, [turn.events, currentTime])

  // All activity events (for markers on progress bar)
  const allActivityEvents = useMemo(() => {
    return turn.events.filter(e => e.type === 'activity')
  }, [turn.events])

  // Playback loop
  useEffect(() => {
    if (playing) {
      timerRef.current = setInterval(() => {
        setCurrentTime(t => {
          const next = t + 50 * speed
          if (next >= totalDuration) {
            setPlaying(false)
            return totalDuration
          }
          return next
        })
      }, 50)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [playing, speed, totalDuration])

  const togglePlay = useCallback(() => {
    if (currentTime >= totalDuration) {
      setCurrentTime(0)
      setPlaying(true)
    } else {
      setPlaying(p => !p)
    }
  }, [currentTime, totalDuration])

  const seekTo = useCallback((pct: number) => {
    setCurrentTime(Math.round(pct * totalDuration))
  }, [totalDuration])

  const color = getAgentColor(turn.agent)
  const progressPct = totalDuration > 0 ? currentTime / totalDuration : 0

  return (
    <div className="turn-player">
      {/* Turn header */}
      <div className="turn-player-header">
        <AgentIcon agent={turn.agent} size={16} />
        <span style={{ fontWeight: 600 }}>{turn.paneName}</span>
        <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
          {formatDuration(totalDuration)}
        </span>
        <div style={{ flex: 1 }} />
        <div className="turn-stats">
          {turn.summary.filesRead > 0 && (
            <span className="turn-stat"><FileText size={10} />{turn.summary.filesRead}</span>
          )}
          {turn.summary.filesEdited > 0 && (
            <span className="turn-stat" style={{ color: '#F0883E' }}><Pencil size={10} />{turn.summary.filesEdited}</span>
          )}
          {turn.summary.filesCreated > 0 && (
            <span className="turn-stat" style={{ color: '#3FB950' }}><FilePlus size={10} />{turn.summary.filesCreated}</span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="turn-controls">
        <button className="turn-control-btn" onClick={togglePlay}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>

        {/* Progress bar */}
        <div
          className="turn-progress"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            seekTo((e.clientX - rect.left) / rect.width)
          }}
        >
          <div className="turn-progress__fill" style={{ width: `${progressPct * 100}%`, background: color }} />
          {/* Event markers */}
          {allActivityEvents.map((e, i) => (
            <div
              key={i}
              className="turn-progress__marker"
              style={{
                left: `${(e.t / totalDuration) * 100}%`,
                background: e.activity?.action === 'edit' || e.activity?.action === 'write'
                  ? '#F0883E'
                  : e.activity?.action === 'create' ? '#3FB950'
                  : e.activity?.action === 'delete' ? '#F85149'
                  : '#58A6FF',
              }}
              title={`${e.activity?.action}: ${e.activity?.file}`}
            />
          ))}
        </div>

        <span className="turn-time">
          {formatDuration(currentTime)} / {formatDuration(totalDuration)}
        </span>

        {/* Speed selector */}
        <div className="turn-speed">
          <Gauge size={10} />
          {[1, 2, 4, 8, 16].map(s => (
            <button
              key={s}
              className={`turn-speed-btn ${speed === s ? 'turn-speed-btn--active' : ''}`}
              onClick={() => setSpeed(s)}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Split: Terminal + Activity timeline */}
      <div className="turn-content">
        {/* Terminal replay */}
        <div className="turn-terminal-wrap">
          <div className="turn-terminal-header">
            <Terminal size={12} />
            <span>Terminal Output</span>
          </div>
          <div
            ref={termContainerRef}
            className="turn-terminal"
          />
        </div>

        {/* Activity sidebar — with expandable diffs */}
        <div className="turn-activity">
          <div className="turn-terminal-header">
            <FileText size={12} />
            <span>File Operations</span>
          </div>
          <div className="turn-activity-list">
            {activityEvents.map((e, i) => {
              const action = e.activity?.action || 'read'
              const Icon = actionIcons[action] || FileText
              const aColor = actionColors[action] || 'var(--text-muted)'
              const hasDiff = !!e.activity?.diff
              const isExpanded = expandedOp === i

              return (
                <div key={i} className="turn-activity-entry">
                  <button
                    className={`turn-activity-item ${hasDiff ? 'turn-activity-item--clickable' : ''}`}
                    onClick={() => {
                      if (hasDiff) setExpandedOp(isExpanded ? null : i)
                    }}
                  >
                    <span className="turn-activity-time">{formatDuration(e.t)}</span>
                    <Icon size={11} style={{ color: aColor, flexShrink: 0 }} />
                    <span className="turn-activity-action" style={{ color: aColor }}>
                      {action}
                    </span>
                    <span className="turn-activity-file">{e.activity?.file}</span>
                    {hasDiff && (
                      isExpanded
                        ? <ChevronDown size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        : <ChevronRight size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    )}
                  </button>
                  {isExpanded && e.activity?.diff && (
                    <div className="turn-activity-diff">
                      <DiffView diff={e.activity.diff} />
                    </div>
                  )}
                </div>
              )
            })}
            {activityEvents.length === 0 && (
              <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', padding: 'var(--space-md)' }}>
                No file operations yet
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────

export function ReplayViewer({ sessionId }: { sessionId?: string }) {
  const { openReplayTab } = useWorkspaceStore()

  if (sessionId) {
    return <SessionDetailView sessionId={sessionId} />
  }

  return <SessionListView onSelectSession={(id) => openReplayTab(id)} />
}

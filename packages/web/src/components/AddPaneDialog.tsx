import { useState, useEffect } from 'react'
import { GitBranch, Share2, Zap, History, Plus, Loader2 } from 'lucide-react'
import { AgentIcon, getAgentDisplayName } from './AgentIcon'
import type { ClientEvent, AgentType, RestoreMode, IsolationMode, AgentAvailability, DiscoveredSession } from '@/types'

const AGENT_TYPES: AgentType[] = ['claudecode', 'codex', 'opencode', 'kimi-cli', 'qwencode']

function estimateTerminalDimensions(): { cols: number; rows: number } {
  const FONT_SIZE = 13
  const FONT_FAMILY = "'Geist Mono', 'JetBrains Mono', monospace"
  const LINE_HEIGHT = Math.ceil(FONT_SIZE * 1.2)
  const XTERM_PADDING = 18
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  let charWidth = FONT_SIZE * 0.6
  if (ctx) {
    ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`
    charWidth = ctx.measureText('W').width
  }
  let containerWidth = 480 - 18
  try {
    const raw = localStorage.getItem('nexus-panel-widths')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.agents) containerWidth = parsed.agents - XTERM_PADDING
    }
  } catch { /* ignore */ }
  const termHeight = Math.min(800, Math.max(300, window.innerHeight * 0.6)) - 40
  const cols = Math.max(40, Math.floor(containerWidth / charWidth))
  const rows = Math.max(10, Math.floor(termHeight / LINE_HEIGHT))
  return { cols, rows }
}

function formatTimeAgo(dateStr?: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

interface AddPaneDialogProps {
  isOpen: boolean
  onClose: () => void
  send: (event: ClientEvent) => void
}

export function AddPaneDialog({ isOpen, onClose, send }: AddPaneDialogProps) {
  const [name, setName] = useState('')
  const [agent, setAgent] = useState<AgentType>('claudecode')
  const [workdir, setWorkdir] = useState('')
  const [task, setTask] = useState('')
  const [restore, setRestore] = useState<RestoreMode>('restart')
  const [isolation, setIsolation] = useState<IsolationMode>('shared')
  const [yolo, setYolo] = useState(false)
  const [agentAvailability, setAgentAvailability] = useState<Record<string, AgentAvailability> | null>(null)

  const [sessions, setSessions] = useState<DiscoveredSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    fetch('/api/agents')
      .then(res => res.json())
      .then(data => {
        setAgentAvailability(data)
        if (data[agent] && !data[agent].installed) {
          const firstInstalled = AGENT_TYPES.find(a => data[a]?.installed)
          if (firstInstalled) setAgent(firstInstalled)
        }
      })
      .catch(() => {})
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || restore !== 'resume') return
    setSessionsLoading(true)
    setSessions([])
    setSelectedSessionId(null)
    fetch(`/api/sessions?agent=${agent}`)
      .then(res => res.json())
      .then((data: DiscoveredSession[]) => setSessions(data))
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false))
  }, [isOpen, agent, restore])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    if (restore === 'resume' && !selectedSessionId) return

    const estimatedDims = estimateTerminalDimensions()

    send({
      type: 'pane.create',
      config: {
        name: name.trim(),
        agent,
        workdir: restore === 'resume' ? undefined : (workdir.trim() || undefined),
        task: restore === 'resume' ? undefined : (task.trim() || undefined),
        restore,
        isolation,
        yolo: yolo || undefined,
        sessionId: restore === 'resume' ? (selectedSessionId || undefined) : undefined,
        ...estimatedDims,
      },
    })

    setName('')
    setWorkdir('')
    setTask('')
    setRestore('restart')
    setIsolation('shared')
    setYolo(false)
    setSelectedSessionId(null)
    setSessions([])
    onClose()
  }

  const isAgentInstalled = (a: AgentType) => !agentAvailability || agentAvailability[a]?.installed !== false
  const isResume = restore === 'resume'

  return (
    <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="add-pane-dialog">
        <h2 className="dialog-title">Add Pane</h2>

        <form onSubmit={handleSubmit} className="dialog-form">
          {/* Row 1: Name + Agent (side by side) */}
          <div style={{ display: 'flex', gap: 'var(--space-lg)' }}>
            <div className="form-field" style={{ flex: 1, minWidth: 0 }}>
              <label className="form-label">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Auth Refactor"
                required
                className="form-input"
                autoFocus
              />
            </div>
            <div className="form-field" style={{ flex: 1, minWidth: 0 }}>
              <label className="form-label">Agent</label>
              <div className="agent-selector-grid">
                {AGENT_TYPES.map((a) => {
                  const installed = isAgentInstalled(a)
                  const hint = agentAvailability?.[a]?.installHint
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => installed && setAgent(a)}
                      disabled={!installed}
                      title={!installed ? `Not installed. ${hint}` : undefined}
                      className={`agent-selector-btn${agent === a ? ' agent-selector-btn--active' : ''}${!installed ? ' agent-selector-btn--disabled' : ''}`}
                    >
                      <AgentIcon agent={a} size="var(--icon-md)" />
                      <span>{getAgentDisplayName(a)}</span>
                      {!installed && <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto' }}>N/A</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Row 2: Start Mode toggle (two buttons inline) */}
          <div className="form-field">
            <label className="form-label">Start Mode</label>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              {([
                { value: 'resume' as RestoreMode, icon: History, label: 'Resume Session' },
                { value: 'restart' as RestoreMode, icon: Plus, label: 'New Session' },
              ] as const).map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRestore(value)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '8px 12px',
                    border: `1px solid ${restore === value ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-md)',
                    background: restore === value ? 'var(--accent-primary)1a' : 'var(--bg-surface)',
                    color: restore === value ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: 'var(--font-sm)',
                    fontWeight: restore === value ? 600 : 400,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Row 3: Two-column — left: options, right: session list or task */}
          <div style={{ display: 'flex', gap: 'var(--space-lg)', minHeight: 0 }}>
            {/* Left column: workdir, isolation, yolo */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', minWidth: 0 }}>
              {!isResume && (
                <div className="form-field">
                  <label className="form-label">Work Directory</label>
                  <input
                    type="text"
                    value={workdir}
                    onChange={(e) => setWorkdir(e.target.value)}
                    placeholder="e.g. src/auth"
                    className="form-input"
                  />
                </div>
              )}

              <div className="form-field">
                <label className="form-label">Isolation</label>
                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                  {([
                    { value: 'shared' as IsolationMode, icon: Share2, label: 'Shared' },
                    { value: 'worktree' as IsolationMode, icon: GitBranch, label: 'Worktree' },
                  ] as const).map(({ value, icon: Icon, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setIsolation(value)}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5,
                        padding: '6px 10px',
                        border: `1px solid ${isolation === value ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                        borderRadius: 'var(--radius-md)',
                        background: isolation === value ? 'var(--accent-primary)1a' : 'var(--bg-surface)',
                        color: isolation === value ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontSize: 'var(--font-xs)',
                        fontWeight: isolation === value ? 600 : 400,
                      }}
                    >
                      <Icon size={13} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-field">
                <button
                  type="button"
                  onClick={() => setYolo(!yolo)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 10px',
                    border: `1px solid ${yolo ? 'var(--status-warning, orange)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-md)',
                    background: yolo ? 'rgba(255,165,0,0.1)' : 'var(--bg-surface)',
                    color: yolo ? 'var(--status-warning, orange)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: 'var(--font-xs)',
                    fontWeight: yolo ? 600 : 400,
                  }}
                >
                  <Zap size={13} />
                  YOLO Mode {yolo ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            {/* Right column: session list (resume) or task (new) */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              {isResume ? (
                <div className="form-field" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <label className="form-label">Select Session</label>
                  <div style={{
                    flex: 1,
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    maxHeight: 220,
                    overflowY: 'auto',
                    background: 'var(--bg-surface)',
                  }}>
                    {sessionsLoading && (
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: 8, padding: 'var(--space-xl)', color: 'var(--text-muted)', fontSize: 'var(--font-sm)',
                      }}>
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        Loading...
                      </div>
                    )}
                    {!sessionsLoading && sessions.length === 0 && (
                      <div style={{
                        padding: 'var(--space-xl)', color: 'var(--text-muted)',
                        fontSize: 'var(--font-sm)', textAlign: 'center',
                      }}>
                        No sessions found
                      </div>
                    )}
                    {sessions.map((s) => {
                      const selected = selectedSessionId === s.sessionId
                      return (
                        <button
                          key={s.sessionId}
                          type="button"
                          onClick={() => setSelectedSessionId(selected ? null : s.sessionId)}
                          style={{
                            display: 'flex', flexDirection: 'column', gap: 2,
                            width: '100%', padding: '7px 10px', border: 'none',
                            borderBottom: '1px solid var(--border-subtle)',
                            background: selected ? 'var(--accent-primary)1a' : 'transparent',
                            cursor: 'pointer', textAlign: 'left', borderRadius: 0,
                            outline: selected ? '2px solid var(--accent-primary)' : 'none',
                            outlineOffset: -2,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              fontFamily: 'var(--font-mono)', fontSize: '11px',
                              color: selected ? 'var(--accent-primary)' : 'var(--text-muted)', flexShrink: 0,
                            }}>
                              {s.sessionId.slice(0, 10)}
                            </span>
                            {s.source === 'nexus' && (
                              <span style={{
                                fontSize: '9px', color: 'var(--accent-primary)',
                                background: 'var(--accent-primary)1a', padding: '0 4px',
                                borderRadius: 'var(--radius-sm)', lineHeight: '16px',
                              }}>
                                nexus
                              </span>
                            )}
                            <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>
                              {formatTimeAgo(s.updatedAt || s.createdAt)}
                            </span>
                          </div>
                          {s.summary && (
                            <div style={{
                              fontSize: 'var(--font-xs)', color: 'var(--text-primary)',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                              {s.summary}
                            </div>
                          )}
                          <div style={{
                            display: 'flex', gap: 8, fontSize: '10px',
                            color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                          }}>
                            {s.model && <span>{s.model.replace('claude-', '').replace(/-\d{8}$/, '')}</span>}
                            {s.costUsd != null && <span>${s.costUsd.toFixed(3)}</span>}
                            {s.numTurns != null && <span>{s.numTurns}t</span>}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="form-field" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <label className="form-label">Task <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                  <textarea
                    value={task}
                    onChange={(e) => setTask(e.target.value)}
                    placeholder="Describe what this agent should work on..."
                    rows={5}
                    className="form-input form-textarea"
                    style={{ flex: 1, resize: 'vertical' }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="dialog-actions">
            <button type="button" onClick={onClose} className="btn btn--secondary">
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={isResume && !selectedSessionId}
            >
              {isResume ? 'Resume' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

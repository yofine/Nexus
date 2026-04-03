import { useState, useEffect } from 'react'
import { GitBranch, Share2, Zap, History, Plus, Loader2, X, FolderOpen, MessageSquare } from 'lucide-react'
import { AgentIcon, getAgentDisplayName } from './AgentIcon'
import type { ClientEvent, AgentType, RestoreMode, IsolationMode, AgentAvailability, DiscoveredSession } from '@/types'
import { loadLayoutPreferences } from '@/lib/layoutPreferences'

const AGENT_TYPES: AgentType[] = ['claudecode', 'codex', 'opencode', 'kimi-cli', 'qodercli']

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
    const prefs = loadLayoutPreferences()
    containerWidth = prefs.widthsByMode[prefs.mode].agents - XTERM_PADDING
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
        {/* Header */}
        <div className="apd-header">
          <h2 className="apd-title">New Agent Pane</h2>
          <button type="button" onClick={onClose} className="apd-close-btn">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="apd-form">
          {/* Agent type selector — prominent, top-level */}
          <div className="apd-section">
            <label className="apd-label">Agent</label>
            <div className="apd-agent-grid">
              {AGENT_TYPES.map((a) => {
                const installed = isAgentInstalled(a)
                const hint = agentAvailability?.[a]?.installHint
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => installed && setAgent(a)}
                    disabled={!installed}
                    title={!installed ? `Not installed. ${hint}` : getAgentDisplayName(a)}
                    className={`apd-agent-card${agent === a ? ' apd-agent-card--active' : ''}${!installed ? ' apd-agent-card--disabled' : ''}`}
                  >
                    <AgentIcon agent={a} size="20px" />
                    <span className="apd-agent-name">{getAgentDisplayName(a)}</span>
                    {!installed && <span className="apd-agent-na">N/A</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Name input */}
          <div className="apd-section">
            <label className="apd-label" htmlFor="apd-name">Name</label>
            <input
              id="apd-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Auth Refactor"
              required
              className="apd-input"
              autoFocus
            />
          </div>

          {/* Start Mode toggle */}
          <div className="apd-section">
            <label className="apd-label">Start Mode</label>
            <div className="apd-mode-toggle">
              <button
                type="button"
                onClick={() => setRestore('restart')}
                className={`apd-mode-btn${!isResume ? ' apd-mode-btn--active' : ''}`}
              >
                <Plus size={14} />
                New Session
              </button>
              <button
                type="button"
                onClick={() => setRestore('resume')}
                className={`apd-mode-btn${isResume ? ' apd-mode-btn--active' : ''}`}
              >
                <History size={14} />
                Resume Session
              </button>
            </div>
          </div>

          {/* Conditional content based on mode */}
          {isResume ? (
            /* Session list for resume mode */
            <div className="apd-section">
              <label className="apd-label">Select Session</label>
              <div className="apd-session-list">
                {sessionsLoading && (
                  <div className="apd-session-empty">
                    <Loader2 size={16} className="apd-spinner" />
                    <span>Loading sessions...</span>
                  </div>
                )}
                {!sessionsLoading && sessions.length === 0 && (
                  <div className="apd-session-empty">
                    <span>No sessions found</span>
                  </div>
                )}
                {sessions.map((s) => {
                  const selected = selectedSessionId === s.sessionId
                  return (
                    <button
                      key={s.sessionId}
                      type="button"
                      onClick={() => setSelectedSessionId(selected ? null : s.sessionId)}
                      className={`apd-session-item${selected ? ' apd-session-item--selected' : ''}`}
                    >
                      <div className="apd-session-top">
                        <span className="apd-session-id">{s.sessionId.slice(0, 10)}</span>
                        {s.source === 'nexus' && <span className="apd-session-badge">nexus</span>}
                        <span className="apd-session-time">{formatTimeAgo(s.updatedAt || s.createdAt)}</span>
                      </div>
                      {s.summary && <div className="apd-session-summary">{s.summary}</div>}
                      <div className="apd-session-meta">
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
            /* New session fields */
            <>
              <div className="apd-section">
                <label className="apd-label" htmlFor="apd-workdir">
                  <FolderOpen size={12} />
                  Work Directory
                  <span className="apd-label-hint">optional</span>
                </label>
                <input
                  id="apd-workdir"
                  type="text"
                  value={workdir}
                  onChange={(e) => setWorkdir(e.target.value)}
                  placeholder="e.g. src/auth"
                  className="apd-input"
                />
              </div>

              <div className="apd-section">
                <label className="apd-label" htmlFor="apd-task">
                  <MessageSquare size={12} />
                  Task
                  <span className="apd-label-hint">optional</span>
                </label>
                <textarea
                  id="apd-task"
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  placeholder="Describe what this agent should work on..."
                  rows={3}
                  className="apd-input apd-textarea"
                />
              </div>
            </>
          )}

          {/* Options row */}
          <div className="apd-options">
            <div className="apd-option-group">
              <button
                type="button"
                onClick={() => setIsolation(isolation === 'shared' ? 'worktree' : 'shared')}
                className={`apd-option-chip${isolation === 'worktree' ? ' apd-option-chip--active' : ''}`}
              >
                {isolation === 'worktree' ? <GitBranch size={13} /> : <Share2 size={13} />}
                {isolation === 'worktree' ? 'Worktree' : 'Shared'}
              </button>

              <button
                type="button"
                onClick={() => setYolo(!yolo)}
                className={`apd-option-chip${yolo ? ' apd-option-chip--warning' : ''}`}
              >
                <Zap size={13} />
                YOLO {yolo ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {/* Footer actions */}
          <div className="apd-footer">
            <button type="button" onClick={onClose} className="btn btn--secondary">
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={!name.trim() || (isResume && !selectedSessionId)}
            >
              {isResume ? 'Resume' : 'Create Pane'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

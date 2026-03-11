import { useState, useEffect } from 'react'
import { GitBranch, Share2, Zap } from 'lucide-react'
import { AgentIcon, getAgentDisplayName } from './AgentIcon'
import type { ClientEvent, AgentType, RestoreMode, IsolationMode, AgentAvailability } from '@/types'

const AGENT_TYPES: AgentType[] = ['claudecode', 'opencode', 'qwencode']

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
  const [restore, setRestore] = useState<RestoreMode>('continue')
  const [isolation, setIsolation] = useState<IsolationMode>('shared')
  const [yolo, setYolo] = useState(false)
  const [agentAvailability, setAgentAvailability] = useState<Record<string, AgentAvailability> | null>(null)

  useEffect(() => {
    if (!isOpen) return
    fetch('/api/agents')
      .then(res => res.json())
      .then(data => {
        setAgentAvailability(data)
        // If current selection is not installed, switch to first installed
        if (data[agent] && !data[agent].installed) {
          const firstInstalled = AGENT_TYPES.find(a => data[a]?.installed)
          if (firstInstalled) setAgent(firstInstalled)
        }
      })
      .catch(() => {})
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    send({
      type: 'pane.create',
      config: {
        name: name.trim(),
        agent,
        workdir: workdir.trim() || undefined,
        task: task.trim() || undefined,
        restore,
        isolation,
        yolo: yolo || undefined,
      },
    })

    // Reset form
    setName('')
    setWorkdir('')
    setTask('')
    setRestore('continue')
    setIsolation('shared')
    setYolo(false)
    onClose()
  }

  const isAgentInstalled = (a: AgentType) => !agentAvailability || agentAvailability[a]?.installed !== false

  return (
    <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="add-pane-dialog">
        <h2 className="dialog-title">Add Pane</h2>

        <form onSubmit={handleSubmit} className="dialog-form">
          {/* Name */}
          <div className="form-field">
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

          {/* Agent Type */}
          <div className="form-field">
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
                    {!installed && <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto' }}>Not installed</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Working Directory + Restore Mode */}
          <div className="form-row-pair">
            <div className="form-field" style={{ flex: 1, minWidth: 0 }}>
              <label className="form-label">Work Directory</label>
              <input
                type="text"
                value={workdir}
                onChange={(e) => setWorkdir(e.target.value)}
                placeholder="e.g. src/auth"
                className="form-input"
              />
            </div>
            <div className="form-field" style={{ width: 180, flexShrink: 0 }}>
              <label className="form-label">Restore Mode</label>
              <select
                value={restore}
                onChange={(e) => setRestore(e.target.value as RestoreMode)}
                className="form-input form-select"
              >
                <option value="continue">Continue</option>
                <option value="restart">Restart</option>
                <option value="manual">Manual</option>
              </select>
            </div>
          </div>

          {/* Isolation Mode */}
          <div className="form-field">
            <label className="form-label">Isolation</label>
            <div className="isolation-grid">
              {([
                { value: 'shared' as IsolationMode, icon: Share2, label: 'Shared', desc: 'Same working directory' },
                { value: 'worktree' as IsolationMode, icon: GitBranch, label: 'Git Worktree', desc: 'Isolated branch & diff' },
              ] as const).map(({ value, icon: Icon, label, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setIsolation(value)}
                  className={`isolation-btn${isolation === value ? ' isolation-btn--active' : ''}`}
                >
                  <Icon size={16} className="isolation-btn__icon" />
                  <div className="isolation-btn__text">
                    <div className="isolation-btn__label">{label}</div>
                    <div className="isolation-btn__desc">{desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* YOLO Mode */}
          <div className="form-field">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={14} style={{ color: yolo ? 'var(--accent)' : 'var(--text-muted)' }} />
              YOLO Mode
            </label>
            <button
              type="button"
              onClick={() => setYolo(!yolo)}
              className={`isolation-btn${yolo ? ' isolation-btn--active' : ''}`}
              style={{ width: '100%' }}
            >
              <Zap size={16} className="isolation-btn__icon" />
              <div className="isolation-btn__text">
                <div className="isolation-btn__label">{yolo ? 'Enabled' : 'Disabled'}</div>
                <div className="isolation-btn__desc">Skip all permission prompts</div>
              </div>
            </button>
          </div>

          {/* Task */}
          <div className="form-field">
            <label className="form-label">Task <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Describe what this agent should work on..."
              rows={3}
              className="form-input form-textarea"
            />
          </div>

          {/* Actions */}
          <div className="dialog-actions">
            <button type="button" onClick={onClose} className="btn btn--secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn--primary">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { AgentIcon, getAgentDisplayName } from './AgentIcon'
import type { ClientEvent, AgentType, RestoreMode } from '@/types'

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
      },
    })

    // Reset form
    setName('')
    setWorkdir('')
    setTask('')
    setRestore('continue')
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="add-pane-dialog">
        <h2
          style={{
            margin: '0 0 var(--space-xl) 0',
            fontSize: 'var(--font-xl)',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          Add Pane
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          {/* Name */}
          <div>
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
          <div>
            <label className="form-label">Agent</label>
            <div className="agent-selector-grid">
              {(['claudecode', 'opencode', 'aider', 'codex', 'gemini'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAgent(a as AgentType)}
                  className={`agent-selector-btn${agent === a ? ' agent-selector-btn--active' : ''}`}
                >
                  <AgentIcon agent={a} size="var(--icon-md)" />
                  <span>{getAgentDisplayName(a)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Working Directory + Restore Mode side by side on large screens */}
          <div className="form-row-pair">
            <div style={{ flex: 1 }}>
              <label className="form-label">Working Directory (optional)</label>
              <input
                type="text"
                value={workdir}
                onChange={(e) => setWorkdir(e.target.value)}
                placeholder="e.g. src/auth"
                className="form-input"
              />
            </div>
            <div style={{ flex: 0, minWidth: 160 }}>
              <label className="form-label">Restore Mode</label>
              <select
                value={restore}
                onChange={(e) => setRestore(e.target.value as RestoreMode)}
                className="form-input"
              >
                <option value="continue">Continue (--continue)</option>
                <option value="restart">Restart</option>
                <option value="manual">Manual</option>
              </select>
            </div>
          </div>

          {/* Task */}
          <div>
            <label className="form-label">Task (optional)</label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Describe what this agent should work on..."
              rows={3}
              className="form-input form-textarea"
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 'var(--space-md)', justifyContent: 'flex-end', marginTop: 'var(--space-md)' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn--secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--primary"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

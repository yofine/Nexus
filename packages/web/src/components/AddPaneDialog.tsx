import { useState } from 'react'
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
      <div
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          padding: 24,
          width: 420,
          maxWidth: '90vw',
        }}
      >
        <h2
          style={{
            margin: '0 0 20px 0',
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          Add Pane
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Name */}
          <div>
            <label style={labelStyle}>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Auth Refactor"
              required
              style={inputStyle}
              autoFocus
            />
          </div>

          {/* Agent Type */}
          <div>
            <label style={labelStyle}>Agent</label>
            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value as AgentType)}
              style={inputStyle}
            >
              <option value="claudecode">Claude Code</option>
              <option value="opencode">OpenCode</option>
            </select>
          </div>

          {/* Working Directory */}
          <div>
            <label style={labelStyle}>Working Directory (optional)</label>
            <input
              type="text"
              value={workdir}
              onChange={(e) => setWorkdir(e.target.value)}
              placeholder="e.g. src/auth"
              style={inputStyle}
            />
          </div>

          {/* Task */}
          <div>
            <label style={labelStyle}>Task (optional)</label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Describe what this agent should work on..."
              rows={3}
              style={{
                ...inputStyle,
                resize: 'vertical',
                fontFamily: 'var(--font-ui)',
              }}
            />
          </div>

          {/* Restore Mode */}
          <div>
            <label style={labelStyle}>Restore Mode</label>
            <select
              value={restore}
              onChange={(e) => setRestore(e.target.value as RestoreMode)}
              style={inputStyle}
            >
              <option value="continue">Continue (--continue)</option>
              <option value="restart">Restart</option>
              <option value="manual">Manual</option>
            </select>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'var(--bg-overlay)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-default)',
                borderRadius: 4,
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                background: 'var(--accent-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 4,
  fontSize: 12,
  color: 'var(--text-secondary)',
  fontWeight: 500,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-base)',
  border: '1px solid var(--border-default)',
  borderRadius: 4,
  padding: '8px 10px',
  color: 'var(--text-primary)',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
}

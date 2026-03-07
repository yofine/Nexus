import { useState, useCallback } from 'react'
import { Terminal as TerminalIcon, ChevronDown, ChevronUp, X } from 'lucide-react'
import { Terminal } from './Terminal'
import type { ClientEvent } from '@/types'

interface BottomTerminalProps {
  send: (event: ClientEvent) => void
}

const PANE_ID = '__shell__'

export function BottomTerminal({ send }: BottomTerminalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [spawned, setSpawned] = useState(false)

  const handleOpen = useCallback(() => {
    if (!spawned) {
      // Ask server to spawn a plain shell (no agent command)
      send({
        type: 'pane.create',
        config: {
          name: '__shell__',
          agent: '__shell__',
          restore: 'manual',
        },
      })
      setSpawned(true)
    }
    setIsOpen(true)
  }, [spawned, send])

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [])

  const handleTerminalData = useCallback(
    (data: string) => {
      send({ type: 'terminal.input', paneId: PANE_ID, data })
    },
    [send],
  )

  const handleTerminalResize = useCallback(
    (cols: number, rows: number) => {
      send({ type: 'terminal.resize', paneId: PANE_ID, cols, rows })
    },
    [send],
  )

  if (!isOpen) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 48,
          right: 0,
          height: 32,
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: 8,
          zIndex: 10,
          cursor: 'pointer',
        }}
        onClick={handleOpen}
      >
        <TerminalIcon size={14} color="var(--text-secondary)" />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Terminal</span>
        <ChevronUp size={14} color="var(--text-muted)" style={{ marginLeft: 'auto' }} />
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 48,
        right: 0,
        height: '35vh',
        background: 'var(--bg-base)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10,
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 12px',
          gap: 8,
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}
      >
        <TerminalIcon size={14} color="var(--text-secondary)" />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Terminal</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              borderRadius: 3,
            }}
            title="Minimize"
          >
            <ChevronDown size={14} color="var(--text-muted)" />
          </button>
        </div>
      </div>

      {/* Terminal area */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Terminal
          paneId={PANE_ID}
          onData={handleTerminalData}
          onResize={handleTerminalResize}
        />
      </div>
    </div>
  )
}

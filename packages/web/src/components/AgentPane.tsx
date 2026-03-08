import { useCallback } from 'react'
import {
  ChevronDown,
  ChevronRight,
  RotateCcw,
  X,
  Circle,
} from 'lucide-react'
import { Terminal } from './Terminal'
import type { PaneState, ClientEvent } from '@/types'

interface AgentPaneProps {
  pane: PaneState
  isExpanded: boolean
  onToggle: () => void
  send: (event: ClientEvent) => void
}

const statusColors: Record<string, string> = {
  running: 'var(--status-running)',
  waiting: 'var(--status-waiting)',
  idle: 'var(--status-idle)',
  stopped: 'var(--status-idle)',
  error: 'var(--status-error)',
}

export function AgentPane({ pane, isExpanded, onToggle, send }: AgentPaneProps) {
  const handleTerminalData = useCallback(
    (data: string) => {
      send({ type: 'terminal.input', paneId: pane.id, data })
    },
    [pane.id, send],
  )

  const handleTerminalResize = useCallback(
    (cols: number, rows: number) => {
      send({ type: 'terminal.resize', paneId: pane.id, cols, rows })
    },
    [pane.id, send],
  )

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation()
    send({ type: 'pane.close', paneId: pane.id })
  }

  const handleRestart = (e: React.MouseEvent) => {
    e.stopPropagation()
    send({ type: 'pane.restart', paneId: pane.id, mode: pane.restore })
  }

  return (
    <div
      style={{
        border: `1px solid ${isExpanded ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
        borderRadius: 6,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        height: isExpanded ? 'clamp(300px, 60vh, 800px)' : 'auto',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          cursor: 'pointer',
          background: isExpanded ? 'var(--bg-elevated)' : 'var(--bg-surface)',
          borderBottom: isExpanded ? '1px solid var(--border-subtle)' : 'none',
          userSelect: 'none',
        }}
      >
        {isExpanded ? (
          <ChevronDown size={14} color="var(--text-secondary)" />
        ) : (
          <ChevronRight size={14} color="var(--text-secondary)" />
        )}

        <Circle
          size={8}
          fill={statusColors[pane.status] || 'var(--status-idle)'}
          color={statusColors[pane.status] || 'var(--status-idle)'}
        />

        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
          {pane.name}
        </span>

        <span
          style={{
            fontSize: 11,
            color: 'var(--accent-primary)',
            background: 'var(--accent-subtle)',
            padding: '1px 6px',
            borderRadius: 3,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {pane.agent}
        </span>

        {pane.workdir && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {pane.workdir}
          </span>
        )}

        {!isExpanded && pane.task && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {pane.task}
          </span>
        )}

        {/* Meta info (context%, cost) */}
        {pane.meta.contextUsedPct !== undefined && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {pane.meta.contextUsedPct}% ctx
          </span>
        )}
        {pane.meta.costUsd !== undefined && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            ${pane.meta.costUsd.toFixed(3)}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button
            onClick={handleRestart}
            title="Restart"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <RotateCcw size={13} color="var(--text-muted)" />
          </button>
          <button
            onClick={handleClose}
            title="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={13} color="var(--text-muted)" />
          </button>
        </div>
      </div>

      {/* Terminal body — conditionally rendered; registry buffers output while collapsed */}
      {isExpanded && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <Terminal
            paneId={pane.id}
            onData={handleTerminalData}
            onResize={handleTerminalResize}
          />
        </div>
      )}
    </div>
  )
}

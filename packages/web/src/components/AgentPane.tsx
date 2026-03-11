import { useCallback } from 'react'
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  RotateCcw,
  X,
} from 'lucide-react'
import { Terminal } from './Terminal'
import { AgentIcon, getAgentDisplayName, getAgentColor } from './AgentIcon'
import { useWorkspaceStore } from '@/stores/workspaceStore'
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
  const paneDiffs = useWorkspaceStore((s) => s.paneDiffs[pane.id])
  const { openReviewTab } = useWorkspaceStore()
  const diffCount = paneDiffs?.length ?? 0

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
        borderRadius: 'var(--radius-md)',
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
        className="agent-pane-header"
        style={{
          background: isExpanded ? 'var(--bg-elevated)' : 'var(--bg-surface)',
          borderBottom: isExpanded ? '1px solid var(--border-subtle)' : 'none',
        }}
      >
        <div className="agent-pane-header__main">
          {isExpanded ? (
            <ChevronDown className="icon-sm" style={{ color: 'var(--text-secondary)' }} />
          ) : (
            <ChevronRight className="icon-sm" style={{ color: 'var(--text-secondary)' }} />
          )}

          {/* Status dot */}
          <div style={{
            width: 'var(--space-md)',
            height: 'var(--space-md)',
            borderRadius: '50%',
            background: statusColors[pane.status] || 'var(--status-idle)',
            flexShrink: 0,
          }} />

          {/* Agent icon + name */}
          <AgentIcon agent={pane.agent} size="var(--icon-md)" />

          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 'var(--font-md)', whiteSpace: 'nowrap' }}>
            {pane.name}
          </span>

          <span
            style={{
              fontSize: 'var(--font-xs)',
              color: getAgentColor(pane.agent),
              background: `${getAgentColor(pane.agent)}1a`,
              padding: '2px var(--space-sm)',
              borderRadius: 'var(--radius-sm)',
              fontFamily: 'var(--font-mono)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {getAgentDisplayName(pane.agent)}
          </span>

          {/* Meta info (branch, workdir, context%, cost, diff count) */}
          <div className="agent-pane-header__meta">
            {pane.isolation === 'worktree' && pane.branch && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: 'var(--font-xs)',
                  color: 'var(--accent-primary)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <GitBranch size={11} />
                {pane.branch.replace('nexus/', '')}
              </span>
            )}
            {pane.workdir && (
              <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {pane.workdir}
              </span>
            )}
            {pane.meta.contextUsedPct !== undefined && (
              <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {pane.meta.contextUsedPct}% ctx
              </span>
            )}
            {pane.meta.costUsd !== undefined && (
              <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                ${pane.meta.costUsd.toFixed(3)}
              </span>
            )}
            {pane.isolation === 'worktree' && diffCount > 0 && (
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  openReviewTab(pane.id, pane.name)
                }}
                style={{
                  fontSize: 'var(--font-xs)',
                  color: 'var(--status-waiting)',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                }}
              >
                {diffCount} file{diffCount !== 1 ? 's' : ''} changed
              </span>
            )}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-xs)', flexShrink: 0 }}>
            <button
              onClick={handleRestart}
              title="Restart"
              className="pane-action-btn"
            >
              <RotateCcw className="icon-sm" style={{ color: 'var(--text-muted)' }} />
            </button>
            <button
              onClick={handleClose}
              title="Close"
              className="pane-action-btn"
            >
              <X className="icon-sm" style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
        </div>

        {!isExpanded && pane.task && (
          <div className="agent-pane-header__task">
            {pane.task}
          </div>
        )}
      </div>

      {/* Terminal body — always mounted to keep xterm instance alive and cols in sync */}
      <div style={isExpanded ? {
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      } : {
        position: 'absolute',
        width: 0,
        height: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}>
        <Terminal
          paneId={pane.id}
          onData={handleTerminalData}
          onResize={handleTerminalResize}
        />
      </div>
    </div>
  )
}

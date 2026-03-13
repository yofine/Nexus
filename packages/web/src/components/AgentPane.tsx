import { useCallback, useEffect, useRef, memo } from 'react'
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  RotateCcw,
  X,
  Play,
} from 'lucide-react'
import { Terminal } from './Terminal'
import { AgentIcon, getAgentDisplayName, getAgentColor } from './AgentIcon'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import {
  pauseTerminal,
  resumeTerminal,
  refitTerminal,
  scrollTerminalToBottom,
  getTerminalDimensions,
} from '@/stores/terminalRegistry'
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

export const AgentPane = memo(function AgentPane({ pane, isExpanded, onToggle, send }: AgentPaneProps) {
  const paneDiffs = useWorkspaceStore((s) => s.paneDiffs[pane.id])
  const { openReviewTab } = useWorkspaceStore()
  const diffCount = paneDiffs?.length ?? 0
  const prevExpandedRef = useRef(isExpanded)

  // Handle pause/resume when expand state changes
  useEffect(() => {
    const wasExpanded = prevExpandedRef.current
    prevExpandedRef.current = isExpanded

    if (isExpanded && !wasExpanded) {
      // Expanding: first refit to get correct dimensions, then resume
      // (resume does reset + replay, which needs correct cols to render properly)
      // Use double-rAF to ensure the container has laid out with real dimensions
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          refitTerminal(pane.id)
          // Send resize to server immediately (don't wait for debounced ResizeObserver)
          const dims = getTerminalDimensions(pane.id)
          if (dims) {
            send({ type: 'terminal.resize', paneId: pane.id, cols: dims.cols, rows: dims.rows })
          }
          resumeTerminal(pane.id)
          scrollTerminalToBottom(pane.id)
        })
      })
    } else if (!isExpanded && wasExpanded) {
      // Collapsing: pause terminal writes to prevent zero-size rendering
      pauseTerminal(pane.id)
    }
  }, [isExpanded, pane.id])

  // Initial state: if pane mounts collapsed, pause immediately
  useEffect(() => {
    if (!isExpanded) {
      pauseTerminal(pane.id)
    }
    // no cleanup needed — pane removal clears history via clearTerminalHistory
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.id])

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
    send({ type: 'pane.restart', paneId: pane.id, mode: 'restart' })
  }

  const handleResume = (e: React.MouseEvent) => {
    e.stopPropagation()
    const sessionId = pane.meta.sessionId || pane.sessionId
    if (sessionId) {
      send({ type: 'pane.restart', paneId: pane.id, mode: 'resume', sessionId })
    } else {
      send({ type: 'pane.restart', paneId: pane.id, mode: 'continue' })
    }
  }

  const hasSessionId = !!(pane.meta.sessionId || pane.sessionId)
  const isStopped = pane.status === 'stopped' || pane.status === 'error'

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

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-xs)', flexShrink: 0, alignItems: 'center' }}>
            {/* Resume button — shown when pane is stopped/error or has a session ID */}
            {(isStopped || hasSessionId) && (
              <button
                onClick={handleResume}
                title={hasSessionId
                  ? `Resume session ${(pane.meta.sessionId || pane.sessionId || '').slice(0, 12)}`
                  : 'Resume (--continue)'}
                className="pane-action-btn"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  color: 'var(--accent-primary)',
                }}
              >
                <Play size={13} fill="currentColor" />
              </button>
            )}
            <button
              onClick={handleRestart}
              title="Restart (new session)"
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

      {/* Terminal body — always mounted to keep xterm instance alive */}
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
})

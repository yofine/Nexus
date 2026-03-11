import { useState, useCallback, useMemo } from 'react'
import {
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileEdit,
  FileMinus,
  FileSymlink,
  ExternalLink,
  GitBranch,
  Check,
  X,
  CheckCheck,
  Trash2,
} from 'lucide-react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { ClientEvent, FileDiff } from '@/types'

interface GitDiffPanelProps {
  send: (event: ClientEvent) => void
  paneId?: string  // undefined = workspace (shared) diffs; set = worktree pane diffs
}

const statusIcons: Record<string, typeof FilePlus> = {
  added: FilePlus,
  modified: FileEdit,
  deleted: FileMinus,
  renamed: FileSymlink,
}

const statusColors: Record<string, string> = {
  added: 'var(--status-running)',
  modified: 'var(--status-waiting)',
  deleted: 'var(--status-error)',
  renamed: 'var(--accent-primary)',
}

function DiffHunks({ hunks }: { hunks: string }) {
  if (!hunks) return null

  const lines = hunks.split('\n')

  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        lineHeight: 1.6,
        overflow: 'auto',
        borderTop: '1px solid var(--border-subtle)',
      }}
    >
      {lines.map((line, i) => {
        let bg = 'transparent'
        let color = 'var(--text-code)'

        if (line.startsWith('+') && !line.startsWith('+++')) {
          bg = 'var(--diff-added-bg)'
          color = 'var(--status-running)'
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          bg = 'var(--diff-removed-bg)'
          color = 'var(--status-error)'
        } else if (line.startsWith('@@')) {
          color = 'var(--accent-primary)'
        } else if (line.startsWith('diff') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++')) {
          color = 'var(--text-muted)'
        }

        return (
          <div
            key={i}
            style={{
              padding: '0 var(--space-md)',
              background: bg,
              color,
              whiteSpace: 'pre',
              minHeight: 'var(--font-xl)',
            }}
          >
            {line}
          </div>
        )
      })}
    </div>
  )
}

function ActionButton({ icon: Icon, title, onClick, color }: {
  icon: typeof Check
  title: string
  onClick: (e: React.MouseEvent) => void
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 6,
        display: 'flex',
        alignItems: 'center',
        borderRadius: 'var(--radius-sm)',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-elevated)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none'
      }}
    >
      <Icon className="icon-xs" style={{ color: color || 'var(--text-muted)' }} />
    </button>
  )
}

interface DiffFileItemProps {
  diff: FileDiff
  onAccept: (file: string) => void
  onDiscard: (file: string) => void
}

function DiffFileItem({ diff, onAccept, onDiscard }: DiffFileItemProps) {
  const [expanded, setExpanded] = useState(false)
  const { openFileTab } = useWorkspaceStore()
  const Icon = statusIcons[diff.status] || FileEdit

  const handleOpenFile = (e: React.MouseEvent) => {
    e.stopPropagation()
    openFileTab(diff.file)
  }

  const handleAccept = (e: React.MouseEvent) => {
    e.stopPropagation()
    onAccept(diff.file)
  }

  const handleDiscard = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDiscard(diff.file)
  }

  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          padding: 'var(--space-sm) var(--space-lg)',
          cursor: 'pointer',
          fontSize: 'var(--font-sm)',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-primary)',
          userSelect: 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-overlay)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        {expanded ? (
          <ChevronDown className="icon-xs" style={{ color: 'var(--text-muted)' }} />
        ) : (
          <ChevronRight className="icon-xs" style={{ color: 'var(--text-muted)' }} />
        )}
        <Icon className="icon-sm" style={{ color: statusColors[diff.status] }} />
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {diff.file}
        </span>
        {/* Action buttons in a container that prevents row toggle */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}
        >
          <ActionButton icon={ExternalLink} title="Open file" onClick={handleOpenFile} />
          <ActionButton icon={Check} title="Accept (stage)" onClick={handleAccept} color="var(--status-running)" />
          <ActionButton icon={X} title="Discard changes" onClick={handleDiscard} color="var(--status-error)" />
        </div>
        <span
          style={{
            fontSize: 'var(--font-xs)',
            color: statusColors[diff.status],
            textTransform: 'uppercase',
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {diff.status[0]}
        </span>
      </div>

      {expanded && diff.hunks && <DiffHunks hunks={diff.hunks} />}
    </div>
  )
}

export function GitDiffPanel({ send, paneId }: GitDiffPanelProps) {
  const { gitDiffs, panes, paneDiffs } = useWorkspaceStore()
  const [confirmDiscardAll, setConfirmDiscardAll] = useState(false)

  const isWorktree = !!paneId
  const pane = isWorktree ? panes.find((p) => p.id === paneId) : undefined

  // Determine which diffs to show
  const activeDiffs = useMemo(() => {
    if (paneId && paneDiffs[paneId]) {
      return paneDiffs[paneId]
    }
    if (paneId) {
      return [] // worktree pane but no diffs yet
    }
    return gitDiffs
  }, [paneId, paneDiffs, gitDiffs])

  const handleRefresh = useCallback(() => {
    if (paneId) {
      send({ type: 'pane.diff.refresh', paneId })
    } else {
      send({ type: 'git.refresh' })
    }
  }, [send, paneId])

  const handleAcceptFile = useCallback((file: string) => {
    send({ type: 'git.accept', file })
  }, [send])

  const handleDiscardFile = useCallback((file: string) => {
    send({ type: 'git.discard', file })
  }, [send])

  const handleAcceptAll = useCallback(() => {
    send({ type: 'git.accept.all' })
  }, [send])

  const handleDiscardAll = useCallback(() => {
    if (!confirmDiscardAll) {
      setConfirmDiscardAll(true)
      setTimeout(() => setConfirmDiscardAll(false), 3000)
      return
    }
    send({ type: 'git.discard.all' })
    setConfirmDiscardAll(false)
  }, [send, confirmDiscardAll])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header with context info + actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          padding: 'var(--space-sm) var(--space-lg)',
          flexShrink: 0,
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {isWorktree && pane?.branch && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 'var(--font-xs)',
              color: 'var(--accent-primary)',
              fontFamily: 'var(--font-mono)',
              background: 'var(--accent-subtle)',
              padding: '2px var(--space-sm)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <GitBranch size={11} />
            {pane.branch.replace('nexus/', '')}
          </span>
        )}
        <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', flex: 1 }}>
          {activeDiffs.length} change{activeDiffs.length !== 1 ? 's' : ''}
        </span>

        {/* Batch actions — only for workspace diffs (not worktree for now) */}
        {!isWorktree && activeDiffs.length > 0 && (
          <>
            <button
              onClick={handleAcceptAll}
              title="Accept all (stage all)"
              className="pane-action-btn"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-overlay)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none'
              }}
            >
              <CheckCheck className="icon-sm" style={{ color: 'var(--status-running)' }} />
            </button>
            <button
              onClick={handleDiscardAll}
              title={confirmDiscardAll ? 'Click again to confirm' : 'Discard all changes'}
              className="pane-action-btn"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-overlay)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none'
              }}
              style={confirmDiscardAll ? {
                background: 'var(--diff-removed-bg)',
                borderRadius: 'var(--radius-sm)',
              } : undefined}
            >
              <Trash2 className="icon-sm" style={{ color: 'var(--status-error)' }} />
            </button>
          </>
        )}

        <button
          onClick={handleRefresh}
          title="Refresh"
          className="pane-action-btn"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-overlay)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none'
          }}
        >
          <RefreshCw className="icon-sm" style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Diff list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeDiffs.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-muted)',
              fontSize: 'var(--font-sm)',
            }}
          >
            No changes
          </div>
        ) : (
          activeDiffs.map((diff) => (
            <DiffFileItem
              key={diff.file}
              diff={diff}
              onAccept={handleAcceptFile}
              onDiscard={handleDiscardFile}
            />
          ))
        )}
      </div>
    </div>
  )
}

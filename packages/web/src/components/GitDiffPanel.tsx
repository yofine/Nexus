import { useState, useCallback } from 'react'
import {
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileEdit,
  FileMinus,
  FileSymlink,
  ExternalLink,
} from 'lucide-react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { ClientEvent, FileDiff } from '@/types'

interface GitDiffPanelProps {
  send: (event: ClientEvent) => void
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

function DiffFileItem({ diff }: { diff: FileDiff }) {
  const [expanded, setExpanded] = useState(false)
  const { openFileTab } = useWorkspaceStore()
  const Icon = statusIcons[diff.status] || FileEdit

  const handleOpenFile = (e: React.MouseEvent) => {
    e.stopPropagation()
    openFileTab(diff.file)
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
        <button
          onClick={handleOpenFile}
          title="Open file"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 2,
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
          <ExternalLink className="icon-xs" style={{ color: 'var(--text-muted)' }} />
        </button>
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

export function GitDiffPanel({ send }: GitDiffPanelProps) {
  const { gitDiffs } = useWorkspaceStore()

  const handleRefresh = useCallback(() => {
    send({ type: 'git.refresh' })
  }, [send])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header with refresh button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          padding: 'var(--space-xs) var(--space-lg)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', flex: 1 }}>
          {gitDiffs.length} change{gitDiffs.length !== 1 ? 's' : ''}
        </span>
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
        {gitDiffs.length === 0 ? (
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
          gitDiffs.map((diff) => (
            <DiffFileItem key={diff.file} diff={diff} />
          ))
        )}
      </div>
    </div>
  )
}

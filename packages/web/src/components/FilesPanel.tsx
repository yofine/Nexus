import { useMemo, useState, useCallback } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { ActivityEntry } from '@/stores/workspaceStore'
import { getPaneColorById } from './AgentIcon'
import { ArrowUpDown, ArrowDown, ArrowUp, FileCode2, AlertTriangle } from 'lucide-react'
import type { FileDiff } from '@/types'

// ── Types ──

interface FileRow {
  file: string
  agents: Array<{ paneId: string; name: string }>
  linesAdded: number
  linesRemoved: number
  actionCount: number
  lastAction: string
  lastTimestamp: number
  isConflict: boolean
}

type SortKey = 'file' | 'changes' | 'actions' | 'agents' | 'time'

// ── Helpers ──

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function buildFileRows(
  activities: ActivityEntry[],
  gitDiffs: FileDiff[],
  gitStagedDiffs: FileDiff[],
  panes: Array<{ id: string }>,
): FileRow[] {
  // Collect per-file data from activities
  const fileMap = new Map<string, {
    agents: Map<string, string> // paneId -> name
    actionCount: number
    lastAction: string
    lastTimestamp: number
  }>()

  for (const a of activities) {
    let entry = fileMap.get(a.file)
    if (!entry) {
      entry = { agents: new Map(), actionCount: 0, lastAction: a.action, lastTimestamp: a.timestamp }
      fileMap.set(a.file, entry)
    }
    entry.agents.set(a.paneId, a.paneName)
    entry.actionCount++
    if (a.timestamp > entry.lastTimestamp) {
      entry.lastTimestamp = a.timestamp
      entry.lastAction = a.action
    }
  }

  // Build diff lookup for line counts
  const diffLookup = new Map<string, { added: number; removed: number }>()
  for (const diff of [...gitDiffs, ...gitStagedDiffs]) {
    if (!diff.hunks) continue
    let added = 0
    let removed = 0
    for (const line of diff.hunks.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) added++
      if (line.startsWith('-') && !line.startsWith('---')) removed++
    }
    const existing = diffLookup.get(diff.file)
    if (existing) {
      existing.added += added
      existing.removed += removed
    } else {
      diffLookup.set(diff.file, { added, removed })
    }
  }

  // Also include files from git diffs that have no activity yet
  for (const diff of [...gitDiffs, ...gitStagedDiffs]) {
    if (!fileMap.has(diff.file)) {
      fileMap.set(diff.file, {
        agents: new Map(),
        actionCount: 0,
        lastAction: diff.status === 'added' ? 'create' : 'edit',
        lastTimestamp: Date.now(),
      })
    }
  }

  const rows: FileRow[] = []
  for (const [file, data] of fileMap) {
    const diffData = diffLookup.get(file)
    const agents = Array.from(data.agents, ([paneId, name]) => ({ paneId, name }))
    const isConflict = agents.length > 1 && activities.some(
      (a) => a.file === file && a.action !== 'read',
    )

    rows.push({
      file,
      agents,
      linesAdded: diffData?.added || 0,
      linesRemoved: diffData?.removed || 0,
      actionCount: data.actionCount,
      lastAction: data.lastAction,
      lastTimestamp: data.lastTimestamp,
      isConflict,
    })
  }

  return rows
}

// ── Sort helpers ──

function sortRows(rows: FileRow[], key: SortKey, asc: boolean): FileRow[] {
  const sorted = [...rows]
  const dir = asc ? 1 : -1
  sorted.sort((a, b) => {
    switch (key) {
      case 'file':
        return dir * a.file.localeCompare(b.file)
      case 'changes':
        return dir * ((a.linesAdded + a.linesRemoved) - (b.linesAdded + b.linesRemoved))
      case 'actions':
        return dir * (a.actionCount - b.actionCount)
      case 'agents':
        return dir * (a.agents.length - b.agents.length)
      case 'time':
        return dir * (a.lastTimestamp - b.lastTimestamp)
      default:
        return 0
    }
  })
  return sorted
}

// ── Sort Header ──

function SortHeader({
  label,
  sortKey,
  currentKey,
  asc,
  onSort,
  align,
}: {
  label: string
  sortKey: SortKey
  currentKey: SortKey
  asc: boolean
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = currentKey === sortKey
  return (
    <button
      onClick={() => onSort(sortKey)}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.04em',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        padding: '0 2px',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        width: '100%',
      }}
    >
      {label}
      {active ? (
        asc ? <ArrowUp width={9} height={9} /> : <ArrowDown width={9} height={9} />
      ) : (
        <ArrowUpDown width={9} height={9} style={{ opacity: 0.3 }} />
      )}
    </button>
  )
}

// ── Change Bar ──

function ChangeBar({ added, removed }: { added: number; removed: number }) {
  const total = added + removed
  if (total === 0) return <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>—</span>

  const maxWidth = 60
  const addW = Math.max(1, Math.min(maxWidth * 0.8, (added / Math.max(total, 1)) * maxWidth))
  const remW = Math.max(1, Math.min(maxWidth * 0.8, (removed / Math.max(total, 1)) * maxWidth))

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#3FB950', minWidth: 24, textAlign: 'right' }}>
        +{added}
      </span>
      <div style={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <div style={{ width: addW, height: 4, borderRadius: 1, background: '#3FB950' }} />
        {removed > 0 && <div style={{ width: remW, height: 4, borderRadius: 1, background: '#F85149' }} />}
      </div>
      {removed > 0 && (
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#F85149' }}>
          -{removed}
        </span>
      )}
    </div>
  )
}

// ── Main Component ──

export function FilesPanel() {
  const activities = useWorkspaceStore((s) => s.activities)
  const gitDiffs = useWorkspaceStore((s) => s.gitDiffs)
  const gitStagedDiffs = useWorkspaceStore((s) => s.gitStagedDiffs)
  const panes = useWorkspaceStore((s) => s.panes)
  const openFileTab = useWorkspaceStore((s) => s.openFileTab)

  const [sortKey, setSortKey] = useState<SortKey>('changes')
  const [sortAsc, setSortAsc] = useState(false) // default desc for changes

  const handleSort = useCallback((key: SortKey) => {
    if (key === sortKey) {
      setSortAsc((prev) => !prev)
    } else {
      setSortKey(key)
      setSortAsc(key === 'file') // file asc by default, others desc
    }
  }, [sortKey])

  const rows = useMemo(
    () => buildFileRows(activities, gitDiffs, gitStagedDiffs, panes),
    [activities, gitDiffs, gitStagedDiffs, panes],
  )

  const sortedRows = useMemo(
    () => sortRows(rows, sortKey, sortAsc),
    [rows, sortKey, sortAsc],
  )

  if (sortedRows.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          height: '100%',
          color: 'var(--text-muted)',
          fontSize: 'var(--font-sm)',
        }}
      >
        <FileCode2 size={28} style={{ opacity: 0.3 }} />
        No files changed yet
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', fontSize: 'var(--font-xs)' }}>
      {/* Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 140px 60px 100px 70px',
          gap: 4,
          padding: '6px 12px',
          borderBottom: '1px solid var(--border-subtle)',
          position: 'sticky',
          top: 0,
          background: 'var(--bg-base)',
          zIndex: 1,
        }}
      >
        <SortHeader label="File" sortKey="file" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
        <SortHeader label="Changes" sortKey="changes" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
        <SortHeader label="Ops" sortKey="actions" currentKey={sortKey} asc={sortAsc} onSort={handleSort} align="right" />
        <SortHeader label="Agents" sortKey="agents" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
        <SortHeader label="Last" sortKey="time" currentKey={sortKey} asc={sortAsc} onSort={handleSort} align="right" />
      </div>

      {/* Rows */}
      {sortedRows.map((row) => (
        <div
          key={row.file}
          onClick={() => openFileTab(row.file)}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 140px 60px 100px 70px',
            gap: 4,
            padding: '5px 12px',
            borderBottom: '1px solid var(--border-subtle)',
            cursor: 'pointer',
            transition: 'background 0.1s',
            alignItems: 'center',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          {/* File name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            {row.isConflict && (
              <AlertTriangle width={11} height={11} style={{ color: '#FBBF24', flexShrink: 0 }} />
            )}
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontWeight: row.isConflict ? 600 : 400,
                }}
                title={row.file}
              >
                {row.file.split('/').pop()}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: 'var(--text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {row.file.includes('/') ? row.file.substring(0, row.file.lastIndexOf('/')) : '.'}
              </div>
            </div>
          </div>

          {/* Changes bar */}
          <ChangeBar added={row.linesAdded} removed={row.linesRemoved} />

          {/* Action count */}
          <div
            style={{
              textAlign: 'right',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
              fontSize: 11,
            }}
          >
            {row.actionCount || '—'}
          </div>

          {/* Agents */}
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {row.agents.map((a) => {
              const c = getPaneColorById(a.paneId, panes)
              return (
                <div
                  key={a.paneId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    fontSize: 10,
                  }}
                >
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: c, flexShrink: 0 }} />
                  <span style={{ color: c, fontWeight: 600, maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.name}
                  </span>
                </div>
              )
            })}
            {row.agents.length === 0 && (
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>—</span>
            )}
          </div>

          {/* Last activity */}
          <div
            style={{
              textAlign: 'right',
              color: 'var(--text-muted)',
              fontSize: 10,
              whiteSpace: 'nowrap',
            }}
          >
            {relativeTime(row.lastTimestamp)}
          </div>
        </div>
      ))}

      {/* Summary footer */}
      <div
        style={{
          padding: '8px 12px',
          fontSize: 10,
          color: 'var(--text-muted)',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          gap: 16,
        }}
      >
        <span>{sortedRows.length} files</span>
        <span style={{ color: '#3FB950' }}>
          +{sortedRows.reduce((s, r) => s + r.linesAdded, 0)}
        </span>
        <span style={{ color: '#F85149' }}>
          -{sortedRows.reduce((s, r) => s + r.linesRemoved, 0)}
        </span>
        {sortedRows.filter((r) => r.isConflict).length > 0 && (
          <span style={{ color: '#FBBF24' }}>
            {sortedRows.filter((r) => r.isConflict).length} conflicts
          </span>
        )}
      </div>
    </div>
  )
}

import { useMemo, useEffect, useState, useCallback, useRef } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { ActivityEntry } from '@/stores/workspaceStore'
import { getAgentColor } from './AgentIcon'
import { Eye, Pencil, FilePlus, FileX, FileCode2 } from 'lucide-react'
import type { FileAction } from '@/types'

// ── Helpers ──

function getActionIcon(action: FileAction, size: number) {
  const props = { width: size, height: size, strokeWidth: 1.5 }
  switch (action) {
    case 'read': return <Eye {...props} />
    case 'edit': return <Pencil {...props} />
    case 'write': return <FileCode2 {...props} />
    case 'create': return <FilePlus {...props} />
    case 'delete': return <FileX {...props} />
    default: return <FileCode2 {...props} />
  }
}

function getActionColor(action: FileAction): string {
  switch (action) {
    case 'read': return '#58A6FF'
    case 'edit': return '#F0883E'
    case 'write': return '#3FB950'
    case 'create': return '#3FB950'
    case 'delete': return '#F85149'
    default: return 'var(--text-secondary)'
  }
}

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function groupByDirectory(files: string[]): Map<string, string[]> {
  const dirs = new Map<string, string[]>()
  for (const file of files) {
    const parts = file.split('/')
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.'
    if (!dirs.has(dir)) dirs.set(dir, [])
    dirs.get(dir)!.push(file)
  }
  return dirs
}

// ── File Node ──

interface FileNodeProps {
  file: string
  agents: Array<{ paneId: string; paneName: string; agent: string; action: FileAction }>
  isNew: boolean
  onClickFile: (file: string) => void
}

function FileNode({ file, agents, isNew, onClickFile }: FileNodeProps) {
  const fileName = file.split('/').pop() || file

  return (
    <div
      className={isNew ? 'activity-file-node--new' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
      onClick={() => onClickFile(file)}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-overlay)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      {/* Agent cursors */}
      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
        {agents.map((a) => (
          <div
            key={a.paneId}
            className="agent-cursor-dot"
            style={{
              '--cursor-color': getAgentColor(a.agent),
            } as React.CSSProperties}
            title={`${a.paneName}: ${a.action}`}
          >
            <span style={{ color: getActionColor(a.action), display: 'flex' }}>
              {getActionIcon(a.action, 10)}
            </span>
          </div>
        ))}
      </div>

      {/* File name */}
      <span
        style={{
          fontSize: 'var(--font-sm)',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {fileName}
      </span>

      {/* Glow highlight when actively being worked on */}
      {agents.length > 0 && (
        <div
          className="file-active-glow"
          style={{
            '--glow-color': getAgentColor(agents[0].agent),
          } as React.CSSProperties}
        />
      )}
    </div>
  )
}

// ── Directory Group ──

interface DirGroupProps {
  dir: string
  files: string[]
  activeFileAgents: Map<string, Array<{ paneId: string; paneName: string; agent: string; action: FileAction }>>
  newFiles: Set<string>
  onClickFile: (file: string) => void
}

function DirGroup({ dir, files, activeFileAgents, newFiles, onClickFile }: DirGroupProps) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{
          fontSize: 'var(--font-xs)',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          padding: '2px 8px',
          userSelect: 'none',
        }}
      >
        {dir === '.' ? '/' : dir + '/'}
      </div>
      <div style={{ paddingLeft: 8 }}>
        {files.map((file) => (
          <FileNode
            key={file}
            file={file}
            agents={activeFileAgents.get(file) || []}
            isNew={newFiles.has(file)}
            onClickFile={onClickFile}
          />
        ))}
      </div>
    </div>
  )
}

// ── Timeline Entry ──

function TimelineEntry({ entry, isNew }: { entry: ActivityEntry; isNew: boolean }) {
  const [timeStr, setTimeStr] = useState(() => relativeTime(entry.timestamp))
  const color = getAgentColor(entry.agent)

  useEffect(() => {
    const timer = setInterval(() => setTimeStr(relativeTime(entry.timestamp)), 5000)
    return () => clearInterval(timer)
  }, [entry.timestamp])

  return (
    <div
      className={isNew ? 'activity-timeline-entry--new' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 12px',
        fontSize: 'var(--font-xs)',
        minHeight: 24,
      }}
    >
      {/* Agent color bar */}
      <div style={{ width: 3, height: 16, borderRadius: 2, background: color, flexShrink: 0 }} />

      {/* Agent name */}
      <span style={{ color, fontWeight: 600, width: 72, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {entry.paneName}
      </span>

      {/* Action icon */}
      <span style={{ color: getActionColor(entry.action), display: 'flex', flexShrink: 0 }}>
        {getActionIcon(entry.action, 12)}
      </span>

      {/* File path */}
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}
      >
        {entry.file}
      </span>

      {/* Time */}
      <span style={{ color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
        {timeStr}
      </span>
    </div>
  )
}

// ── Main Component ──

export function ActivityMap() {
  const { activities, paneCurrentFile, panes, openFileTab } = useWorkspaceStore()
  const [newFileIds, setNewFileIds] = useState<Set<string>>(new Set())
  const [newEntryIds, setNewEntryIds] = useState<Set<string>>(new Set())
  const prevActivityCountRef = useRef(0)

  // Track new entries for animation
  useEffect(() => {
    if (activities.length > prevActivityCountRef.current) {
      const newIds = new Set<string>()
      const newFIds = new Set<string>()
      const newCount = activities.length - prevActivityCountRef.current
      for (let i = 0; i < Math.min(newCount, 5); i++) {
        newIds.add(activities[i].id)
        newFIds.add(activities[i].file)
      }
      setNewEntryIds(newIds)
      setNewFileIds(newFIds)
      // Clear animation flags after animation completes
      const timer = setTimeout(() => {
        setNewEntryIds(new Set())
        setNewFileIds(new Set())
      }, 800)
      prevActivityCountRef.current = activities.length
      return () => clearTimeout(timer)
    }
    prevActivityCountRef.current = activities.length
  }, [activities])

  // Build active file map from paneCurrentFile
  const activeFileAgents = useMemo(() => {
    const map = new Map<string, Array<{ paneId: string; paneName: string; agent: string; action: FileAction }>>()
    for (const [paneId, current] of Object.entries(paneCurrentFile)) {
      const pane = panes.find((p) => p.id === paneId)
      if (!pane) continue
      if (!map.has(current.file)) map.set(current.file, [])
      map.get(current.file)!.push({
        paneId,
        paneName: pane.name,
        agent: pane.agent,
        action: current.action,
      })
    }
    return map
  }, [paneCurrentFile, panes])

  // Build touched files list from recent activities (last 30 unique files)
  const touchedFiles = useMemo(() => {
    const seen = new Set<string>()
    const files: string[] = []
    for (const act of activities) {
      if (!seen.has(act.file)) {
        seen.add(act.file)
        files.push(act.file)
        if (files.length >= 30) break
      }
    }
    return files
  }, [activities])

  // Group by directory
  const dirGroups = useMemo(() => groupByDirectory(touchedFiles), [touchedFiles])

  const handleClickFile = useCallback((file: string) => {
    openFileTab(file)
  }, [openFileTab])

  // Empty state
  if (activities.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 16,
          color: 'var(--text-muted)',
        }}
      >
        <div className="activity-empty-orbit">
          <div className="orbit-ring" />
          <div className="orbit-dot orbit-dot--1" />
          <div className="orbit-dot orbit-dot--2" />
          <div className="orbit-dot orbit-dot--3" />
        </div>
        <span style={{ fontSize: 'var(--font-lg)' }}>Waiting for agent activity...</span>
        <span style={{ fontSize: 'var(--font-xs)' }}>File operations will appear here in real-time</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Top: Active file map */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
          padding: '8px 4px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {/* Active agents summary bar */}
        <div
          style={{
            display: 'flex',
            gap: 12,
            padding: '4px 12px 8px',
            flexWrap: 'wrap',
          }}
        >
          {panes.filter((p) => paneCurrentFile[p.id]).map((pane) => {
            const current = paneCurrentFile[pane.id]
            const color = getAgentColor(pane.agent)
            return (
              <div
                key={pane.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-md)',
                  background: `color-mix(in srgb, ${color} 12%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
                  fontSize: 'var(--font-xs)',
                }}
              >
                <div
                  className="agent-cursor-breathing"
                  style={{
                    '--cursor-color': color,
                  } as React.CSSProperties}
                />
                <span style={{ color, fontWeight: 600 }}>{pane.name}</span>
                <span style={{ color: 'var(--text-muted)' }}>→</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  {current.file.split('/').pop()}
                </span>
              </div>
            )
          })}
        </div>

        {/* File tree map */}
        <div>
          {Array.from(dirGroups.entries()).map(([dir, files]) => (
            <DirGroup
              key={dir}
              dir={dir}
              files={files}
              activeFileAgents={activeFileAgents}
              newFiles={newFileIds}
              onClickFile={handleClickFile}
            />
          ))}
        </div>
      </div>

      {/* Bottom: Timeline */}
      <div
        style={{
          flexShrink: 0,
          maxHeight: 200,
          overflow: 'auto',
          background: 'var(--bg-surface)',
        }}
      >
        <div
          style={{
            padding: '6px 12px 2px',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            userSelect: 'none',
          }}
        >
          Timeline
        </div>
        {activities.slice(0, 30).map((entry) => (
          <TimelineEntry
            key={entry.id}
            entry={entry}
            isNew={newEntryIds.has(entry.id)}
          />
        ))}
      </div>
    </div>
  )
}

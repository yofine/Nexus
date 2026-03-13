import { useMemo, useEffect, useState, useCallback, useRef } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { ActivityEntry } from '@/stores/workspaceStore'
import { getAgentColor } from './AgentIcon'
import { DependencyTopology, VIEW_MODE_META, type ViewMode } from './DependencyTopology'
import { Eye, Pencil, FilePlus, FileX, FileCode2, Filter, GitFork, FolderTree, Flame, Users, Clock } from 'lucide-react'
import type { FileAction, DepGraph } from '@/types'

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
      <div style={{ width: 3, height: 16, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ color, fontWeight: 600, minWidth: 100, maxWidth: 140, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {entry.paneName}
      </span>
      <span style={{ color: getActionColor(entry.action), display: 'flex', flexShrink: 0 }}>
        {getActionIcon(entry.action, 12)}
      </span>
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
      <span style={{ color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
        {timeStr}
      </span>
    </div>
  )
}

// ── View Mode Icons ──

const VIEW_ICONS: Record<ViewMode, typeof GitFork> = {
  dependency: GitFork,
  directory:  FolderTree,
  heatmap:    Flame,
  agent:      Users,
  temporal:   Clock,
}

// ── Main Component ──

export function ActivityMap() {
  const { activities, paneCurrentFile, panes, openFileTab, depGraph, setDepGraph } = useWorkspaceStore()
  const [newEntryIds, setNewEntryIds] = useState<Set<string>>(new Set())
  const prevActivityCountRef = useRef(0)
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('dependency')
  const [filterPaneId, setFilterPaneId] = useState<string | null>(null)

  // Fetch dependency graph on mount
  useEffect(() => {
    if (!depGraph) {
      fetchDepGraph()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchDepGraph = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/deps')
      if (res.ok) {
        const graph: DepGraph = await res.json()
        setDepGraph(graph)
      }
    } catch (err) {
      console.error('Failed to fetch dependency graph:', err)
    } finally {
      setLoading(false)
    }
  }, [setDepGraph])

  // Track new entries for animation
  useEffect(() => {
    if (activities.length > prevActivityCountRef.current) {
      const newIds = new Set<string>()
      const newCount = activities.length - prevActivityCountRef.current
      for (let i = 0; i < Math.min(newCount, 5); i++) {
        newIds.add(activities[i].id)
      }
      setNewEntryIds(newIds)
      const timer = setTimeout(() => setNewEntryIds(new Set()), 800)
      prevActivityCountRef.current = activities.length
      return () => clearTimeout(timer)
    }
    prevActivityCountRef.current = activities.length
  }, [activities])

  const filteredActivities = useMemo(() => {
    if (!filterPaneId) return activities
    return activities.filter((a) => a.paneId === filterPaneId)
  }, [activities, filterPaneId])

  // Get unique panes that have activity
  const activePaneList = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; agent: string }>()
    for (const a of activities) {
      if (!seen.has(a.paneId)) {
        seen.set(a.paneId, { id: a.paneId, name: a.paneName, agent: a.agent })
      }
    }
    return Array.from(seen.values())
  }, [activities])

  const handleClickFile = useCallback((file: string) => {
    openFileTab(file)
  }, [openFileTab])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Row 1: View mode tabs */}
      <div
        style={{
          flexShrink: 0,
          borderBottom: '1px solid var(--border-subtle)',
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minHeight: 32,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 1,
            background: 'var(--bg-primary)',
            borderRadius: 'var(--radius-md)',
            padding: 2,
            border: '1px solid var(--border-subtle)',
          }}
        >
          {(Object.keys(VIEW_MODE_META) as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              title={VIEW_MODE_META[mode].desc}
              style={{
                background: viewMode === mode
                  ? 'var(--bg-elevated)'
                  : 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '2px 8px',
                fontSize: 'var(--font-xs)',
                color: viewMode === mode ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: viewMode === mode ? 600 : 400,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {(() => { const ModeIcon = VIEW_ICONS[mode]; return <ModeIcon width={10} height={10} /> })()}
              <span>{VIEW_MODE_META[mode].label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Row 2: Active agents */}
      {panes.some((p) => paneCurrentFile[p.id]) && (
        <div
          style={{
            flexShrink: 0,
            borderBottom: '1px solid var(--border-subtle)',
            padding: '4px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
            minHeight: 28,
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
                  style={{ '--cursor-color': color } as React.CSSProperties}
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
      )}

      {/* Center: Topology graph */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {loading && !depGraph ? (
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
            Analyzing dependencies...
          </div>
        ) : depGraph ? (
          <DependencyTopology
            graph={depGraph}
            viewMode={viewMode}
            onClickFile={handleClickFile}
          />
        ) : (
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
        )}
      </div>

      {/* Bottom: Timeline */}
      <div
        style={{
          flexShrink: 0,
          maxHeight: 200,
          overflow: 'auto',
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <div
          style={{
            padding: '6px 12px 2px',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-muted)',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            userSelect: 'none',
          }}
        >
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>Timeline</span>

          {/* Agent filter chips */}
          {activePaneList.length > 1 && (
            <>
              <div style={{ width: 1, height: 12, background: 'var(--border-subtle)' }} />
              <Filter width={10} height={10} style={{ opacity: 0.5 }} />
              <button
                onClick={() => setFilterPaneId(null)}
                style={{
                  background: !filterPaneId ? 'var(--bg-elevated)' : 'none',
                  border: !filterPaneId ? '1px solid var(--border-default)' : '1px solid transparent',
                  borderRadius: 'var(--radius-sm)',
                  padding: '1px 6px',
                  fontSize: 'var(--font-xs)',
                  color: !filterPaneId ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: !filterPaneId ? 600 : 400,
                }}
              >
                All
              </button>
              {activePaneList.map((p) => {
                const color = getAgentColor(p.agent)
                const isActive = filterPaneId === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => setFilterPaneId(isActive ? null : p.id)}
                    style={{
                      background: isActive ? `color-mix(in srgb, ${color} 15%, transparent)` : 'none',
                      border: isActive ? `1px solid color-mix(in srgb, ${color} 30%, transparent)` : '1px solid transparent',
                      borderRadius: 'var(--radius-sm)',
                      padding: '1px 6px',
                      fontSize: 'var(--font-xs)',
                      color: isActive ? color : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontWeight: isActive ? 600 : 400,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                    }}
                  >
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: color }} />
                    {p.name}
                  </button>
                )
              })}
            </>
          )}
        </div>
        {filteredActivities.length === 0 ? (
          <div style={{ padding: '8px 12px', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
            {filterPaneId ? 'No activity for this agent' : 'No activity yet'}
          </div>
        ) : (
          filteredActivities.slice(0, 30).map((entry) => (
            <TimelineEntry
              key={entry.id}
              entry={entry}
              isNew={newEntryIds.has(entry.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

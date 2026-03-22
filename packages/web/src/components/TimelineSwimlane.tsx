import { useState, useMemo } from 'react'
import { useWorkspaceStore, type ActivityEntry } from '@/stores/workspaceStore'
import { getPaneColorById } from './AgentIcon'
import type { FileAction } from '@/types'

const ACTION_COLORS: Record<FileAction, string> = {
  read: '#58A6FF',
  edit: '#F0883E',
  write: '#3FB950',
  create: '#3FB950',
  delete: '#F85149',
  bash: 'var(--text-muted)',
}

const TIME_RANGES = [
  { label: '5min', ms: 5 * 60 * 1000 },
  { label: '15min', ms: 15 * 60 * 1000 },
  { label: '30min', ms: 30 * 60 * 1000 },
  { label: '1h', ms: 60 * 60 * 1000 },
] as const

const LANE_HEIGHT = 32
const LABEL_WIDTH = 140
const DOT_RADIUS = 4
const PADDING_TOP = 32
const PADDING_BOTTOM = 24
const TICK_COUNT = 6

function formatRelativeTime(ms: number): string {
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.round(min / 60)
  return `${hr}h`
}

function shortFileName(path: string): string {
  const parts = path.split('/')
  return parts.length > 1
    ? parts.slice(-2).join('/')
    : parts[parts.length - 1] || path
}

export function TimelineSwimlane() {
  const activities = useWorkspaceStore((s) => s.activities)
  const panes = useWorkspaceStore((s) => s.panes)
  const [rangeMs, setRangeMs] = useState(TIME_RANGES[1].ms)
  const [tooltip, setTooltip] = useState<{
    x: number
    y: number
    entry: ActivityEntry
  } | null>(null)

  const now = useMemo(() => Date.now(), [activities])

  const cutoff = now - rangeMs
  const filtered = useMemo(
    () => activities.filter((a) => a.timestamp >= cutoff),
    [activities, cutoff],
  )

  // Determine unique swim lanes (by paneId, ordered by first appearance)
  const lanes = useMemo(() => {
    const seen = new Map<string, { paneId: string; paneName: string }>()
    // Use reverse so earliest appears first
    for (let i = filtered.length - 1; i >= 0; i--) {
      const a = filtered[i]
      if (!seen.has(a.paneId)) {
        seen.set(a.paneId, { paneId: a.paneId, paneName: a.paneName })
      }
    }
    return Array.from(seen.values())
  }, [filtered])

  // Find cross-agent file connections (same file touched by different panes)
  const crossFileLinks = useMemo(() => {
    const byFile = new Map<string, ActivityEntry[]>()
    for (const a of filtered) {
      const list = byFile.get(a.file)
      if (list) list.push(a)
      else byFile.set(a.file, [a])
    }
    const links: Array<{ file: string; entries: ActivityEntry[] }> = []
    for (const [file, entries] of byFile) {
      const uniquePanes = new Set(entries.map((e) => e.paneId))
      if (uniquePanes.size > 1) {
        links.push({ file, entries })
      }
    }
    return links
  }, [filtered])

  const svgWidth = 600
  const chartWidth = svgWidth - LABEL_WIDTH
  const svgHeight = PADDING_TOP + lanes.length * LANE_HEIGHT + PADDING_BOTTOM

  function xForTime(ts: number): number {
    const ratio = (ts - cutoff) / rangeMs
    return LABEL_WIDTH + ratio * chartWidth
  }

  function yForLane(paneId: string): number {
    const idx = lanes.findIndex((l) => l.paneId === paneId)
    return PADDING_TOP + idx * LANE_HEIGHT + LANE_HEIGHT / 2
  }

  // Generate tick marks
  const ticks = useMemo(() => {
    const result: Array<{ x: number; label: string }> = []
    for (let i = 0; i < TICK_COUNT; i++) {
      const ratio = i / (TICK_COUNT - 1)
      const ts = cutoff + ratio * rangeMs
      const x = LABEL_WIDTH + ratio * chartWidth
      const label = i === TICK_COUNT - 1 ? 'now' : formatRelativeTime(now - ts)
      result.push({ x, label })
    }
    return result
  }, [cutoff, rangeMs, chartWidth, now])

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)',
        padding: '8px 12px',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        overflow: 'hidden',
      }}
    >
      {/* Time range selector */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginBottom: 8,
        }}
      >
        <span style={{ color: 'var(--text-muted)', marginRight: 8, fontSize: 'var(--font-sm)' }}>
          Timeline
        </span>
        {TIME_RANGES.map((r) => (
          <button
            key={r.label}
            onClick={() => setRangeMs(r.ms)}
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid',
              borderColor:
                rangeMs === r.ms ? 'var(--accent-primary)' : 'var(--border-subtle)',
              background:
                rangeMs === r.ms ? 'var(--accent-primary)' : 'transparent',
              color:
                rangeMs === r.ms ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 'var(--font-xs)',
              fontFamily: 'var(--font-mono)',
              lineHeight: '18px',
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {lanes.length === 0 ? (
        <div
          style={{
            color: 'var(--text-muted)',
            textAlign: 'center',
            padding: '24px 0',
          }}
        >
          No activity in this time range
        </div>
      ) : (
        <div style={{ position: 'relative', overflowX: 'auto' }}>
          <svg
            width="100%"
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ display: 'block', minWidth: 400 }}
          >
            {/* Tick marks and time labels */}
            {ticks.map((tick, i) => (
              <g key={i}>
                <line
                  x1={tick.x}
                  y1={PADDING_TOP - 4}
                  x2={tick.x}
                  y2={PADDING_TOP + lanes.length * LANE_HEIGHT}
                  stroke="var(--border-subtle)"
                  strokeWidth={0.5}
                  strokeDasharray={i === ticks.length - 1 ? 'none' : '2,3'}
                />
                <text
                  x={tick.x}
                  y={PADDING_TOP - 10}
                  textAnchor="middle"
                  fill="var(--text-muted)"
                  fontSize={10}
                  fontFamily="var(--font-mono)"
                >
                  {tick.label}
                </text>
              </g>
            ))}

            {/* Swim lane rows */}
            {lanes.map((lane, idx) => {
              const y = PADDING_TOP + idx * LANE_HEIGHT
              const color = getPaneColorById(lane.paneId, panes)
              return (
                <g key={lane.paneId}>
                  {/* Lane background stripe */}
                  {idx % 2 === 0 && (
                    <rect
                      x={LABEL_WIDTH}
                      y={y}
                      width={chartWidth}
                      height={LANE_HEIGHT}
                      fill="var(--text-muted)"
                      opacity={0.03}
                    />
                  )}
                  {/* Lane baseline */}
                  <line
                    x1={LABEL_WIDTH}
                    y1={y + LANE_HEIGHT / 2}
                    x2={LABEL_WIDTH + chartWidth}
                    y2={y + LANE_HEIGHT / 2}
                    stroke="var(--border-subtle)"
                    strokeWidth={0.5}
                  />
                  {/* Label: color dot + name */}
                  <circle
                    cx={12}
                    cy={y + LANE_HEIGHT / 2}
                    r={4}
                    fill={color}
                  />
                  <text
                    x={22}
                    y={y + LANE_HEIGHT / 2 + 4}
                    fill="var(--text-primary)"
                    fontSize={11}
                    fontFamily="var(--font-mono)"
                  >
                    {lane.paneName.length > 14
                      ? lane.paneName.slice(0, 13) + '\u2026'
                      : lane.paneName}
                  </text>
                </g>
              )
            })}

            {/* Cross-file dashed vertical lines */}
            {crossFileLinks.map((link) => {
              // For each pair of panes, draw one connector between the latest event from each
              const byPane = new Map<string, typeof link.entries[0]>()
              for (const e of link.entries) {
                const prev = byPane.get(e.paneId)
                if (!prev || e.timestamp > prev.timestamp) byPane.set(e.paneId, e)
              }
              const representatives = [...byPane.values()]
              const lines: JSX.Element[] = []
              for (let i = 0; i < representatives.length; i++) {
                for (let j = i + 1; j < representatives.length; j++) {
                  const a = representatives[i]
                  const b = representatives[j]
                  const midX = (xForTime(a.timestamp) + xForTime(b.timestamp)) / 2
                  lines.push(
                    <line
                      key={`${link.file}-${a.paneId}-${b.paneId}`}
                      x1={midX}
                      y1={Math.min(yForLane(a.paneId), yForLane(b.paneId))}
                      x2={midX}
                      y2={Math.max(yForLane(a.paneId), yForLane(b.paneId))}
                      stroke="var(--text-muted)"
                      strokeWidth={0.8}
                      strokeDasharray="3,3"
                      opacity={0.5}
                    />,
                  )
                }
              }
              return lines
            })}

            {/* Event dots */}
            {filtered.map((entry) => {
              const x = xForTime(entry.timestamp)
              const y = yForLane(entry.paneId)
              const color = ACTION_COLORS[entry.action] || 'var(--text-muted)'
              return (
                <circle
                  key={entry.id}
                  cx={x}
                  cy={y}
                  r={DOT_RADIUS}
                  fill={color}
                  stroke="var(--bg-surface)"
                  strokeWidth={1}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => {
                    const svgEl = e.currentTarget.closest('svg')
                    if (!svgEl) return
                    const rect = svgEl.getBoundingClientRect()
                    const pt = svgEl.createSVGPoint()
                    pt.x = x
                    pt.y = y
                    const ctm = svgEl.getScreenCTM()
                    if (!ctm) return
                    const screenPt = pt.matrixTransform(ctm)
                    setTooltip({
                      x: screenPt.x - rect.left,
                      y: screenPt.y - rect.top,
                      entry,
                    })
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              )
            })}

            {/* Bottom time axis line */}
            <line
              x1={LABEL_WIDTH}
              y1={PADDING_TOP + lanes.length * LANE_HEIGHT}
              x2={LABEL_WIDTH + chartWidth}
              y2={PADDING_TOP + lanes.length * LANE_HEIGHT}
              stroke="var(--border-subtle)"
              strokeWidth={1}
            />
          </svg>

          {/* Tooltip */}
          {tooltip && (
            <div
              style={{
                position: 'absolute',
                left: tooltip.x,
                top: tooltip.y - 40,
                transform: 'translateX(-50%)',
                background: 'var(--bg-elevated, var(--bg-surface))',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 8px',
                fontSize: 'var(--font-xs)',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                zIndex: 50,
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
            >
              <span
                style={{
                  color: ACTION_COLORS[tooltip.entry.action] || 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                {tooltip.entry.action}
              </span>{' '}
              <span style={{ color: 'var(--text-secondary, var(--text-muted))' }}>
                {shortFileName(tooltip.entry.file)}
              </span>{' '}
              <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                {formatRelativeTime(now - tooltip.entry.timestamp)} ago
              </span>
            </div>
          )}
        </div>
      )}

      {/* Action color legend */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginTop: 6,
          flexWrap: 'wrap',
        }}
      >
        {(['read', 'edit', 'write', 'create', 'delete', 'bash'] as FileAction[]).map(
          (action) => (
            <span
              key={action}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                color: 'var(--text-muted)',
                fontSize: 'var(--font-xs)',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: ACTION_COLORS[action],
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              {action}
            </span>
          ),
        )}
      </div>
    </div>
  )
}

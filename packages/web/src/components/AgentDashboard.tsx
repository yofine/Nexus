import { useMemo, useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { ActivityEntry } from '@/stores/workspaceStore'
import { getPaneColorById } from './AgentIcon'
import type { PaneState, FileDiff } from '@/types'
import { Activity, FileCode2, DollarSign, Brain, Clock, AlertTriangle } from 'lucide-react'

// ── Helpers ──

function formatUptime(startedAt?: string): string {
  if (!startedAt) return '-'
  const ms = Date.now() - new Date(startedAt).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

interface AgentStats {
  fileCount: number
  linesAdded: number
  linesRemoved: number
  conflictFiles: number
  recentFiles: string[]
  sparkline: number[] // 6 buckets, most recent last
}

function computeStats(
  pane: PaneState,
  activities: ActivityEntry[],
  paneDiffs: FileDiff[],
  allActivities: ActivityEntry[],
): AgentStats {
  const touchedFiles = new Set<string>()
  const paneActivities = activities.filter((a) => a.paneId === pane.id)
  for (const a of paneActivities) touchedFiles.add(a.file)

  let linesAdded = 0
  let linesRemoved = 0
  for (const diff of paneDiffs) {
    if (!diff.hunks) continue
    const lines = diff.hunks.split('\n')
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) linesAdded++
      if (line.startsWith('-') && !line.startsWith('---')) linesRemoved++
    }
  }

  const conflictFiles = new Set<string>()
  for (const file of touchedFiles) {
    const otherWriters = allActivities.filter(
      (a) => a.file === file && a.paneId !== pane.id && a.action !== 'read',
    )
    if (otherWriters.length > 0 && paneActivities.some((a) => a.file === file && a.action !== 'read')) {
      conflictFiles.add(file)
    }
  }

  const recentFiles: string[] = []
  const seen = new Set<string>()
  for (const a of [...paneActivities].sort((x, y) => y.timestamp - x.timestamp)) {
    if (!seen.has(a.file)) {
      seen.add(a.file)
      recentFiles.push(a.file)
      if (recentFiles.length >= 5) break
    }
  }

  const now = Date.now()
  const bucketMs = (30 * 60 * 1000) / 6
  const sparkline = [0, 0, 0, 0, 0, 0]
  for (const a of paneActivities) {
    const age = now - a.timestamp
    if (age > 30 * 60 * 1000) continue
    const bucket = 5 - Math.min(5, Math.floor(age / bucketMs))
    sparkline[bucket]++
  }

  return {
    fileCount: touchedFiles.size,
    linesAdded,
    linesRemoved,
    conflictFiles: conflictFiles.size,
    recentFiles,
    sparkline,
  }
}

// ── Sparkline ──

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1)
  const h = 20
  const w = 64
  const barW = w / data.length - 2

  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      {data.map((v, i) => {
        const barH = Math.max(1, (v / max) * (h - 2))
        return (
          <rect
            key={i}
            x={i * (barW + 2)}
            y={h - barH}
            width={barW}
            height={barH}
            rx={1}
            fill={v > 0 ? color : 'var(--border-subtle)'}
            opacity={v > 0 ? 0.5 + (v / max) * 0.5 : 0.3}
          />
        )
      })}
    </svg>
  )
}

// ── Context Bar ──

function ContextBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Brain width={10} height={10} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <div
        style={{
          flex: 1,
          height: 3,
          borderRadius: 2,
          background: 'var(--border-subtle)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 2,
            background: pct > 80 ? 'var(--status-error)' : pct > 50 ? color : 'var(--status-running)',
            transition: 'width 0.3s',
          }}
        />
      </div>
      <span
        style={{
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          color: pct > 80 ? 'var(--status-error)' : 'var(--text-muted)',
          minWidth: 28,
          textAlign: 'right',
        }}
      >
        {pct}%
      </span>
    </div>
  )
}

// ── Status Badge ──

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  running: { bg: 'color-mix(in srgb, var(--status-running) 15%, transparent)', color: 'var(--status-running)', label: 'Running' },
  waiting: { bg: 'color-mix(in srgb, var(--status-waiting) 15%, transparent)', color: 'var(--status-waiting)', label: 'Waiting' },
  idle: { bg: 'var(--bg-surface)', color: 'var(--text-muted)', label: 'Idle' },
  stopped: { bg: 'var(--bg-surface)', color: 'var(--text-muted)', label: 'Stopped' },
  error: { bg: 'color-mix(in srgb, var(--status-error) 15%, transparent)', color: 'var(--status-error)', label: 'Error' },
}

// ── Agent Card ──

function AgentCard({ pane, color, stats }: { pane: PaneState; color: string; stats: AgentStats }) {
  const style = STATUS_STYLES[pane.status] || STATUS_STYLES.idle
  const [uptime, setUptime] = useState(() => formatUptime(pane.startedAt))

  useEffect(() => {
    if (pane.status !== 'running' && pane.status !== 'waiting') return
    const timer = setInterval(() => setUptime(formatUptime(pane.startedAt)), 5000)
    return () => clearInterval(timer)
  }, [pane.startedAt, pane.status])

  return (
    <div
      style={{
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Color header bar */}
      <div style={{ height: 3, background: color }} />

      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Row 1: Name + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: color,
              boxShadow: `0 0 6px ${color}66`,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontWeight: 700,
              fontSize: 'var(--font-md)',
              color: 'var(--text-primary)',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {pane.name}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: style.color,
              background: style.bg,
              padding: '1px 8px',
              borderRadius: 'var(--radius-sm)',
              lineHeight: '16px',
            }}
          >
            {style.label}
          </span>
        </div>

        {/* Row 2: Inline metrics */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <FileCode2 width={11} height={11} style={{ color: 'var(--text-muted)' }} />
            {stats.fileCount} files
          </span>
          {stats.linesAdded + stats.linesRemoved > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Activity width={11} height={11} style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--status-running)' }}>+{stats.linesAdded}</span>
              <span style={{ color: 'var(--status-error)' }}>-{stats.linesRemoved}</span>
            </span>
          )}
          {pane.meta.costUsd !== undefined && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <DollarSign width={10} height={10} style={{ color: 'var(--text-muted)' }} />
              {pane.meta.costUsd.toFixed(2)}
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock width={10} height={10} style={{ color: 'var(--text-muted)' }} />
            {uptime}
          </span>
        </div>

        {/* Row 3: Context bar */}
        {pane.meta.contextUsedPct !== undefined && (
          <ContextBar pct={pane.meta.contextUsedPct} color={color} />
        )}

        {/* Row 4: Sparkline + conflicts */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkline data={stats.sparkline} color={color} />
          <span style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>30min</span>
          <div style={{ flex: 1 }} />
          {stats.conflictFiles > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 11,
                color: 'var(--status-warning, #FBBF24)',
                fontWeight: 600,
              }}
            >
              <AlertTriangle width={11} height={11} />
              {stats.conflictFiles} conflict{stats.conflictFiles !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Row 5: Recent files */}
        {stats.recentFiles.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {stats.recentFiles.map((file) => (
              <span
                key={file}
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {file}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ──

export function AgentDashboard() {
  const panes = useWorkspaceStore((s) => s.panes)
  const activities = useWorkspaceStore((s) => s.activities)
  const paneDiffs = useWorkspaceStore((s) => s.paneDiffs)

  const agentStats = useMemo(() => {
    const map = new Map<string, AgentStats>()
    for (const pane of panes) {
      map.set(pane.id, computeStats(pane, activities, paneDiffs[pane.id] || [], activities))
    }
    return map
  }, [panes, activities, paneDiffs])

  if (panes.length === 0) {
    return (
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
        No agents running
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: panes.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 10,
        padding: 12,
        overflow: 'auto',
        height: '100%',
        alignContent: 'start',
      }}
    >
      {panes.map((pane) => (
        <AgentCard
          key={pane.id}
          pane={pane}
          color={getPaneColorById(pane.id, panes)}
          stats={agentStats.get(pane.id)!}
        />
      ))}
    </div>
  )
}

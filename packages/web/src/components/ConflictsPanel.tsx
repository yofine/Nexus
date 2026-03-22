import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, FileWarning, GitFork } from 'lucide-react'
import { useWorkspaceStore, type ActivityEntry } from '@/stores/workspaceStore'
import { getPaneColorById } from './AgentIcon'
import type { FileAction, DepGraph, PaneState } from '@/types'

type Severity = 'high' | 'medium' | 'low'

interface Conflict {
  id: string
  severity: Severity
  type: 'direct' | 'dependency' | 'historical'
  description: string
  files: string[]
  agents: Array<{ paneId: string; name: string }>
  timestamp: number
}

const SEVERITY_COLORS: Record<Severity, string> = {
  high: '#F85149',
  medium: '#F59E0B',
  low: '#58A6FF',
}

const SEVERITY_LABELS: Record<Severity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

function isWriteAction(action: FileAction): boolean {
  return action !== 'read'
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

function detectDirectConflicts(
  paneCurrentFile: Record<string, { file: string; action: FileAction }>,
  panes: PaneState[],
): Conflict[] {
  const fileToWriters = new Map<string, Array<{ paneId: string; name: string }>>()

  for (const [paneId, entry] of Object.entries(paneCurrentFile)) {
    if (!isWriteAction(entry.action)) continue
    const pane = panes.find((p) => p.id === paneId)
    if (!pane) continue
    const writers = fileToWriters.get(entry.file) || []
    writers.push({ paneId, name: pane.name })
    fileToWriters.set(entry.file, writers)
  }

  const conflicts: Conflict[] = []
  for (const [file, writers] of fileToWriters) {
    if (writers.length < 2) continue
    conflicts.push({
      id: `direct:${file}`,
      severity: 'high',
      type: 'direct',
      description: `Multiple agents are writing to the same file simultaneously`,
      files: [file],
      agents: writers,
      timestamp: Date.now(),
    })
  }
  return conflicts
}

function detectDependencyConflicts(
  paneCurrentFile: Record<string, { file: string; action: FileAction }>,
  panes: PaneState[],
  depGraph: DepGraph | null,
): Conflict[] {
  if (!depGraph || depGraph.nodes.length === 0) return []

  // Build a lookup: file path -> list of files it imports and files that import it
  const importsMap = new Map<string, Set<string>>()
  const importedByMap = new Map<string, Set<string>>()

  for (const node of depGraph.nodes) {
    importsMap.set(node.id, new Set(node.imports))
    for (const imp of node.imports) {
      const set = importedByMap.get(imp) || new Set()
      set.add(node.id)
      importedByMap.set(imp, set)
    }
  }

  // Collect panes that are writing
  const writingPanes: Array<{ paneId: string; name: string; file: string }> = []
  for (const [paneId, entry] of Object.entries(paneCurrentFile)) {
    if (!isWriteAction(entry.action)) continue
    const pane = panes.find((p) => p.id === paneId)
    if (!pane) continue
    writingPanes.push({ paneId, name: pane.name, file: entry.file })
  }

  const conflicts: Conflict[] = []
  const seen = new Set<string>()

  for (let i = 0; i < writingPanes.length; i++) {
    for (let j = i + 1; j < writingPanes.length; j++) {
      const a = writingPanes[i]
      const b = writingPanes[j]
      if (a.file === b.file) continue // already caught by direct conflict

      const aImportsB = importsMap.get(a.file)?.has(b.file)
      const bImportsA = importsMap.get(b.file)?.has(a.file)

      if (aImportsB || bImportsA) {
        const key = [a.file, b.file].sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)

        const direction = aImportsB
          ? `${a.file.split('/').pop()} imports ${b.file.split('/').pop()}`
          : `${b.file.split('/').pop()} imports ${a.file.split('/').pop()}`

        conflicts.push({
          id: `dep:${key}`,
          severity: 'medium',
          type: 'dependency',
          description: `Editing interdependent files: ${direction}`,
          files: [a.file, b.file],
          agents: [
            { paneId: a.paneId, name: a.name },
            { paneId: b.paneId, name: b.name },
          ],
          timestamp: Date.now(),
        })
      }
    }
  }

  return conflicts
}

function detectHistoricalConflicts(
  activities: ActivityEntry[],
  panes: PaneState[],
): Conflict[] {
  const fiveMinAgo = Date.now() - 5 * 60 * 1000
  const recent = activities.filter(
    (a) => a.timestamp >= fiveMinAgo && isWriteAction(a.action),
  )

  // Group by file
  const fileToAgents = new Map<string, Map<string, { paneId: string; name: string; timestamp: number }>>()

  for (const act of recent) {
    const agents = fileToAgents.get(act.file) || new Map()
    // Keep the most recent activity per agent for this file
    if (!agents.has(act.paneId) || agents.get(act.paneId)!.timestamp < act.timestamp) {
      agents.set(act.paneId, { paneId: act.paneId, name: act.paneName, timestamp: act.timestamp })
    }
    fileToAgents.set(act.file, agents)
  }

  const conflicts: Conflict[] = []
  for (const [file, agents] of fileToAgents) {
    if (agents.size < 2) continue
    const agentList = Array.from(agents.values())
    const latestTs = Math.max(...agentList.map((a) => a.timestamp))

    conflicts.push({
      id: `hist:${file}`,
      severity: 'low',
      type: 'historical',
      description: `File was written by multiple agents in the last 5 minutes`,
      files: [file],
      agents: agentList.map((a) => ({ paneId: a.paneId, name: a.name })),
      timestamp: latestTs,
    })
  }

  return conflicts
}

export function ConflictsPanel() {
  const panes = useWorkspaceStore((s) => s.panes)
  const paneCurrentFile = useWorkspaceStore((s) => s.paneCurrentFile)
  const activities = useWorkspaceStore((s) => s.activities)
  const depGraph = useWorkspaceStore((s) => s.depGraph)

  const conflicts = useMemo(() => {
    const direct = detectDirectConflicts(paneCurrentFile, panes)
    const dependency = detectDependencyConflicts(paneCurrentFile, panes, depGraph)
    const historical = detectHistoricalConflicts(activities, panes)

    // Deduplicate: if a file has a direct conflict, skip its historical conflict
    const directFiles = new Set(direct.flatMap((c) => c.files))
    const filteredHistorical = historical.filter(
      (c) => !c.files.some((f) => directFiles.has(f)),
    )

    return [...direct, ...dependency, ...filteredHistorical]
  }, [paneCurrentFile, activities, depGraph, panes])

  if (conflicts.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '32px 16px',
          color: 'var(--text-secondary)',
        }}
      >
        <CheckCircle2 size={32} style={{ color: '#3FB950' }} />
        <span style={{ fontSize: 13 }}>No conflicts detected</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 8 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--text-secondary)',
          padding: '4px 8px 8px',
        }}
      >
        Conflicts ({conflicts.length})
      </div>

      {conflicts.map((conflict) => {
        const color = SEVERITY_COLORS[conflict.severity]
        const SeverityIcon = conflict.type === 'dependency' ? GitFork : conflict.type === 'direct' ? AlertTriangle : FileWarning

        return (
          <div
            key={conflict.id}
            style={{
              padding: '10px 12px',
              borderRadius: 6,
              backgroundColor: 'var(--bg-surface)',
              border: `1px solid ${color}33`,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {/* Header: severity badge + icon */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SeverityIcon size={14} style={{ color, flexShrink: 0 }} />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#fff',
                  backgroundColor: color,
                  padding: '1px 6px',
                  borderRadius: 3,
                  lineHeight: '16px',
                }}
              >
                {SEVERITY_LABELS[conflict.severity]}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  marginLeft: 'auto',
                  flexShrink: 0,
                }}
              >
                {formatRelativeTime(conflict.timestamp)}
              </span>
            </div>

            {/* Files */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {conflict.files.map((file) => (
                <div
                  key={file}
                  style={{
                    fontSize: 12,
                    fontFamily: 'var(--font-mono, monospace)',
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={file}
                >
                  {file}
                </div>
              ))}
            </div>

            {/* Agents */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {conflict.agents.map((agent) => (
                <div
                  key={agent.paneId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: getPaneColorById(agent.paneId, panes),
                      flexShrink: 0,
                    }}
                  />
                  {agent.name}
                </div>
              ))}
            </div>

            {/* Description */}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
              {conflict.description}
            </div>
          </div>
        )
      })}
    </div>
  )
}

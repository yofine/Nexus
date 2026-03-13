import { useMemo, useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { ActivityEntry } from '@/stores/workspaceStore'
import type { DepGraph, FileAction, FileDiff } from '@/types'
import { getAgentColor } from './AgentIcon'

// ─── View Modes ─────────────────────────────────────────────

export type ViewMode = 'dependency' | 'directory' | 'heatmap' | 'agent' | 'temporal'

export const VIEW_MODE_META: Record<ViewMode, { label: string; desc: string }> = {
  dependency: { label: 'Imports',     desc: 'Import / dependency relationships' },
  directory:  { label: 'Directory',   desc: 'Directory structure (5 levels)' },
  heatmap:    { label: 'Heatmap',     desc: 'File activity frequency' },
  agent:      { label: 'Agent',       desc: 'File ownership by agent clusters' },
  temporal:   { label: 'Temporal',    desc: 'Chronological access order' },
}

// ─── Constants ──────────────────────────────────────────────

const NODE_WIDTH = 240
const NODE_HEIGHT = 96
const DIR_NODE_WIDTH = 220
const DIR_NODE_HEIGHT = 52

// ─── File role detection ────────────────────────────────────

type FileRole = 'component' | 'hook' | 'store' | 'type' | 'util' | 'style' | 'config' | 'test' | 'entry' | 'file'

const ROLE_META: Record<FileRole, { label: string; color: string }> = {
  component: { label: 'Component', color: '#58A6FF' },
  hook:      { label: 'Hook',      color: '#A78BFA' },
  store:     { label: 'Store',     color: '#34D399' },
  type:      { label: 'Type',      color: '#94A3B8' },
  util:      { label: 'Util',      color: '#FBBF24' },
  style:     { label: 'Style',     color: '#F472B6' },
  config:    { label: 'Config',    color: '#9CA3AF' },
  test:      { label: 'Test',      color: '#2DD4BF' },
  entry:     { label: 'Entry',     color: '#F59E0B' },
  file:      { label: 'File',      color: '#6B7280' },
}

function detectFileRole(filePath: string): FileRole {
  const lower = filePath.toLowerCase()
  const fileName = lower.split('/').pop() || ''
  const dir = lower.includes('/') ? lower.substring(0, lower.lastIndexOf('/')) : ''

  if (fileName.match(/\.(test|spec)\./)) return 'test'
  if (fileName.match(/^(index|main|app|entry)\.(ts|tsx|js|jsx)$/)) return 'entry'
  if (fileName.match(/\.(css|scss|less|styl)$/)) return 'style'
  if (fileName.match(/^(tsconfig|vite\.config|tailwind\.config|package)\./)) return 'config'
  if (fileName.match(/\.config\.(ts|js|mjs)$/)) return 'config'
  if (fileName.match(/^types?\.(ts|tsx)$/) || dir.includes('/types')) return 'type'
  if (fileName.match(/^use[A-Z]/) || dir.includes('/hooks')) return 'hook'
  if (dir.includes('/stores') || dir.includes('/store') || fileName.match(/Store\.(ts|tsx)$/)) return 'store'
  if (dir.includes('/utils') || dir.includes('/lib') || dir.includes('/helpers')) return 'util'
  if (dir.includes('/components') || fileName.match(/\.(tsx|jsx)$/)) return 'component'
  return 'file'
}

// ─── Git status helpers ─────────────────────────────────────

type GitStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'staged' | 'clean'

const GIT_STATUS_META: Record<GitStatus, { label: string; color: string }> = {
  modified: { label: 'M',  color: '#F0883E' },
  added:    { label: 'A',  color: '#3FB950' },
  deleted:  { label: 'D',  color: '#F85149' },
  renamed:  { label: 'R',  color: '#D2A8FF' },
  staged:   { label: 'S',  color: '#58A6FF' },
  clean:    { label: '',   color: 'transparent' },
}

function resolveGitStatus(
  filePath: string,
  unstaged: FileDiff[],
  staged: FileDiff[],
): GitStatus {
  const stagedFile = staged.find((d) => d.file === filePath)
  if (stagedFile) return 'staged'
  const unstagedFile = unstaged.find((d) => d.file === filePath)
  if (unstagedFile) return unstagedFile.status === 'renamed' ? 'renamed' : unstagedFile.status as GitStatus
  return 'clean'
}

// ─── Activity heat calculation ──────────────────────────────

function calcHeat(filePath: string, activities: ActivityEntry[]): number {
  let count = 0
  const now = Date.now()
  for (const a of activities) {
    if (a.file !== filePath) continue
    const age = (now - a.timestamp) / 1000
    count += age < 60 ? 1 : age < 300 ? 0.6 : age < 600 ? 0.3 : 0.1
  }
  return count
}

function heatToColor(heat: number, maxHeat: number): string {
  if (maxHeat <= 0 || heat <= 0) return 'transparent'
  const t = Math.min(heat / Math.max(maxHeat, 1), 1)
  if (t < 0.5) {
    const p = t / 0.5
    return `rgba(240, 136, 62, ${0.08 + p * 0.15})`
  }
  const p = (t - 0.5) / 0.5
  return `rgba(248, 81, 73, ${0.2 + p * 0.2})`
}

// ─── Relative time ──────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 5) return 'now'
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  return `${Math.floor(diff / 3600)}h`
}

// ─── Shared types ───────────────────────────────────────────

interface AgentActivity {
  paneId: string
  paneName: string
  agent: string
  action: FileAction
}

interface FileNodeData {
  label: string
  fullPath: string
  dir: string
  role: FileRole
  gitStatus: GitStatus
  heat: number
  maxHeat: number
  activeAgents: AgentActivity[]
  importCount: number
  importedByCount: number
  conflicting: boolean
  lastAgent: { name: string; timestamp: number } | null
  [key: string]: unknown
}

interface DirAgentInfo {
  paneId: string
  name: string
  agent: string
}

interface DirNodeData {
  label: string
  fullPath: string
  fileCount: number
  modifiedCount: number       // recursive: includes descendant dirs
  activeAgentList: DirAgentInfo[]  // unique agents operating in this dir (recursive)
  conflict: boolean           // multiple agents writing in this subtree
  heatTotal: number
  roles: Record<string, number>  // role -> count
  [key: string]: unknown
}

interface BuildContext {
  graph: DepGraph
  activeFileAgents: Map<string, AgentActivity[]>
  gitDiffs: FileDiff[]
  gitStagedDiffs: FileDiff[]
  activities: ActivityEntry[]
  panes: Array<{ id: string; name: string; agent: string }>
}

// ═══════════════════════════════════════════════════════════
// Layout Strategies
// ═══════════════════════════════════════════════════════════

// ─── 1. Dependency Layout (dagre LR) ────────────────────────

function layoutDependency(graph: DepGraph): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph({ compound: true })
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 8, ranksep: 36, edgesep: 4, marginx: 8, marginy: 8 })

  const nodeIds = new Set(graph.nodes.map((n) => n.id))
  const groups = new Map<string, string[]>()
  for (const node of graph.nodes) {
    const dir = node.id.includes('/') ? node.id.substring(0, node.id.lastIndexOf('/')) : '.'
    if (!groups.has(dir)) groups.set(dir, [])
    groups.get(dir)!.push(node.id)
  }
  for (const [group] of groups) {
    g.setNode(`__group:${group}`, { label: group, clusterLabelPos: 'top', style: 'fill: none' })
  }
  for (const node of graph.nodes) {
    const dir = node.id.includes('/') ? node.id.substring(0, node.id.lastIndexOf('/')) : '.'
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
    g.setParent(node.id, `__group:${dir}`)
  }
  for (const node of graph.nodes) {
    for (const imp of node.imports) {
      if (nodeIds.has(imp)) g.setEdge(node.id, imp)
    }
  }
  dagre.layout(g)

  const positions = new Map<string, { x: number; y: number }>()
  for (const node of graph.nodes) {
    const n = g.node(node.id)
    if (n) positions.set(node.id, { x: n.x - NODE_WIDTH / 2, y: n.y - NODE_HEIGHT / 2 })
  }
  return positions
}

// ─── 2. Directory Layout (tree structure with dagre TB) ──────

const DIR_DEPTH = 5

function getDirPath(filePath: string, maxDepth: number = DIR_DEPTH): string {
  const parts = filePath.split('/')
  if (parts.length <= 1) return '.'
  const dirParts = parts.slice(0, -1)
  return dirParts.slice(0, maxDepth).join('/')
}

interface DirectoryLayoutResult {
  dirNodes: Node[]
  dirEdges: Edge[]
}

function layoutDirectory(
  graph: DepGraph,
  activities: ActivityEntry[],
  gitDiffs: FileDiff[],
  gitStagedDiffs: FileDiff[],
  activeFileAgents: Map<string, AgentActivity[]>,
): DirectoryLayoutResult {
  // ── Step 1: Collect directory → direct files mapping ──
  const dirFiles = new Map<string, string[]>()
  const allDirs = new Set<string>()

  for (const node of graph.nodes) {
    const dir = getDirPath(node.id)
    if (!dirFiles.has(dir)) dirFiles.set(dir, [])
    dirFiles.get(dir)!.push(node.id)

    // Register all ancestor directories
    const parts = dir.split('/')
    for (let i = 1; i <= parts.length; i++) {
      allDirs.add(parts.slice(0, i).join('/'))
    }
    if (dir === '.') allDirs.add('.')
  }

  // ── Step 2: Build parent-child tree ──
  const childrenMap = new Map<string, Set<string>>()
  for (const dir of allDirs) {
    if (dir === '.') continue
    const parts = dir.split('/')
    const parent = parts.length > 1 ? parts.slice(0, -1).join('/') : '.'
    if (!allDirs.has(parent)) allDirs.add(parent)
    if (!childrenMap.has(parent)) childrenMap.set(parent, new Set())
    childrenMap.get(parent)!.add(dir)
  }

  // ── Step 3: Compute per-dir LOCAL stats (direct files only) ──
  const localModified = new Map<string, number>()
  const localAgents = new Map<string, Map<string, DirAgentInfo>>() // dir -> paneId -> info
  const localHeat = new Map<string, number>()
  const localRoles = new Map<string, Record<string, number>>()
  const localFileCount = new Map<string, number>()

  for (const dir of allDirs) {
    const files = dirFiles.get(dir) || []
    let modified = 0
    let heat = 0
    const roles: Record<string, number> = {}
    const agents = new Map<string, DirAgentInfo>()

    for (const file of files) {
      if (resolveGitStatus(file, gitDiffs, gitStagedDiffs) !== 'clean') modified++
      heat += calcHeat(file, activities)
      const role = detectFileRole(file)
      roles[role] = (roles[role] || 0) + 1

      // Collect unique agents operating on this file
      const fileAgents = activeFileAgents.get(file)
      if (fileAgents) {
        for (const a of fileAgents) {
          if (!agents.has(a.paneId)) {
            agents.set(a.paneId, { paneId: a.paneId, name: a.paneName, agent: a.agent })
          }
        }
      }
    }

    localModified.set(dir, modified)
    localAgents.set(dir, agents)
    localHeat.set(dir, heat)
    localRoles.set(dir, roles)
    localFileCount.set(dir, files.length)
  }

  // ── Step 4: Recursive rollup (bottom-up) ──
  // For each dir, accumulate descendant stats
  const recursiveFileCount = new Map<string, number>()
  const recursiveModified = new Map<string, number>()
  const recursiveAgents = new Map<string, Map<string, DirAgentInfo>>()
  const recursiveHasActivity = new Map<string, boolean>() // for edge highlight bubble-up

  // Process leaf-to-root via sorted by depth descending
  const sortedDirs = [...allDirs].sort((a, b) => {
    const da = a === '.' ? 0 : a.split('/').length
    const db = b === '.' ? 0 : b.split('/').length
    return db - da // deepest first
  })

  for (const dir of sortedDirs) {
    let totalFiles = localFileCount.get(dir) || 0
    let totalModified = localModified.get(dir) || 0
    const totalAgents = new Map(localAgents.get(dir) || [])
    let hasActivity = totalAgents.size > 0

    const children = childrenMap.get(dir)
    if (children) {
      for (const child of children) {
        totalFiles += recursiveFileCount.get(child) || 0
        totalModified += recursiveModified.get(child) || 0
        if (recursiveHasActivity.get(child)) hasActivity = true
        const childAgents = recursiveAgents.get(child)
        if (childAgents) {
          for (const [pid, info] of childAgents) {
            if (!totalAgents.has(pid)) totalAgents.set(pid, info)
          }
        }
      }
    }

    recursiveFileCount.set(dir, totalFiles)
    recursiveModified.set(dir, totalModified)
    recursiveAgents.set(dir, totalAgents)
    recursiveHasActivity.set(dir, hasActivity)
  }

  // ── Step 5: Dagre layout ──
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 24, ranksep: 40, marginx: 16, marginy: 16 })

  for (const dir of allDirs) {
    g.setNode(`__dirview:${dir}`, { width: DIR_NODE_WIDTH, height: DIR_NODE_HEIGHT })
  }
  for (const [parent, children] of childrenMap) {
    for (const child of children) {
      g.setEdge(`__dirview:${parent}`, `__dirview:${child}`)
    }
  }
  dagre.layout(g)

  // ── Step 6: Build nodes ──
  const dirNodes: Node[] = []
  const dirEdges: Edge[] = []

  for (const dir of allDirs) {
    const n = g.node(`__dirview:${dir}`)
    if (!n) continue

    const dirLabel = dir === '.' ? '/' : dir.split('/').pop()! + '/'
    const agentMap = recursiveAgents.get(dir) || new Map()
    const agentList = [...agentMap.values()]
    // Conflict = multiple distinct agents with at least one writing agent in this subtree
    const hasWritingAgents = agentList.length > 1

    dirNodes.push({
      id: `__dirview:${dir}`,
      type: 'dirNode',
      position: { x: n.x - DIR_NODE_WIDTH / 2, y: n.y - DIR_NODE_HEIGHT / 2 },
      data: {
        label: dirLabel,
        fullPath: dir,
        fileCount: recursiveFileCount.get(dir) || 0,
        modifiedCount: recursiveModified.get(dir) || 0,
        activeAgentList: agentList,
        conflict: hasWritingAgents,
        heatTotal: localHeat.get(dir) || 0,
        roles: localRoles.get(dir) || {},
      } satisfies DirNodeData,
    })
  }

  // ── Step 7: Build edges with bubble-up highlight ──
  for (const [parent, children] of childrenMap) {
    for (const child of children) {
      // Highlight if the child subtree has any active agents
      const hasActivity = recursiveHasActivity.get(child) || false
      // Conflict highlight if child subtree has multiple agents
      const childAgents = recursiveAgents.get(child)
      const isConflict = childAgents ? childAgents.size > 1 : false

      const edgeColor = isConflict
        ? '#FBBF24'
        : hasActivity
          ? 'var(--accent-primary)'
          : 'var(--border-default)'

      dirEdges.push({
        id: `__dirtree:${parent}->${child}`,
        source: `__dirview:${parent}`,
        target: `__dirview:${child}`,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, width: 8, height: 8, color: edgeColor },
        style: {
          stroke: edgeColor,
          strokeWidth: isConflict ? 2.5 : hasActivity ? 2 : 1,
          opacity: hasActivity ? 0.8 : 0.4,
        },
        animated: isConflict,
      })
    }
  }

  return { dirNodes, dirEdges }
}

// ─── 3. Heatmap Layout (heat-sorted grid) ───────────────────

function layoutHeatmap(
  graph: DepGraph,
  heatMap: Map<string, number>,
): Map<string, { x: number; y: number }> {
  // Only include files with activity, sorted by heat descending
  const sorted = graph.nodes
    .filter((n) => (heatMap.get(n.id) || 0) > 0)
    .sort((a, b) => {
      const ha = heatMap.get(a.id) || 0
      const hb = heatMap.get(b.id) || 0
      if (hb !== ha) return hb - ha
      return a.id.localeCompare(b.id)
    })

  const positions = new Map<string, { x: number; y: number }>()
  const cols = Math.max(1, Math.ceil(Math.sqrt(sorted.length)))
  const GAP_X = 12
  const GAP_Y = 12

  for (let i = 0; i < sorted.length; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    positions.set(sorted[i].id, {
      x: col * (NODE_WIDTH + GAP_X),
      y: row * (NODE_HEIGHT + GAP_Y),
    })
  }

  return positions
}

// ─── 4. Agent Layout (left label + right file grid per row) ──

const AGENT_FILE_COLS = 3       // file cards per row to the right of the label
const AGENT_ROW_GAP_Y = 36     // vertical gap between agent rows
const AGENT_LABEL_WIDTH = 160   // width of the agent name card on the left
const AGENT_LABEL_GAP_X = 16   // gap between label card and file grid
const AGENT_INNER_GAP_X = 10   // horizontal gap between file cards
const AGENT_INNER_GAP_Y = 8    // vertical gap between file card rows

interface AgentLabelNodeData {
  label: string
  fileCount: number
  color: string
  agentType: string
  [key: string]: unknown
}

function AgentLabelNodeComponent({ data }: { data: AgentLabelNodeData }) {
  return (
    <div
      style={{
        width: AGENT_LABEL_WIDTH,
        height: '100%',
        minHeight: NODE_HEIGHT,
        borderRadius: 8,
        background: `color-mix(in srgb, ${data.color} 10%, var(--bg-elevated))`,
        border: `1.5px solid ${data.color}`,
        fontFamily: 'var(--font-mono)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '12px 10px',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: `color-mix(in srgb, ${data.color} 20%, transparent)`,
          border: `2px solid ${data.color}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 800,
          color: data.color,
        }}
      >
        {data.label.charAt(0).toUpperCase()}
      </div>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: data.color,
        textAlign: 'center',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '100%',
      }}>
        {data.label}
      </div>
      <div style={{
        fontSize: 9,
        color: 'var(--text-muted)',
      }}>
        {data.fileCount} file{data.fileCount !== 1 ? 's' : ''}
      </div>
    </div>
  )
}

function layoutAgent(
  graph: DepGraph,
  heatMap: Map<string, number>,
  activeFileAgents: Map<string, AgentActivity[]>,
  activities: ActivityEntry[],
  panes: Array<{ id: string; name: string; agent: string }>,
): { positions: Map<string, { x: number; y: number }>; extraNodes: Node[] } {
  // Assign each file to the agent that touched it most
  const fileAgentCount = new Map<string, Map<string, number>>()
  for (const a of activities) {
    if (!fileAgentCount.has(a.file)) fileAgentCount.set(a.file, new Map())
    const counts = fileAgentCount.get(a.file)!
    counts.set(a.paneId, (counts.get(a.paneId) || 0) + 1)
  }
  for (const [file, agents] of activeFileAgents) {
    if (!fileAgentCount.has(file)) fileAgentCount.set(file, new Map())
    const counts = fileAgentCount.get(file)!
    for (const a of agents) {
      counts.set(a.paneId, (counts.get(a.paneId) || 0) + 5)
    }
  }

  // Group files by primary agent (skip untouched files)
  const agentFiles = new Map<string, string[]>()

  for (const node of graph.nodes) {
    const counts = fileAgentCount.get(node.id)
    if (!counts || counts.size === 0) continue
    let bestPane = ''
    let bestCount = 0
    for (const [paneId, count] of counts) {
      if (count > bestCount) { bestPane = paneId; bestCount = count }
    }
    if (!agentFiles.has(bestPane)) agentFiles.set(bestPane, [])
    agentFiles.get(bestPane)!.push(node.id)
  }

  // Sort files within each cluster by heat descending
  for (const [, files] of agentFiles) {
    files.sort((a, b) => (heatMap.get(b) || 0) - (heatMap.get(a) || 0))
  }

  const positions = new Map<string, { x: number; y: number }>()
  const extraNodes: Node[] = []

  // x offset where file cards start (right of the label card)
  const filesStartX = AGENT_LABEL_WIDTH + AGENT_LABEL_GAP_X

  let clusterY = 0

  const allGroups: Array<{ paneId: string; files: string[] }> = []
  for (const [paneId, files] of agentFiles) allGroups.push({ paneId, files })

  for (const group of allGroups) {
    const pane = panes.find((p) => p.id === group.paneId)
    const agentName = pane?.name || group.paneId
    const agentType = pane?.agent || 'workspace'
    const color = getAgentColor(agentType)

    const cols = AGENT_FILE_COLS
    const rows = Math.max(1, Math.ceil(group.files.length / cols))
    const filesHeight = rows * NODE_HEIGHT + (rows - 1) * AGENT_INNER_GAP_Y
    // Label card height matches files area (at least one NODE_HEIGHT)
    const labelHeight = Math.max(NODE_HEIGHT, filesHeight)

    // Agent label node on the left, vertically centered
    extraNodes.push({
      id: `__agent:${group.paneId}`,
      type: 'agentLabel',
      position: { x: 0, y: clusterY },
      data: {
        label: agentName,
        fileCount: group.files.length,
        color,
        agentType,
      } satisfies AgentLabelNodeData,
      selectable: false,
      draggable: false,
      style: {
        width: AGENT_LABEL_WIDTH,
        height: labelHeight,
      },
    })

    // File cards to the right, in horizontal rows
    for (let i = 0; i < group.files.length; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      positions.set(group.files[i], {
        x: filesStartX + col * (NODE_WIDTH + AGENT_INNER_GAP_X),
        y: clusterY + row * (NODE_HEIGHT + AGENT_INNER_GAP_Y),
      })
    }

    clusterY += labelHeight + AGENT_ROW_GAP_Y
  }

  return { positions, extraNodes }
}

// ─── 5. Temporal Layout (chronological sequence) ────────────

function layoutTemporal(
  graph: DepGraph,
  activities: ActivityEntry[],
): { positions: Map<string, { x: number; y: number }>; edges: Edge[] } {
  // Order files by first-touched time
  const firstTouch = new Map<string, number>()
  const fileAgent = new Map<string, string>()
  const sortedActivities = [...activities].sort((a, b) => a.timestamp - b.timestamp)
  for (const a of sortedActivities) {
    if (!firstTouch.has(a.file)) {
      firstTouch.set(a.file, a.timestamp)
      fileAgent.set(a.file, a.agent)
    }
  }

  const graphFileSet = new Set(graph.nodes.map((n) => n.id))
  const touchedOrdered = [...firstTouch.entries()]
    .sort((a, b) => a[1] - b[1])
    .filter(([id]) => graphFileSet.has(id))
    .map(([id]) => id)

  // Only show touched files
  const positions = new Map<string, { x: number; y: number }>()
  const COLS = 3
  const GAP_X = 12
  const GAP_Y = 12

  for (let i = 0; i < touchedOrdered.length; i++) {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    positions.set(touchedOrdered[i], {
      x: col * (NODE_WIDTH + GAP_X),
      y: row * (NODE_HEIGHT + GAP_Y),
    })
  }

  // Sequence edges showing access order
  const edges: Edge[] = []
  for (let i = 1; i < Math.min(touchedOrdered.length, 40); i++) {
    const prev = touchedOrdered[i - 1]
    const curr = touchedOrdered[i]
    const agentType = fileAgent.get(curr) || 'workspace'
    const color = getAgentColor(agentType)
    edges.push({
      id: `__seq:${i}`,
      source: prev,
      target: curr,
      type: 'smoothstep',
      animated: false,
      label: `${i}`,
      labelStyle: { fontSize: 8, fill: 'var(--text-muted)' },
      labelBgStyle: { fill: 'var(--bg-surface)', fillOpacity: 0.8 },
      labelBgPadding: [2, 4] as [number, number],
      markerEnd: { type: MarkerType.ArrowClosed, width: 8, height: 8, color },
      style: { stroke: color, strokeWidth: 1.5, opacity: 0.4 },
    })
  }

  return { positions, edges }
}

// ═══════════════════════════════════════════════════════════
// Custom Node Components
// ═══════════════════════════════════════════════════════════

function FileNodeComponent({ data }: { data: FileNodeData }) {
  const hasActivity = data.activeAgents.length > 0
  const primaryAgent = data.activeAgents[0]
  const agentColor = primaryAgent ? getAgentColor(primaryAgent.agent) : null
  const roleMeta = ROLE_META[data.role]
  const gitMeta = GIT_STATUS_META[data.gitStatus]
  const heatBg = heatToColor(data.heat, data.maxHeat)
  const isConflict = data.conflicting

  const maxFan = Math.max(data.importCount, data.importedByCount, 1)
  const fanOutW = Math.round((data.importCount / maxFan) * 52)
  const fanInW = Math.round((data.importedByCount / maxFan) * 52)

  return (
    <div
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        borderRadius: 8,
        background: hasActivity
          ? `color-mix(in srgb, ${agentColor} 12%, var(--bg-elevated))`
          : heatBg !== 'transparent'
            ? `linear-gradient(135deg, var(--bg-elevated) 60%, ${heatBg})`
            : 'var(--bg-elevated)',
        border: isConflict
          ? '2px solid #FBBF24'
          : hasActivity
            ? `1.5px solid ${agentColor}`
            : '1px solid var(--border-default)',
        fontFamily: 'var(--font-mono)',
        position: 'relative',
        transition: 'border-color 0.3s, background 0.3s, box-shadow 0.3s',
        boxShadow: isConflict
          ? '0 0 16px rgba(251, 191, 36, 0.3)'
          : hasActivity
            ? `0 0 14px color-mix(in srgb, ${agentColor} 30%, transparent)`
            : '0 1px 4px rgba(0,0,0,0.12)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--text-muted)', width: 5, height: 5, border: 'none' }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--text-muted)', width: 5, height: 5, border: 'none' }} />

      {/* Row 1: Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px 0', minHeight: 18 }}>
        <span style={{
          fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px',
          color: roleMeta.color, background: `color-mix(in srgb, ${roleMeta.color} 14%, transparent)`,
          padding: '1px 5px', borderRadius: 3, lineHeight: '14px',
        }}>
          {roleMeta.label}
        </span>
        {data.gitStatus !== 'clean' && (
          <span style={{
            fontSize: 8, fontWeight: 700, color: gitMeta.color,
            background: `color-mix(in srgb, ${gitMeta.color} 14%, transparent)`,
            padding: '1px 5px', borderRadius: 3, lineHeight: '14px',
          }}>
            {gitMeta.label}
          </span>
        )}
        {isConflict && <span style={{ fontSize: 10, lineHeight: 1 }} title="Multiple agents editing">⚠</span>}
        <span style={{ flex: 1 }} />
        {data.heat > 0 && (
          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {Array.from({ length: Math.min(Math.ceil(data.heat), 5) }).map((_, i) => (
              <div key={i} style={{
                width: 4, height: 4, borderRadius: '50%',
                background: data.heat > 3 ? '#F85149' : data.heat > 1 ? '#F0883E' : '#FBBF24',
                opacity: 0.5 + (i / 5) * 0.5,
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Row 2: Dir + Filename */}
      <div style={{ padding: '2px 8px 0', flex: 1, minHeight: 0 }}>
        {data.dir !== '.' && (
          <div style={{ fontSize: 8, color: 'var(--text-muted)', lineHeight: 1, marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {data.dir}/
          </div>
        )}
        <div style={{
          fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: hasActivity ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontWeight: hasActivity ? 600 : 500, lineHeight: 1.3,
        }} title={data.fullPath}>
          {data.label}
        </div>
      </div>

      {/* Row 3: Agent activity / last-agent / fan bars */}
      <div style={{ padding: '0 8px 5px', display: 'flex', alignItems: 'flex-end', gap: 6, minHeight: 22 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {hasActivity ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {data.activeAgents.map((a) => (
                <div key={a.paneId} style={{
                  display: 'flex', alignItems: 'center', gap: 3, fontSize: 8,
                  color: getAgentColor(a.agent), fontWeight: 600, maxWidth: '100%',
                }}>
                  <div style={{
                    width: 4, height: 4, borderRadius: '50%', background: getAgentColor(a.agent),
                    animation: 'pulse 1.5s ease-in-out infinite', flexShrink: 0,
                  }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.paneName}</span>
                  <span style={{ opacity: 0.5, fontWeight: 400 }}>{a.action}</span>
                </div>
              ))}
            </div>
          ) : data.lastAgent ? (
            <div style={{ fontSize: 8, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {data.lastAgent.name} · {relativeTime(data.lastAgent.timestamp)}
            </div>
          ) : null}
        </div>
        {(data.importCount > 0 || data.importedByCount > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end', flexShrink: 0, width: 68 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 7, color: 'var(--text-muted)', width: 8, textAlign: 'right' }}>{data.importCount}</span>
              <div style={{ height: 3, width: fanOutW, borderRadius: 2, background: 'color-mix(in srgb, #58A6FF 50%, transparent)' }} />
              <span style={{ fontSize: 7, color: 'var(--text-muted)' }}>↗</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 7, color: 'var(--text-muted)', width: 8, textAlign: 'right' }}>{data.importedByCount}</span>
              <div style={{ height: 3, width: fanInW, borderRadius: 2, background: 'color-mix(in srgb, #F0883E 50%, transparent)' }} />
              <span style={{ fontSize: 7, color: 'var(--text-muted)' }}>↙</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Directory Node Component ──────────────────────────────

function DirNodeComponent({ data }: { data: DirNodeData }) {
  const topRoles = Object.entries(data.roles)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)

  const hasActivity = data.activeAgentList.length > 0
  const hasChanges = data.modifiedCount > 0

  return (
    <div
      style={{
        width: DIR_NODE_WIDTH,
        height: DIR_NODE_HEIGHT,
        borderRadius: 8,
        background: data.conflict
          ? 'color-mix(in srgb, #FBBF24 6%, var(--bg-elevated))'
          : 'var(--bg-elevated)',
        border: data.conflict
          ? '2px solid #FBBF24'
          : hasActivity
            ? '1.5px solid var(--accent-primary)'
            : hasChanges
              ? '1.5px solid #F0883E'
              : '1px solid var(--border-default)',
        fontFamily: 'var(--font-mono)',
        padding: '6px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        boxShadow: data.conflict
          ? '0 0 14px rgba(251, 191, 36, 0.3)'
          : hasActivity
            ? '0 0 12px color-mix(in srgb, var(--accent-primary) 25%, transparent)'
            : '0 1px 4px rgba(0,0,0,0.12)',
        transition: 'border-color 0.3s, box-shadow 0.3s',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: 'var(--text-muted)', width: 5, height: 5, border: 'none' }} />
      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--text-muted)', width: 5, height: 5, border: 'none' }} />

      {/* Row 1: Dir name + file count + modified badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {data.conflict && <span style={{ fontSize: 10, lineHeight: 1, flexShrink: 0 }} title="Multiple agents operating here">⚠</span>}
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {data.label}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>
          {data.fileCount}
        </span>
        {data.modifiedCount > 0 && (
          <span style={{ fontSize: 8, fontWeight: 700, color: '#F0883E', background: 'color-mix(in srgb, #F0883E 14%, transparent)', padding: '1px 4px', borderRadius: 3, flexShrink: 0 }}>
            {data.modifiedCount}M
          </span>
        )}
      </div>

      {/* Row 2: Role dots + agent tags */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 14 }}>
        {/* Role dots */}
        <div style={{ display: 'flex', gap: 3, flex: 1 }}>
          {topRoles.map(([role, count]) => {
            const meta = ROLE_META[role as FileRole]
            return (
              <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 2 }} title={`${meta.label}: ${count}`}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color }} />
                <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>{count}</span>
              </div>
            )
          })}
        </div>

        {/* Active agent names */}
        {data.activeAgentList.map((a) => {
          const color = getAgentColor(a.agent)
          return (
            <span
              key={a.paneId}
              style={{
                fontSize: 7,
                fontWeight: 700,
                color,
                background: `color-mix(in srgb, ${color} 14%, transparent)`,
                padding: '1px 4px',
                borderRadius: 3,
                flexShrink: 0,
                maxWidth: 60,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={a.name}
            >
              {a.name}
            </span>
          )
        })}
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  fileNode: FileNodeComponent,
  dirNode: DirNodeComponent,
  agentLabel: AgentLabelNodeComponent,
}

// ═══════════════════════════════════════════════════════════
// Graph Builder
// ═══════════════════════════════════════════════════════════

function buildFlowData(ctx: BuildContext, viewMode: ViewMode): { nodes: Node[]; edges: Edge[] } {
  const { graph, activeFileAgents, gitDiffs, gitStagedDiffs, activities, panes } = ctx
  const activeFiles = new Set(activeFileAgents.keys())
  const nodeIds = new Set(graph.nodes.map((n) => n.id))

  // Directory mode returns a completely different set of nodes
  if (viewMode === 'directory') {
    const { dirNodes, dirEdges } = layoutDirectory(graph, activities, gitDiffs, gitStagedDiffs, activeFileAgents)
    return { nodes: dirNodes, edges: dirEdges }
  }

  // Imported-by count
  const importedByCount = new Map<string, number>()
  for (const node of graph.nodes) {
    for (const imp of node.imports) {
      if (nodeIds.has(imp)) importedByCount.set(imp, (importedByCount.get(imp) || 0) + 1)
    }
  }

  // Heat per file
  const heatMap = new Map<string, number>()
  let maxHeat = 0
  for (const node of graph.nodes) {
    const h = calcHeat(node.id, activities)
    heatMap.set(node.id, h)
    if (h > maxHeat) maxHeat = h
  }

  // Last agent per file
  const lastAgentMap = new Map<string, { name: string; timestamp: number }>()
  for (const a of activities) {
    if (!lastAgentMap.has(a.file) || a.timestamp > lastAgentMap.get(a.file)!.timestamp) {
      lastAgentMap.set(a.file, { name: a.paneName, timestamp: a.timestamp })
    }
  }

  // Multi-agent conflict
  const conflictFiles = new Set<string>()
  for (const [file, agents] of activeFileAgents) {
    const uniqueAgents = new Set(agents.map((a) => a.paneId))
    if (uniqueAgents.size > 1 && agents.some((a) => a.action !== 'read')) {
      conflictFiles.add(file)
    }
  }

  // Get positions + extra nodes based on view mode
  let positions: Map<string, { x: number; y: number }>
  let extraNodes: Node[] = []
  let extraEdges: Edge[] = []

  switch (viewMode) {
    case 'heatmap': {
      positions = layoutHeatmap(graph, heatMap)
      break
    }
    case 'agent': {
      const r = layoutAgent(graph, heatMap, activeFileAgents, activities, panes)
      positions = r.positions
      extraNodes = r.extraNodes
      break
    }
    case 'temporal': {
      const r = layoutTemporal(graph, activities)
      positions = r.positions
      extraEdges = r.edges
      break
    }
    default: {
      positions = layoutDependency(graph)
      break
    }
  }

  // Build file nodes
  const nodes: Node[] = [...extraNodes]

  for (const node of graph.nodes) {
    const pos = positions.get(node.id)
    if (!pos) continue

    const fileName = node.id.split('/').pop() || node.id
    const dir = node.id.includes('/') ? node.id.substring(0, node.id.lastIndexOf('/')) : '.'

    nodes.push({
      id: node.id,
      type: 'fileNode',
      position: pos,
      data: {
        label: fileName,
        fullPath: node.id,
        dir,
        role: detectFileRole(node.id),
        gitStatus: resolveGitStatus(node.id, gitDiffs, gitStagedDiffs),
        heat: heatMap.get(node.id) || 0,
        maxHeat,
        activeAgents: activeFileAgents.get(node.id) || [],
        importCount: node.imports.filter((i) => nodeIds.has(i)).length,
        importedByCount: importedByCount.get(node.id) || 0,
        conflicting: conflictFiles.has(node.id),
        lastAgent: lastAgentMap.get(node.id) || null,
      } satisfies FileNodeData,
    })
  }

  // Build edges
  const edges: Edge[] = [...extraEdges]

  // Dependency edges only for dependency view
  if (viewMode === 'dependency') {
    for (const node of graph.nodes) {
      for (const imp of node.imports) {
        if (!nodeIds.has(imp)) continue
        const isActive = activeFiles.has(node.id)
        const agentInfo = activeFileAgents.get(node.id)?.[0]
        const color = isActive && agentInfo ? getAgentColor(agentInfo.agent) : 'var(--text-muted)'
        edges.push({
          id: `${node.id}->${imp}`,
          source: node.id,
          target: imp,
          type: 'smoothstep',
          animated: isActive,
          markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color },
          style: { stroke: color, strokeWidth: isActive ? 2 : 1, opacity: isActive ? 0.85 : 0.35 },
        })
      }
    }
  }

  return { nodes, edges }
}

// ═══════════════════════════════════════════════════════════
// Inner Flow
// ═══════════════════════════════════════════════════════════

// Stable object refs to avoid ReactFlow re-renders
const REACT_FLOW_PRO_OPTIONS = { hideAttribution: true }
const REACT_FLOW_STYLE = { background: 'var(--bg-base)' }
const REACT_FLOW_DEFAULT_EDGE_OPTIONS = { type: 'smoothstep' as const }
const MINIMAP_STYLE = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 4 }

function minimapNodeColor(node: Node) {
  const data = node.data as FileNodeData
  if (data?.conflicting) return '#FBBF24'
  if (data?.activeAgents?.length > 0) return getAgentColor(data.activeAgents[0].agent)
  if (data?.gitStatus === 'modified') return '#F0883E'
  if (data?.gitStatus === 'added') return '#3FB950'
  return 'var(--bg-elevated)'
}

// Debounce interval for topology rebuilds (ms)
const TOPOLOGY_DEBOUNCE_MS = 500

function TopologyInner({
  graph,
  viewMode,
  onClickFile,
}: {
  graph: DepGraph
  viewMode: ViewMode
  onClickFile: (file: string) => void
}) {
  // Use individual selectors to avoid re-rendering on unrelated store changes
  const paneCurrentFile = useWorkspaceStore((s) => s.paneCurrentFile)
  const panes = useWorkspaceStore((s) => s.panes)
  const gitDiffs = useWorkspaceStore((s) => s.gitDiffs)
  const gitStagedDiffs = useWorkspaceStore((s) => s.gitStagedDiffs)
  const activities = useWorkspaceStore((s) => s.activities)

  const { fitView } = useReactFlow()
  const prevViewMode = useRef(viewMode)

  // Debounced build context — avoid rebuilding the topology on every micro-update
  const latestCtxRef = useRef<BuildContext | null>(null)
  const [debouncedCtx, setDebouncedCtx] = useState<BuildContext | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // Stable pane identity list — only changes when pane ids/names/agents actually change
  const stablePaneList = useMemo(() => {
    return panes.map((p) => ({ id: p.id, name: p.name, agent: p.agent }))
  }, [panes.map((p) => `${p.id}:${p.name}:${p.agent}`).join(',')])

  const activeFileAgents = useMemo(() => {
    const map = new Map<string, AgentActivity[]>()
    for (const [paneId, current] of Object.entries(paneCurrentFile)) {
      const pane = stablePaneList.find((p) => p.id === paneId)
      if (!pane) continue
      if (!map.has(current.file)) map.set(current.file, [])
      map.get(current.file)!.push({ paneId, paneName: pane.name, agent: pane.agent, action: current.action })
    }
    return map
  }, [paneCurrentFile, stablePaneList])

  const rawCtx: BuildContext = useMemo(() => ({
    graph, activeFileAgents, gitDiffs, gitStagedDiffs, activities,
    panes: stablePaneList,
  }), [graph, activeFileAgents, gitDiffs, gitStagedDiffs, activities, stablePaneList])

  // Debounce context updates to avoid spamming dagre layout
  useEffect(() => {
    latestCtxRef.current = rawCtx
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    // First render should be immediate
    if (!debouncedCtx) {
      setDebouncedCtx(rawCtx)
      return
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedCtx(latestCtxRef.current)
    }, TOPOLOGY_DEBOUNCE_MS)
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [rawCtx]) // eslint-disable-line react-hooks/exhaustive-deps

  const { nodes: flowNodes, edges: flowEdges } = useMemo(
    () => debouncedCtx ? buildFlowData(debouncedCtx, viewMode) : { nodes: [], edges: [] },
    [debouncedCtx, viewMode],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges)

  useEffect(() => {
    setNodes(flowNodes)
    setEdges(flowEdges)
  }, [flowNodes, flowEdges, setNodes, setEdges])

  // Re-fit when view mode changes or on initial load
  useEffect(() => {
    if (prevViewMode.current !== viewMode || nodes.length > 0) {
      prevViewMode.current = viewMode
      setTimeout(() => fitView({ padding: 0.04, duration: 300 }), 100)
    }
  }, [viewMode, nodes.length, fitView])

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.id.startsWith('__')) return
      onClickFile(node.id)
    },
    [onClickFile],
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.3}
      maxZoom={2.5}
      nodesDraggable={false}
      proOptions={REACT_FLOW_PRO_OPTIONS}
      style={REACT_FLOW_STYLE}
      defaultEdgeOptions={REACT_FLOW_DEFAULT_EDGE_OPTIONS}
    >
      <Background color="var(--border-default)" gap={32} size={0.5} />
      <MiniMap
        nodeColor={minimapNodeColor}
        maskColor="rgba(0,0,0,0.6)"
        style={MINIMAP_STYLE}
        pannable
        zoomable
      />
    </ReactFlow>
  )
}

// ═══════════════════════════════════════════════════════════
// Main Export
// ═══════════════════════════════════════════════════════════

export function DependencyTopology({
  graph,
  viewMode,
  onClickFile,
}: {
  graph: DepGraph
  viewMode: ViewMode
  onClickFile: (file: string) => void
}) {
  return (
    <ReactFlowProvider>
      <TopologyInner graph={graph} viewMode={viewMode} onClickFile={onClickFile} />
    </ReactFlowProvider>
  )
}

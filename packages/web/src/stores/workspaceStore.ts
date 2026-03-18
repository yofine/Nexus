import { create } from 'zustand'
import type { PaneState, PaneMeta, PaneStatus, FileNode, FileDiff, IsolationMode, FileActivity, FileAction, DepGraph } from '@/types'

export interface EditorTab {
  id: string
  type: 'file' | 'review' | 'activity' | 'replay'
  label: string
  filePath?: string
  paneId?: string   // null/undefined = workspace (shared) review; set = worktree pane review
  pinned?: boolean
  sessionId?: string // for replay tabs
}

export interface ActivityEntry {
  id: string
  paneId: string
  paneName: string
  agent: string
  file: string
  action: FileAction
  timestamp: number
}

let activitySeq = 0

interface WorkspaceStore {
  name: string
  description: string
  projectDir: string
  panes: PaneState[]
  activePaneId: string | null
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting'

  // File tree and git diff
  fileTree: FileNode[]
  gitDiffs: FileDiff[]
  gitStagedDiffs: FileDiff[]
  gitBranchInfo: { branch: string; remote?: string; ahead: number; behind: number } | null

  // Per-pane diffs (worktree isolation)
  paneDiffs: Record<string, FileDiff[]>
  diffViewPaneId: string | null // null = show global workspace diffs

  // Activity tracking
  activities: ActivityEntry[]
  paneCurrentFile: Record<string, { file: string; action: FileAction }>

  // Merge results (transient feedback)
  mergeResults: Record<string, { success: boolean; message: string }>

  // Dependency graph
  depGraph: DepGraph | null

  // Tab system
  tabs: EditorTab[]
  activeTabId: string | null

  // Actions
  setWorkspace: (name: string, description: string, projectDir: string, panes: PaneState[]) => void
  setPanes: (panes: PaneState[]) => void
  addPane: (pane: PaneState) => void
  removePane: (paneId: string) => void
  updatePaneStatus: (paneId: string, status: PaneStatus) => void
  updatePaneMeta: (paneId: string, meta: PaneMeta) => void
  setActivePaneId: (paneId: string | null) => void
  setConnectionStatus: (status: 'connected' | 'disconnected' | 'reconnecting') => void
  setFileTree: (tree: FileNode[]) => void
  setGitDiffs: (diffs: FileDiff[]) => void
  setGitStagedDiffs: (diffs: FileDiff[]) => void
  setGitAllDiffs: (diffs: FileDiff[], staged: FileDiff[]) => void
  setGitBranchInfo: (info: { branch: string; remote?: string; ahead: number; behind: number }) => void
  setPaneDiffs: (paneId: string, diffs: FileDiff[]) => void
  removePaneDiffs: (paneId: string) => void
  setMergeResult: (paneId: string, result: { success: boolean; message: string }) => void
  clearMergeResult: (paneId: string) => void
  setDiffViewPaneId: (paneId: string | null) => void
  setDepGraph: (graph: DepGraph) => void
  addActivity: (paneId: string, activity: FileActivity) => void
  addFileActivity: (activity: FileActivity) => void
  openFileTab: (path: string) => void
  openReviewTab: (paneId?: string, paneName?: string) => void
  openReplayTab: (sessionId?: string) => void
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  name: '',
  description: '',
  projectDir: '',
  panes: [],
  activePaneId: null,
  connectionStatus: 'disconnected',
  fileTree: [],
  gitDiffs: [],
  gitStagedDiffs: [],
  gitBranchInfo: null,
  paneDiffs: {},
  mergeResults: {},
  diffViewPaneId: null,
  activities: [],
  paneCurrentFile: {},
  depGraph: null,
  tabs: [
    { id: 'tab:activity', type: 'activity', label: 'Activity', pinned: true },
    { id: 'review:workspace', type: 'review', label: 'Review', pinned: true },
  ],
  activeTabId: 'tab:activity',

  setWorkspace: (name, description, projectDir, panes) =>
    set((state) => {
      const visible = panes.filter((p) => p.agent !== '__shell__')
      return {
        name,
        description,
        projectDir,
        panes: visible,
        activePaneId: state.activePaneId || (visible.length > 0 ? visible[0].id : null),
      }
    }),

  setPanes: (panes) => set({ panes: panes.filter((p) => p.agent !== '__shell__') }),

  addPane: (pane) =>
    set((state) => {
      if (pane.agent === '__shell__') return state
      return {
        panes: [...state.panes, pane],
        activePaneId: pane.id,
      }
    }),

  removePane: (paneId) =>
    set((state) => {
      const { [paneId]: _, ...restPaneDiffs } = state.paneDiffs
      const reviewTabId = `review:${paneId}`
      const nextTabs = state.tabs.filter((t) => t.id !== reviewTabId)
      let nextActiveTab = state.activeTabId
      if (state.activeTabId === reviewTabId) {
        nextActiveTab = nextTabs.length > 0 ? nextTabs[0].id : null
      }
      return {
        panes: state.panes.filter((p) => p.id !== paneId),
        activePaneId: state.activePaneId === paneId
          ? (state.panes.find((p) => p.id !== paneId)?.id ?? null)
          : state.activePaneId,
        paneDiffs: restPaneDiffs,
        diffViewPaneId: state.diffViewPaneId === paneId ? null : state.diffViewPaneId,
        tabs: nextTabs,
        activeTabId: nextActiveTab,
      }
    }),

  updatePaneStatus: (paneId, status) =>
    set((state) => {
      const idx = state.panes.findIndex((p) => p.id === paneId)
      if (idx === -1 || state.panes[idx].status === status) return state
      const panes = state.panes.slice()
      panes[idx] = { ...panes[idx], status }
      return { panes }
    }),

  updatePaneMeta: (paneId, meta) =>
    set((state) => {
      const idx = state.panes.findIndex((p) => p.id === paneId)
      if (idx === -1) return state
      const existing = state.panes[idx].meta
      // Skip update if values haven't actually changed
      const hasChange = Object.keys(meta).some(
        (k) => (meta as Record<string, unknown>)[k] !== (existing as Record<string, unknown>)[k]
      )
      if (!hasChange) return state
      const panes = state.panes.slice()
      panes[idx] = { ...panes[idx], meta: { ...existing, ...meta } }
      return { panes }
    }),

  setActivePaneId: (paneId) => set({ activePaneId: paneId }),

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  setFileTree: (fileTree) => set({ fileTree }),

  setGitDiffs: (gitDiffs) => set({ gitDiffs }),

  setGitStagedDiffs: (gitStagedDiffs) => set({ gitStagedDiffs }),

  setGitAllDiffs: (gitDiffs, gitStagedDiffs) => set({ gitDiffs, gitStagedDiffs }),

  setGitBranchInfo: (gitBranchInfo) => set({ gitBranchInfo }),

  setPaneDiffs: (paneId, diffs) =>
    set((state) => ({
      paneDiffs: { ...state.paneDiffs, [paneId]: diffs },
    })),

  removePaneDiffs: (paneId) =>
    set((state) => {
      const { [paneId]: _, ...rest } = state.paneDiffs
      return {
        paneDiffs: rest,
        diffViewPaneId: state.diffViewPaneId === paneId ? null : state.diffViewPaneId,
      }
    }),

  setMergeResult: (paneId, result) =>
    set((state) => ({
      mergeResults: { ...state.mergeResults, [paneId]: result },
    })),

  clearMergeResult: (paneId) =>
    set((state) => {
      const { [paneId]: _, ...rest } = state.mergeResults
      return { mergeResults: rest }
    }),

  setDiffViewPaneId: (diffViewPaneId) => set({ diffViewPaneId }),

  setDepGraph: (depGraph) => set({ depGraph }),

  addActivity: (paneId, activity) =>
    set((state) => {
      const pane = state.panes.find((p) => p.id === paneId)
      if (!pane) return state
      const entry: ActivityEntry = {
        id: `act-${++activitySeq}`,
        paneId,
        paneName: pane.name,
        agent: pane.agent,
        file: activity.file,
        action: activity.action,
        timestamp: activity.timestamp,
      }
      // Keep last 100 activities
      const activities = [entry, ...state.activities].slice(0, 100)
      return {
        activities,
        paneCurrentFile: {
          ...state.paneCurrentFile,
          [paneId]: { file: activity.file, action: activity.action },
        },
      }
    }),

  addFileActivity: (activity) =>
    set((state) => {
      // Skip if this file was already tracked by a pane.activity event recently
      const recent = state.activities[0]
      if (recent && recent.file === activity.file && activity.timestamp - recent.timestamp < 2000) {
        return state
      }
      // Try to attribute: find the most recently active (running/waiting) agent
      const activePanes = state.panes.filter(
        (p) => p.status === 'running' || p.status === 'waiting',
      )
      const pane = activePanes.length > 0 ? activePanes[0] : null
      const entry: ActivityEntry = {
        id: `act-${++activitySeq}`,
        paneId: pane?.id || '__workspace__',
        paneName: pane?.name || 'Workspace',
        agent: pane?.agent || 'workspace',
        file: activity.file,
        action: activity.action,
        timestamp: activity.timestamp,
      }
      const activities = [entry, ...state.activities].slice(0, 100)
      return {
        activities,
        paneCurrentFile: pane
          ? { ...state.paneCurrentFile, [pane.id]: { file: activity.file, action: activity.action } }
          : state.paneCurrentFile,
      }
    }),

  openFileTab: (path) =>
    set((state) => {
      const existing = state.tabs.find((t) => t.type === 'file' && t.filePath === path)
      if (existing) {
        return { activeTabId: existing.id }
      }
      const label = path.split('/').pop() || path
      const tab: EditorTab = { id: `file:${path}`, type: 'file', label, filePath: path }
      return { tabs: [...state.tabs, tab], activeTabId: tab.id }
    }),

  openReviewTab: (paneId?: string, paneName?: string) =>
    set((state) => {
      if (!paneId) {
        // Open/focus workspace review tab (always exists as pinned)
        const existing = state.tabs.find((t) => t.id === 'review:workspace')
        if (existing) {
          return { activeTabId: existing.id }
        }
        const tab: EditorTab = { id: 'review:workspace', type: 'review', label: 'Review', pinned: true }
        return { tabs: [tab, ...state.tabs], activeTabId: tab.id }
      }
      // Open/focus a worktree pane review tab
      const tabId = `review:${paneId}`
      const existing = state.tabs.find((t) => t.id === tabId)
      if (existing) {
        return { activeTabId: existing.id }
      }
      const tab: EditorTab = { id: tabId, type: 'review', label: paneName || 'Review', paneId }
      return { tabs: [...state.tabs, tab], activeTabId: tab.id }
    }),

  openReplayTab: (sessionId?: string) =>
    set((state) => {
      const tabId = sessionId ? `replay:${sessionId}` : 'tab:replay'
      const existing = state.tabs.find((t) => t.id === tabId)
      if (existing) return { activeTabId: existing.id }
      const tab: EditorTab = {
        id: tabId,
        type: 'replay',
        label: sessionId ? 'Replay' : 'Replay History',
        sessionId,
      }
      return { tabs: [...state.tabs, tab], activeTabId: tab.id }
    }),

  closeTab: (tabId) =>
    set((state) => {
      const tab = state.tabs.find((t) => t.id === tabId)
      if (tab?.pinned) return state // Cannot close pinned tabs
      const idx = state.tabs.findIndex((t) => t.id === tabId)
      const next = state.tabs.filter((t) => t.id !== tabId)
      let nextActive = state.activeTabId
      if (state.activeTabId === tabId) {
        if (next.length === 0) {
          nextActive = null
        } else if (idx >= next.length) {
          nextActive = next[next.length - 1].id
        } else {
          nextActive = next[idx].id
        }
      }
      return { tabs: next, activeTabId: nextActive }
    }),

  setActiveTab: (tabId) => set({ activeTabId: tabId }),
}))

import { create } from 'zustand'
import type { PaneState, PaneMeta, PaneStatus, FileNode, FileDiff, IsolationMode } from '@/types'

export interface EditorTab {
  id: string
  type: 'file' | 'review'
  label: string
  filePath?: string
  paneId?: string   // null/undefined = workspace (shared) review; set = worktree pane review
  pinned?: boolean
}

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

  // Per-pane diffs (worktree isolation)
  paneDiffs: Record<string, FileDiff[]>
  diffViewPaneId: string | null // null = show global workspace diffs

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
  setPaneDiffs: (paneId: string, diffs: FileDiff[]) => void
  removePaneDiffs: (paneId: string) => void
  setDiffViewPaneId: (paneId: string | null) => void
  openFileTab: (path: string) => void
  openReviewTab: (paneId?: string, paneName?: string) => void
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
  paneDiffs: {},
  diffViewPaneId: null,
  tabs: [{ id: 'review:workspace', type: 'review', label: 'Review', pinned: true }],
  activeTabId: 'review:workspace',

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
    set((state) => ({
      panes: state.panes.map((p) =>
        p.id === paneId ? { ...p, status } : p
      ),
    })),

  updatePaneMeta: (paneId, meta) =>
    set((state) => ({
      panes: state.panes.map((p) =>
        p.id === paneId ? { ...p, meta: { ...p.meta, ...meta } } : p
      ),
    })),

  setActivePaneId: (paneId) => set({ activePaneId: paneId }),

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  setFileTree: (fileTree) => set({ fileTree }),

  setGitDiffs: (gitDiffs) => set({ gitDiffs }),

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

  setDiffViewPaneId: (diffViewPaneId) => set({ diffViewPaneId }),

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

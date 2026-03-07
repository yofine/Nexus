import { create } from 'zustand'
import type { PaneState, PaneMeta, PaneStatus, FileNode, FileDiff } from '@/types'

export interface EditorTab {
  id: string
  type: 'file' | 'diff'
  label: string
  filePath?: string
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
  openFileTab: (path: string) => void
  openDiffTab: () => void
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
  tabs: [],
  activeTabId: null,

  setWorkspace: (name, description, projectDir, panes) =>
    set((state) => ({
      name,
      description,
      projectDir,
      panes,
      activePaneId: state.activePaneId || (panes.length > 0 ? panes[0].id : null),
    })),

  setPanes: (panes) => set({ panes }),

  addPane: (pane) =>
    set((state) => ({
      panes: [...state.panes, pane],
      activePaneId: pane.id,
    })),

  removePane: (paneId) =>
    set((state) => ({
      panes: state.panes.filter((p) => p.id !== paneId),
      activePaneId: state.activePaneId === paneId
        ? (state.panes.find((p) => p.id !== paneId)?.id ?? null)
        : state.activePaneId,
    })),

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

  openDiffTab: () =>
    set((state) => {
      const existing = state.tabs.find((t) => t.type === 'diff')
      if (existing) {
        return { activeTabId: existing.id }
      }
      const tab: EditorTab = { id: 'diff', type: 'diff', label: 'Review' }
      return { tabs: [...state.tabs, tab], activeTabId: tab.id }
    }),

  closeTab: (tabId) =>
    set((state) => {
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

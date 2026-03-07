import { create } from 'zustand'
import type { PaneState, PaneMeta, PaneStatus } from '@/types'

interface WorkspaceStore {
  name: string
  description: string
  projectDir: string
  panes: PaneState[]
  activePaneId: string | null
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting'

  // Actions
  setWorkspace: (name: string, description: string, projectDir: string, panes: PaneState[]) => void
  setPanes: (panes: PaneState[]) => void
  addPane: (pane: PaneState) => void
  removePane: (paneId: string) => void
  updatePaneStatus: (paneId: string, status: PaneStatus) => void
  updatePaneMeta: (paneId: string, meta: PaneMeta) => void
  setActivePaneId: (paneId: string | null) => void
  setConnectionStatus: (status: 'connected' | 'disconnected' | 'reconnecting') => void
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  name: '',
  description: '',
  projectDir: '',
  panes: [],
  activePaneId: null,
  connectionStatus: 'disconnected',

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
}))

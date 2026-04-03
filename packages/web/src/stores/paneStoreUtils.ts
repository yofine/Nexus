import type { ClientEvent, PaneState, RestoreMode } from '../types'

export function upsertPaneById(panes: PaneState[], nextPane: PaneState): PaneState[] {
  const index = panes.findIndex((pane) => pane.id === nextPane.id)
  if (index === -1) {
    return [...panes, nextPane]
  }

  const next = panes.slice()
  next[index] = nextPane
  return next
}

export function createRestartPaneEvent(paneId: string): Extract<ClientEvent, { type: 'pane.restart' }> {
  return {
    type: 'pane.restart',
    paneId,
    mode: 'restart',
  }
}

export function canResumePane(pane: Pick<PaneState, 'sessionId' | 'meta'>): boolean {
  return Boolean(pane.sessionId || pane.meta.sessionId)
}

export function getResumeMode(_pane: Pick<PaneState, 'sessionId' | 'meta'>): RestoreMode {
  return 'resume'
}

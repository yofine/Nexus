import { describe, expect, it } from 'vitest'
import type { PaneState } from '../types'
import {
  canResumePane,
  createRestartPaneEvent,
  getResumeMode,
  upsertPaneById,
} from './paneStoreUtils'

function makePane(overrides: Partial<PaneState> = {}): PaneState {
  return {
    id: 'pane-1',
    name: 'Pane 1',
    agent: 'claudecode',
    restore: 'restart',
    isolation: 'shared',
    runtime: 'pty',
    status: 'idle',
    meta: {},
    ...overrides,
  }
}

describe('paneStoreUtils', () => {
  it('replaces an existing pane instead of duplicating it during restart', () => {
    const original = makePane({ pid: 101, status: 'idle' })
    const replacement = makePane({ pid: 202, status: 'running' })

    const panes = upsertPaneById([original], replacement)

    expect(panes).toHaveLength(1)
    expect(panes[0]).toEqual(replacement)
  })

  it('creates a restart event that always starts a new session', () => {
    expect(createRestartPaneEvent('pane-7')).toEqual({
      type: 'pane.restart',
      paneId: 'pane-7',
      mode: 'restart',
    })
  })

  it('allows resume only when a concrete session id exists', () => {
    expect(canResumePane(makePane())).toBe(false)
    expect(canResumePane(makePane({ sessionId: 'sess-1' }))).toBe(true)
    expect(canResumePane(makePane({ meta: { sessionId: 'sess-2' } }))).toBe(true)
    expect(getResumeMode(makePane({ sessionId: 'sess-1' }))).toBe('resume')
  })
})

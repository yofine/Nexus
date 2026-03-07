import { useCallback } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { writeToTerminal } from '@/stores/terminalRegistry'
import { Layout } from '@/components/Layout'
import type { ServerEvent } from '@/types'

export function App() {
  const {
    setWorkspace,
    addPane,
    removePane,
    updatePaneStatus,
    updatePaneMeta,
    setConnectionStatus,
    setFileTree,
    setGitDiffs,
  } = useWorkspaceStore()

  const handleMessage = useCallback(
    (event: ServerEvent) => {
      switch (event.type) {
        case 'workspace.state':
          setWorkspace(
            event.state.name,
            event.state.description || '',
            event.state.projectDir,
            event.state.panes,
          )
          setConnectionStatus('connected')
          break

        case 'terminal.output':
          writeToTerminal(event.paneId, event.data)
          break

        case 'pane.status':
          updatePaneStatus(event.paneId, event.status)
          break

        case 'pane.meta':
          updatePaneMeta(event.paneId, event.meta)
          break

        case 'pane.added':
          addPane(event.pane)
          break

        case 'pane.removed':
          removePane(event.paneId)
          break

        case 'fs.tree':
          setFileTree(event.tree)
          break

        case 'git.diff':
          setGitDiffs(event.diff)
          break
      }
    },
    [setWorkspace, addPane, removePane, updatePaneStatus, updatePaneMeta, setConnectionStatus, setFileTree, setGitDiffs],
  )

  const { send, status } = useWebSocket({ onMessage: handleMessage })

  // Keep connection status in sync
  useWorkspaceStore.getState().setConnectionStatus(status)

  return <Layout send={send} />
}

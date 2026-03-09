import { useCallback, useEffect } from 'react'
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
    setPaneDiffs,
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

        case 'pane.diff':
          setPaneDiffs(event.paneId, event.diffs)
          break
      }
    },
    [setWorkspace, addPane, removePane, updatePaneStatus, updatePaneMeta, setConnectionStatus, setFileTree, setGitDiffs, setPaneDiffs],
  )

  const { send, status } = useWebSocket({ onMessage: handleMessage })

  // Sync connection status via effect to avoid render-loop
  useEffect(() => {
    setConnectionStatus(status)
  }, [status, setConnectionStatus])

  return <Layout send={send} />
}

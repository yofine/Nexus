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
    setGitStagedDiffs,
    setGitBranchInfo,
    setPaneDiffs,
    addActivity,
    addFileActivity,
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
          setGitDiffs(event.unstaged)
          setGitStagedDiffs(event.staged || [])
          break

        case 'git.branchInfo':
          setGitBranchInfo({ branch: event.branch, remote: event.remote, ahead: event.ahead, behind: event.behind })
          break

        case 'git.result':
          // Commit/push results — UI updates via diff refresh automatically
          if (!event.success) {
            console.error(`git.${event.action} failed:`, event.message)
          }
          break

        case 'pane.diff':
          setPaneDiffs(event.paneId, event.diffs)
          break

        case 'pane.activity':
          addActivity(event.paneId, event.activity)
          break

        case 'file.activity':
          addFileActivity(event.activity)
          break
      }
    },
    [setWorkspace, addPane, removePane, updatePaneStatus, updatePaneMeta, setConnectionStatus, setFileTree, setGitDiffs, setGitStagedDiffs, setGitBranchInfo, setPaneDiffs, addActivity, addFileActivity],
  )

  const { send, status } = useWebSocket({ onMessage: handleMessage })

  // Sync connection status via effect to avoid render-loop
  useEffect(() => {
    setConnectionStatus(status)
  }, [status, setConnectionStatus])

  return <Layout send={send} />
}

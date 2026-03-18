import type { WebSocket } from '@fastify/websocket'
import type { ClientEvent, ServerEvent } from '../types.ts'
import type { WorkspaceManager } from '../workspace/WorkspaceManager.ts'
import type { GitService } from '../git/GitService.ts'

export function setupWsHandlers(
  socket: WebSocket,
  workspaceManager: WorkspaceManager,
  gitService?: GitService,
): void {
  const send = (event: ServerEvent) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(event))
    }
  }

  // Send initial workspace state
  const state = workspaceManager.getState()
  send({
    type: 'workspace.state',
    state,
  })

  // Replay terminal scrollback for each pane asynchronously.
  // Uses setImmediate to yield between panes and between chunks,
  // preventing event loop starvation with 10+ panes × 512KB scrollback.
  const SCROLLBACK_CHUNK_SIZE = 64 * 1024 // 64KB per message
  const replayScrollback = async () => {
    for (const pane of state.panes) {
      const scrollback = workspaceManager.getScrollback(pane.id)
      if (!scrollback) continue
      if (scrollback.length <= SCROLLBACK_CHUNK_SIZE) {
        send({ type: 'terminal.output', paneId: pane.id, data: scrollback })
      } else {
        for (let i = 0; i < scrollback.length; i += SCROLLBACK_CHUNK_SIZE) {
          if (socket.readyState !== socket.OPEN) return // bail if disconnected
          send({ type: 'terminal.output', paneId: pane.id, data: scrollback.slice(i, i + SCROLLBACK_CHUNK_SIZE) })
          // Yield to event loop between chunks
          await new Promise<void>((resolve) => setImmediate(resolve))
        }
      }
    }
  }
  replayScrollback().catch(() => { /* socket may have closed */ })

  // Send initial per-pane diffs for worktree panes
  const paneDiffs = workspaceManager.getPaneDiffs()
  for (const [paneId, diffs] of paneDiffs) {
    if (diffs.length > 0) {
      send({ type: 'pane.diff', paneId, diffs })
    }
  }

  // Send initial branch info
  gitService?.getBranchInfo()
    .then((info) => send({ type: 'git.branchInfo', ...info }))
    .catch(() => {})

  // Register event handlers for this client (multi-client safe)
  const cleanup = workspaceManager.onEvents({
    onTerminalData: (paneId, data) => {
      send({ type: 'terminal.output', paneId, data })
    },
    onPaneStatus: (paneId, status) => {
      send({ type: 'pane.status', paneId, status })
    },
    onPaneMeta: (paneId, meta) => {
      send({ type: 'pane.meta', paneId, meta })
    },
    onPaneAdded: (pane) => {
      send({ type: 'pane.added', pane })
    },
    onPaneRemoved: (paneId) => {
      send({ type: 'pane.removed', paneId })
    },
    onPaneActivity: (paneId, activity) => {
      send({ type: 'pane.activity', paneId, activity })
    },
    onFileActivity: (activity) => {
      send({ type: 'file.activity', activity })
    },
    onPaneDiff: (paneId, diffs) => {
      send({ type: 'pane.diff', paneId, diffs })
    },
    onFileTree: (tree) => {
      send({ type: 'fs.tree', tree })
    },
    onGitDiff: (result) => {
      send({ type: 'git.diff', unstaged: result.unstaged, staged: result.staged })
    },
  })

  // Handle incoming messages from client
  socket.on('message', (raw: { toString(): string }) => {
    let event: ClientEvent
    try {
      event = JSON.parse(raw.toString()) as ClientEvent
    } catch {
      return
    }

    switch (event.type) {
      case 'terminal.input':
        workspaceManager.writeToPane(event.paneId, event.data)
        break

      case 'terminal.resize':
        workspaceManager.resizePane(event.paneId, event.cols, event.rows)
        break

      case 'pane.create':
        workspaceManager.createPane(event.config).catch((err) => {
          console.error('pane.create failed:', err)
        })
        break

      case 'pane.close':
        workspaceManager.closePane(event.paneId).catch((err) => {
          console.error('pane.close failed:', err)
        })
        break

      case 'pane.restart':
        workspaceManager.restartPane(event.paneId, event.mode, event.sessionId)
        break

      case 'session.list':
        send({ type: 'session.list', paneId: event.paneId, sessions: workspaceManager.getSessionList(event.paneId) })
        break

      case 'git.refresh':
        gitService?.refresh()
        break

      case 'git.accept':
        gitService?.acceptFile(event.file).catch((err) => {
          console.error('git.accept failed:', err)
        })
        break

      case 'git.accept.all':
        gitService?.acceptAll().catch((err) => {
          console.error('git.accept.all failed:', err)
        })
        break

      case 'git.discard':
        gitService?.discardFile(event.file).catch((err) => {
          console.error('git.discard failed:', err)
        })
        break

      case 'git.discard.all':
        gitService?.discardAll().catch((err) => {
          console.error('git.discard.all failed:', err)
        })
        break

      case 'git.unstage':
        gitService?.unstageFile(event.file).catch((err) => {
          console.error('git.unstage failed:', err)
        })
        break

      case 'git.unstage.all':
        gitService?.unstageAll().catch((err) => {
          console.error('git.unstage.all failed:', err)
        })
        break

      case 'git.commit':
        if (gitService) {
          gitService.commit(event.message)
            .then((summary) => {
              send({ type: 'git.result', action: 'commit', success: true, message: summary })
              // Also refresh branch info after commit
              return gitService.getBranchInfo()
            })
            .then((info) => {
              send({ type: 'git.branchInfo', ...info })
            })
            .catch((err) => {
              send({ type: 'git.result', action: 'commit', success: false, message: String(err) })
            })
        }
        break

      case 'git.push':
        if (gitService) {
          gitService.push()
            .then((summary) => {
              send({ type: 'git.result', action: 'push', success: true, message: summary })
              return gitService.getBranchInfo()
            })
            .then((info) => {
              send({ type: 'git.branchInfo', ...info })
            })
            .catch((err) => {
              send({ type: 'git.result', action: 'push', success: false, message: String(err) })
            })
        }
        break

      case 'pane.merge':
        workspaceManager.mergeWorktree(event.paneId)
          .then((result) => {
            send({ type: 'pane.merge.result', paneId: event.paneId, ...result })
            // Refresh global git diff after merge
            gitService?.refresh()
          })
          .catch((err) => {
            send({ type: 'pane.merge.result', paneId: event.paneId, success: false, message: String(err) })
          })
        break

      case 'pane.discard':
        workspaceManager.discardWorktree(event.paneId)
          .then((result) => {
            send({ type: 'pane.merge.result', paneId: event.paneId, ...result })
            gitService?.refresh()
          })
          .catch((err) => {
            send({ type: 'pane.merge.result', paneId: event.paneId, success: false, message: String(err) })
          })
        break

      case 'pane.diff.refresh':
        workspaceManager.refreshPaneDiff(event.paneId)
        break

      case 'workspace.save':
        break

      case 'review.comment': {
        // Send review comment to agent pane as terminal input
        const { paneId: targetPaneId, comment } = event
        const targetPane = workspaceManager.getPanes().find((p) => p.id === targetPaneId)
        if (targetPane && comment.content.trim()) {
          const msg = [
            '',
            `[Review Comment] ${comment.file}:${comment.line}`,
            comment.content.trim(),
            '',
          ].join('\n')
          workspaceManager.writeToPane(targetPaneId, msg + '\n')
        }
        break
      }

      case 'broadcast.send':
      case 'task.dispatch':
        // P2 features — no-op for now
        break
    }
  })

  socket.on('close', () => {
    cleanup()
  })
}

import type { WebSocket } from '@fastify/websocket'
import type { ClientEvent, ServerEvent } from '../types.ts'
import type { WorkspaceManager } from '../workspace/WorkspaceManager.ts'

export function setupWsHandlers(
  socket: WebSocket,
  workspaceManager: WorkspaceManager,
): void {
  const send = (event: ServerEvent) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(event))
    }
  }

  // Send initial workspace state
  send({
    type: 'workspace.state',
    state: workspaceManager.getState(),
  })

  // Register workspace event handlers to forward to this client
  workspaceManager.onEvents({
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
        workspaceManager.createPane(event.config)
        break

      case 'pane.close':
        workspaceManager.closePane(event.paneId)
        break

      case 'pane.restart':
        workspaceManager.restartPane(event.paneId, event.mode)
        break

      case 'workspace.save':
        // Config auto-saved on pane changes, this is for explicit save
        break

      case 'broadcast.send':
      case 'task.dispatch':
      case 'review.comment':
      case 'git.refresh':
        // P1/P2 features — no-op for now
        break
    }
  })

  socket.on('close', () => {
    // Cleanup if needed
  })
}

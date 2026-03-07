import { useState, useCallback } from 'react'
import { Sidebar } from './Sidebar'
import { AgentPane } from './AgentPane'
import { AddPaneDialog } from './AddPaneDialog'
import { FileTree } from './FileTree'
import { FileViewer } from './FileViewer'
import { GitDiffPanel } from './GitDiffPanel'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { ClientEvent } from '@/types'
import { Monitor, GitBranch, FolderTree } from 'lucide-react'

interface LayoutProps {
  send: (event: ClientEvent) => void
}

export function Layout({ send }: LayoutProps) {
  const { panes, activePaneId, setActivePaneId, name, connectionStatus, selectedFile } = useWorkspaceStore()
  const [showAddDialog, setShowAddDialog] = useState(false)

  const handleTogglePane = useCallback(
    (paneId: string) => {
      setActivePaneId(activePaneId === paneId ? null : paneId)
    },
    [activePaneId, setActivePaneId],
  )

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '48px 1fr 300px 240px',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
      }}
    >
      {/* Column 1: Sidebar */}
      <Sidebar onAddPane={() => setShowAddDialog(true)} />

      {/* Column 2: Agent Accordion Area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
          borderRight: '1px solid var(--border-subtle)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            flexShrink: 0,
          }}
        >
          <Monitor size={14} color="var(--accent-primary)" />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {name || 'Nexus'}
          </span>
          <div
            style={{
              marginLeft: 'auto',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background:
                connectionStatus === 'connected'
                  ? 'var(--status-running)'
                  : connectionStatus === 'reconnecting'
                    ? 'var(--status-waiting)'
                    : 'var(--status-error)',
            }}
            title={connectionStatus}
          />
        </div>

        {/* Pane List */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: 8,
            overflow: 'auto',
            minHeight: 0,
          }}
        >
          {panes.length === 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: 12,
                color: 'var(--text-muted)',
              }}
            >
              <Monitor size={32} />
              <span style={{ fontSize: 14 }}>No agent panes</span>
              <button
                onClick={() => setShowAddDialog(true)}
                style={{
                  background: 'var(--accent-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Add Pane
              </button>
            </div>
          )}

          {panes.map((pane) => (
            <AgentPane
              key={pane.id}
              pane={pane}
              isActive={activePaneId === pane.id}
              onToggle={() => handleTogglePane(pane.id)}
              send={send}
            />
          ))}
        </div>
      </div>

      {/* Column 3: Diff & Code Review */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--border-subtle)',
          height: '100vh',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            flexShrink: 0,
          }}
        >
          <GitBranch size={14} color="var(--text-secondary)" />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Diff & Review
          </span>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <GitDiffPanel send={send} />
        </div>
      </div>

      {/* Column 4: Files */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            flexShrink: 0,
          }}
        >
          <FolderTree size={14} color="var(--text-secondary)" />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Files
          </span>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {selectedFile ? (
            <FileViewer />
          ) : (
            <FileTree />
          )}
        </div>
      </div>

      {/* Add Pane Dialog */}
      <AddPaneDialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        send={send}
      />
    </div>
  )
}

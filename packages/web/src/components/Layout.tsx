import { useState, useCallback, useRef } from 'react'
import { Sidebar } from './Sidebar'
import { AgentPane } from './AgentPane'
import { AddPaneDialog } from './AddPaneDialog'
import { CommandPalette } from './CommandPalette'
import { ResizeHandle } from './ResizeHandle'
import { FileTree } from './FileTree'
import { EditorTabs } from './EditorTabs'
import { BottomTerminal } from './BottomTerminal'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import type { ClientEvent } from '@/types'
import { Monitor, FolderTree } from 'lucide-react'

const STORAGE_KEY = 'nexus-panel-widths'

interface PanelWidths {
  agents: number
  editor: number
  files: number
}

function loadWidths(): PanelWidths {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        agents: Math.max(280, parsed.agents || 480),
        editor: Math.max(300, parsed.editor || 0), // 0 = flex
        files: Math.max(180, parsed.files || 240),
      }
    }
  } catch { /* ignore */ }
  return { agents: 480, editor: 0, files: 240 }
}

function saveWidths(widths: PanelWidths) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(widths))
}

interface LayoutProps {
  send: (event: ClientEvent) => void
}

export function Layout({ send }: LayoutProps) {
  const { panes, activePaneId, setActivePaneId, name, connectionStatus } = useWorkspaceStore()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [widths, setWidths] = useState<PanelWidths>(loadWidths)
  const widthsRef = useRef(widths)
  widthsRef.current = widths

  const handleTogglePane = useCallback(
    (paneId: string) => {
      setActivePaneId(activePaneId === paneId ? null : paneId)
    },
    [activePaneId, setActivePaneId],
  )

  const handleOpenAddPane = useCallback(() => setShowAddDialog(true), [])
  const handleToggleCommandPalette = useCallback(() => setShowCommandPalette(v => !v), [])

  const handleSaveWidths = useCallback(() => {
    saveWidths(widthsRef.current)
  }, [])

  const handleResizeAgents = useCallback((delta: number) => {
    setWidths(w => ({ ...w, agents: Math.max(280, w.agents + delta) }))
  }, [])

  const handleResizeFiles = useCallback((delta: number) => {
    setWidths(w => ({ ...w, files: Math.max(180, w.files - delta) }))
  }, [])

  useKeyboardShortcuts({
    send,
    onToggleCommandPalette: handleToggleCommandPalette,
    onAddPane: handleOpenAddPane,
  })

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
      }}
    >
      {/* Column 1: Sidebar */}
      <div style={{ width: 48, flexShrink: 0 }}>
        <Sidebar onAddPane={handleOpenAddPane} />
      </div>

      {/* Column 2: Agent Panes */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
          width: widths.agents,
          flexShrink: 0,
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
                onClick={handleOpenAddPane}
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
              isExpanded={activePaneId === pane.id}
              onToggle={() => handleTogglePane(pane.id)}
              send={send}
            />
          ))}
        </div>
      </div>

      {/* Resize handle: Agents | Editor */}
      <ResizeHandle onResize={handleResizeAgents} onResizeEnd={handleSaveWidths} />

      {/* Column 3: Editor Tabs (flex: 1 takes remaining space) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
          flex: 1,
          minWidth: 300,
        }}
      >
        <EditorTabs send={send} />
      </div>

      {/* Resize handle: Editor | Files */}
      <ResizeHandle onResize={handleResizeFiles} onResizeEnd={handleSaveWidths} />

      {/* Column 4: File Tree */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          width: widths.files,
          flexShrink: 0,
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
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <FileTree />
        </div>
      </div>

      {/* Add Pane Dialog */}
      <AddPaneDialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        send={send}
      />

      {/* Command Palette */}
      <CommandPalette
        open={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        send={send}
        onAddPane={handleOpenAddPane}
      />

      {/* Bottom Terminal */}
      <BottomTerminal send={send} />
    </div>
  )
}

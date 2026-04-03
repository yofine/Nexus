import { useState, useCallback, useRef, useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { AgentPane } from './AgentPane'
import { AddPaneDialog } from './AddPaneDialog'
import { SettingsDialog } from './SettingsDialog'
import { NotesDialog } from './NotesDialog'
import { CommandPalette } from './CommandPalette'
import { ResizeHandle } from './ResizeHandle'
import { FileTree } from './FileTree'
import { EditorTabs } from './EditorTabs'
import { BottomTerminal } from './BottomTerminal'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import type { ClientEvent } from '@/types'
import { Monitor, FolderTree, RotateCcw } from 'lucide-react'
import {
  AGENT_WIDTH_STEPS,
  DEFAULT_WIDTHS,
  FILE_WIDTH_STEPS,
  LAYOUT_EVENT,
  cycleStep,
  loadLayoutPreferences,
  resetModeWidths,
  saveModeWidths,
  type LayoutMode,
  type LayoutPanel,
  type PanelWidths,
} from '@/lib/layoutPreferences'

interface LayoutProps {
  send: (event: ClientEvent) => void
}

function PanelHeaderAction({
  active,
  title,
  onClick,
  icon,
}: {
  active?: boolean
  title: string
  onClick: () => void
  icon: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="pane-action-btn"
      style={{
        color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
        minWidth: 32,
        minHeight: 32,
        justifyContent: 'center',
      }}
    >
      {icon}
    </button>
  )
}

export function Layout({ send }: LayoutProps) {
  const { panes, activePaneId, setActivePaneId, name, connectionStatus } = useWorkspaceStore()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [layoutPrefs, setLayoutPrefs] = useState(loadLayoutPreferences)
  const [widths, setWidths] = useState<PanelWidths>(() => loadLayoutPreferences().widthsByMode[loadLayoutPreferences().mode])
  const [maximizedPanel, setMaximizedPanel] = useState<Exclude<LayoutPanel, 'terminal'> | null>(null)
  const widthsRef = useRef(widths)
  widthsRef.current = widths

  const mode: LayoutMode = layoutPrefs.mode

  const syncLayoutPrefs = useCallback(() => {
    const prefs = loadLayoutPreferences()
    setLayoutPrefs(prefs)
    setWidths(prefs.widthsByMode[prefs.mode])
    setMaximizedPanel(null)
  }, [])

  useEffect(() => {
    window.addEventListener(LAYOUT_EVENT, syncLayoutPrefs)
    window.addEventListener('storage', syncLayoutPrefs)
    return () => {
      window.removeEventListener(LAYOUT_EVENT, syncLayoutPrefs)
      window.removeEventListener('storage', syncLayoutPrefs)
    }
  }, [syncLayoutPrefs])

  const handleTogglePane = useCallback(
    (paneId: string) => {
      const current = useWorkspaceStore.getState().activePaneId
      setActivePaneId(current === paneId ? null : paneId)
    },
    [setActivePaneId],
  )

  const handleOpenAddPane = useCallback(() => setShowAddDialog(true), [])
  const handleToggleCommandPalette = useCallback(() => setShowCommandPalette(v => !v), [])
  const handleOpenSettings = useCallback(() => setShowSettings(true), [])
  const handleOpenNotes = useCallback(() => setShowNotes(true), [])
  const handleOpenReplay = useCallback(() => {
    useWorkspaceStore.getState().openReplayTab()
  }, [])

  const persistWidths = useCallback((next: PanelWidths) => {
    saveModeWidths(mode, next)
    setLayoutPrefs(loadLayoutPreferences())
  }, [mode])

  const handleResizeAgents = useCallback((delta: number) => {
    if (maximizedPanel === 'editor') return
    setWidths(w => ({ ...w, agents: Math.max(280, w.agents + delta) }))
  }, [maximizedPanel])

  const handleResizeFiles = useCallback((delta: number) => {
    if (maximizedPanel === 'editor') return
    setWidths(w => ({ ...w, files: Math.max(160, w.files - delta) }))
  }, [maximizedPanel])

  const handleSaveWidths = useCallback(() => {
    persistWidths(widthsRef.current)
  }, [persistWidths])

  const handleCycleAgentsWidth = useCallback(() => {
    setWidths((w) => {
      const next = { ...w, agents: cycleStep(AGENT_WIDTH_STEPS, w.agents) }
      persistWidths(next)
      return next
    })
  }, [persistWidths])

  const handleCycleFilesWidth = useCallback(() => {
    setWidths((w) => {
      const next = { ...w, files: cycleStep(FILE_WIDTH_STEPS, w.files) }
      persistWidths(next)
      return next
    })
  }, [persistWidths])

  const handleResetAgentsWidth = useCallback(() => {
    setWidths((w) => {
      const next = { ...w, agents: DEFAULT_WIDTHS[mode].agents }
      persistWidths(next)
      return next
    })
  }, [mode, persistWidths])

  const handleResetFilesWidth = useCallback(() => {
    setWidths((w) => {
      const next = { ...w, files: DEFAULT_WIDTHS[mode].files }
      persistWidths(next)
      return next
    })
  }, [mode, persistWidths])

  const handleResetLayout = useCallback(() => {
    resetModeWidths(mode)
    syncLayoutPrefs()
  }, [mode, syncLayoutPrefs])

  const handleToggleMaximize = useCallback((panel: Exclude<LayoutPanel, 'terminal'>) => {
    if (panel !== 'editor') return
    setMaximizedPanel((current) => (current === 'editor' ? null : 'editor'))
  }, [])

  const isEditorFullscreen = maximizedPanel === 'editor'

  useKeyboardShortcuts({
    send,
    onToggleCommandPalette: handleToggleCommandPalette,
    onAddPane: handleOpenAddPane,
    onOpenSettings: handleOpenSettings,
  })

  return (
    <div
      style={{
        display: 'flex',
        height: 'calc(100vh - var(--header-height))',
        width: '100vw',
        overflow: 'hidden',
      }}
    >
      <div style={{ width: 'var(--sidebar-width)', flexShrink: 0 }}>
        <Sidebar onAddPane={handleOpenAddPane} onOpenSettings={handleOpenSettings} onOpenReplay={handleOpenReplay} onOpenNotes={handleOpenNotes} />
      </div>

      {!isEditorFullscreen && (
        <>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              overflow: 'hidden',
              width: widths.agents,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-md)',
                padding: '0 var(--space-xl)',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)',
                flexShrink: 0,
                height: 'var(--header-height)',
                boxSizing: 'border-box',
              }}
            >
              <Monitor className="icon-sm" style={{ color: 'var(--accent-primary)' }} />
              <span style={{ fontSize: 'var(--font-md)', fontWeight: 600, color: 'var(--text-primary)' }}>
                {name || 'Nexus'}
              </span>
              <div
                style={{
                  marginLeft: 'auto',
                  width: 'var(--space-md)',
                  height: 'var(--space-md)',
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
                    gap: 'var(--space-lg)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <Monitor className="icon-hero" />
                  <span style={{ fontSize: 'var(--font-lg)' }}>No agent panes</span>
                  <button
                    onClick={handleOpenAddPane}
                    style={{
                      background: 'var(--accent-primary)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      padding: 'var(--space-md) var(--space-xl)',
                      cursor: 'pointer',
                      fontSize: 'var(--font-md)',
                    }}
                  >
                    Add Pane
                  </button>
                </div>
              )}

              {panes.map((pane, index) => (
                <AgentPane
                  key={pane.id}
                  pane={pane}
                  paneIndex={index}
                  isExpanded={activePaneId === pane.id}
                  onToggle={() => handleTogglePane(pane.id)}
                  send={send}
                />
              ))}
            </div>
          </div>

          <ResizeHandle
            onResize={handleResizeAgents}
            onResizeEnd={handleSaveWidths}
            onCycleWidth={handleCycleAgentsWidth}
            onResetWidth={handleResetAgentsWidth}
          />
        </>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
          flex: 1,
          minWidth: 300,
        }}
      >
        <EditorTabs
          send={send}
          isMaximized={maximizedPanel === 'editor'}
          onToggleMaximize={() => handleToggleMaximize('editor')}
          onResetLayout={handleResetLayout}
        />
      </div>

      {!isEditorFullscreen && (
        <>
          <ResizeHandle
            onResize={handleResizeFiles}
            onResizeEnd={handleSaveWidths}
            onCycleWidth={handleCycleFilesWidth}
            onResetWidth={handleResetFilesWidth}
          />

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              width: widths.files,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-md)',
                padding: '0 var(--space-xl)',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)',
                flexShrink: 0,
                height: 'var(--header-height)',
                boxSizing: 'border-box',
              }}
            >
              <FolderTree className="icon-sm" style={{ color: 'var(--text-secondary)' }} />
              <span style={{ fontSize: 'var(--font-md)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Files
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-xs)' }}>
                <PanelHeaderAction
                  title="Reset layout"
                  onClick={handleResetLayout}
                  icon={<RotateCcw size={14} />}
                />
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
              <FileTree />
            </div>
          </div>
        </>
      )}

      <AddPaneDialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        send={send}
      />

      <SettingsDialog
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />

      <NotesDialog
        isOpen={showNotes}
        onClose={() => setShowNotes(false)}
      />

      <CommandPalette
        open={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        send={send}
        onAddPane={handleOpenAddPane}
      />

      <BottomTerminal send={send} />
    </div>
  )
}

import { X, File, GitBranch } from 'lucide-react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { EditorTab } from '@/stores/workspaceStore'
import { FileViewer } from './FileViewer'
import { GitDiffPanel } from './GitDiffPanel'
import type { ClientEvent } from '@/types'

interface EditorTabsProps {
  send: (event: ClientEvent) => void
}

function TabButton({ tab, isActive, onActivate, onClose }: {
  tab: EditorTab
  isActive: boolean
  onActivate: () => void
  onClose: (e: React.MouseEvent) => void
}) {
  const Icon = tab.type === 'diff' ? GitBranch : File

  return (
    <div
      onClick={onActivate}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-sm)',
        padding: 'var(--tab-padding)',
        cursor: 'pointer',
        fontSize: 'var(--font-sm)',
        fontFamily: 'var(--font-mono)',
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        background: isActive ? 'var(--bg-elevated)' : 'transparent',
        borderBottom: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = 'var(--bg-overlay)'
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = 'transparent'
      }}
    >
      <Icon className="icon-xs" style={{ color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
      <span>{tab.label}</span>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 2,
          display: 'flex',
          alignItems: 'center',
          borderRadius: 'var(--radius-sm)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-overlay)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'none'
        }}
      >
        <X className="icon-xs" style={{ color: 'var(--text-muted)' }} />
      </button>
    </div>
  )
}

export function EditorTabs({ send }: EditorTabsProps) {
  const { tabs, activeTabId, setActiveTab, closeTab } = useWorkspaceStore()

  const activeTab = tabs.find((t) => t.id === activeTabId)

  if (tabs.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 'var(--space-md)',
          color: 'var(--text-muted)',
        }}
      >
        <File className="icon-hero" />
        <span style={{ fontSize: 'var(--font-md)' }}>Open a file or view diffs</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          overflow: 'auto',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          flexShrink: 0,
        }}
      >
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onActivate={() => setActiveTab(tab.id)}
            onClose={(e) => {
              e.stopPropagation()
              closeTab(tab.id)
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {activeTab?.type === 'diff' && <GitDiffPanel send={send} />}
        {activeTab?.type === 'file' && activeTab.filePath && (
          <FileViewer filePath={activeTab.filePath} />
        )}
      </div>
    </div>
  )
}

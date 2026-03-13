import { Plus, Zap, ClipboardList, Settings, History, StickyNote } from 'lucide-react'

interface SidebarProps {
  onAddPane: () => void
  onOpenSettings: () => void
  onOpenReplay: () => void
  onOpenNotes: () => void
}

interface SidebarButtonProps {
  icon: React.ReactNode
  title: string
  onClick?: () => void
  disabled?: boolean
}

function SidebarButton({ icon, title, onClick, disabled }: SidebarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 'var(--btn-size)',
        height: 'var(--btn-size)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'none',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.3 : 1,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = 'var(--bg-overlay)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none'
      }}
    >
      {icon}
    </button>
  )
}

export function Sidebar({ onAddPane, onOpenSettings, onOpenReplay, onOpenNotes }: SidebarProps) {
  return (
    <div
      style={{
        width: 'var(--sidebar-width)',
        height: '100%',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 'var(--space-lg)',
        gap: 'var(--space-xs)',
      }}
    >
      <SidebarButton
        icon={<Plus className="sidebar-icon" />}
        title="Add Pane"
        onClick={onAddPane}
      />
      <SidebarButton
        icon={<Zap className="sidebar-icon sidebar-icon--disabled" />}
        title="Task Dispatch (coming soon)"
        disabled
      />
      <SidebarButton
        icon={<History className="sidebar-icon" />}
        title="Replay History"
        onClick={onOpenReplay}
      />
      <SidebarButton
        icon={<StickyNote className="sidebar-icon" />}
        title="Notes"
        onClick={onOpenNotes}
      />
      <SidebarButton
        icon={<ClipboardList className="sidebar-icon sidebar-icon--disabled" />}
        title="Templates (coming soon)"
        disabled
      />

      <div style={{ flex: 1 }} />

      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <SidebarButton
          icon={<Settings className="sidebar-icon" />}
          title="Settings (⌘,)"
          onClick={onOpenSettings}
        />
      </div>
    </div>
  )
}

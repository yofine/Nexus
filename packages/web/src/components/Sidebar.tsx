import { Plus, Zap, ClipboardList, Settings, GitBranch } from 'lucide-react'
import { useWorkspaceStore } from '@/stores/workspaceStore'

interface SidebarProps {
  onAddPane: () => void
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
        width: 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'none',
        border: 'none',
        borderRadius: 6,
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

export function Sidebar({ onAddPane }: SidebarProps) {
  const { openDiffTab } = useWorkspaceStore()

  return (
    <div
      style={{
        width: 48,
        height: '100%',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 12,
        gap: 4,
      }}
    >
      <SidebarButton
        icon={<Plus size={18} color="var(--text-secondary)" />}
        title="Add Pane"
        onClick={onAddPane}
      />
      <SidebarButton
        icon={<GitBranch size={18} color="var(--text-secondary)" />}
        title="Review Diffs"
        onClick={openDiffTab}
      />
      <SidebarButton
        icon={<Zap size={18} color="var(--text-muted)" />}
        title="Task Dispatch (coming soon)"
        disabled
      />
      <SidebarButton
        icon={<ClipboardList size={18} color="var(--text-muted)" />}
        title="Templates (coming soon)"
        disabled
      />

      <div style={{ flex: 1 }} />

      <div style={{ marginBottom: 12 }}>
        <SidebarButton
          icon={<Settings size={18} color="var(--text-muted)" />}
          title="Settings (coming soon)"
          disabled
        />
      </div>
    </div>
  )
}

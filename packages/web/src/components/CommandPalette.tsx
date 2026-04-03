import { useEffect, useRef, useState, useMemo } from 'react'
import { Command } from 'cmdk'
import {
  Plus,
  X,
  RotateCcw,
  GitBranch,
  Palette,
} from 'lucide-react'
import { AgentIcon } from './AgentIcon'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { ClientEvent } from '@/types'
import { createRestartPaneEvent } from '@/stores/paneStoreUtils'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  send: (event: ClientEvent) => void
  onAddPane: () => void
}

export function CommandPalette({ open, onClose, send, onAddPane }: CommandPaletteProps) {
  const { panes, activePaneId, setActivePaneId, openReviewTab } = useWorkspaceStore()
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setSearch('')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const themes = useMemo(() => [
    'dark-ide', 'github-dark', 'dracula', 'tokyo-night', 'catppuccin', 'nord', 'light-ide',
  ], [])

  if (!open) return null

  const runAndClose = (fn: () => void) => {
    fn()
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '20vh',
        background: 'rgba(0,0,0,0.5)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <Command
        label="Command Palette"
        style={{
          width: 520,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px',
          gap: 8,
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>{'>'}</span>
          <Command.Input
            ref={inputRef}
            value={search}
            onValueChange={setSearch}
            placeholder="Type a command..."
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: 14,
              fontFamily: 'var(--font-ui)',
            }}
          />
          <kbd style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            background: 'var(--bg-surface)',
            padding: '2px 6px',
            borderRadius: 4,
            border: '1px solid var(--border-subtle)',
          }}>ESC</kbd>
        </div>

        <Command.List style={{
          maxHeight: 320,
          overflow: 'auto',
          padding: 8,
        }}>
          <Command.Empty style={{
            padding: 16,
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 13,
          }}>
            No results found.
          </Command.Empty>

          {/* Pane Actions */}
          <Command.Group heading={<GroupHeading>Panes</GroupHeading>}>
            <Item
              onSelect={() => runAndClose(onAddPane)}
              icon={<Plus size={14} />}
              shortcut="⌘N"
            >
              New Agent Pane
            </Item>

            {panes.map((pane) => (
              <Item
                key={pane.id}
                onSelect={() => runAndClose(() => setActivePaneId(pane.id))}
                icon={<AgentIcon agent={pane.agent} size={14} />}
              >
                Switch to {pane.name}
              </Item>
            ))}

            {activePaneId && (
              <>
                <Item
                  onSelect={() => runAndClose(() => {
                    const pane = panes.find(p => p.id === activePaneId)
                    if (pane) send(createRestartPaneEvent(activePaneId))
                  })}
                  icon={<RotateCcw size={14} />}
                >
                  Restart Current Pane
                </Item>
                <Item
                  onSelect={() => runAndClose(() => send({ type: 'pane.close', paneId: activePaneId }))}
                  icon={<X size={14} />}
                  shortcut="⌘W"
                >
                  Close Current Pane
                </Item>
              </>
            )}
          </Command.Group>

          {/* Git */}
          <Command.Group heading={<GroupHeading>Git</GroupHeading>}>
            <Item
              onSelect={() => runAndClose(() => openReviewTab())}
              icon={<GitBranch size={14} />}
            >
              Open Git Diff
            </Item>
            <Item
              onSelect={() => runAndClose(() => send({ type: 'git.refresh' }))}
              icon={<GitBranch size={14} />}
            >
              Refresh Git Diff
            </Item>
          </Command.Group>

          {/* Themes */}
          <Command.Group heading={<GroupHeading>Theme</GroupHeading>}>
            {themes.map((theme) => (
              <Item
                key={theme}
                onSelect={() => runAndClose(() => {
                  document.documentElement.setAttribute('data-theme', theme)
                })}
                icon={<Palette size={14} />}
              >
                {theme}
              </Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  )
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      padding: '4px 8px',
    }}>
      {children}
    </span>
  )
}

function Item({ children, onSelect, icon, shortcut }: {
  children: React.ReactNode
  onSelect: () => void
  icon?: React.ReactNode
  shortcut?: string
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 13,
        color: 'var(--text-primary)',
      }}
      className="cmdk-item"
    >
      <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1 }}>{children}</span>
      {shortcut && (
        <kbd style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          background: 'var(--bg-surface)',
          padding: '2px 6px',
          borderRadius: 4,
          border: '1px solid var(--border-subtle)',
        }}>
          {shortcut}
        </kbd>
      )}
    </Command.Item>
  )
}

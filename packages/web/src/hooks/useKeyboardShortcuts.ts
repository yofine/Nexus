import { useEffect } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { ClientEvent } from '@/types'

interface UseKeyboardShortcutsOptions {
  send: (event: ClientEvent) => void
  onToggleCommandPalette: () => void
  onAddPane: () => void
}

export function useKeyboardShortcuts({
  send,
  onToggleCommandPalette,
  onAddPane,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

      // Don't intercept when typing in inputs (except cmdk)
      const target = e.target as HTMLElement
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
      const inTerminal = target.closest('.xterm')

      // Cmd/Ctrl+K — command palette (always works)
      if (mod && e.key === 'k') {
        e.preventDefault()
        onToggleCommandPalette()
        return
      }

      // Skip remaining shortcuts if in terminal or input
      if (inTerminal || inInput) return

      // Cmd/Ctrl+N — new pane
      if (mod && e.key === 'n') {
        e.preventDefault()
        onAddPane()
        return
      }

      // Cmd/Ctrl+W — close active pane
      if (mod && e.key === 'w') {
        e.preventDefault()
        const { activePaneId } = useWorkspaceStore.getState()
        if (activePaneId) {
          send({ type: 'pane.close', paneId: activePaneId })
        }
        return
      }

      // Cmd/Ctrl+1-9 — switch pane by index
      if (mod && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const { panes, setActivePaneId } = useWorkspaceStore.getState()
        const idx = parseInt(e.key) - 1
        if (idx < panes.length) {
          setActivePaneId(panes[idx].id)
        }
        return
      }

      // Cmd/Ctrl+G — open git diff tab
      if (mod && e.key === 'g') {
        e.preventDefault()
        const { openDiffTab } = useWorkspaceStore.getState()
        openDiffTab()
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [send, onToggleCommandPalette, onAddPane])
}

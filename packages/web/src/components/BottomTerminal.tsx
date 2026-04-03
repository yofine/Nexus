import { useState, useCallback, useEffect } from 'react'
import { Terminal as TerminalIcon, ChevronDown, ChevronUp, Maximize2, Minimize2, RotateCcw, RefreshCw, Square, Eraser } from 'lucide-react'
import { Terminal } from './Terminal'
import type { ClientEvent } from '@/types'
import {
  DEFAULT_TERMINAL_HEIGHTS,
  LAYOUT_EVENT,
  TERMINAL_HEIGHT_STEPS,
  cycleStep,
  loadLayoutPreferences,
  saveModeTerminalHeight,
  type LayoutMode,
} from '@/lib/layoutPreferences'

interface BottomTerminalProps {
  send: (event: ClientEvent) => void
}

const PANE_ID = '__shell__'
const STATIC_COMMANDS = ['pwd', 'ls', 'git status', 'git diff --stat']
const SCRIPT_KEYS = ['dev', 'build', 'test', 'lint']

export function BottomTerminal({ send }: BottomTerminalProps) {
  const initialPrefs = loadLayoutPreferences()
  const [isOpen, setIsOpen] = useState(false)
  const [spawned, setSpawned] = useState(false)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(initialPrefs.mode)
  const [heightPct, setHeightPct] = useState(initialPrefs.terminalHeightByMode[initialPrefs.mode])
  const [isMaximized, setIsMaximized] = useState(false)
  const [pendingCommand, setPendingCommand] = useState<string | null>(null)
  const [projectCommands, setProjectCommands] = useState<string[]>([])
  const [lastCommand, setLastCommand] = useState<string | null>(null)

  useEffect(() => {
    const syncLayoutPrefs = () => {
      const prefs = loadLayoutPreferences()
      setLayoutMode(prefs.mode)
      setHeightPct(prefs.terminalHeightByMode[prefs.mode])
      setIsMaximized(false)
    }
    window.addEventListener(LAYOUT_EVENT, syncLayoutPrefs)
    window.addEventListener('storage', syncLayoutPrefs)
    return () => {
      window.removeEventListener(LAYOUT_EVENT, syncLayoutPrefs)
      window.removeEventListener('storage', syncLayoutPrefs)
    }
  }, [])

  useEffect(() => {
    fetch('/api/file?path=package.json')
      .then((res) => res.ok ? res.json() : null)
      .then((data: { content: string } | null) => {
        if (!data?.content) return
        const parsed = JSON.parse(data.content) as { scripts?: Record<string, string> }
        const scripts = parsed.scripts || {}
        const commands = SCRIPT_KEYS.filter((key) => key in scripts).map((key) => `pnpm ${key}`)
        setProjectCommands(commands)
      })
      .catch(() => setProjectCommands([]))
  }, [])

  const runCommand = useCallback((command: string) => {
    if (!spawned) {
      send({
        type: 'pane.create',
        config: {
          name: '__shell__',
          agent: '__shell__',
          restore: 'manual',
        },
      })
      setSpawned(true)
      setPendingCommand(command)
      setIsOpen(true)
      setLastCommand(command)
      return
    }

    setIsOpen(true)
    send({ type: 'terminal.input', paneId: PANE_ID, data: `${command}\r` })
    setLastCommand(command)
  }, [send, spawned])

  useEffect(() => {
    if (!spawned || !pendingCommand || !isOpen) return
    const timeout = window.setTimeout(() => {
      send({ type: 'terminal.input', paneId: PANE_ID, data: `${pendingCommand}\r` })
      setPendingCommand(null)
    }, 180)
    return () => window.clearTimeout(timeout)
  }, [isOpen, pendingCommand, send, spawned])

  const handleOpen = useCallback(() => {
    if (!spawned) {
      send({
        type: 'pane.create',
        config: {
          name: '__shell__',
          agent: '__shell__',
          restore: 'manual',
        },
      })
      setSpawned(true)
    }
    setIsOpen(true)
  }, [spawned, send])

  const handleClose = useCallback(() => {
    setIsOpen(false)
    setIsMaximized(false)
  }, [])

  const handleTerminalData = useCallback(
    (data: string) => {
      send({ type: 'terminal.input', paneId: PANE_ID, data })
    },
    [send],
  )

  const handleTerminalResize = useCallback(
    (cols: number, rows: number) => {
      send({ type: 'terminal.resize', paneId: PANE_ID, cols, rows })
    },
    [send],
  )

  const setAndPersistHeight = useCallback((next: number) => {
    setHeightPct(next)
    saveModeTerminalHeight(layoutMode, next)
  }, [layoutMode])

  const handleCycleHeight = useCallback(() => {
    if (isMaximized) {
      setIsMaximized(false)
    }
    setAndPersistHeight(cycleStep(TERMINAL_HEIGHT_STEPS, heightPct))
  }, [heightPct, isMaximized, setAndPersistHeight])

  const handleResetHeight = useCallback(() => {
    setIsMaximized(false)
    setAndPersistHeight(DEFAULT_TERMINAL_HEIGHTS[layoutMode])
  }, [layoutMode, setAndPersistHeight])

  const handleToggleMaximize = useCallback(() => {
    setIsMaximized((value) => !value)
  }, [])

  const commandButtons = [...STATIC_COMMANDS, ...projectCommands]
  const terminalHeight = isMaximized ? 'calc(100vh - var(--header-height) * 2)' : `${heightPct}vh`

  if (!isOpen) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 'var(--sidebar-width)',
          right: 0,
          height: 'var(--header-height)',
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 var(--space-lg)',
          gap: 'var(--space-md)',
          zIndex: 10,
          cursor: 'pointer',
        }}
        onClick={handleOpen}
      >
        <TerminalIcon className="icon-sm" style={{ color: 'var(--text-secondary)' }} />
        <span style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>Terminal</span>
        <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>{heightPct}vh</span>
        <ChevronUp className="icon-sm" style={{ color: 'var(--text-muted)', marginLeft: 'auto' }} />
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 'var(--sidebar-width)',
        right: 0,
        height: terminalHeight,
        background: 'var(--bg-base)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: 'var(--space-xs) var(--space-lg)',
          gap: 'var(--space-md)',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}
      >
        <TerminalIcon className="icon-sm" style={{ color: 'var(--text-secondary)' }} />
        <span style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', fontWeight: 500 }}>Terminal</span>
        <button className="pane-action-btn" title={`Height ${heightPct}vh`} onClick={handleCycleHeight}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 28 }}>{heightPct}vh</span>
        </button>
        <button className="pane-action-btn" title="Reset height" onClick={handleResetHeight}>
          <RotateCcw className="icon-xs" style={{ color: 'var(--text-secondary)' }} />
        </button>
        <button className="pane-action-btn" title="Interrupt current command" onClick={() => send({ type: 'terminal.input', paneId: PANE_ID, data: '\u0003' })}>
          <Square className="icon-xs" style={{ color: 'var(--text-secondary)' }} />
        </button>
        <button className="pane-action-btn" title="Clear terminal" onClick={() => send({ type: 'terminal.input', paneId: PANE_ID, data: 'clear\r' })}>
          <Eraser className="icon-xs" style={{ color: 'var(--text-secondary)' }} />
        </button>
        <button className="pane-action-btn" title="Retry last command" onClick={() => lastCommand && runCommand(lastCommand)} disabled={!lastCommand}>
          <RefreshCw className="icon-xs" style={{ color: lastCommand ? 'var(--text-secondary)' : 'var(--text-muted)' }} />
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-xs)' }}>
          <button className="pane-action-btn" title={isMaximized ? 'Restore terminal' : 'Maximize terminal'} onClick={handleToggleMaximize}>
            {isMaximized ? (
              <Minimize2 className="icon-xs" style={{ color: 'var(--accent-primary)' }} />
            ) : (
              <Maximize2 className="icon-xs" style={{ color: 'var(--text-secondary)' }} />
            )}
          </button>
          <button className="pane-action-btn" title="Minimize terminal" onClick={handleClose}>
            <ChevronDown className="icon-sm" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-elevated)',
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        {commandButtons.map((command) => (
          <button
            key={command}
            className="terminal-chip"
            onClick={() => runCommand(command)}
          >
            {command}
          </button>
        ))}
        <button className="terminal-chip" onClick={() => send({ type: 'terminal.input', paneId: PANE_ID, data: 'clear\r' })}>
          clear
        </button>
        <button className="terminal-chip" onClick={() => send({ type: 'terminal.input', paneId: PANE_ID, data: '--help' })}>
          --help
        </button>
        <button className="terminal-chip" onClick={() => send({ type: 'terminal.input', paneId: PANE_ID, data: '--watch' })}>
          --watch
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <Terminal
          paneId={PANE_ID}
          onData={handleTerminalData}
          onResize={handleTerminalResize}
        />
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import {
  X,
  Palette,
  Keyboard,
  Bot,
  Settings,
  Check,
  Terminal,
  CircleDot,
  Zap,
  ChevronRight,
  AlertCircle,
  LoaderCircle,
  Save,
} from 'lucide-react'
import { AgentIcon } from './AgentIcon'
import type { GlobalConfig, AgentDefinition, AgentAvailability } from '@/types'

interface SettingsDialogProps {
  isOpen: boolean
  onClose: () => void
}

type SettingsTab = 'general' | 'shortcuts' | 'agents'

const THEMES = [
  { id: 'dark-ide', name: 'Dark IDE', desc: 'Deep purple accents' },
  { id: 'github-dark', name: 'GitHub Dark', desc: 'GitHub-style dark' },
  { id: 'dracula', name: 'Dracula', desc: 'Classic Dracula palette' },
  { id: 'tokyo-night', name: 'Tokyo Night', desc: 'Soft blue tones' },
  { id: 'catppuccin', name: 'Catppuccin', desc: 'Mocha flavor' },
  { id: 'nord', name: 'Nord', desc: 'Arctic color palette' },
  { id: 'light-ide', name: 'Light IDE', desc: 'Clean light theme' },
]

const FONT_OPTIONS = [
  { value: "'Geist Mono', 'JetBrains Mono', monospace", label: 'Geist Mono' },
  { value: "'JetBrains Mono', 'Fira Code', monospace", label: 'JetBrains Mono' },
  { value: "'Fira Code', 'Source Code Pro', monospace", label: 'Fira Code' },
  { value: "'Source Code Pro', 'Menlo', monospace", label: 'Source Code Pro' },
  { value: "'Cascadia Code', 'Consolas', monospace", label: 'Cascadia Code' },
  { value: "'SF Mono', 'Monaco', monospace", label: 'SF Mono' },
  { value: "'IBM Plex Mono', monospace", label: 'IBM Plex Mono' },
]

const SHORTCUTS = [
  { keys: '⌘ K', action: 'Open Command Palette', scope: 'Global' },
  { keys: '⌘ N', action: 'New Agent Pane', scope: 'Global' },
  { keys: '⌘ W', action: 'Close Active Pane', scope: 'Global' },
  { keys: '⌘ 1-9', action: 'Switch Pane by Index', scope: 'Global' },
  { keys: '⌘ G', action: 'Open Git Diff', scope: 'Global' },
  { keys: '⌘ ,', action: 'Open Settings', scope: 'Global' },
  { keys: '⌘ `', action: 'Toggle Bottom Terminal', scope: 'Global' },
  { keys: 'Escape', action: 'Close Dialog / Palette', scope: 'Dialog' },
]

const AGENT_DISPLAY: Record<string, { name: string; desc: string }> = {
  claudecode: { name: 'Claude Code', desc: 'Anthropic CLI agent for coding tasks' },
  codex: { name: 'Codex', desc: 'OpenAI CLI coding agent' },
  opencode: { name: 'OpenCode', desc: 'Open-source AI coding agent' },
  'kimi-cli': { name: 'Kimi Code', desc: 'Moonshot AI coding assistant' },
  qodercli: { name: 'Qoder CLI', desc: 'Qoder coding agent' },
}

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [config, setConfig] = useState<GlobalConfig | null>(null)
  const [initialConfig, setInitialConfig] = useState<GlobalConfig | null>(null)
  const [availability, setAvailability] = useState<Record<string, AgentAvailability>>({})
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedFeedback, setSavedFeedback] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editingAgent, setEditingAgent] = useState<string | null>(null)
  const [fontValue, setFontValue] = useState(FONT_OPTIONS[0].value)
  const [initialTheme, setInitialTheme] = useState<string | null>(null)
  const [initialFont, setInitialFont] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setLoading(true)
      setLoadError(null)
      setSaveError(null)

      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark-ide'
      const currentFont = localStorage.getItem('nexus-font-mono') || FONT_OPTIONS[0].value
      setInitialTheme(currentTheme)
      setInitialFont(currentFont)
      setFontValue(currentFont)

      Promise.all([
        fetch('/api/config').then(async (r) => {
          if (!r.ok) throw new Error('Failed to load settings')
          return r.json()
        }),
        fetch('/api/agents').then(async (r) => {
          if (!r.ok) throw new Error('Failed to load agent availability')
          return r.json()
        }).catch(() => ({})),
      ]).then(([nextConfig, nextAvailability]) => {
        setConfig(nextConfig)
        setInitialConfig(nextConfig)
        setAvailability(nextAvailability)
      }).catch(() => {
        setLoadError('Failed to load settings.')
      }).finally(() => {
        setLoading(false)
      })
    }
  }, [isOpen])

  useEffect(() => {
    if (!savedFeedback) return
    const timeout = window.setTimeout(() => setSavedFeedback(false), 1500)
    return () => window.clearTimeout(timeout)
  }, [savedFeedback])

  // ESC to close
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, config, initialTheme, initialFont, fontValue])

  const applyThemePreview = useCallback((themeId: string) => {
    document.documentElement.setAttribute('data-theme', themeId)
    localStorage.setItem('nexus-theme', themeId)
  }, [])

  const applyFontPreview = useCallback((nextFont: string) => {
    document.documentElement.style.setProperty('--font-mono', nextFont)
    localStorage.setItem('nexus-font-mono', nextFont)
    setFontValue(nextFont)
  }, [])

  const handleClose = useCallback(() => {
    if (initialTheme) {
      applyThemePreview(initialTheme)
    }
    if (initialFont) {
      applyFontPreview(initialFont)
    }
    setSavedFeedback(false)
    setSaveError(null)
    onClose()
  }, [applyFontPreview, applyThemePreview, initialFont, initialTheme, onClose])

  const handleSave = useCallback(async () => {
    if (!config) return
    setSaving(true)
    setSaveError(null)
    try {
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (!response.ok) throw new Error('Failed to save settings')
      setSavedFeedback(true)
      setInitialConfig(config)
      setInitialTheme(config.defaults.theme)
      setInitialFont(fontValue)
    } catch {
      setSaveError('Failed to save settings.')
    }
    setSaving(false)
  }, [config, fontValue])

  const handleThemeChange = useCallback((themeId: string) => {
    applyThemePreview(themeId)
    if (config) {
      setConfig({ ...config, defaults: { ...config.defaults, theme: themeId } })
    }
  }, [applyThemePreview, config])

  const handleFontChange = useCallback((fontValue: string) => {
    applyFontPreview(fontValue)
  }, [applyFontPreview])

  const handleDefaultsChange = useCallback((key: string, value: string | number) => {
    if (!config) return
    setConfig({ ...config, defaults: { ...config.defaults, [key]: value } })
  }, [config])

  const handleAgentUpdate = useCallback((agentKey: string, field: keyof AgentDefinition, value: string | boolean) => {
    if (!config) return
    const agent = config.agents[agentKey]
    if (!agent) return
    setConfig({
      ...config,
      agents: {
        ...config.agents,
        [agentKey]: { ...agent, [field]: value },
      },
    })
  }, [config])

  const handleEnvChange = useCallback((agentKey: string, envStr: string) => {
    if (!config) return
    const agent = config.agents[agentKey]
    if (!agent) return
    const env: Record<string, string> = {}
    envStr.split('\n').forEach(line => {
      const idx = line.indexOf('=')
      if (idx > 0) {
        env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
      }
    })
    setConfig({
      ...config,
      agents: {
        ...config.agents,
        [agentKey]: { ...agent, env },
      },
    })
  }, [config])

  if (!isOpen) return null

  const currentTheme = config?.defaults.theme || document.documentElement.getAttribute('data-theme') || 'dark-ide'
  const dirty = Boolean(config && (
    JSON.stringify(config) !== JSON.stringify(initialConfig) ||
    fontValue !== (initialFont ?? fontValue) ||
    currentTheme !== (initialTheme ?? currentTheme)
  ))

  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
    { id: 'general', label: 'General', icon: <Settings size={16} /> },
    { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard size={16} /> },
    { id: 'agents', label: 'Agents', icon: <Bot size={16} /> },
  ]

  return (
    <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="settings-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', minWidth: 0 }}>
            <Settings className="icon-md" style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--font-xl)', fontWeight: 600 }}>Settings</div>
              <div className="settings-subtitle">
                {loading ? 'Loading settings...'
                  : saveError ? saveError
                    : savedFeedback ? 'Changes saved.'
                      : dirty ? 'Unsaved changes'
                        : 'System preferences and agent configuration'}
              </div>
            </div>
          </div>
          <div className="settings-header-actions">
            <button className="btn btn--secondary settings-header-btn" onClick={handleClose}>
              Cancel
            </button>
            <button className="btn btn--primary settings-header-btn" onClick={handleSave} disabled={!dirty || saving || loading || !config}>
              {saving ? <LoaderCircle size={14} className="settings-spin" /> : <Save size={14} />}
              <span>{saving ? 'Saving...' : 'Save'}</span>
            </button>
            <button className="pane-action-btn" onClick={handleClose}>
              <X className="icon-md" style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>
        </div>

        <div className="settings-body">
          {/* Left menu */}
          <nav className="settings-nav">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`settings-nav-item ${activeTab === tab.id ? 'settings-nav-item--active' : ''}`}
                onClick={() => { setActiveTab(tab.id); setEditingAgent(null) }}
              >
                <span style={{ color: activeTab === tab.id ? 'var(--accent-primary)' : 'var(--text-muted)', flexShrink: 0 }}>
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* Right content */}
          <div className="settings-content">
            {loadError && (
              <div className="settings-banner settings-banner--error">
                <AlertCircle size={14} />
                <span>{loadError}</span>
              </div>
            )}
            {!loading && !config && !loadError && (
              <div className="settings-empty-state">
                <Settings className="icon-lg" />
                <span>No settings data available.</span>
              </div>
            )}
            {loading && (
              <div className="settings-empty-state">
                <LoaderCircle className="icon-lg settings-spin" />
                <span>Loading settings...</span>
              </div>
            )}
            {!loading && config && activeTab === 'general' && (
              <GeneralTab
                config={config}
                currentTheme={currentTheme}
                currentFont={fontValue}
                onThemeChange={handleThemeChange}
                onFontChange={handleFontChange}
                onDefaultsChange={handleDefaultsChange}
              />
            )}
            {!loading && config && activeTab === 'shortcuts' && <ShortcutsTab />}
            {!loading && config && activeTab === 'agents' && (
              <AgentsTab
                config={config}
                availability={availability}
                editingAgent={editingAgent}
                onEditAgent={setEditingAgent}
                onAgentUpdate={handleAgentUpdate}
                onEnvChange={handleEnvChange}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── General Tab ─────────────────────────────────────────────

function GeneralTab({
  config,
  currentTheme,
  currentFont,
  onThemeChange,
  onFontChange,
  onDefaultsChange,
}: {
  config: GlobalConfig | null
  currentTheme: string
  currentFont: string
  onThemeChange: (id: string) => void
  onFontChange: (value: string) => void
  onDefaultsChange: (key: string, value: string | number) => void
}) {
  return (
    <div className="settings-section-list">
      {/* Theme */}
      <section className="settings-section">
        <div className="settings-section-header">
          <Palette className="icon-sm" style={{ color: 'var(--accent-primary)' }} />
          <h3>Theme</h3>
        </div>
        <div className="theme-grid">
          {THEMES.map(theme => (
            <button
              key={theme.id}
              className={`theme-card ${currentTheme === theme.id ? 'theme-card--active' : ''}`}
              onClick={() => onThemeChange(theme.id)}
            >
              <ThemePreview themeId={theme.id} />
              <div className="theme-card__info">
                <span className="theme-card__name">{theme.name}</span>
                <span className="theme-card__desc">{theme.desc}</span>
              </div>
              {currentTheme === theme.id && (
                <Check size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Font */}
      <section className="settings-section">
        <div className="settings-section-header">
          <Terminal className="icon-sm" style={{ color: 'var(--accent-primary)' }} />
          <h3>Terminal Font</h3>
        </div>
        <div className="font-grid">
          {FONT_OPTIONS.map(font => (
            <button
              key={font.value}
              className={`font-card ${currentFont === font.value ? 'font-card--active' : ''}`}
              onClick={() => onFontChange(font.value)}
            >
              <span className="font-card__preview" style={{ fontFamily: font.value }}>Aa</span>
              <span className="font-card__name">{font.label}</span>
              {currentFont === font.value && (
                <Check size={12} style={{ color: 'var(--accent-primary)' }} />
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Defaults */}
      <section className="settings-section">
        <div className="settings-section-header">
          <CircleDot className="icon-sm" style={{ color: 'var(--accent-primary)' }} />
          <h3>Defaults</h3>
        </div>
        <div className="settings-field-list">
          <div className="settings-field">
            <label className="form-label">Shell</label>
            <input
              className="form-input"
              value={config?.defaults.shell || ''}
              onChange={(e) => onDefaultsChange('shell', e.target.value)}
              placeholder="/bin/zsh"
            />
          </div>
          <div className="settings-field">
            <label className="form-label">Scrollback Lines</label>
            <input
              className="form-input"
              type="number"
              value={config?.defaults.scrollback_lines || 5000}
              onChange={(e) => onDefaultsChange('scrollback_lines', parseInt(e.target.value) || 5000)}
            />
          </div>
          <div className="settings-field">
            <label className="form-label">History Retention (days)</label>
            <input
              className="form-input"
              type="number"
              value={config?.defaults.history_retention_days || 30}
              onChange={(e) => onDefaultsChange('history_retention_days', parseInt(e.target.value) || 30)}
            />
          </div>
        </div>
      </section>
    </div>
  )
}

// ─── Theme Preview ───────────────────────────────────────────

const THEME_COLORS: Record<string, { bg: string; surface: string; accent: string; text: string; border: string }> = {
  'dark-ide':     { bg: '#0d0d0d', surface: '#161616', accent: '#7c6af7', text: '#e8e8e8', border: '#2a2a2a' },
  'github-dark':  { bg: '#0d1117', surface: '#010409', accent: '#58a6ff', text: '#e6edf3', border: '#21262d' },
  'dracula':      { bg: '#282a36', surface: '#21222c', accent: '#bd93f9', text: '#f8f8f2', border: '#44475a' },
  'tokyo-night':  { bg: '#1a1b26', surface: '#16161e', accent: '#7aa2f7', text: '#c0caf5', border: '#292e42' },
  'catppuccin':   { bg: '#1e1e2e', surface: '#181825', accent: '#cba6f7', text: '#cdd6f4', border: '#313244' },
  'nord':         { bg: '#2e3440', surface: '#272c36', accent: '#88c0d0', text: '#eceff4', border: '#3b4252' },
  'light-ide':    { bg: '#ffffff', surface: '#f5f5f5', accent: '#6b57e8', text: '#1a1a1a', border: '#e0e0e0' },
}

function ThemePreview({ themeId }: { themeId: string }) {
  const c = THEME_COLORS[themeId] || THEME_COLORS['dark-ide']
  return (
    <div style={{
      width: 40,
      height: 28,
      borderRadius: 4,
      background: c.bg,
      border: `1px solid ${c.border}`,
      display: 'flex',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <div style={{ width: 8, background: c.surface, borderRight: `1px solid ${c.border}` }} />
      <div style={{ flex: 1, padding: '4px 3px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ height: 3, width: '80%', background: c.accent, borderRadius: 1, opacity: 0.8 }} />
        <div style={{ height: 2, width: '60%', background: c.text, borderRadius: 1, opacity: 0.3 }} />
        <div style={{ height: 2, width: '90%', background: c.text, borderRadius: 1, opacity: 0.2 }} />
      </div>
    </div>
  )
}

// ─── Shortcuts Tab ───────────────────────────────────────────

function ShortcutsTab() {
  return (
    <div className="settings-section-list">
      <section className="settings-section">
        <div className="settings-section-header">
          <Keyboard className="icon-sm" style={{ color: 'var(--accent-primary)' }} />
          <h3>Keyboard Shortcuts</h3>
        </div>
        <p style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-lg)' }}>
          On macOS use ⌘, on Windows/Linux use Ctrl.
        </p>
        <div className="shortcuts-list">
          {SHORTCUTS.map((shortcut, i) => (
            <div key={i} className="shortcut-row">
              <div className="shortcut-row__info">
                <span className="shortcut-row__action">{shortcut.action}</span>
                <span className="shortcut-row__scope">{shortcut.scope}</span>
              </div>
              <kbd className="shortcut-kbd">{shortcut.keys}</kbd>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// ─── Agents Tab ──────────────────────────────────────────────

function AgentsTab({
  config,
  availability,
  editingAgent,
  onEditAgent,
  onAgentUpdate,
  onEnvChange,
}: {
  config: GlobalConfig | null
  availability: Record<string, AgentAvailability>
  editingAgent: string | null
  onEditAgent: (key: string | null) => void
  onAgentUpdate: (key: string, field: keyof AgentDefinition, value: string | boolean) => void
  onEnvChange: (key: string, envStr: string) => void
}) {
  const [envDrafts, setEnvDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!config) return
    setEnvDrafts((prev) => {
      const nextDrafts: Record<string, string> = {}
      for (const [key, agent] of Object.entries(config.agents)) {
        const serialized = Object.entries(agent.env || {}).map(([envKey, envValue]) => `${envKey}=${envValue}`).join('\n')
        nextDrafts[key] = key === editingAgent && prev[key] !== undefined ? prev[key] : serialized
      }
      return nextDrafts
    })
  }, [config, editingAgent])

  if (!config) return null

  const agentKeys = Object.keys(config.agents)

  return (
    <div className="settings-section-list">
      <section className="settings-section">
        <div className="settings-section-header">
          <Bot className="icon-sm" style={{ color: 'var(--accent-primary)' }} />
          <h3>Installed Agents</h3>
        </div>
        <p style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-lg)' }}>
          Configure CLI agents detected on your system. Click an agent to edit its settings.
        </p>

        <div className="agents-list">
          {agentKeys.map(key => {
            const agent = config.agents[key]
            const avail = availability[key]
            const display = AGENT_DISPLAY[key] || { name: key, desc: '' }
            const isEditing = editingAgent === key
            const installed = avail?.installed ?? false

            return (
              <div key={key} className="agent-config-card">
                <button
                  className={`agent-config-header ${isEditing ? 'agent-config-header--active' : ''}`}
                  onClick={() => onEditAgent(isEditing ? null : key)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', flex: 1, minWidth: 0 }}>
                    <AgentIcon agent={key as any} size={20} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                        <span style={{ fontWeight: 600, fontSize: 'var(--font-md)' }}>{display.name}</span>
                        <span className={`agent-status-badge ${installed ? 'agent-status-badge--installed' : 'agent-status-badge--missing'}`}>
                          {installed ? 'Installed' : 'Not Found'}
                        </span>
                      </div>
                      <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>{display.desc}</span>
                    </div>
                  </div>
                  <ChevronRight
                    size={14}
                    style={{
                      color: 'var(--text-muted)',
                      transition: 'transform 0.15s',
                      transform: isEditing ? 'rotate(90deg)' : 'rotate(0deg)',
                      flexShrink: 0,
                    }}
                  />
                </button>

                {isEditing && (
                  <div className="agent-config-body">
                    {!installed && avail && (
                      <div className="agent-install-hint">
                        <AlertCircle size={14} />
                        <span>Install: <code>{avail.installHint}</code></span>
                      </div>
                    )}

                    <div className="settings-field-list">
                      <div className="settings-field">
                        <label className="form-label">Binary Path</label>
                        <input
                          className="form-input"
                          value={agent.bin}
                          onChange={(e) => onAgentUpdate(key, 'bin', e.target.value)}
                          placeholder="claude"
                        />
                      </div>

                      <div className="settings-field-row">
                        <div className="settings-field" style={{ flex: 1 }}>
                          <label className="form-label">Continue Flag</label>
                          <input
                            className="form-input"
                            value={agent.continue_flag}
                            onChange={(e) => onAgentUpdate(key, 'continue_flag', e.target.value)}
                          />
                        </div>
                        <div className="settings-field" style={{ flex: 1 }}>
                          <label className="form-label">YOLO Flag</label>
                          <input
                            className="form-input"
                            value={agent.yolo_flag || ''}
                            onChange={(e) => onAgentUpdate(key, 'yolo_flag', e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="settings-field">
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                          <span>Statusline Integration</span>
                          <ToggleSwitch
                            checked={agent.statusline}
                            onChange={(v) => onAgentUpdate(key, 'statusline', v)}
                          />
                        </label>
                        <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                          Parse agent statusline output for model, cost, and context metrics
                        </span>
                      </div>

                      <div className="settings-field">
                        <label className="form-label">Environment Variables</label>
                        <textarea
                          className="form-input form-textarea"
                          value={envDrafts[key] ?? ''}
                          onChange={(e) => {
                            const nextValue = e.target.value
                            setEnvDrafts((prev) => ({ ...prev, [key]: nextValue }))
                          }}
                          onBlur={() => onEnvChange(key, envDrafts[key] ?? '')}
                          placeholder="KEY=value&#10;ANOTHER_KEY=value"
                          rows={3}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Capabilities summary */}
      <section className="settings-section">
        <div className="settings-section-header">
          <Zap className="icon-sm" style={{ color: 'var(--accent-primary)' }} />
          <h3>Agent Capabilities</h3>
        </div>
        <div className="capabilities-grid">
          {agentKeys.map(key => {
            const agent = config.agents[key]
            const avail = availability[key]
            const display = AGENT_DISPLAY[key] || { name: key, desc: '' }
            return (
              <div key={key} className="capability-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
                  <AgentIcon agent={key as any} size={16} />
                  <span style={{ fontWeight: 600, fontSize: 'var(--font-sm)' }}>{display.name}</span>
                </div>
                <div className="capability-list">
                  <CapabilityRow label="Statusline" enabled={agent.statusline} />
                  <CapabilityRow label="Continue Mode" enabled={!!agent.continue_flag} />
                  <CapabilityRow label="YOLO Mode" enabled={!!agent.yolo_flag} />
                  <CapabilityRow label="Worktree Isolation" enabled={true} />
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function CapabilityRow({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', fontSize: 'var(--font-xs)' }}>
      <div style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: enabled ? 'var(--status-running)' : 'var(--text-muted)',
      }} />
      <span style={{ color: enabled ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{label}</span>
    </div>
  )
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={(e) => { e.preventDefault(); onChange(!checked) }}
      style={{
        width: 32,
        height: 18,
        borderRadius: 9,
        border: 'none',
        background: checked ? 'var(--accent-primary)' : 'var(--bg-overlay)',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <div style={{
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: '#fff',
        position: 'absolute',
        top: 2,
        left: checked ? 16 : 2,
        transition: 'left 0.2s',
      }} />
    </button>
  )
}

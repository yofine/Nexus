interface AgentIconProps {
  agent: string
  size?: number | string
  className?: string
}

export function AgentIcon({ agent, size = 16, className }: AgentIconProps) {
  const normalized = agent.toLowerCase()
  const sizeStyle = { width: size, height: size, flexShrink: 0 } as React.CSSProperties

  if (normalized === 'claudecode' || normalized === 'claude') {
    return (
      <svg className={className} style={sizeStyle} viewBox="0 0 24 24" fill="none">
        <path d="M16.862 3.487c-.46-.27-1.077-.09-1.378.401L9.37 13.895a.24.24 0 0 0 .093.326l1.558.907a.24.24 0 0 0 .327-.088l4.08-6.985a.12.12 0 0 1 .212.027l1.584 6.56c.178.738-.257 1.48-.972 1.66l-5.507 1.378c-.357.09-.734.035-1.048-.152L4.34 13.265a1.15 1.15 0 0 1-.42-1.572L8.858 3.12A1.15 1.15 0 0 1 10.43 2.7l6.432 3.787" stroke="#D97757" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="17.5" cy="4.5" r="1.5" fill="#D97757"/>
      </svg>
    )
  }

  if (normalized === 'opencode') {
    return (
      <svg className={className} style={sizeStyle} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="4" stroke="#58A6FF" strokeWidth="1.5"/>
        <path d="M8 12l3-4v3h2v-3l3 4-3 4v-3h-2v3z" fill="#58A6FF" opacity="0.8"/>
      </svg>
    )
  }

  if (normalized === 'codex' || normalized === 'openai') {
    return (
      <svg className={className} style={sizeStyle} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="#10A37F" strokeWidth="1.5"/>
        <path d="M12 7v5l3.5 2" stroke="#10A37F" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="12" cy="12" r="1.5" fill="#10A37F"/>
      </svg>
    )
  }

  if (normalized === 'kimi-cli' || normalized === 'kimi' || normalized === 'kimicode') {
    return (
      <svg className={className} style={sizeStyle} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="#6366F1" strokeWidth="1.5"/>
        <path d="M8 10c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="9.5" cy="12.5" r="1.2" fill="#6366F1"/>
        <circle cx="14.5" cy="12.5" r="1.2" fill="#6366F1"/>
        <path d="M9.5 16c1 1.2 3.5 1.2 5 0" stroke="#6366F1" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    )
  }

  if (normalized === 'qwencode' || normalized === 'qwen') {
    return (
      <svg className={className} style={sizeStyle} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="4" stroke="#7C3AED" strokeWidth="1.5"/>
        <path d="M8 12h8M12 8v8" stroke="#7C3AED" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="8" cy="8" r="1.2" fill="#7C3AED"/>
        <circle cx="16" cy="16" r="1.2" fill="#7C3AED"/>
      </svg>
    )
  }

  if (normalized === 'gemini' || normalized === 'google') {
    return (
      <svg className={className} style={sizeStyle} viewBox="0 0 24 24" fill="none">
        <path d="M12 3c0 4.97-4.03 9-9 9 4.97 0 9 4.03 9 9 0-4.97 4.03-9 9-9-4.97 0-9-4.03-9-9z" stroke="#8B5CF6" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    )
  }

  if (normalized === 'aider') {
    return (
      <svg className={className} style={sizeStyle} viewBox="0 0 24 24" fill="none">
        <path d="M4 20L12 4l8 16" stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M7.5 14h9" stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    )
  }

  if (normalized === 'cursor') {
    return (
      <svg className={className} style={sizeStyle} viewBox="0 0 24 24" fill="none">
        <path d="M5 3l14 9-6 2-3 7z" stroke="#F59E0B" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    )
  }

  // Default: terminal icon for unknown agents
  return (
    <svg className={className} style={sizeStyle} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="var(--text-secondary)" strokeWidth="1.5"/>
      <path d="M7 9l3 3-3 3" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13 15h4" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

// Agent display name mapping
export function getAgentDisplayName(agent: string): string {
  const map: Record<string, string> = {
    claudecode: 'Claude Code',
    claude: 'Claude Code',
    codex: 'Codex',
    opencode: 'OpenCode',
    'kimi-cli': 'Kimi Code',
    kimi: 'Kimi Code',
    kimicode: 'Kimi Code',
    qwencode: 'Qwen Code',
    qwen: 'Qwen Code',
    openai: 'OpenAI',
    gemini: 'Gemini',
    aider: 'Aider',
    cursor: 'Cursor',
  }
  return map[agent.toLowerCase()] || agent
}

// Agent brand color
export function getAgentColor(agent: string): string {
  const map: Record<string, string> = {
    claudecode: '#D97757',
    claude: '#D97757',
    codex: '#10A37F',
    opencode: '#58A6FF',
    'kimi-cli': '#6366F1',
    kimi: '#6366F1',
    qwencode: '#7C3AED',
    qwen: '#7C3AED',
    openai: '#10A37F',
    gemini: '#8B5CF6',
    aider: '#22C55E',
    cursor: '#F59E0B',
    workspace: '#888888',
  }
  return map[agent.toLowerCase()] || 'var(--accent-primary)'
}

// Per-pane instance colors — visually distinct palette for differentiating agents
const PANE_COLORS = [
  '#7C6AF7', // purple
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
  '#8B5CF6', // violet
  '#14B8A6', // teal
  '#84CC16', // lime
  '#E879F9', // fuchsia
]

export function getPaneColor(index: number): string {
  return PANE_COLORS[index % PANE_COLORS.length]
}

// Get pane color by paneId, looking up index in panes array
export function getPaneColorById(paneId: string, panes: Array<{ id: string }>): string {
  const index = panes.findIndex((p) => p.id === paneId)
  return getPaneColor(index >= 0 ? index : 0)
}

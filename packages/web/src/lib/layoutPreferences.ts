export type LayoutMode = 'large' | 'regular' | 'small'
export type LayoutPanel = 'agents' | 'editor' | 'files' | 'terminal'

export interface PanelWidths {
  agents: number
  files: number
}

export interface LayoutPreferences {
  mode: LayoutMode
  widthsByMode: Record<LayoutMode, PanelWidths>
  terminalHeightByMode: Record<LayoutMode, number>
}

export const LAYOUT_EVENT = 'nexus:layout-preferences-changed'

const MODE_KEY = 'nexus-layout-mode'
const PREFS_KEY = 'nexus-layout-preferences-v1'
const LEGACY_WIDTHS_KEY = 'nexus-panel-widths'

export const DEFAULT_WIDTHS: Record<LayoutMode, PanelWidths> = {
  large: { agents: 480, files: 240 },
  regular: { agents: 360, files: 200 },
  small: { agents: 280, files: 160 },
}

export const DEFAULT_TERMINAL_HEIGHTS: Record<LayoutMode, number> = {
  large: 35,
  regular: 50,
  small: 50,
}

export const AGENT_WIDTH_STEPS = [280, 360, 480, 640]
export const FILE_WIDTH_STEPS = [160, 200, 240, 320]
export const TERMINAL_HEIGHT_STEPS = [35, 50, 75]

function clampWidths(widths: Partial<PanelWidths> | undefined, fallback: PanelWidths): PanelWidths {
  return {
    agents: Math.max(280, widths?.agents ?? fallback.agents),
    files: Math.max(160, widths?.files ?? fallback.files),
  }
}

function clampTerminalHeight(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value)
  return TERMINAL_HEIGHT_STEPS.includes(num) ? num : fallback
}

export function loadLayoutPreferences(): LayoutPreferences {
  const mode: LayoutMode = 'regular'

  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LayoutPreferences>
      return {
        mode,
        widthsByMode: {
          large: clampWidths(parsed.widthsByMode?.large, DEFAULT_WIDTHS.large),
          regular: clampWidths(parsed.widthsByMode?.regular, DEFAULT_WIDTHS.regular),
          small: clampWidths(parsed.widthsByMode?.small, DEFAULT_WIDTHS.small),
        },
        terminalHeightByMode: {
          large: clampTerminalHeight(parsed.terminalHeightByMode?.large, DEFAULT_TERMINAL_HEIGHTS.large),
          regular: clampTerminalHeight(parsed.terminalHeightByMode?.regular, DEFAULT_TERMINAL_HEIGHTS.regular),
          small: clampTerminalHeight(parsed.terminalHeightByMode?.small, DEFAULT_TERMINAL_HEIGHTS.small),
        },
      }
    }
  } catch {
    // ignore invalid saved prefs
  }

  const legacy = loadLegacyWidths()
  return {
    mode,
    widthsByMode: {
      large: DEFAULT_WIDTHS.large,
      regular: legacy ?? DEFAULT_WIDTHS.regular,
      small: DEFAULT_WIDTHS.small,
    },
    terminalHeightByMode: { ...DEFAULT_TERMINAL_HEIGHTS },
  }
}

function loadLegacyWidths(): PanelWidths | null {
  try {
    const raw = localStorage.getItem(LEGACY_WIDTHS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PanelWidths>
    return clampWidths(parsed, DEFAULT_WIDTHS.regular)
  } catch {
    return null
  }
}

export function saveLayoutPreferences(prefs: LayoutPreferences) {
  const normalized: LayoutPreferences = {
    mode: 'regular',
    widthsByMode: {
      large: clampWidths(prefs.widthsByMode?.regular, DEFAULT_WIDTHS.large),
      regular: clampWidths(prefs.widthsByMode?.regular, DEFAULT_WIDTHS.regular),
      small: clampWidths(prefs.widthsByMode?.regular, DEFAULT_WIDTHS.small),
    },
    terminalHeightByMode: {
      large: clampTerminalHeight(prefs.terminalHeightByMode?.regular, DEFAULT_TERMINAL_HEIGHTS.large),
      regular: clampTerminalHeight(prefs.terminalHeightByMode?.regular, DEFAULT_TERMINAL_HEIGHTS.regular),
      small: clampTerminalHeight(prefs.terminalHeightByMode?.regular, DEFAULT_TERMINAL_HEIGHTS.small),
    },
  }
  localStorage.setItem(MODE_KEY, 'regular')
  localStorage.setItem(PREFS_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new CustomEvent(LAYOUT_EVENT))
}

export function loadLayoutMode(): LayoutMode {
  return 'regular'
}

export function saveLayoutMode(mode: LayoutMode) {
  if (mode !== 'regular') return
}

export function saveModeWidths(mode: LayoutMode, widths: PanelWidths) {
  const prefs = loadLayoutPreferences()
  saveLayoutPreferences({
    ...prefs,
    widthsByMode: {
      ...prefs.widthsByMode,
      [mode]: clampWidths(widths, DEFAULT_WIDTHS[mode]),
    },
  })
}

export function resetModeWidths(mode: LayoutMode) {
  const prefs = loadLayoutPreferences()
  saveLayoutPreferences({
    ...prefs,
    widthsByMode: {
      ...prefs.widthsByMode,
      [mode]: { ...DEFAULT_WIDTHS[mode] },
    },
  })
}

export function saveModeTerminalHeight(mode: LayoutMode, height: number) {
  const prefs = loadLayoutPreferences()
  saveLayoutPreferences({
    ...prefs,
    terminalHeightByMode: {
      ...prefs.terminalHeightByMode,
      [mode]: clampTerminalHeight(height, DEFAULT_TERMINAL_HEIGHTS[mode]),
    },
  })
}

export function cycleStep(steps: number[], current: number): number {
  const idx = steps.indexOf(current)
  if (idx === -1) {
    const next = steps.find((step) => step > current)
    return next ?? steps[0]
  }
  return steps[(idx + 1) % steps.length]
}

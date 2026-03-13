/**
 * Global terminal write callback registry.
 * Avoids React rendering overhead for high-frequency terminal output.
 * Keeps a scrollback history so re-mounted terminals can replay output.
 *
 * Also stores xterm + FitAddon references for external control:
 * - pause/resume writes (to avoid zero-size rendering while collapsed)
 * - scrollToBottom (to jump to latest output when expanding)
 * - refit (to recalculate dimensions after visibility change)
 */
import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'

const writers = new Map<string, (data: string) => void>()
const histories = new Map<string, string[]>()
const terminals = new Map<string, Terminal>()
const fitAddons = new Map<string, FitAddon>()
const paused = new Set<string>()

const MAX_HISTORY_CHUNKS = 10000

export function registerTerminalWriter(
  paneId: string,
  writeFn: (data: string) => void,
  term: Terminal,
  fitAddon: FitAddon,
): void {
  writers.set(paneId, writeFn)
  terminals.set(paneId, term)
  fitAddons.set(paneId, fitAddon)

  // Replay history into newly mounted terminal (only if not paused)
  if (!paused.has(paneId)) {
    const history = histories.get(paneId)
    if (history && history.length > 0) {
      for (const chunk of history) {
        writeFn(chunk)
      }
    }
  }
}

export function unregisterTerminalWriter(paneId: string): void {
  writers.delete(paneId)
  terminals.delete(paneId)
  fitAddons.delete(paneId)
}

export function writeToTerminal(paneId: string, data: string): void {
  // Always append to history
  let history = histories.get(paneId)
  if (!history) {
    history = []
    histories.set(paneId, history)
  }
  history.push(data)
  // Trim to avoid unbounded memory growth — use splice to mutate in place
  if (history.length > MAX_HISTORY_CHUNKS) {
    history.splice(0, history.length - MAX_HISTORY_CHUNKS / 2)
  }

  // When paused (pane collapsed), skip writing to xterm to avoid
  // zero-size rendering that causes character misalignment
  if (paused.has(paneId)) return

  const writer = writers.get(paneId)
  if (writer) {
    writer(data)
  }
}

export function clearTerminalHistory(paneId: string): void {
  histories.delete(paneId)
}

// ─── Pause / Resume ──────────────────────────────────────────
// When a pane is collapsed, pause writes to avoid xterm rendering
// at zero dimensions. On expand, resume and replay from history.

export function pauseTerminal(paneId: string): void {
  paused.add(paneId)
}

export function resumeTerminal(paneId: string): void {
  paused.delete(paneId)
  // Reset xterm buffer and replay history with correct dimensions
  const term = terminals.get(paneId)
  const writer = writers.get(paneId)
  if (term && writer) {
    term.reset()
    const history = histories.get(paneId)
    if (history && history.length > 0) {
      for (const chunk of history) {
        writer(chunk)
      }
    }
  }
}

// ─── External Control ────────────────────────────────────────

export function scrollTerminalToBottom(paneId: string): void {
  const term = terminals.get(paneId)
  if (term) {
    term.scrollToBottom()
  }
}

export function refitTerminal(paneId: string): void {
  const fitAddon = fitAddons.get(paneId)
  if (fitAddon) {
    try {
      fitAddon.fit()
    } catch {
      // fitAddon.fit() can throw if the terminal is not attached
    }
  }
}

export function getTerminalDimensions(paneId: string): { cols: number; rows: number } | null {
  const term = terminals.get(paneId)
  if (term) {
    return { cols: term.cols, rows: term.rows }
  }
  return null
}

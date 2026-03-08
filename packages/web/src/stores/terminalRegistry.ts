/**
 * Global terminal write callback registry.
 * Avoids React rendering overhead for high-frequency terminal output.
 * Keeps a scrollback history so re-mounted terminals can replay output.
 */
const writers = new Map<string, (data: string) => void>()
const histories = new Map<string, string[]>()

const MAX_HISTORY_CHUNKS = 10000

export function registerTerminalWriter(paneId: string, writeFn: (data: string) => void): void {
  writers.set(paneId, writeFn)
  // Replay history into newly mounted terminal
  const history = histories.get(paneId)
  if (history && history.length > 0) {
    for (const chunk of history) {
      writeFn(chunk)
    }
  }
}

export function unregisterTerminalWriter(paneId: string): void {
  writers.delete(paneId)
}

export function writeToTerminal(paneId: string, data: string): void {
  // Always append to history
  let history = histories.get(paneId)
  if (!history) {
    history = []
    histories.set(paneId, history)
  }
  history.push(data)
  // Trim to avoid unbounded memory growth
  if (history.length > MAX_HISTORY_CHUNKS) {
    histories.set(paneId, history.slice(-MAX_HISTORY_CHUNKS / 2))
  }

  const writer = writers.get(paneId)
  if (writer) {
    writer(data)
  }
}

export function clearTerminalHistory(paneId: string): void {
  histories.delete(paneId)
}

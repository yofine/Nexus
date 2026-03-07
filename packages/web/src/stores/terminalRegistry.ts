/**
 * Global terminal write callback registry.
 * Avoids React rendering overhead for high-frequency terminal output.
 */
const writers = new Map<string, (data: string) => void>()

export function registerTerminalWriter(paneId: string, writeFn: (data: string) => void): void {
  writers.set(paneId, writeFn)
}

export function unregisterTerminalWriter(paneId: string): void {
  writers.delete(paneId)
}

export function writeToTerminal(paneId: string, data: string): void {
  const writer = writers.get(paneId)
  if (writer) {
    writer(data)
  }
}

import type { IPty } from 'node-pty'

/**
 * Detects when a shell process is ready to receive commands.
 *
 * Strategy: write an echo sentinel command into the PTY immediately after spawn.
 * The sentinel queues behind .bashrc/.zshrc sourcing and executes only when
 * the shell is interactive and ready.  We watch the PTY output for the sentinel
 * value and resolve the promise.
 *
 * Performance notes:
 * - The sentinel is a single small write; no polling loop.
 * - The onData listener is removed as soon as the sentinel is found or the
 *   timeout fires, so there is zero ongoing overhead.
 * - The sentinel string includes paneId to avoid cross-pane collisions.
 */

const FALLBACK_TIMEOUT_MS = 8000

export interface ShellReadyOptions {
  /** Milliseconds before giving up and resolving anyway. Default 8000. */
  timeoutMs?: number
  /** If true, suppress the sentinel echo from reaching downstream consumers. */
  stripSentinel?: boolean
}

export interface ShellReadyResult {
  /** Whether the sentinel was detected (true) or we timed out (false). */
  detected: boolean
  /** Milliseconds elapsed from injection to detection/timeout. */
  elapsedMs: number
}

export class ShellReadyDetector {
  private sentinel: string
  private resolve!: (result: ShellReadyResult) => void
  private promise: Promise<ShellReadyResult>
  private startTime: number
  private timer: ReturnType<typeof setTimeout> | null = null
  private disposed = false

  // Exposed for testing — accumulated raw output chunks
  private chunks: string[] = []

  constructor(
    private paneId: string,
    private options: ShellReadyOptions = {},
  ) {
    // Use a unique, unlikely-to-collide sentinel value
    this.sentinel = `__NEXUS_RDY_${paneId}_${Date.now().toString(36)}__`
    this.startTime = Date.now()

    this.promise = new Promise<ShellReadyResult>((resolve) => {
      this.resolve = resolve
    })
  }

  /**
   * Inject the sentinel into the shell and start watching.
   * Call this immediately after pty.spawn().
   *
   * Returns a promise that resolves when the shell is ready.
   * The caller should await this before sending any agent command.
   */
  start(term: IPty): Promise<ShellReadyResult> {
    const timeoutMs = this.options.timeoutMs ?? FALLBACK_TIMEOUT_MS

    // Inject sentinel echo — the shell will execute this after .bashrc finishes
    term.write(`echo ${this.sentinel}\r`)

    // Set up fallback timeout
    this.timer = setTimeout(() => {
      if (!this.disposed) {
        this.disposed = true
        this.resolve({
          detected: false,
          elapsedMs: Date.now() - this.startTime,
        })
      }
    }, timeoutMs)

    return this.promise
  }

  /**
   * Feed PTY output data into the detector.
   * Call this from the PTY onData handler.
   *
   * Returns the data with the sentinel line stripped if `stripSentinel` is true
   * and the sentinel was found in this chunk. Otherwise returns the data as-is.
   */
  feed(data: string): string {
    if (this.disposed) return data

    this.chunks.push(data)

    // Check if sentinel appears in accumulated data
    // We check chunks to handle the case where sentinel spans two chunks
    const recent = this.chunks.length <= 3
      ? this.chunks.join('')
      : this.chunks.slice(-3).join('')

    if (recent.includes(this.sentinel)) {
      this.disposed = true
      if (this.timer) {
        clearTimeout(this.timer)
        this.timer = null
      }
      this.resolve({
        detected: true,
        elapsedMs: Date.now() - this.startTime,
      })
      // Free reference to accumulated chunks
      this.chunks = []

      if (this.options.stripSentinel) {
        return this.stripSentinelFromData(data)
      }
    }

    return data
  }

  /**
   * Whether the detector has finished (either by detection or timeout).
   */
  get isDone(): boolean {
    return this.disposed
  }

  /**
   * Clean up without resolving (e.g., if the PTY is killed before ready).
   */
  dispose(): void {
    if (!this.disposed) {
      this.disposed = true
      if (this.timer) {
        clearTimeout(this.timer)
        this.timer = null
      }
      this.resolve({
        detected: false,
        elapsedMs: Date.now() - this.startTime,
      })
    }
    this.chunks = []
  }

  private stripSentinelFromData(data: string): string {
    // Remove the sentinel line and surrounding echo command artifacts
    // The echo command produces: `echo __NEXUS_RDY_...__\r\n__NEXUS_RDY_...__\r\n`
    // We want to strip both the command echo and the output
    const lines = data.split('\n')
    const filtered = lines.filter((line) => !line.includes(this.sentinel))
    return filtered.join('\n')
  }
}

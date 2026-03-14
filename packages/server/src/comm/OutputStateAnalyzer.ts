import type { PaneMeta, PaneStatus } from '../types.ts'

/**
 * Infers Agent behavioral state from PTY output patterns and statusline metadata.
 *
 * State machine:
 *   running  — Agent is producing output (actively working)
 *   waiting  — Agent has stopped producing output for `idleThresholdMs`
 *              (likely waiting for user input or confirmation)
 *   idle     — Extended silence (`idleThresholdMs * 3`), process still alive
 *   stopped  — Process exited normally
 *   error    — Process exited with non-zero code
 *
 * The stopped/error states are set externally (from PTY exit handler),
 * not by this analyzer.
 *
 * Performance:
 * - Single setTimeout for idle detection; re-armed per output chunk.
 * - onOutput() is called on every PTY data event, so it must be fast:
 *   just a timestamp update + timer reset.
 * - Meta changes are infrequent and cheap to process.
 * - No string inspection on the hot path (prompt detection is in AgentReadyDetector).
 */

const DEFAULT_IDLE_THRESHOLD_MS = 5000

export interface OutputStateOptions {
  /** Ms of silence before transitioning running→waiting. Default 5000. */
  idleThresholdMs?: number
  /** Callback when inferred status changes. */
  onStatusChange?: (status: PaneStatus) => void
}

export class OutputStateAnalyzer {
  private currentStatus: PaneStatus = 'running'
  private lastOutputTime = 0
  private lastContextPct: number | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private extendedIdleTimer: ReturnType<typeof setTimeout> | null = null

  private idleThresholdMs: number
  private onStatusChange?: (status: PaneStatus) => void

  constructor(options: OutputStateOptions = {}) {
    this.idleThresholdMs = options.idleThresholdMs ?? DEFAULT_IDLE_THRESHOLD_MS
    this.onStatusChange = options.onStatusChange
    this.lastOutputTime = Date.now()
  }

  /**
   * Call on every PTY output chunk. Must be fast — hot path.
   */
  onOutput(): void {
    this.lastOutputTime = Date.now()

    // If we were waiting/idle, transition back to running
    if (this.currentStatus === 'waiting' || this.currentStatus === 'idle') {
      this.setStatus('running')
    }

    this.resetIdleTimers()
  }

  /**
   * Call when a statusline meta event is received.
   * Context usage changes confirm the agent is actively working.
   */
  onMeta(meta: PaneMeta): void {
    if (meta.contextUsedPct !== undefined) {
      if (this.lastContextPct !== null && meta.contextUsedPct > this.lastContextPct) {
        // Context grew — agent is definitely working
        if (this.currentStatus !== 'running') {
          this.setStatus('running')
        }
        this.resetIdleTimers()
      }
      this.lastContextPct = meta.contextUsedPct
    }
  }

  /**
   * Call when the PTY process exits. Overrides any inferred state.
   */
  onExit(exitCode: number): void {
    this.clearTimers()
    this.setStatus(exitCode === 0 ? 'stopped' : 'error')
  }

  /**
   * Get the current inferred status.
   */
  getStatus(): PaneStatus {
    return this.currentStatus
  }

  /**
   * Milliseconds since last output.
   */
  getSilenceMs(): number {
    return Date.now() - this.lastOutputTime
  }

  /**
   * Clean up timers.
   */
  dispose(): void {
    this.clearTimers()
  }

  private setStatus(status: PaneStatus): void {
    if (status === this.currentStatus) return
    this.currentStatus = status
    this.onStatusChange?.(status)
  }

  private resetIdleTimers(): void {
    this.clearTimers()

    // Stage 1: running → waiting
    this.idleTimer = setTimeout(() => {
      if (this.currentStatus === 'running') {
        this.setStatus('waiting')
      }

      // Stage 2: waiting → idle (3x threshold)
      this.extendedIdleTimer = setTimeout(() => {
        if (this.currentStatus === 'waiting') {
          this.setStatus('idle')
        }
      }, this.idleThresholdMs * 2)
    }, this.idleThresholdMs)
  }

  private clearTimers(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    if (this.extendedIdleTimer) {
      clearTimeout(this.extendedIdleTimer)
      this.extendedIdleTimer = null
    }
  }
}

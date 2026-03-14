import type { PaneMeta } from '../types.ts'

/**
 * Detects when an Agent process has finished initializing and is ready
 * to receive user input (tasks, review comments, etc.).
 *
 * Strategy (layered, first match wins):
 *   1. Statusline detection — if the StatuslineParser emits a meta event with
 *      a session_id, the agent is live and ready.
 *   2. Prompt pattern — detect known agent prompt patterns in terminal output
 *      (e.g., Claude Code's `❯` or `>` prompt after init banner).
 *   3. Output quiescence — if the agent stops producing output for a
 *      configurable interval, assume it's waiting for input.
 *   4. Hard timeout — resolve regardless after a maximum wait.
 *
 * Performance:
 * - No polling; purely event-driven via feed() / onMeta() calls.
 * - Single timer for quiescence; re-armed on each output chunk.
 * - All listeners removed on resolve.
 */

const DEFAULT_QUIESCENCE_MS = 3000
const DEFAULT_HARD_TIMEOUT_MS = 15000

// Known agent prompt patterns (after ANSI stripping)
const PROMPT_PATTERNS = [
  /❯\s*$/,           // Claude Code prompt
  />\s*$/,            // Generic prompt
  /\$\s*$/,           // Shell-style prompt (some agents)
  /waiting for input/i,
]

export interface AgentReadyOptions {
  /** Ms of output silence before assuming ready. Default 3000. */
  quiescenceMs?: number
  /** Hard timeout ms. Default 15000. */
  hardTimeoutMs?: number
  /** Additional prompt regex patterns for custom agents. */
  extraPromptPatterns?: RegExp[]
}

export type AgentReadyReason = 'statusline' | 'prompt' | 'quiescence' | 'timeout'

export interface AgentReadyResult {
  reason: AgentReadyReason
  elapsedMs: number
}

export class AgentReadyDetector {
  private resolve!: (result: AgentReadyResult) => void
  private promise: Promise<AgentReadyResult>
  private startTime: number
  private disposed = false

  private quiescenceTimer: ReturnType<typeof setTimeout> | null = null
  private hardTimer: ReturnType<typeof setTimeout> | null = null

  private quiescenceMs: number
  private promptPatterns: RegExp[]

  constructor(private options: AgentReadyOptions = {}) {
    this.startTime = Date.now()
    this.quiescenceMs = options.quiescenceMs ?? DEFAULT_QUIESCENCE_MS
    this.promptPatterns = [
      ...PROMPT_PATTERNS,
      ...(options.extraPromptPatterns || []),
    ]

    this.promise = new Promise<AgentReadyResult>((resolve) => {
      this.resolve = resolve
    })
  }

  /**
   * Start the detection timers. Returns a promise that resolves when the
   * agent is deemed ready.
   */
  start(): Promise<AgentReadyResult> {
    const hardTimeoutMs = this.options.hardTimeoutMs ?? DEFAULT_HARD_TIMEOUT_MS

    // Hard timeout
    this.hardTimer = setTimeout(() => {
      this.finish('timeout')
    }, hardTimeoutMs)

    // Start initial quiescence timer (agent may not produce any output
    // if it's immediately ready)
    this.resetQuiescence()

    return this.promise
  }

  /**
   * Feed terminal output from the agent. Resets quiescence timer and
   * checks for prompt patterns.
   */
  feed(data: string): void {
    if (this.disposed) return

    // Reset quiescence timer on any output
    this.resetQuiescence()

    // Check for prompt patterns (strip ANSI first)
    const clean = stripAnsi(data)
    // Only check the last portion — prompt appears at end of output
    const tail = clean.slice(-200)

    for (const pattern of this.promptPatterns) {
      if (pattern.test(tail)) {
        this.finish('prompt')
        return
      }
    }
  }

  /**
   * Called when a statusline meta event is received. If it contains a
   * session_id, the agent is definitely ready.
   */
  onMeta(meta: PaneMeta): void {
    if (this.disposed) return

    if (meta.sessionId) {
      this.finish('statusline')
    }
  }

  get isDone(): boolean {
    return this.disposed
  }

  dispose(): void {
    if (!this.disposed) {
      this.disposed = true
      this.clearTimers()
      this.resolve({
        reason: 'timeout',
        elapsedMs: Date.now() - this.startTime,
      })
    }
  }

  private finish(reason: AgentReadyReason): void {
    if (this.disposed) return
    this.disposed = true
    this.clearTimers()
    this.resolve({
      reason,
      elapsedMs: Date.now() - this.startTime,
    })
  }

  private resetQuiescence(): void {
    if (this.quiescenceTimer) {
      clearTimeout(this.quiescenceTimer)
    }
    this.quiescenceTimer = setTimeout(() => {
      this.finish('quiescence')
    }, this.quiescenceMs)
  }

  private clearTimers(): void {
    if (this.quiescenceTimer) {
      clearTimeout(this.quiescenceTimer)
      this.quiescenceTimer = null
    }
    if (this.hardTimer) {
      clearTimeout(this.hardTimer)
      this.hardTimer = null
    }
  }
}

// Lightweight ANSI stripper — only needs to handle enough for prompt detection
function stripAnsi(str: string): string {
  return str
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '') // OSC
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')          // CSI
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')  // control chars
}

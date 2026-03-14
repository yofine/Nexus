import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AgentReadyDetector } from './AgentReadyDetector.ts'

describe('AgentReadyDetector', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  // --- Statusline detection ---

  it('should resolve on statusline with session_id', async () => {
    const detector = new AgentReadyDetector({ hardTimeoutMs: 10000 })
    const promise = detector.start()

    detector.onMeta({ sessionId: 'sess-123', model: 'claude-opus-4-6' })

    const result = await promise
    expect(result.reason).toBe('statusline')
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(detector.isDone).toBe(true)
  })

  it('should NOT resolve on meta without session_id', () => {
    const detector = new AgentReadyDetector({ hardTimeoutMs: 10000 })
    detector.start()

    detector.onMeta({ model: 'claude-opus-4-6' })

    expect(detector.isDone).toBe(false)
  })

  // --- Prompt detection ---

  it('should resolve on Claude Code prompt (❯)', async () => {
    const detector = new AgentReadyDetector({ hardTimeoutMs: 10000 })
    const promise = detector.start()

    detector.feed('Welcome to Claude Code!\n')
    detector.feed('Type your request below.\n❯ ')

    const result = await promise
    expect(result.reason).toBe('prompt')
  })

  it('should resolve on generic > prompt', async () => {
    const detector = new AgentReadyDetector({ hardTimeoutMs: 10000 })
    const promise = detector.start()

    detector.feed('Agent initialized.\n> ')

    const result = await promise
    expect(result.reason).toBe('prompt')
  })

  it('should detect prompt with ANSI sequences stripped', async () => {
    const detector = new AgentReadyDetector({ hardTimeoutMs: 10000 })
    const promise = detector.start()

    // Simulate ANSI-colored prompt
    detector.feed('\x1b[32m❯\x1b[0m ')

    const result = await promise
    expect(result.reason).toBe('prompt')
  })

  it('should detect custom prompt patterns via extraPromptPatterns', async () => {
    const detector = new AgentReadyDetector({
      hardTimeoutMs: 10000,
      extraPromptPatterns: [/READY>>>\s*$/],
    })
    const promise = detector.start()

    detector.feed('Custom agent init...\nREADY>>> ')

    const result = await promise
    expect(result.reason).toBe('prompt')
  })

  // --- Quiescence detection ---

  it('should resolve on quiescence (no output for threshold)', async () => {
    const detector = new AgentReadyDetector({
      quiescenceMs: 2000,
      hardTimeoutMs: 30000,
    })
    const promise = detector.start()

    // Some initial output, then silence
    detector.feed('initializing...\n')

    // Advance past quiescence threshold
    vi.advanceTimersByTime(2100)

    const result = await promise
    expect(result.reason).toBe('quiescence')
  })

  it('should reset quiescence timer on new output', async () => {
    const detector = new AgentReadyDetector({
      quiescenceMs: 2000,
      hardTimeoutMs: 30000,
    })
    const promise = detector.start()

    detector.feed('chunk 1\n')
    vi.advanceTimersByTime(1500) // Not enough

    detector.feed('chunk 2\n') // Resets timer
    vi.advanceTimersByTime(1500) // Still not enough from last feed

    expect(detector.isDone).toBe(false)

    vi.advanceTimersByTime(600) // Now 2100ms from last feed

    const result = await promise
    expect(result.reason).toBe('quiescence')
  })

  // --- Hard timeout ---

  it('should resolve on hard timeout as last resort', async () => {
    const detector = new AgentReadyDetector({
      quiescenceMs: 30000, // Very high quiescence
      hardTimeoutMs: 5000,
    })
    const promise = detector.start()

    // Keep feeding to prevent quiescence
    for (let i = 0; i < 10; i++) {
      detector.feed(`output ${i}\n`)
      vi.advanceTimersByTime(400)
    }

    // Advance past hard timeout
    vi.advanceTimersByTime(5000)

    const result = await promise
    expect(result.reason).toBe('timeout')
  })

  // --- Priority ---

  it('statusline should win over quiescence', async () => {
    const detector = new AgentReadyDetector({
      quiescenceMs: 100,
      hardTimeoutMs: 30000,
    })
    const promise = detector.start()

    // Send meta immediately (before quiescence could fire)
    detector.onMeta({ sessionId: 'sess-1' })

    const result = await promise
    expect(result.reason).toBe('statusline')
  })

  it('prompt should win over quiescence', async () => {
    const detector = new AgentReadyDetector({
      quiescenceMs: 100,
      hardTimeoutMs: 30000,
    })
    const promise = detector.start()

    detector.feed('init...\n❯ ')

    const result = await promise
    expect(result.reason).toBe('prompt')
  })

  // --- Dispose ---

  it('should clean up on dispose()', async () => {
    const detector = new AgentReadyDetector({ hardTimeoutMs: 10000 })
    const promise = detector.start()

    detector.dispose()

    const result = await promise
    expect(result.reason).toBe('timeout')
    expect(detector.isDone).toBe(true)
  })

  it('should be safe to call feed/onMeta after dispose', () => {
    const detector = new AgentReadyDetector()
    detector.start()
    detector.dispose()

    // Should not throw
    detector.feed('data\n')
    detector.onMeta({ sessionId: 'x' })
  })

  // --- Performance ---

  it('should handle high-frequency feed() with minimal overhead', () => {
    vi.useRealTimers() // Need real timers for perf measurement
    const detector = new AgentReadyDetector({ quiescenceMs: 60000, hardTimeoutMs: 60000 })
    detector.start()

    const start = performance.now()
    for (let i = 0; i < 50000; i++) {
      detector.feed(`line ${i}: some agent output that is typical length\n`)
    }
    const elapsed = performance.now() - start

    // 50k calls should complete well under 200ms
    expect(elapsed).toBeLessThan(200)

    detector.dispose()
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OutputStateAnalyzer } from './OutputStateAnalyzer.ts'

describe('OutputStateAnalyzer', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  // --- Basic state transitions ---

  it('should start in running state', () => {
    const analyzer = new OutputStateAnalyzer()
    expect(analyzer.getStatus()).toBe('running')
    analyzer.dispose()
  })

  it('should transition running → waiting after idle threshold', () => {
    const statusChanges: string[] = []
    const analyzer = new OutputStateAnalyzer({
      idleThresholdMs: 2000,
      onStatusChange: (s) => statusChanges.push(s),
    })

    // Initial output
    analyzer.onOutput()
    vi.advanceTimersByTime(2100)

    expect(analyzer.getStatus()).toBe('waiting')
    expect(statusChanges).toContain('waiting')
    analyzer.dispose()
  })

  it('should transition waiting → idle after extended silence', () => {
    const statusChanges: string[] = []
    const analyzer = new OutputStateAnalyzer({
      idleThresholdMs: 1000,
      onStatusChange: (s) => statusChanges.push(s),
    })

    analyzer.onOutput()

    // First threshold: running → waiting
    vi.advanceTimersByTime(1100)
    expect(analyzer.getStatus()).toBe('waiting')

    // Extended threshold (2x more): waiting → idle
    vi.advanceTimersByTime(2100)
    expect(analyzer.getStatus()).toBe('idle')
    expect(statusChanges).toEqual(['waiting', 'idle'])
    analyzer.dispose()
  })

  it('should transition waiting → running on new output', () => {
    const statusChanges: string[] = []
    const analyzer = new OutputStateAnalyzer({
      idleThresholdMs: 1000,
      onStatusChange: (s) => statusChanges.push(s),
    })

    analyzer.onOutput()
    vi.advanceTimersByTime(1100) // → waiting
    expect(analyzer.getStatus()).toBe('waiting')

    analyzer.onOutput() // → running
    expect(analyzer.getStatus()).toBe('running')
    expect(statusChanges).toEqual(['waiting', 'running'])
    analyzer.dispose()
  })

  it('should transition idle → running on new output', () => {
    const analyzer = new OutputStateAnalyzer({ idleThresholdMs: 500 })

    analyzer.onOutput()
    vi.advanceTimersByTime(600)  // → waiting
    vi.advanceTimersByTime(1100) // → idle
    expect(analyzer.getStatus()).toBe('idle')

    analyzer.onOutput()
    expect(analyzer.getStatus()).toBe('running')
    analyzer.dispose()
  })

  // --- Idle timer reset ---

  it('should reset idle timer on each output', () => {
    const analyzer = new OutputStateAnalyzer({ idleThresholdMs: 2000 })

    // Output at t=0
    analyzer.onOutput()
    vi.advanceTimersByTime(1500) // 1500ms, not yet waiting

    // Output again at t=1500, resetting timer
    analyzer.onOutput()
    vi.advanceTimersByTime(1500) // 3000ms total, but only 1500ms since last output

    expect(analyzer.getStatus()).toBe('running')

    vi.advanceTimersByTime(600) // Now 2100ms since last output
    expect(analyzer.getStatus()).toBe('waiting')
    analyzer.dispose()
  })

  // --- Meta / context changes ---

  it('should transition to running when context_used_pct increases', () => {
    const analyzer = new OutputStateAnalyzer({ idleThresholdMs: 500 })

    analyzer.onOutput()
    analyzer.onMeta({ contextUsedPct: 10 }) // Set baseline

    vi.advanceTimersByTime(600) // → waiting
    expect(analyzer.getStatus()).toBe('waiting')

    // Context grew → agent is working
    analyzer.onMeta({ contextUsedPct: 15 })
    expect(analyzer.getStatus()).toBe('running')
    analyzer.dispose()
  })

  it('should NOT transition on same context_used_pct', () => {
    const analyzer = new OutputStateAnalyzer({ idleThresholdMs: 500 })

    analyzer.onOutput()
    analyzer.onMeta({ contextUsedPct: 10 })

    vi.advanceTimersByTime(600) // → waiting

    // Same value — no change
    analyzer.onMeta({ contextUsedPct: 10 })
    expect(analyzer.getStatus()).toBe('waiting')
    analyzer.dispose()
  })

  // --- Process exit ---

  it('should set stopped on exit code 0', () => {
    const statusChanges: string[] = []
    const analyzer = new OutputStateAnalyzer({
      onStatusChange: (s) => statusChanges.push(s),
    })

    analyzer.onExit(0)
    expect(analyzer.getStatus()).toBe('stopped')
    expect(statusChanges).toContain('stopped')
    analyzer.dispose()
  })

  it('should set error on non-zero exit', () => {
    const analyzer = new OutputStateAnalyzer()
    analyzer.onExit(1)
    expect(analyzer.getStatus()).toBe('error')
    analyzer.dispose()
  })

  it('should clear timers on exit', () => {
    const statusChanges: string[] = []
    const analyzer = new OutputStateAnalyzer({
      idleThresholdMs: 500,
      onStatusChange: (s) => statusChanges.push(s),
    })

    analyzer.onOutput()
    analyzer.onExit(0) // Should clear idle timers

    // Advancing time should NOT trigger waiting transition
    vi.advanceTimersByTime(1000)
    expect(statusChanges).toEqual(['stopped'])
    analyzer.dispose()
  })

  // --- Silence measurement ---

  it('should track silence duration', () => {
    vi.useRealTimers()
    const analyzer = new OutputStateAnalyzer()
    analyzer.onOutput()

    // Small delay
    const before = analyzer.getSilenceMs()
    expect(before).toBeGreaterThanOrEqual(0)
    expect(before).toBeLessThan(50)
    analyzer.dispose()
  })

  // --- Callback dedup ---

  it('should not fire callback for same status', () => {
    const statusChanges: string[] = []
    const analyzer = new OutputStateAnalyzer({
      idleThresholdMs: 500,
      onStatusChange: (s) => statusChanges.push(s),
    })

    // Multiple outputs should not re-fire 'running'
    analyzer.onOutput()
    analyzer.onOutput()
    analyzer.onOutput()
    expect(statusChanges).toEqual([]) // Already running, no change
    analyzer.dispose()
  })

  // --- Performance ---

  it('should handle rapid onOutput() calls efficiently', () => {
    vi.useRealTimers()
    const analyzer = new OutputStateAnalyzer()

    const start = performance.now()
    for (let i = 0; i < 100000; i++) {
      analyzer.onOutput()
    }
    const elapsed = performance.now() - start

    // 100k calls should be very fast (just timestamp + timer reset)
    expect(elapsed).toBeLessThan(500)
    analyzer.dispose()
  })

  // --- Dispose ---

  it('should not fire callbacks after dispose', () => {
    const statusChanges: string[] = []
    const analyzer = new OutputStateAnalyzer({
      idleThresholdMs: 500,
      onStatusChange: (s) => statusChanges.push(s),
    })

    analyzer.onOutput()
    analyzer.dispose()

    // Advance time — should not trigger anything
    vi.advanceTimersByTime(1000)
    expect(statusChanges).toEqual([])
  })
})

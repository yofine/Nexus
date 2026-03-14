import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ShellReadyDetector } from './ShellReadyDetector.ts'

// Minimal IPty mock — only write() is needed
function createMockPty() {
  const writes: string[] = []
  return {
    write(data: string) { writes.push(data) },
    writes,
  }
}

describe('ShellReadyDetector', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('should inject sentinel on start()', async () => {
    const detector = new ShellReadyDetector('test-1')
    const pty = createMockPty()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    detector.start(pty as any)

    expect(pty.writes.length).toBe(1)
    expect(pty.writes[0]).toContain('echo __NEXUS_RDY_test-1_')
    expect(pty.writes[0].endsWith('\r')).toBe(true)
  })

  it('should resolve with detected=true when sentinel appears in output', async () => {
    const detector = new ShellReadyDetector('p1', { timeoutMs: 5000 })
    const pty = createMockPty()

    const promise = detector.start(pty as any)

    // Simulate shell echoing back the sentinel
    const sentinel = pty.writes[0].replace('echo ', '').replace('\r', '')
    detector.feed(`some shell init output\n`)
    detector.feed(`${sentinel}\n`)

    const result = await promise
    expect(result.detected).toBe(true)
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(detector.isDone).toBe(true)
  })

  it('should resolve with detected=false on timeout', async () => {
    const detector = new ShellReadyDetector('p2', { timeoutMs: 1000 })
    const pty = createMockPty()

    const promise = detector.start(pty as any)

    // Never feed the sentinel
    detector.feed('some random output\n')

    vi.advanceTimersByTime(1100)

    const result = await promise
    expect(result.detected).toBe(false)
    expect(detector.isDone).toBe(true)
  })

  it('should handle sentinel split across multiple chunks', async () => {
    const detector = new ShellReadyDetector('p3')
    const pty = createMockPty()

    const promise = detector.start(pty as any)

    const sentinel = pty.writes[0].replace('echo ', '').replace('\r', '')
    const half = Math.floor(sentinel.length / 2)

    // Split sentinel across two chunks
    detector.feed(sentinel.slice(0, half))
    detector.feed(sentinel.slice(half) + '\n')

    const result = await promise
    expect(result.detected).toBe(true)
  })

  it('should strip sentinel from output when stripSentinel=true', () => {
    const detector = new ShellReadyDetector('p4', { stripSentinel: true })
    const pty = createMockPty()

    detector.start(pty as any)

    const sentinel = pty.writes[0].replace('echo ', '').replace('\r', '')
    const result = detector.feed(`prefix\n${sentinel}\nsuffix\n`)

    // Sentinel line should be removed
    expect(result).not.toContain(sentinel)
    expect(result).toContain('prefix')
    expect(result).toContain('suffix')
  })

  it('should not strip sentinel when stripSentinel=false (default)', () => {
    const detector = new ShellReadyDetector('p5')
    const pty = createMockPty()

    detector.start(pty as any)

    const sentinel = pty.writes[0].replace('echo ', '').replace('\r', '')
    const result = detector.feed(`${sentinel}\n`)

    // Data should pass through unchanged
    expect(result).toContain(sentinel)
  })

  it('should be safe to call feed() after resolution', () => {
    const detector = new ShellReadyDetector('p6')
    const pty = createMockPty()

    detector.start(pty as any)

    const sentinel = pty.writes[0].replace('echo ', '').replace('\r', '')
    detector.feed(`${sentinel}\n`)

    // Subsequent feeds should just pass through
    const result = detector.feed('more data\n')
    expect(result).toBe('more data\n')
  })

  it('should clean up on dispose()', async () => {
    const detector = new ShellReadyDetector('p7', { timeoutMs: 10000 })
    const pty = createMockPty()

    const promise = detector.start(pty as any)
    detector.dispose()

    const result = await promise
    expect(result.detected).toBe(false)
    expect(detector.isDone).toBe(true)
  })

  it('should not collide between multiple instances', async () => {
    const d1 = new ShellReadyDetector('pane-1')
    const d2 = new ShellReadyDetector('pane-2')
    const pty1 = createMockPty()
    const pty2 = createMockPty()

    const p1 = d1.start(pty1 as any)
    const p2 = d2.start(pty2 as any)

    // Each should have different sentinels
    expect(pty1.writes[0]).not.toBe(pty2.writes[0])

    // Feed pane-2's sentinel to pane-1 — should NOT resolve pane-1
    const sentinel2 = pty2.writes[0].replace('echo ', '').replace('\r', '')
    d1.feed(`${sentinel2}\n`)
    expect(d1.isDone).toBe(false)

    // Feed correct sentinel
    const sentinel1 = pty1.writes[0].replace('echo ', '').replace('\r', '')
    d1.feed(`${sentinel1}\n`)
    d2.feed(`${sentinel2}\n`)

    const r1 = await p1
    const r2 = await p2
    expect(r1.detected).toBe(true)
    expect(r2.detected).toBe(true)
  })

  // --- Performance ---

  it('should handle high-frequency feed() calls without accumulating', () => {
    const detector = new ShellReadyDetector('perf-1', { timeoutMs: 60000 })
    const pty = createMockPty()

    detector.start(pty as any)

    // Simulate 10000 small chunks (typical xterm scenario)
    const start = performance.now()
    for (let i = 0; i < 10000; i++) {
      detector.feed(`line ${i} of output data that is reasonably long\n`)
    }
    const elapsed = performance.now() - start

    // Should complete in well under 100ms
    expect(elapsed).toBeLessThan(100)

    detector.dispose()
  })

  it('should free chunk buffer after sentinel detection', async () => {
    const detector = new ShellReadyDetector('perf-2')
    const pty = createMockPty()

    const promise = detector.start(pty as any)

    // Feed lots of data before sentinel
    for (let i = 0; i < 100; i++) {
      detector.feed(`chunk ${i}\n`)
    }

    const sentinel = pty.writes[0].replace('echo ', '').replace('\r', '')
    detector.feed(`${sentinel}\n`)

    await promise

    // Feed after resolution — should just pass through, no accumulation
    const r = detector.feed('post-detection\n')
    expect(r).toBe('post-detection\n')
  })
})

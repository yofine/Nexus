import { describe, it, expect } from 'vitest'
import { StatuslineParser } from './StatuslineParser.ts'

describe('StatuslineParser', () => {
  // --- Basic parsing ---

  it('should extract valid statusline with 2+ known fields', () => {
    const parser = new StatuslineParser()
    const json = JSON.stringify({
      model: 'claude-opus-4-6',
      session_id: 'sess-abc',
      cost_usd: 0.05,
      context_used_pct: 42,
    })

    const { cleanData, meta } = parser.parse(json + '\n')
    expect(meta).not.toBeNull()
    expect(meta!.model).toBe('claude-opus-4-6')
    expect(meta!.sessionId).toBe('sess-abc')
    expect(meta!.costUsd).toBe(0.05)
    expect(meta!.contextUsedPct).toBe(42)
    // Statusline should be stripped from output
    expect(cleanData).toBe('')
  })

  it('should pass through non-JSON lines', () => {
    const parser = new StatuslineParser()
    const { cleanData, meta } = parser.parse('Hello world\n')
    expect(meta).toBeNull()
    expect(cleanData).toBe('Hello world\n')
  })

  it('should pass through partial lines (no newline)', () => {
    const parser = new StatuslineParser()
    const { cleanData, meta } = parser.parse('partial output')
    expect(meta).toBeNull()
    expect(cleanData).toBe('partial output')
  })

  // --- Hardened validation ---

  it('should reject JSON with only 1 known field (below threshold)', () => {
    const parser = new StatuslineParser()
    const json = JSON.stringify({ model: 'gpt-4' })
    const { cleanData, meta } = parser.parse(json + '\n')
    expect(meta).toBeNull()
    // Should pass through as normal output
    expect(cleanData).toContain('gpt-4')
  })

  it('should reject JSON with wrong field types', () => {
    const parser = new StatuslineParser()
    const json = JSON.stringify({
      model: 123,             // should be string
      cost_usd: 'not-a-num',  // should be number
    })
    const { cleanData, meta } = parser.parse(json + '\n')
    expect(meta).toBeNull()
  })

  it('should reject JSON arrays', () => {
    const parser = new StatuslineParser()
    const { cleanData, meta } = parser.parse('[1, 2, 3]\n')
    expect(meta).toBeNull()
    expect(cleanData).toContain('[1, 2, 3]')
  })

  it('should accept with exactly 2 known fields', () => {
    const parser = new StatuslineParser()
    const json = JSON.stringify({ model: 'opus', session_id: 'x' })
    const { cleanData, meta } = parser.parse(json + '\n')
    expect(meta).not.toBeNull()
    expect(meta!.model).toBe('opus')
  })

  it('should NOT strip agent-generated JSON (e.g., tool output)', () => {
    const parser = new StatuslineParser()
    // This is JSON that an agent might output but isn't a statusline
    const json = JSON.stringify({
      name: 'test-file.ts',
      content: 'export const x = 1',
      lines: 42,
    })
    const { cleanData, meta } = parser.parse(json + '\n')
    expect(meta).toBeNull()
    expect(cleanData).toContain('test-file.ts')
  })

  // --- Multi-line handling ---

  it('should handle mixed statusline and regular output', () => {
    const parser = new StatuslineParser()
    const statusline = JSON.stringify({
      model: 'claude-opus-4-6',
      session_id: 'sess-1',
      cost_usd: 0.1,
    })
    const input = `Regular line 1\n${statusline}\nRegular line 2\n`
    const { cleanData, meta } = parser.parse(input)

    expect(meta).not.toBeNull()
    expect(meta!.model).toBe('claude-opus-4-6')
    expect(cleanData).toContain('Regular line 1')
    expect(cleanData).toContain('Regular line 2')
    expect(cleanData).not.toContain('claude-opus-4-6')
  })

  it('should handle statusline split across chunks via buffer', () => {
    const parser = new StatuslineParser()
    const json = JSON.stringify({ model: 'opus', session_id: 'x', cost_usd: 1 })

    // First chunk: partial JSON (no newline)
    const r1 = parser.parse(json.slice(0, 10))
    expect(r1.meta).toBeNull()
    expect(r1.cleanData).toBe(json.slice(0, 10))

    // Second chunk: rest of JSON + newline
    const r2 = parser.parse(json.slice(10) + '\n')
    expect(r2.meta).not.toBeNull()
    expect(r2.meta!.model).toBe('opus')
  })

  // --- Fast path ---

  it('should fast-reject lines not starting with {', () => {
    const parser = new StatuslineParser()
    // Even if a line contains JSON-like content, leading non-{ should skip parse
    const { meta } = parser.parse('  prefix {"model":"x","session_id":"y"}\n')
    expect(meta).toBeNull()
  })

  it('should fast-reject very short lines', () => {
    const parser = new StatuslineParser()
    const { meta } = parser.parse('{}\n')
    expect(meta).toBeNull()
  })

  // --- Reset ---

  it('should clear buffer on reset()', () => {
    const parser = new StatuslineParser()

    // Leave partial data in buffer
    parser.parse('partial')

    parser.reset()

    // Next parse should not see the old buffer
    const json = JSON.stringify({ model: 'opus', session_id: 'x', cost_usd: 0.5 })
    const { meta } = parser.parse(json + '\n')
    expect(meta).not.toBeNull()
    expect(meta!.model).toBe('opus')
  })

  // --- Performance ---

  it('should parse 100k lines efficiently', () => {
    const parser = new StatuslineParser()
    const normalLine = 'This is a regular line of terminal output from an agent\n'
    const statusline = JSON.stringify({
      model: 'claude-opus-4-6',
      session_id: 'sess-perf',
      cost_usd: 1.5,
      context_used_pct: 67,
    }) + '\n'

    const start = performance.now()
    let metaCount = 0

    for (let i = 0; i < 100000; i++) {
      // 1 statusline per 1000 normal lines
      const input = i % 1000 === 0 ? statusline : normalLine
      const { meta } = parser.parse(input)
      if (meta) metaCount++
    }

    const elapsed = performance.now() - start

    expect(metaCount).toBe(100) // 100000 / 1000
    // Should complete in under 200ms
    expect(elapsed).toBeLessThan(200)
  })

  it('should handle large chunks without excessive copying', () => {
    const parser = new StatuslineParser()

    // Build a large chunk (100KB) with one statusline buried in it
    const lines: string[] = []
    for (let i = 0; i < 2000; i++) {
      lines.push(`line ${i}: ${'x'.repeat(40)}`)
    }
    // Insert statusline in the middle
    const statusline = JSON.stringify({
      model: 'opus',
      session_id: 's1',
      cost_usd: 0.01,
      context_used_pct: 10,
    })
    lines.splice(1000, 0, statusline)

    const bigChunk = lines.join('\n') + '\n'

    const start = performance.now()
    const { cleanData, meta } = parser.parse(bigChunk)
    const elapsed = performance.now() - start

    expect(meta).not.toBeNull()
    expect(meta!.model).toBe('opus')
    expect(cleanData).not.toContain('"session_id"')
    // Should be fast even for large chunks
    expect(elapsed).toBeLessThan(50)
  })

  // --- Edge cases ---

  it('should handle empty string input', () => {
    const parser = new StatuslineParser()
    const { cleanData, meta } = parser.parse('')
    expect(meta).toBeNull()
    expect(cleanData).toBe('')
  })

  it('should handle consecutive newlines', () => {
    const parser = new StatuslineParser()
    const { cleanData, meta } = parser.parse('\n\n\n')
    expect(meta).toBeNull()
    expect(cleanData).toBe('\n\n\n')
  })

  it('should handle malformed JSON gracefully', () => {
    const parser = new StatuslineParser()
    const { cleanData, meta } = parser.parse('{this is not json but starts with brace and is long enough}\n')
    expect(meta).toBeNull()
    expect(cleanData).toContain('{this is not json')
  })

  it('should handle multiple statuslines in one chunk, last one wins', () => {
    const parser = new StatuslineParser()
    const s1 = JSON.stringify({ model: 'first', session_id: 'a', cost_usd: 0.1 })
    const s2 = JSON.stringify({ model: 'second', session_id: 'b', cost_usd: 0.2 })
    const { meta } = parser.parse(`${s1}\n${s2}\n`)
    // Last statusline in the chunk should be the returned meta
    expect(meta).not.toBeNull()
    expect(meta!.model).toBe('second')
  })
})

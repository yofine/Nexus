import type { PaneMeta } from '../types.ts'

/**
 * Parses Claude Code statusline JSON from PTY output.
 *
 * Hardened version with multi-layer validation:
 *   1. Line must parse as valid JSON
 *   2. Must contain at least 2 known statusline fields (eliminates random JSON)
 *   3. Field types are strictly validated
 *
 * Performance:
 * - Fast-path: lines that don't start with '{' are skipped with zero overhead.
 * - Buffer is only used for incomplete lines; complete lines are processed inline.
 * - JSON.parse is only attempted on candidate lines, not all output.
 */

// The known statusline field names and their expected types
const KNOWN_FIELDS: Record<string, string> = {
  model: 'string',
  session_id: 'string',
  cost_usd: 'number',
  context_used_pct: 'number',
  cwd: 'string',
  tool_name: 'string',
  // Claude Code may add more fields — add them here as discovered
}

// Minimum number of known fields required to classify as statusline
const MIN_KNOWN_FIELDS = 2

export class StatuslineParser {
  private buffer = ''

  /**
   * Process raw PTY output data.
   * Returns { cleanData, meta } where cleanData has statusline JSON stripped
   * and meta contains parsed metadata (if any was found).
   */
  parse(data: string): { cleanData: string; meta: PaneMeta | null } {
    let meta: PaneMeta | null = null

    // Fast path: no newline means partial chunk (keystroke echo, prompt).
    // Buffer it but pass through immediately.
    if (!data.includes('\n')) {
      this.buffer += data
      return { cleanData: data, meta: null }
    }

    const combined = this.buffer + data
    this.buffer = ''

    const lines = combined.split('\n')

    // Last element is trailing content (empty if data ended with \n)
    const trailing = lines.pop() || ''
    if (trailing) {
      this.buffer = trailing
    }

    const cleanLines: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()

      // Fast reject: not a JSON candidate
      if (trimmed.length < 10 || trimmed.charCodeAt(0) !== 0x7B /* '{' */) {
        cleanLines.push(line)
        continue
      }

      // Must end with '}'
      if (trimmed.charCodeAt(trimmed.length - 1) !== 0x7D /* '}' */) {
        cleanLines.push(line)
        continue
      }

      // Attempt JSON parse
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(trimmed)
      } catch {
        cleanLines.push(line)
        continue
      }

      // Validate: must be a plain object with enough known fields
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        cleanLines.push(line)
        continue
      }

      if (this.isStatuslineJson(parsed)) {
        meta = this.extractMeta(parsed)
        // Strip this line from terminal output
        continue
      }

      // Valid JSON but not a statusline — pass through
      cleanLines.push(line)
    }

    // Reconstruct output
    let cleanData = cleanLines.join('\n')
    if (cleanLines.length > 0) {
      cleanData += '\n'
    }

    return { cleanData, meta }
  }

  /**
   * Reset internal buffer state. Useful when restarting a pane.
   */
  reset(): void {
    this.buffer = ''
  }

  private isStatuslineJson(obj: Record<string, unknown>): boolean {
    let matchCount = 0
    for (const [field, expectedType] of Object.entries(KNOWN_FIELDS)) {
      if (field in obj) {
        // Type must also match
        if (typeof obj[field] === expectedType) {
          matchCount++
        }
      }
    }
    return matchCount >= MIN_KNOWN_FIELDS
  }

  private extractMeta(obj: Record<string, unknown>): PaneMeta {
    const meta: PaneMeta = {}

    if (typeof obj.model === 'string') {
      meta.model = obj.model
    }
    if (typeof obj.context_used_pct === 'number') {
      meta.contextUsedPct = obj.context_used_pct
    }
    if (typeof obj.cost_usd === 'number') {
      meta.costUsd = obj.cost_usd
    }
    if (typeof obj.session_id === 'string') {
      meta.sessionId = obj.session_id
    }
    if (typeof obj.cwd === 'string') {
      meta.cwd = obj.cwd
    }

    return meta
  }
}

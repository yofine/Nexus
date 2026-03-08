import type { PaneMeta } from '../types.ts'

/**
 * Parses Claude Code statusline JSON from PTY output.
 * Claude Code outputs JSON status lines that contain metadata about
 * the current session (model, context usage, cost, etc.).
 */
export class StatuslineParser {
  private buffer = ''

  /**
   * Process raw PTY output data.
   * Returns { cleanData, meta } where cleanData has statusline JSON stripped
   * and meta contains parsed metadata (if any was found).
   */
  parse(data: string): { cleanData: string; meta: PaneMeta | null } {
    let meta: PaneMeta | null = null

    // If data contains no newline, it's a partial chunk (e.g. keystroke echo, prompt).
    // Pass it through immediately — statusline JSON always arrives as a complete line.
    if (!data.includes('\n')) {
      // Accumulate into buffer for potential statusline detection,
      // but also pass through to terminal immediately.
      this.buffer += data
      return { cleanData: data, meta: null }
    }

    const lines = (this.buffer + data).split('\n')
    this.buffer = ''

    // Last element is either empty (data ended with \n) or an incomplete line
    const trailing = lines.pop() || ''
    if (trailing) {
      this.buffer = trailing
    }

    const cleanLines: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()

      // Try to detect statusline JSON
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed)
          if (this.isStatuslineJson(parsed)) {
            meta = this.extractMeta(parsed)
            continue // Strip this line from output
          }
        } catch {
          // Not valid JSON, treat as normal output
        }
      }

      cleanLines.push(line)
    }

    // Reconstruct: join complete lines with \n, add trailing \n since each was a complete line
    let cleanData = cleanLines.join('\n')
    if (cleanLines.length > 0) {
      cleanData += '\n'
    }

    return { cleanData, meta }
  }

  private isStatuslineJson(obj: Record<string, unknown>): boolean {
    // Claude Code statusline typically has these fields
    return (
      typeof obj === 'object' &&
      obj !== null &&
      ('model' in obj || 'session_id' in obj || 'cost_usd' in obj || 'context_used_pct' in obj)
    )
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

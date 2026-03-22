export type FileAction = 'read' | 'edit' | 'write' | 'create' | 'delete' | 'bash'

export interface FileActivity {
  file: string
  action: FileAction
  timestamp: number
}

// More complete ANSI stripping — handles OSC sequences, cursor movement, etc.
function stripAnsi(str: string): string {
  return str
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '') // OSC sequences
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')          // CSI sequences
    .replace(/\x1b[()][AB012]/g, '')                 // Character set selection
    .replace(/\x1b[>=<]/g, '')                       // Keypad/cursor mode
    .replace(/\x0f|\x0e/g, '')                       // SI/SO
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')  // Other control chars
}

/**
 * Parses Claude Code PTY output to detect file operations.
 * Claude Code outputs tool usage with various ANSI-styled formats.
 * This parser strips ANSI codes and matches known patterns.
 */
const MAX_BUFFER_SIZE = 64 * 1024 // 64KB — same as StatuslineParser

export class ActivityParser {
  private buffer = ''
  private lastFile = ''
  private lastTime = 0
  private readonly DEDUP_MS = 2000 // Ignore same file within 2s

  parse(data: string): FileActivity | null {
    if (!data.includes('\n')) {
      this.buffer += data
      // Prevent unbounded buffer growth (e.g., binary output without newlines)
      if (this.buffer.length > MAX_BUFFER_SIZE) {
        this.buffer = ''
      }
      return null
    }

    const lines = (this.buffer + data).split('\n')
    this.buffer = ''

    const trailing = lines.pop() || ''
    if (trailing) {
      this.buffer = trailing
    }

    // Check all lines, return first match
    for (const line of lines) {
      const activity = this.parseLine(line)
      if (activity) {
        // Dedup: skip if same file within DEDUP_MS
        if (activity.file === this.lastFile && activity.timestamp - this.lastTime < this.DEDUP_MS) {
          continue
        }
        this.lastFile = activity.file
        this.lastTime = activity.timestamp
        return activity
      }
    }

    return null
  }

  private parseLine(line: string): FileActivity | null {
    const clean = stripAnsi(line).trim()
    if (!clean || clean.length < 5) return null

    // ── Claude Code specific patterns ──

    // Pattern: "⎿  Read file_path" or "⎿  Edit file_path" (Claude Code tool result markers)
    const toolResultMatch = clean.match(
      /^[⎿│├└┌┐┘┤┬┴┼╭╮╰╯─━]?\s*(Read|Edit|Write|MultiEdit|Create|Delete|Glob|Grep|Bash)\s+(.+)/i,
    )
    if (toolResultMatch) {
      return this.buildActivity(toolResultMatch[1], toolResultMatch[2])
    }

    // Pattern: Tool name at start of line followed by path — "Read src/foo.ts"
    // Must be exact tool name, not part of a sentence
    const toolStartMatch = clean.match(
      /^(Read|Edit|Write|MultiEdit|Create|Delete)\s+([^\s(][^\s]*\.\w{1,10})\b/,
    )
    if (toolStartMatch) {
      return this.buildActivity(toolStartMatch[1], toolStartMatch[2])
    }

    // Pattern: Tool name with parenthesized path — "Read(src/foo.ts)" or "Edit(file_path=...)"
    const parenMatch = clean.match(
      /\b(Read|Edit|Write|MultiEdit|Create|Delete)\((?:file_path\s*[:=]\s*)?["']?([^"')]+\.\w{1,10})["']?\)/i,
    )
    if (parenMatch) {
      return this.buildActivity(parenMatch[1], parenMatch[2])
    }

    // Pattern: "file_path": "src/foo.ts" (JSON-like in tool output)
    const jsonFieldMatch = clean.match(
      /["']?file_path["']?\s*[:=]\s*["']([^"']+\.\w{1,10})["']/i,
    )
    if (jsonFieldMatch) {
      const action = this.inferActionFromContext(clean)
      return this.buildActivity(action, jsonFieldMatch[1])
    }

    // Pattern: "── Read: src/foo.ts" or "Read: src/foo.ts"
    const colonMatch = clean.match(
      /(?:─+\s*)?(Read|Edit|Write|MultiEdit|Create|Delete)\s*:\s*(.+?)(?:\s*─+)?$/i,
    )
    if (colonMatch) {
      return this.buildActivity(colonMatch[1], colonMatch[2])
    }

    // Pattern: Spinner chars + tool — "⠿ Edit src/foo.ts" / "✓ Write src/bar.ts"
    const spinnerMatch = clean.match(
      /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠿✓✗✔✘●◉▶▸►◆◇■□▪▫★☆○◎]\s*(Read|Edit|Write|MultiEdit|Create|Delete)\s+(.+)/i,
    )
    if (spinnerMatch) {
      return this.buildActivity(spinnerMatch[1], spinnerMatch[2])
    }

    // Pattern: Indented path after tool header (continuation line)
    // e.g., "   /relative/path/file.ts" or "   path/to/file.ts"
    // Only if line is just a path with leading whitespace
    const indentedPathMatch = clean.match(
      /^([a-zA-Z0-9_][a-zA-Z0-9_./\-]*\.\w{1,10})$/,
    )
    if (indentedPathMatch && line.startsWith(' ')) {
      return this.buildActivity('Read', indentedPathMatch[1])
    }

    return null
  }

  private buildActivity(toolName: string, rawPath: string): FileActivity | null {
    const file = this.cleanPath(rawPath)
    if (!file || !this.isValidPath(file)) return null

    const action = this.toolToAction(toolName)
    return { file, action, timestamp: Date.now() }
  }

  private toolToAction(tool: string): FileAction {
    switch (tool.toLowerCase()) {
      case 'read':
      case 'glob':
      case 'grep':
        return 'read'
      case 'edit':
      case 'multiedit':
        return 'edit'
      case 'write':
        return 'write'
      case 'create':
        return 'create'
      case 'delete':
        return 'delete'
      case 'bash':
        return 'bash'
      default:
        return 'read'
    }
  }

  private inferActionFromContext(line: string): string {
    const lower = line.toLowerCase()
    if (lower.includes('edit') || lower.includes('old_string') || lower.includes('new_string')) return 'Edit'
    if (lower.includes('write') || lower.includes('content')) return 'Write'
    if (lower.includes('delete') || lower.includes('remove')) return 'Delete'
    return 'Read'
  }

  private cleanPath(raw: string): string {
    return raw
      .trim()
      .replace(/^['"`]+|['"`]+$/g, '')
      .replace(/^\.\//, '')
      .replace(/\s+.*$/, '')   // Remove anything after whitespace
      .replace(/[,;:)]+$/, '') // Remove trailing punctuation
      .replace(/^\(/, '')      // Remove leading paren
  }

  // Paths under these prefixes are Nexus internals or noise — ignore them
  private static IGNORED_PREFIXES = ['.nexus/', 'node_modules/', '.git/']

  private isValidPath(file: string): boolean {
    if (!file || file.length < 3) return false
    // Must have a file extension
    if (!/\.\w{1,10}$/.test(file)) return false
    // Must not be absolute path or URL
    if (file.startsWith('/') || file.includes('://')) return false
    // Skip Nexus internal and noise paths
    for (const prefix of ActivityParser.IGNORED_PREFIXES) {
      if (file.startsWith(prefix)) return false
    }
    // No suspicious chars
    if (/[<>|&$`\\{}[\]]/.test(file)) return false
    // Reasonable length
    const parts = file.split('/')
    if (parts.length > 15) return false
    for (const part of parts) {
      if (part.length > 100 || part.length === 0) return false
    }
    return true
  }
}

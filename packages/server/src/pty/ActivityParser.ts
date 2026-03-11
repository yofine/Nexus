export type FileAction = 'read' | 'edit' | 'write' | 'create' | 'delete' | 'bash'

export interface FileActivity {
  file: string
  action: FileAction
  timestamp: number
}

/**
 * Parses Claude Code PTY output to detect file operations.
 * Extracts tool calls like Read, Edit, Write from terminal output.
 */
export class ActivityParser {
  private buffer = ''

  parse(data: string): FileActivity | null {
    // Only process lines containing potential tool calls
    if (!data.includes('\n')) {
      this.buffer += data
      return null
    }

    const lines = (this.buffer + data).split('\n')
    this.buffer = ''

    const trailing = lines.pop() || ''
    if (trailing) {
      this.buffer = trailing
    }

    // Check lines in reverse — most recent activity matters
    for (let i = lines.length - 1; i >= 0; i--) {
      const activity = this.parseLine(lines[i])
      if (activity) return activity
    }

    return null
  }

  private parseLine(line: string): FileActivity | null {
    // Strip ANSI escape codes for matching
    const clean = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim()
    if (!clean) return null

    // Pattern 1: Tool use markers — "⠿ Read file_path" / "⠿ Edit file_path"
    // Claude Code uses spinner chars followed by tool name
    const toolUseMatch = clean.match(
      /(?:[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠿✓✗●◉▶▸►]|\*)\s*(Read|Edit|Write|MultiEdit|Create|Delete)\s+(.+)/i,
    )
    if (toolUseMatch) {
      return this.buildActivity(toolUseMatch[1], toolUseMatch[2])
    }

    // Pattern 2: Tool call with parentheses — "Read(src/foo.ts)" / "Edit(src/bar.ts)"
    const parenMatch = clean.match(
      /\b(Read|Edit|Write|MultiEdit|Create|Delete)\(([^)]+)\)/i,
    )
    if (parenMatch) {
      return this.buildActivity(parenMatch[1], parenMatch[2])
    }

    // Pattern 3: "file_path:" or "file:" style — common in structured output
    const filePathMatch = clean.match(
      /(?:file_path|file|path)\s*[:=]\s*['"]?([^\s'")\]]+\.\w{1,10})['"]?/i,
    )
    if (filePathMatch) {
      const action = this.inferAction(clean)
      if (action) {
        return this.buildActivity(action, filePathMatch[1])
      }
    }

    // Pattern 4: Direct tool header lines — "── Read: src/foo.ts ──" or "Read: src/foo.ts"
    const headerMatch = clean.match(
      /(?:──\s*)?(Read|Edit|Write|MultiEdit|Create|Delete)\s*:\s*(.+?)(?:\s*──)?$/i,
    )
    if (headerMatch) {
      return this.buildActivity(headerMatch[1], headerMatch[2])
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
      default:
        return 'read'
    }
  }

  private inferAction(line: string): string | null {
    const lower = line.toLowerCase()
    if (lower.includes('edit') || lower.includes('modify') || lower.includes('update')) return 'Edit'
    if (lower.includes('write') || lower.includes('create') || lower.includes('new file')) return 'Write'
    if (lower.includes('read') || lower.includes('view') || lower.includes('open')) return 'Read'
    if (lower.includes('delete') || lower.includes('remove')) return 'Delete'
    return null
  }

  private cleanPath(raw: string): string {
    return raw
      .trim()
      .replace(/^['"`]+|['"`]+$/g, '') // Remove quotes
      .replace(/^\.\//, '') // Remove leading ./
      .replace(/\s+.*$/, '') // Remove anything after whitespace (e.g., trailing description)
      .replace(/[,;:]+$/, '') // Remove trailing punctuation
  }

  private isValidPath(file: string): boolean {
    // Must have a file extension
    if (!/\.\w{1,10}$/.test(file)) return false
    // Must not be an absolute path or URL
    if (file.startsWith('/') || file.includes('://')) return false
    // Must not contain suspicious characters
    if (/[<>|&$`]/.test(file)) return false
    // Sanity: path segments check
    const parts = file.split('/')
    if (parts.length > 15) return false
    // Each part should be reasonable
    for (const part of parts) {
      if (part.length > 100) return false
    }
    return true
  }
}

import fs from 'node:fs'
import path from 'node:path'

// ─── Types ───────────────────────────────────────────────────

export interface DepNode {
  id: string        // relative file path (e.g., "src/index.ts")
  imports: string[] // resolved relative paths this file imports
}

export interface DepGraph {
  nodes: DepNode[]
  root: string      // project root (absolute)
}

// ─── Import regex patterns ───────────────────────────────────

// Matches: import ... from 'specifier'  or  import 'specifier'
const IMPORT_FROM_RE = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g
// Matches: export ... from 'specifier'
const EXPORT_FROM_RE = /export\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g
// Matches: require('specifier')
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
// Matches: import('specifier') — dynamic import
const DYNAMIC_IMPORT_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g

const JS_TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.cjs', '.cts'])
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '', '/index.ts', '/index.tsx', '/index.js', '/index.jsx']

// Directories to skip
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage', '.nexus', '.turbo', '.cache'])

// ─── DependencyAnalyzer ─────────────────────────────────────

export class DependencyAnalyzer {
  private projectDir: string

  constructor(projectDir: string) {
    this.projectDir = projectDir
  }

  /**
   * Scan the project directory and build a dependency graph.
   * Only analyzes JS/TS files with relative imports.
   */
  analyze(): DepGraph {
    const files = this.collectFiles(this.projectDir)
    const nodes: DepNode[] = []

    for (const absPath of files) {
      const relPath = path.relative(this.projectDir, absPath)
      const imports = this.extractImports(absPath, relPath)
      nodes.push({ id: relPath, imports })
    }

    return { nodes, root: this.projectDir }
  }

  private collectFiles(dir: string, depth = 0): string[] {
    if (depth > 8) return [] // safety limit
    const files: string[] = []

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return files
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.') continue
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        files.push(...this.collectFiles(fullPath, depth + 1))
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name)
        if (JS_TS_EXTENSIONS.has(ext)) {
          files.push(fullPath)
        }
      }
    }

    return files
  }

  private extractImports(absPath: string, relPath: string): string[] {
    let content: string
    try {
      content = fs.readFileSync(absPath, 'utf-8')
    } catch {
      return []
    }

    const specifiers = new Set<string>()
    const patterns = [IMPORT_FROM_RE, EXPORT_FROM_RE, REQUIRE_RE, DYNAMIC_IMPORT_RE]

    for (const pattern of patterns) {
      pattern.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = pattern.exec(content)) !== null) {
        const spec = match[1]
        // Only resolve relative imports (skip node_modules / bare specifiers)
        if (spec.startsWith('.')) {
          specifiers.add(spec)
        }
      }
    }

    // Resolve specifiers to relative file paths
    const imports: string[] = []
    const fileDir = path.dirname(absPath)

    for (const spec of specifiers) {
      const resolved = this.resolveSpecifier(fileDir, spec)
      if (resolved) {
        const resolvedRel = path.relative(this.projectDir, resolved)
        imports.push(resolvedRel)
      }
    }

    return imports
  }

  private resolveSpecifier(fromDir: string, specifier: string): string | null {
    const base = path.resolve(fromDir, specifier)

    for (const ext of RESOLVE_EXTENSIONS) {
      const candidate = base + ext
      try {
        if (fs.statSync(candidate).isFile()) {
          return candidate
        }
      } catch {
        // not found, try next
      }
    }

    return null
  }
}

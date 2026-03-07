import fs from 'node:fs'
import path from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import type { FileNode } from '../types.ts'

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.cache',
  '.turbo',
  '__pycache__',
])

const IGNORED_FILES = new Set([
  '.DS_Store',
  'Thumbs.db',
])

export class FsWatcher {
  private projectDir: string
  private watcher: FSWatcher | null = null
  private tree: FileNode[] = []
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private listeners = new Set<(tree: FileNode[]) => void>()

  constructor(projectDir: string) {
    this.projectDir = projectDir
  }

  start(): void {
    // Build initial tree synchronously
    this.tree = this.buildTree(this.projectDir, 0)
    this.notifyListeners()

    // Watch top-level directory only (depth 0) for structural changes
    // Use function-based ignored to reliably filter out heavy directories
    this.watcher = watch(this.projectDir, {
      ignored: (filePath: string) => {
        const basename = path.basename(filePath)
        return IGNORED_DIRS.has(basename) || IGNORED_FILES.has(basename)
      },
      persistent: true,
      ignoreInitial: true,
      depth: 5,
    })

    const scheduleRebuild = () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(() => {
        this.tree = this.buildTree(this.projectDir, 0)
        this.notifyListeners()
      }, 300)
    }

    this.watcher.on('add', scheduleRebuild)
    this.watcher.on('unlink', scheduleRebuild)
    this.watcher.on('addDir', scheduleRebuild)
    this.watcher.on('unlinkDir', scheduleRebuild)
    this.watcher.on('error', () => {
      // Silently handle watcher errors (e.g., ENOSPC)
      // Tree is still built synchronously, just won't auto-update
    })
  }

  getTree(): FileNode[] {
    return this.tree
  }

  onTreeChange(callback: (tree: FileNode[]) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  close(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.watcher?.close()
    this.watcher = null
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.tree)
    }
  }

  private buildTree(dirPath: string, depth: number): FileNode[] {
    if (depth > 8) return [] // Limit recursion depth

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      const nodes: FileNode[] = []

      for (const entry of entries) {
        if (IGNORED_DIRS.has(entry.name) || IGNORED_FILES.has(entry.name)) continue

        const fullPath = path.join(dirPath, entry.name)
        const relativePath = path.relative(this.projectDir, fullPath)

        if (entry.isDirectory()) {
          nodes.push({
            name: entry.name,
            path: relativePath,
            type: 'directory',
            children: this.buildTree(fullPath, depth + 1),
          })
        } else if (entry.isFile()) {
          nodes.push({
            name: entry.name,
            path: relativePath,
            type: 'file',
          })
        }
      }

      // Sort: directories first, then files, alphabetical within each group
      nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      return nodes
    } catch {
      return []
    }
  }
}

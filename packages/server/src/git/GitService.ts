import path from 'node:path'
import { simpleGit, type SimpleGit } from 'simple-git'
import { watch, type FSWatcher } from 'chokidar'
import type { FileDiff } from '../types.ts'

export class GitService {
  private git: SimpleGit
  private projectDir: string
  private watcher: FSWatcher | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private listeners = new Set<(diffs: FileDiff[]) => void>()
  private currentDiffs: FileDiff[] = []

  constructor(projectDir: string) {
    this.projectDir = projectDir
    this.git = simpleGit(projectDir)
  }

  async start(): Promise<void> {
    // Check if this is a git repo
    const isRepo = await this.git.checkIsRepo()
    if (!isRepo) return

    // Get initial diff
    await this.refresh()

    // Watch .git directory for changes (index updates, commits, etc.)
    const gitDir = path.join(this.projectDir, '.git')
    this.watcher = watch([
      path.join(gitDir, 'index'),
      path.join(gitDir, 'HEAD'),
      path.join(gitDir, 'refs'),
    ], {
      persistent: true,
      ignoreInitial: true,
    })

    this.watcher.on('all', () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(() => {
        this.refresh()
      }, 1000)
    })
  }

  async refresh(): Promise<void> {
    try {
      const diffs = await this.getDiffs()
      this.currentDiffs = diffs
      this.notifyListeners()
    } catch {
      // Git operation failed, ignore
    }
  }

  getCurrentDiffs(): FileDiff[] {
    return this.currentDiffs
  }

  onDiffChange(callback: (diffs: FileDiff[]) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  close(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.watcher?.close()
    this.watcher = null
  }

  private async getDiffs(): Promise<FileDiff[]> {
    const status = await this.git.status()
    const diffs: FileDiff[] = []

    // Get unified diff for all changes (staged + unstaged)
    const diffText = await this.git.diff()
    const stagedDiffText = await this.git.diff(['--cached'])
    const combinedDiff = [diffText, stagedDiffText].filter(Boolean).join('\n')

    // Parse file statuses
    const allFiles = new Set<string>()

    for (const file of status.created) {
      allFiles.add(file)
      diffs.push({ file, status: 'added', hunks: '' })
    }
    for (const file of status.deleted) {
      allFiles.add(file)
      diffs.push({ file, status: 'deleted', hunks: '' })
    }
    for (const file of status.modified) {
      allFiles.add(file)
      diffs.push({ file, status: 'modified', hunks: '' })
    }
    for (const file of status.renamed) {
      allFiles.add(file.to)
      diffs.push({ file: file.to, status: 'renamed', hunks: '' })
    }
    // Also catch staged files
    for (const file of status.staged) {
      if (!allFiles.has(file)) {
        allFiles.add(file)
        diffs.push({ file, status: 'modified', hunks: '' })
      }
    }

    // Attach diff hunks to matching files
    if (combinedDiff) {
      const fileDiffs = this.parseFileDiffs(combinedDiff)
      for (const diff of diffs) {
        if (fileDiffs.has(diff.file)) {
          diff.hunks = fileDiffs.get(diff.file)!
        }
      }
    }

    // For newly created (untracked) files, get their content as diff
    for (const diff of diffs) {
      if (diff.status === 'added' && !diff.hunks) {
        try {
          const content = await this.git.show([`:${diff.file}`]).catch(() => null)
          if (content) {
            diff.hunks = `--- /dev/null\n+++ b/${diff.file}\n@@ -0,0 +1 @@\n+${content}`
          }
        } catch {
          // Skip
        }
      }
    }

    return diffs
  }

  /**
   * Parse a unified diff output into a map of filename → diff hunks string
   */
  private parseFileDiffs(diffText: string): Map<string, string> {
    const result = new Map<string, string>()
    const fileSections = diffText.split(/^diff --git /m).filter(Boolean)

    for (const section of fileSections) {
      // Extract filename from "a/path b/path" header
      const headerMatch = section.match(/^a\/(.+?) b\/(.+)/)
      if (!headerMatch) continue

      const filename = headerMatch[2]
      result.set(filename, `diff --git ${section}`)
    }

    return result
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.currentDiffs)
    }
  }
}

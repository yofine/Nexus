import path from 'node:path'
import { simpleGit, type SimpleGit } from 'simple-git'
import { watch, type FSWatcher } from 'chokidar'
import type { FileDiff } from '../types.ts'

export class GitService {
  private git: SimpleGit
  private projectDir: string
  private gitWatcher: FSWatcher | null = null
  private workWatcher: FSWatcher | null = null
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

    const scheduleRefresh = () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(() => {
        this.refresh()
      }, 1000)
    }

    // Watch .git directory for changes (index updates, commits, etc.)
    const gitDir = path.join(this.projectDir, '.git')
    this.gitWatcher = watch([
      path.join(gitDir, 'index'),
      path.join(gitDir, 'HEAD'),
      path.join(gitDir, 'refs'),
    ], {
      persistent: true,
      ignoreInitial: true,
    })
    this.gitWatcher.on('all', scheduleRefresh)

    // Watch working tree for file content changes (so diffs update automatically)
    this.workWatcher = watch(this.projectDir, {
      ignored: (filePath: string) => {
        const basename = path.basename(filePath)
        return basename === '.git' || basename === 'node_modules' || basename === '.nexus' || basename === 'dist'
      },
      persistent: true,
      ignoreInitial: true,
      depth: 5,
    })
    this.workWatcher.on('all', scheduleRefresh)
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

  /**
   * Stage a file (git add). For "accept" workflow.
   */
  async acceptFile(file: string): Promise<void> {
    await this.git.add(file)
    await this.refresh()
  }

  /**
   * Stage all changed files.
   */
  async acceptAll(): Promise<void> {
    await this.git.add('-A')
    await this.refresh()
  }

  /**
   * Discard unstaged changes for a file (git checkout -- file).
   * For untracked files, removes them.
   */
  async discardFile(file: string): Promise<void> {
    const status = await this.git.status()
    const isUntracked = status.not_added.includes(file) || status.created.includes(file)

    if (isUntracked) {
      // Remove untracked file
      const fullPath = path.join(this.projectDir, file)
      const fs = await import('node:fs')
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath)
      }
    } else {
      // Restore from HEAD for tracked files
      await this.git.checkout(['--', file])
      // Also unstage if staged
      try {
        await this.git.reset(['HEAD', '--', file])
      } catch {
        // May not be staged, ignore
      }
    }
    await this.refresh()
  }

  /**
   * Discard all changes (git checkout -- . && git clean -fd).
   */
  async discardAll(): Promise<void> {
    await this.git.checkout(['--', '.'])
    await this.git.clean('f', ['-d'])
    await this.refresh()
  }

  close(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.gitWatcher?.close()
    this.gitWatcher = null
    this.workWatcher?.close()
    this.workWatcher = null
  }

  private async getDiffs(): Promise<FileDiff[]> {
    const status = await this.git.status()
    const diffs: FileDiff[] = []

    // Build set of staged files to exclude them from the diff list
    const stagedFiles = new Set<string>(status.staged)

    // Get unified diff for unstaged changes only
    const diffText = await this.git.diff()

    // Parse file statuses — only include unstaged changes
    const allFiles = new Set<string>()

    for (const file of status.not_added) {
      // Untracked files
      allFiles.add(file)
      diffs.push({ file, status: 'added', hunks: '' })
    }
    for (const file of status.created) {
      if (!stagedFiles.has(file)) {
        allFiles.add(file)
        diffs.push({ file, status: 'added', hunks: '' })
      }
    }
    for (const file of status.deleted) {
      if (!stagedFiles.has(file)) {
        allFiles.add(file)
        diffs.push({ file, status: 'deleted', hunks: '' })
      }
    }
    for (const file of status.modified) {
      allFiles.add(file)
      diffs.push({ file, status: 'modified', hunks: '' })
    }
    for (const file of status.renamed) {
      if (!stagedFiles.has(file.to)) {
        allFiles.add(file.to)
        diffs.push({ file: file.to, status: 'renamed', hunks: '' })
      }
    }

    // Attach diff hunks to matching files
    if (diffText) {
      const fileDiffs = this.parseFileDiffs(diffText)
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

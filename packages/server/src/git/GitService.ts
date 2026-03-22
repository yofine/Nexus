import path from 'node:path'
import { simpleGit, type SimpleGit } from 'simple-git'
import { watch, type FSWatcher } from 'chokidar'
import type { FileDiff } from '../types.ts'

export interface GitDiffResult {
  unstaged: FileDiff[]
  staged: FileDiff[]
}

export class GitService {
  private git: SimpleGit
  private projectDir: string
  private gitWatcher: FSWatcher | null = null
  private workWatcher: FSWatcher | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private workDebounceTimer: ReturnType<typeof setTimeout> | null = null
  private listeners = new Set<(result: GitDiffResult) => void>()
  private currentResult: GitDiffResult = { unstaged: [], staged: [] }

  constructor(projectDir: string) {
    this.projectDir = projectDir
    this.git = simpleGit(projectDir)
  }

  async start(): Promise<void> {
    const isRepo = await this.git.checkIsRepo()
    if (!isRepo) return

    await this.refresh()

    const scheduleRefresh = () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(() => {
        this.refresh()
      }, 1000)
    }

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

    // Working tree watcher — uses a longer debounce to avoid flooding
    // git diff on every keystroke when agents are writing files
    const scheduleWorkRefresh = () => {
      if (this.workDebounceTimer) clearTimeout(this.workDebounceTimer)
      this.workDebounceTimer = setTimeout(() => {
        this.refresh()
      }, 3000)
    }

    this.workWatcher = watch(this.projectDir, {
      ignored: (filePath: string) => {
        const basename = path.basename(filePath)
        return basename === '.git' || basename === 'node_modules' || basename === '.nexus' || basename === 'dist'
      },
      persistent: true,
      ignoreInitial: true,
      depth: 5,
    })
    this.workWatcher.on('all', scheduleWorkRefresh)
  }

  async refresh(): Promise<void> {
    try {
      const result = await Promise.race([
        this.getDiffs(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('git diff timeout')), 15000)
        ),
      ])
      this.currentResult = result
      this.notifyListeners()
    } catch (err) {
      if ((err as Error).message === 'git diff timeout') {
        console.warn('[GitService] git diff timed out (15s), using cached result')
      }
      // Other git failures also silently use cached result
    }
  }

  getCurrentDiffs(): GitDiffResult {
    return this.currentResult
  }

  onDiffChange(callback: (result: GitDiffResult) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  // ─── Stage / Unstage ─────────────────────────────────────

  async acceptFile(file: string): Promise<void> {
    await this.git.add(file)
    await this.refresh()
  }

  async acceptAll(): Promise<void> {
    await this.git.add('-A')
    await this.refresh()
  }

  async unstageFile(file: string): Promise<void> {
    await this.git.reset(['HEAD', '--', file])
    await this.refresh()
  }

  async unstageAll(): Promise<void> {
    await this.git.reset(['HEAD'])
    await this.refresh()
  }

  // ─── Discard ──────────────────────────────────────────────

  async discardFile(file: string): Promise<void> {
    const status = await this.git.status()
    const isUntracked = status.not_added.includes(file) || status.created.includes(file)

    if (isUntracked) {
      const fullPath = path.join(this.projectDir, file)
      const fs = await import('node:fs')
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath)
      }
    } else {
      await this.git.checkout(['--', file])
      try {
        await this.git.reset(['HEAD', '--', file])
      } catch {
        // May not be staged, ignore
      }
    }
    await this.refresh()
  }

  async discardAll(): Promise<void> {
    await this.git.checkout(['--', '.'])
    await this.git.clean('f', ['-d'])
    await this.refresh()
  }

  // ─── Commit / Push ────────────────────────────────────────

  async commit(message: string): Promise<string> {
    const result = await this.git.commit(message)
    await this.refresh()
    const summary = result.summary
    return `${summary.changes} file${summary.changes !== 1 ? 's' : ''}, +${summary.insertions} -${summary.deletions}`
  }

  async push(): Promise<string> {
    await this.git.push()
    await this.refresh()
    return 'Pushed successfully'
  }

  async getBranchInfo(): Promise<{ branch: string; remote?: string; ahead: number; behind: number }> {
    const status = await this.git.status()
    return {
      branch: status.current || 'HEAD',
      remote: status.tracking || undefined,
      ahead: status.ahead,
      behind: status.behind,
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────

  close(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    if (this.workDebounceTimer) clearTimeout(this.workDebounceTimer)
    this.gitWatcher?.close()
    this.gitWatcher = null
    this.workWatcher?.close()
    this.workWatcher = null
  }

  // ─── Internal ─────────────────────────────────────────────

  private async getDiffs(): Promise<GitDiffResult> {
    const status = await this.git.status()
    const unstaged: FileDiff[] = []
    const staged: FileDiff[] = []

    // Get unified diffs
    const [unstagedDiffText, stagedDiffText] = await Promise.all([
      this.git.diff(),
      this.git.diff(['--cached']),
    ])

    const unstagedHunks = this.parseFileDiffs(unstagedDiffText)
    const stagedHunks = this.parseFileDiffs(stagedDiffText)

    const stagedFiles = new Set<string>(status.staged)

    // ─── Unstaged changes ───────────────────────────────────
    for (const file of status.not_added) {
      unstaged.push({ file, status: 'added', hunks: '' })
    }
    for (const file of status.created) {
      if (!stagedFiles.has(file)) {
        unstaged.push({ file, status: 'added', hunks: '' })
      }
    }
    for (const file of status.deleted) {
      if (!stagedFiles.has(file)) {
        unstaged.push({ file, status: 'deleted', hunks: '' })
      }
    }
    for (const file of status.modified) {
      unstaged.push({ file, status: 'modified', hunks: unstagedHunks.get(file) || '' })
    }
    for (const file of status.renamed) {
      if (!stagedFiles.has(file.to)) {
        unstaged.push({ file: file.to, status: 'renamed', hunks: '' })
      }
    }

    // Attach hunks to unstaged entries that don't have them yet
    for (const diff of unstaged) {
      if (!diff.hunks && unstagedHunks.has(diff.file)) {
        diff.hunks = unstagedHunks.get(diff.file)!
      }
    }

    // For untracked files, try to show content
    for (const diff of unstaged) {
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

    // ─── Staged changes ─────────────────────────────────────
    // Use status.files for accurate staged file detection
    for (const fileResult of status.files) {
      const indexStatus = fileResult.index
      if (!indexStatus || indexStatus === '?' || indexStatus === ' ') continue

      const file = fileResult.path
      let diffStatus: FileDiff['status'] = 'modified'
      if (indexStatus === 'A') diffStatus = 'added'
      else if (indexStatus === 'D') diffStatus = 'deleted'
      else if (indexStatus === 'R') diffStatus = 'renamed'

      staged.push({
        file,
        status: diffStatus,
        hunks: stagedHunks.get(file) || '',
      })
    }

    return { unstaged, staged }
  }

  private parseFileDiffs(diffText: string): Map<string, string> {
    const result = new Map<string, string>()
    if (!diffText) return result
    const fileSections = diffText.split(/^diff --git /m).filter(Boolean)

    for (const section of fileSections) {
      const headerMatch = section.match(/^a\/(.+?) b\/(.+)/)
      if (!headerMatch) continue
      const filename = headerMatch[2]
      result.set(filename, `diff --git ${section}`)
    }

    return result
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.currentResult)
    }
  }
}

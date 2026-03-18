import path from 'node:path'
import fs from 'node:fs'
import { simpleGit, type SimpleGit } from 'simple-git'

interface WorktreeEntry {
  path: string
  branch: string
  baseBranch: string
}

export class WorktreeManager {
  private projectDir: string
  private git: SimpleGit
  private worktrees = new Map<string, WorktreeEntry>()

  constructor(projectDir: string) {
    this.projectDir = projectDir
    this.git = simpleGit(projectDir)
  }

  /**
   * Create a git worktree + branch for a pane.
   * Returns the worktree disk path and branch name.
   */
  async create(paneId: string, paneName: string): Promise<{ worktreePath: string; branch: string }> {
    const baseBranch = await this.getCurrentBranch()
    const slug = this.slugify(paneName)
    const branch = `nexus/${paneId}-${slug}`
    const worktreePath = path.join(this.projectDir, '.nexus', 'worktrees', paneId)

    // Clean up if leftover from previous session
    if (fs.existsSync(worktreePath)) {
      await this.forceRemoveWorktree(worktreePath)
    }

    // Delete branch if it already exists (stale from previous session)
    try {
      await this.git.raw(['branch', '-D', branch])
    } catch {
      // Branch doesn't exist, fine
    }

    fs.mkdirSync(path.dirname(worktreePath), { recursive: true })
    await this.git.raw(['worktree', 'add', '-b', branch, worktreePath, baseBranch])

    const entry: WorktreeEntry = { path: worktreePath, branch, baseBranch }
    this.worktrees.set(paneId, entry)

    return { worktreePath, branch }
  }

  /**
   * Restore a worktree from a previous session.
   * If the worktree directory still exists, re-register it.
   * If not, recreate it from the existing branch.
   * Returns false if the branch no longer exists (stale config).
   */
  async restore(paneId: string, branch: string, worktreePath: string): Promise<boolean> {
    // Determine base branch
    const baseBranch = await this.getCurrentBranch()

    // Check if branch exists
    try {
      await this.git.raw(['rev-parse', '--verify', branch])
    } catch {
      // Branch doesn't exist — stale config, can't restore
      return false
    }

    if (fs.existsSync(worktreePath)) {
      // Worktree directory still exists (non-graceful shutdown) — just re-register
      this.worktrees.set(paneId, { path: worktreePath, branch, baseBranch })
      return true
    }

    // Recreate worktree from existing branch
    try {
      // Clean up any stale git worktree metadata
      await this.git.raw(['worktree', 'prune']).catch(() => {})
      fs.mkdirSync(path.dirname(worktreePath), { recursive: true })
      await this.git.raw(['worktree', 'add', worktreePath, branch])
      this.worktrees.set(paneId, { path: worktreePath, branch, baseBranch })
      return true
    } catch (err) {
      console.warn(`[WorktreeManager] Failed to restore worktree for ${paneId}:`, (err as Error).message)
      return false
    }
  }

  /**
   * Remove a worktree. Branch is kept for later merge/PR.
   */
  async remove(paneId: string): Promise<void> {
    const entry = this.worktrees.get(paneId)
    if (!entry) return

    await this.forceRemoveWorktree(entry.path)
    this.worktrees.delete(paneId)
  }

  /**
   * Remove worktree and also delete the branch.
   */
  async removeWithBranch(paneId: string): Promise<void> {
    const entry = this.worktrees.get(paneId)
    if (!entry) return

    await this.forceRemoveWorktree(entry.path)

    try {
      await this.git.raw(['branch', '-D', entry.branch])
    } catch {
      // Branch may not exist
    }

    this.worktrees.delete(paneId)
  }

  /**
   * Get diffs for a worktree pane relative to its base branch.
   */
  async getDiffs(paneId: string): Promise<{ file: string; status: string; hunks: string }[]> {
    const entry = this.worktrees.get(paneId)
    if (!entry) return []

    const wtGit = simpleGit(entry.path)
    const diffs: { file: string; status: string; hunks: string }[] = []

    try {
      // Get status in the worktree (uncommitted changes)
      const status = await wtGit.status()

      // Also get committed changes vs base branch
      const committedDiff = await wtGit.diff([`${entry.baseBranch}...HEAD`]).catch(() => '')
      const uncommittedDiff = await wtGit.diff()
      const stagedDiff = await wtGit.diff(['--cached'])
      const combinedDiff = [committedDiff, uncommittedDiff, stagedDiff].filter(Boolean).join('\n')

      // Collect all changed files
      const allFiles = new Set<string>()
      const fileStatuses = new Map<string, string>()

      // From committed diff vs base
      if (committedDiff) {
        const parsed = this.parseFileDiffs(committedDiff)
        for (const [file] of parsed) {
          allFiles.add(file)
          fileStatuses.set(file, 'modified')
        }
      }

      // From working tree status
      for (const file of status.created) {
        allFiles.add(file)
        fileStatuses.set(file, 'added')
      }
      for (const file of status.modified) {
        allFiles.add(file)
        if (!fileStatuses.has(file)) fileStatuses.set(file, 'modified')
      }
      for (const file of status.deleted) {
        allFiles.add(file)
        fileStatuses.set(file, 'deleted')
      }
      for (const file of status.renamed) {
        allFiles.add(file.to)
        fileStatuses.set(file.to, 'renamed')
      }
      for (const file of status.staged) {
        if (!allFiles.has(file)) {
          allFiles.add(file)
          fileStatuses.set(file, 'modified')
        }
      }

      // Parse hunks
      const hunkMap = combinedDiff ? this.parseFileDiffs(combinedDiff) : new Map<string, string>()

      for (const file of allFiles) {
        diffs.push({
          file,
          status: fileStatuses.get(file) || 'modified',
          hunks: hunkMap.get(file) || '',
        })
      }
    } catch (err) {
      console.warn(`[WorktreeManager] getDiffs failed for ${paneId}:`, (err as Error).message)
    }

    return diffs
  }

  /**
   * Merge the worktree branch into the base branch (e.g. main).
   * First commits any uncommitted changes in the worktree, then merges.
   */
  async merge(paneId: string): Promise<{ success: boolean; message: string }> {
    const entry = this.worktrees.get(paneId)
    if (!entry) {
      return { success: false, message: 'Worktree not found for this pane' }
    }

    const wtGit = simpleGit(entry.path)

    try {
      // Auto-commit any uncommitted changes in the worktree
      const status = await wtGit.status()
      const hasChanges = status.modified.length > 0 || status.created.length > 0
        || status.deleted.length > 0 || status.staged.length > 0
        || status.not_added.length > 0

      if (hasChanges) {
        await wtGit.add('-A')
        await wtGit.commit(`nexus: auto-commit before merge (${entry.branch})`)
      }

      // Check if there are any commits to merge
      const log = await wtGit.log([`${entry.baseBranch}..${entry.branch}`])
      if (log.total === 0) {
        return { success: false, message: 'No changes to merge' }
      }

      // Merge from main repo (not worktree) to avoid "can't merge into checked-out branch" issue
      await this.git.merge([entry.branch])

      return {
        success: true,
        message: `Merged ${log.total} commit${log.total !== 1 ? 's' : ''} from ${entry.branch} into ${entry.baseBranch}`,
      }
    } catch (err) {
      // If merge failed due to conflict, abort it
      try {
        await this.git.merge(['--abort'])
      } catch {
        // ignore abort failure
      }
      return {
        success: false,
        message: `Merge conflict: ${(err as Error).message}`,
      }
    }
  }

  /**
   * Discard all changes: remove worktree and delete the branch.
   */
  async discard(paneId: string): Promise<{ success: boolean; message: string }> {
    const entry = this.worktrees.get(paneId)
    if (!entry) {
      return { success: false, message: 'Worktree not found for this pane' }
    }

    const branch = entry.branch
    await this.forceRemoveWorktree(entry.path)

    try {
      await this.git.raw(['branch', '-D', branch])
    } catch {
      // Branch may not exist
    }

    this.worktrees.delete(paneId)
    return { success: true, message: `Discarded branch ${branch}` }
  }

  getWorktreePath(paneId: string): string | undefined {
    return this.worktrees.get(paneId)?.path
  }

  getBranch(paneId: string): string | undefined {
    return this.worktrees.get(paneId)?.branch
  }

  getBaseBranch(paneId: string): string | undefined {
    return this.worktrees.get(paneId)?.baseBranch
  }

  has(paneId: string): boolean {
    return this.worktrees.has(paneId)
  }

  /**
   * Clean up all worktrees on shutdown.
   */
  async removeAll(): Promise<void> {
    for (const [paneId] of this.worktrees) {
      await this.remove(paneId)
    }
  }

  private async getCurrentBranch(): Promise<string> {
    try {
      const branch = await this.git.revparse(['--abbrev-ref', 'HEAD'])
      return branch.trim() || 'HEAD'
    } catch {
      return 'HEAD'
    }
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30)
  }

  private async forceRemoveWorktree(wtPath: string): Promise<void> {
    try {
      await this.git.raw(['worktree', 'remove', '--force', wtPath])
    } catch {
      // Worktree may already be gone; clean up directory manually
      try {
        fs.rmSync(wtPath, { recursive: true, force: true })
        await this.git.raw(['worktree', 'prune'])
      } catch {
        // Best effort
      }
    }
  }

  private parseFileDiffs(diffText: string): Map<string, string> {
    const result = new Map<string, string>()
    const fileSections = diffText.split(/^diff --git /m).filter(Boolean)

    for (const section of fileSections) {
      const headerMatch = section.match(/^a\/(.+?) b\/(.+)/)
      if (!headerMatch) continue
      const filename = headerMatch[2]
      result.set(filename, `diff --git ${section}`)
    }

    return result
  }
}

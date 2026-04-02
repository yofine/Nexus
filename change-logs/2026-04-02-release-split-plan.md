# 2026-04-02 Release Split Plan

## Goal

Prepare a release that includes only bug fixes and small UX upgrades, while isolating larger migration and feature work onto a separate branch.

## Scope Classification

### Keep On `main`

- Review panel UX:
  - `packages/web/src/components/GitDiffPanel.tsx`
  - `packages/web/src/stores/workspaceStore.ts`
- Settings UX:
  - `packages/web/src/components/SettingsDialog.tsx`
  - `packages/web/src/styles/globals.css`
- Small runtime fixes:
  - `packages/server/src/pty/PtyManager.ts`
  - `packages/server/src/git/GitService.ts`
  - `packages/server/src/git/WorktreeManager.ts`

### Move To Separate Branch

- Branding and command rename:
  - `package.json`
  - `packages/server/package.json`
  - `packages/server/src/cli.ts`
- Workspace directory migration `.nexus` -> `.mexus`:
  - `packages/server/src/workspace/paths.ts`
  - `packages/server/src/workspace/ConfigManager.ts`
  - `packages/server/src/workspace/AgentsYamlWriter.ts`
  - `packages/server/src/history/SessionRecorder.ts`
  - `packages/server/src/index.ts`
  - `packages/server/src/deps/DependencyAnalyzer.ts`
  - `packages/server/src/fs/FsWatcher.ts`
  - `packages/server/src/pty/ActivityParser.ts`
  - `packages/server/src/git/GitService.ts`
  - `packages/server/src/git/WorktreeManager.ts`
- ACP chat/runtime feature work:
  - `packages/server/src/runtime/AcpRuntime.ts`
  - `packages/web/src/components/AgentPane.tsx`
  - `packages/web/src/components/ConversationPane.tsx`
- Documentation and design rename/update set:
  - `BLUEPRINT.md`
  - `CLAUDE.md`
  - `README.md`
  - `design/*`
  - `docs/*`
  - `packages/server/src/comm/DESIGN.md`

## Execution Steps

1. Save backups of all files classified as major changes.
2. Restore `main` working tree to only the files in the "Keep On `main`" section.
3. Fix the known `reviewedFiles` invalidation bug and the settings env draft reset bug before commit.
4. Run validation for the release scope.
5. Commit release-safe changes on `main`.
6. Create a new branch from that commit for major changes.
7. Re-apply the backed-up major-change files onto the new branch.
8. Validate the major branch still contains the intended migration/feature set.
9. Commit the major branch.

## Validation Checklist

### `main`

- `git diff --name-only HEAD~1..HEAD` only contains release-safe files plus this log.
- `pnpm -C packages/web exec tsc --noEmit` succeeds.
- `pnpm --filter @nexus/server build` succeeds.
- `git diff --name-only` does not include branding rename docs or `.mexus` migration files.

### Major Branch

- `git diff --name-only main..HEAD` includes the rename/migration/ACP files listed above.
- `packages/server/src/workspace/paths.ts` exists.
- `packages/web/src/components/ConversationPane.tsx` exists.

## Rollback Plan

### If `main` split is wrong before commit

1. Restore files from the backup directory in `/tmp`.
2. Re-run the classification and adjust the log before committing.

### If `main` commit is wrong after commit

1. Create a safety branch from the bad commit:
   - `git branch backup/release-split-main-<timestamp>`
2. Revert the commit:
   - `git revert <main-commit>`
3. Re-apply the intended release-safe changes from the backup directory or by cherry-picking a corrected commit.

### If the major branch split is wrong before commit

1. Reset the working tree on the major branch to the branch tip:
   - `git restore --worktree --staged .`
2. Re-copy only the files listed in the "Move To Separate Branch" section from backup.

### If the major branch commit is wrong after commit

1. Create a safety branch from the bad state:
   - `git branch backup/release-split-major-<timestamp>`
2. Revert the bad commit on the major branch:
   - `git revert <major-commit>`
3. Re-apply the intended major-only files from backup and recommit.

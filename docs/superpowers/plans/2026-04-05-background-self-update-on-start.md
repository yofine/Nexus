# Background Self-Update On Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `nexus start` trigger a detached npm self-update check in the background without blocking startup or restarting the running CLI, so the next launch picks up the new version.

**Architecture:** Keep the main CLI startup path synchronous and fast. After `startServer()` succeeds, fire a detached child process that runs a small self-update subcommand; that subcommand checks npm, installs `mexus-cli@latest` when needed, and exits silently. Use a simple timestamp lock under `~/.nexus/` to avoid launching repeated update checks on every start.

**Tech Stack:** Node.js 22, TypeScript, Vitest, child_process, fs, path

---

### Task 1: Add failing tests for background-update gating and throttling

**Files:**
- Modify: `packages/server/src/cli.selfUpdate.test.ts`
- Modify: `packages/server/src/cli.ts`
- Test: `packages/server/src/cli.selfUpdate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('only schedules background self-update for the start command', () => {
  expect(shouldScheduleBackgroundSelfUpdate({ command: 'start', alreadyUpdated: false })).toBe(true)
  expect(shouldScheduleBackgroundSelfUpdate({ command: 'status', alreadyUpdated: false })).toBe(false)
})

it('skips when the throttle window has not expired', () => {
  expect(shouldRunBackgroundSelfUpdate({ now: 2000, lastRunAt: 1500, throttleMs: 1000 })).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/server test -- cli.selfUpdate.test.ts`
Expected: FAIL because the background scheduling helpers do not exist yet

- [ ] **Step 3: Write minimal implementation**

```ts
export function shouldScheduleBackgroundSelfUpdate(input: { command: string; alreadyUpdated: boolean }): boolean {
  return input.command === 'start' && !input.alreadyUpdated
}

export function shouldRunBackgroundSelfUpdate(input: { now: number; lastRunAt: number | null; throttleMs: number }): boolean {
  if (input.lastRunAt == null) return true
  return input.now - input.lastRunAt >= input.throttleMs
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/server test -- cli.selfUpdate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-04-05-background-self-update-on-start.md packages/server/src/cli.selfUpdate.test.ts packages/server/src/cli.ts
git commit -m "test: cover background self-update scheduling"
```

### Task 2: Add failing tests for detached update launch and no-restart update execution

**Files:**
- Modify: `packages/server/src/cli.selfUpdate.test.ts`
- Modify: `packages/server/src/cli.ts`
- Test: `packages/server/src/cli.selfUpdate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('spawns a detached self-update process after start', async () => {
  const spawns: Array<{ command: string; args: string[] }> = []
  await launchBackgroundSelfUpdate({
    cliPath: '/usr/local/lib/node_modules/mexus-cli/packages/server/dist/cli.mjs',
    execPath: '/usr/bin/node',
    env: { PATH: '/usr/bin' },
    spawnProcess: async (command, args) => {
      spawns.push({ command, args })
      return true
    },
  })
  expect(spawns).toEqual([{ command: '/usr/bin/node', args: ['/usr/local/lib/node_modules/mexus-cli/packages/server/dist/cli.mjs', '__self-update'] }])
})

it('runs npm install but does not restart the current cli', async () => {
  const result = await runSelfUpdateCommand({
    packageName: 'mexus-cli',
    currentVersion: '2.0.0',
    runCommand: async (_command, commandArgs) => (
      commandArgs.includes('view')
        ? { exitCode: 0, stdout: '"2.0.1"', stderr: '' }
        : { exitCode: 0, stdout: '', stderr: '' }
    ),
  })
  expect(result.action).toBe('updated')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/server test -- cli.selfUpdate.test.ts`
Expected: FAIL because detached launch and no-restart update execution are not implemented yet

- [ ] **Step 3: Write minimal implementation**

```ts
export async function launchBackgroundSelfUpdate(...) {
  await spawnProcess(execPath, [cliPath, '__self-update'])
}

export async function runSelfUpdateCommand(...) {
  const latest = await runCommand('npm', ['view', packageName, 'version', '--json'])
  if (compareVersions(currentVersion, latestVersion) < 0) {
    await runCommand('npm', ['install', '-g', `${packageName}@latest`])
    return { action: 'updated' }
  }
  return { action: 'skipped' }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/server test -- cli.selfUpdate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/cli.selfUpdate.test.ts packages/server/src/cli.ts
git commit -m "feat: move self-update to detached background flow"
```

### Task 3: Wire the `start` command and verify regression safety

**Files:**
- Modify: `packages/server/src/cli.ts`
- Test: `packages/server/src/cli.selfUpdate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('skips detached launch when the throttle file is fresh', async () => {
  const spawnProcess = vi.fn(async () => true)
  await maybeStartBackgroundSelfUpdate({
    command: 'start',
    now: 2000,
    lastRunAt: 1500,
    throttleMs: 1000,
    spawnProcess,
  })
  expect(spawnProcess).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/server test -- cli.selfUpdate.test.ts`
Expected: FAIL because start wiring still follows the old synchronous update path

- [ ] **Step 3: Write minimal implementation**

```ts
if (command === 'start') {
  await startServer(...)
  void maybeStartBackgroundSelfUpdate(...)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/server test -- cli.selfUpdate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/cli.ts packages/server/src/cli.selfUpdate.test.ts
git commit -m "test: verify non-blocking self-update on start"
```

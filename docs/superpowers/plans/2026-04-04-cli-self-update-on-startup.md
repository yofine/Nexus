# CLI Self-Update On Startup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `nexus` check npm for a newer published version at process startup, silently install it when available, then continue startup on the updated CLI.

**Architecture:** Add a small self-update module around the CLI entrypoint so version lookup, environment gating, and child-process spawning are testable without booting the server. The startup path remains best-effort: failures to check or install updates only warn and continue with the current version.

**Tech Stack:** Node.js 22, TypeScript, Vitest, child_process

---

### Task 1: Add failing tests for self-update decision logic

**Files:**
- Create: `packages/server/src/cli.selfUpdate.test.ts`
- Modify: `packages/server/src/cli.ts`
- Test: `packages/server/src/cli.selfUpdate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { compareVersions, shouldSkipSelfUpdate } from './cli.ts'

describe('compareVersions', () => {
  it('treats a newer published version as newer', () => {
    expect(compareVersions('1.0.5', '1.0.6')).toBeLessThan(0)
  })
})

describe('shouldSkipSelfUpdate', () => {
  it('skips in development tsx mode', () => {
    expect(shouldSkipSelfUpdate({
      alreadyUpdated: false,
      packageName: 'nexus-console',
      entryFile: '/repo/packages/server/src/cli.ts',
      execPath: '/usr/bin/node',
    })).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/server test -- cli.selfUpdate.test.ts`
Expected: FAIL with missing exports or missing behavior

- [ ] **Step 3: Write minimal implementation**

```ts
export function compareVersions(current: string, latest: string): number {
  return current.localeCompare(latest, undefined, { numeric: true, sensitivity: 'base' })
}

export function shouldSkipSelfUpdate(input: {
  alreadyUpdated: boolean
  packageName: string
  entryFile: string
  execPath: string
}): boolean {
  return input.alreadyUpdated || input.entryFile.endsWith('.ts')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/server test -- cli.selfUpdate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-04-04-cli-self-update-on-startup.md packages/server/src/cli.selfUpdate.test.ts packages/server/src/cli.ts
git commit -m "test: cover cli self-update decision logic"
```

### Task 2: Add failing tests for update command orchestration

**Files:**
- Modify: `packages/server/src/cli.selfUpdate.test.ts`
- Modify: `packages/server/src/cli.ts`
- Test: `packages/server/src/cli.selfUpdate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('builds npm view and npm install commands for the published package', async () => {
  const commands: string[][] = []
  await maybeSelfUpdate({
    args: ['start'],
    env: {},
    packageName: 'nexus-console',
    currentVersion: '1.0.5',
    entryFile: '/usr/local/lib/node_modules/nexus-console/packages/server/dist/cli.mjs',
    runCommand: async (command, commandArgs) => {
      commands.push([command, ...commandArgs])
      return commandArgs.includes('view')
        ? { exitCode: 0, stdout: '"1.0.6"', stderr: '' }
        : { exitCode: 0, stdout: '', stderr: '' }
    },
    spawnUpdatedCli: async () => 0,
  })

  expect(commands).toEqual([
    ['npm', 'view', 'nexus-console', 'version', '--json'],
    ['npm', 'install', '-g', 'nexus-console@latest'],
  ])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/server test -- cli.selfUpdate.test.ts`
Expected: FAIL because `maybeSelfUpdate()` does not yet coordinate commands

- [ ] **Step 3: Write minimal implementation**

```ts
const latestResult = await runCommand('npm', ['view', packageName, 'version', '--json'])
if (compareVersions(currentVersion, latestVersion) < 0) {
  await runCommand('npm', ['install', '-g', `${packageName}@latest`], { stdio: 'inherit' })
  await spawnUpdatedCli(args, { ...env, NEXUS_SELF_UPDATED: '1' })
  return { action: 'restarted' }
}
return { action: 'continued' }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/server test -- cli.selfUpdate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/cli.selfUpdate.test.ts packages/server/src/cli.ts
git commit -m "feat: add npm self-update startup flow"
```

### Task 3: Wire the CLI entrypoint and verify regression safety

**Files:**
- Modify: `packages/server/src/cli.ts`
- Test: `packages/server/src/cli.selfUpdate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('continues startup when npm version check fails', async () => {
  const result = await maybeSelfUpdate({
    args: ['start'],
    env: {},
    packageName: 'nexus-console',
    currentVersion: '1.0.5',
    entryFile: '/usr/local/lib/node_modules/nexus-console/packages/server/dist/cli.mjs',
    runCommand: async () => ({ exitCode: 1, stdout: '', stderr: 'network error' }),
    spawnUpdatedCli: async () => 0,
  })

  expect(result.action).toBe('continued')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/server test -- cli.selfUpdate.test.ts`
Expected: FAIL because check failures are not handled as best-effort

- [ ] **Step 3: Write minimal implementation**

```ts
try {
  const updateResult = await maybeSelfUpdate(...)
  if (updateResult.action === 'restarted') return
} catch (error) {
  console.warn('[nexus] self-update skipped:', (error as Error).message)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/server test -- cli.selfUpdate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/cli.ts packages/server/src/cli.selfUpdate.test.ts
git commit -m "test: verify cli self-update fallback behavior"
```

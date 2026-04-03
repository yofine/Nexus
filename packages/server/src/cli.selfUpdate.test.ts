import { describe, expect, it, vi } from 'vitest'
import {
  compareVersions,
  maybeSelfUpdate,
  shouldSkipSelfUpdate,
} from './cli.ts'

describe('compareVersions', () => {
  it('treats a newer published version as newer', () => {
    expect(compareVersions('1.0.5', '1.0.6')).toBeLessThan(0)
    expect(compareVersions('1.0.5', '1.0.5')).toBe(0)
    expect(compareVersions('1.0.6', '1.0.5')).toBeGreaterThan(0)
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

  it('does not skip for a published global install', () => {
    expect(shouldSkipSelfUpdate({
      alreadyUpdated: false,
      packageName: 'nexus-console',
      entryFile: '/usr/local/lib/node_modules/nexus-console/packages/server/dist/cli.mjs',
      execPath: '/usr/bin/node',
    })).toBe(false)
  })
})

describe('maybeSelfUpdate', () => {
  it('builds npm view and npm install commands for the published package', async () => {
    const commands: string[][] = []
    const spawnUpdatedCli = vi.fn(async () => 0)

    const result = await maybeSelfUpdate({
      args: ['start'],
      env: {},
      packageName: 'nexus-console',
      currentVersion: '1.0.5',
      entryFile: '/usr/local/lib/node_modules/nexus-console/packages/server/dist/cli.mjs',
      execPath: '/usr/bin/node',
      runCommand: async (command, commandArgs) => {
        commands.push([command, ...commandArgs])
        return commandArgs.includes('view')
          ? { exitCode: 0, stdout: '"1.0.6"', stderr: '' }
          : { exitCode: 0, stdout: '', stderr: '' }
      },
      spawnUpdatedCli,
    })

    expect(result.action).toBe('restarted')
    expect(commands).toEqual([
      ['npm', 'view', 'nexus-console', 'version', '--json'],
      ['npm', 'install', '-g', 'nexus-console@latest'],
    ])
    expect(spawnUpdatedCli).toHaveBeenCalledWith(['start'], {
      NEXUS_SELF_UPDATED: '1',
    })
  })

  it('continues startup when npm version check fails', async () => {
    const result = await maybeSelfUpdate({
      args: ['start'],
      env: {},
      packageName: 'nexus-console',
      currentVersion: '1.0.5',
      entryFile: '/usr/local/lib/node_modules/nexus-console/packages/server/dist/cli.mjs',
      execPath: '/usr/bin/node',
      runCommand: async () => ({ exitCode: 1, stdout: '', stderr: 'network error' }),
      spawnUpdatedCli: async () => 0,
    })

    expect(result.action).toBe('continued')
  })
})

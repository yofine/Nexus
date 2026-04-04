import { describe, expect, it, vi } from 'vitest'
import {
  compareVersions,
  getCliCommandName,
  launchBackgroundSelfUpdate,
  maybeStartBackgroundSelfUpdate,
  runSelfUpdateCommand,
  shouldRunBackgroundSelfUpdate,
  shouldScheduleBackgroundSelfUpdate,
} from './cli.ts'

describe('compareVersions', () => {
  it('treats a newer published version as newer', () => {
    expect(compareVersions('2.0.0', '2.0.1')).toBeLessThan(0)
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0)
    expect(compareVersions('2.0.1', '2.0.0')).toBeGreaterThan(0)
  })
})

describe('getCliCommandName', () => {
  it('uses mexus as the default command name', () => {
    expect(getCliCommandName(undefined)).toBe('mexus')
  })

  it('preserves known command aliases from the invoked binary name', () => {
    expect(getCliCommandName('/usr/local/bin/mexus')).toBe('mexus')
    expect(getCliCommandName('/usr/local/bin/nexus')).toBe('nexus')
  })
})

describe('background self-update scheduling', () => {
  it('only schedules background self-update for the start command', () => {
    expect(shouldScheduleBackgroundSelfUpdate({ command: 'start', alreadyUpdated: false })).toBe(true)
    expect(shouldScheduleBackgroundSelfUpdate({ command: 'status', alreadyUpdated: false })).toBe(false)
    expect(shouldScheduleBackgroundSelfUpdate({ command: 'start', alreadyUpdated: true })).toBe(false)
  })

  it('skips when the throttle window has not expired', () => {
    expect(shouldRunBackgroundSelfUpdate({ now: 2000, lastRunAt: 1500, throttleMs: 1000 })).toBe(false)
    expect(shouldRunBackgroundSelfUpdate({ now: 3000, lastRunAt: 1500, throttleMs: 1000 })).toBe(true)
    expect(shouldRunBackgroundSelfUpdate({ now: 3000, lastRunAt: null, throttleMs: 1000 })).toBe(true)
  })
})

describe('launchBackgroundSelfUpdate', () => {
  it('spawns a detached self-update process after start', async () => {
    const spawns: Array<{ command: string; args: string[] }> = []

    const launched = await launchBackgroundSelfUpdate({
      cliPath: '/usr/local/lib/node_modules/mexus-cli/packages/server/dist/cli.mjs',
      execPath: '/usr/bin/node',
      env: { PATH: '/usr/bin' },
      spawnProcess: async (command, args) => {
        spawns.push({ command, args })
        return true
      },
    })

    expect(launched).toBe(true)
    expect(spawns).toEqual([
      {
        command: '/usr/bin/node',
        args: ['/usr/local/lib/node_modules/mexus-cli/packages/server/dist/cli.mjs', '__self-update'],
      },
    ])
  })
})

describe('runSelfUpdateCommand', () => {
  it('runs npm install but does not restart the current cli', async () => {
    const commands: string[][] = []

    const result = await runSelfUpdateCommand({
      packageName: 'mexus-cli',
      currentVersion: '2.0.0',
      runCommand: async (command, commandArgs) => {
        commands.push([command, ...commandArgs])
        return commandArgs.includes('view')
          ? { exitCode: 0, stdout: '"2.0.1"', stderr: '' }
          : { exitCode: 0, stdout: '', stderr: '' }
      },
    })

    expect(result.action).toBe('updated')
    expect(commands).toEqual([
      ['npm', 'view', 'mexus-cli', 'version', '--json'],
      ['npm', 'install', '-g', 'mexus-cli@latest'],
    ])
  })

  it('continues silently when version check fails', async () => {
    const result = await runSelfUpdateCommand({
      packageName: 'mexus-cli',
      currentVersion: '2.0.0',
      runCommand: async () => ({ exitCode: 1, stdout: '', stderr: 'network error' }),
    })

    expect(result.action).toBe('skipped')
  })
})

describe('maybeStartBackgroundSelfUpdate', () => {
  it('skips detached launch when the throttle file is fresh', async () => {
    const spawnProcess = vi.fn(async () => true)

    const launched = await maybeStartBackgroundSelfUpdate({
      command: 'start',
      alreadyUpdated: false,
      now: 2000,
      lastRunAt: 1500,
      throttleMs: 1000,
      cliPath: '/usr/local/lib/node_modules/mexus-cli/packages/server/dist/cli.mjs',
      execPath: '/usr/bin/node',
      env: {},
      readLastRunAt: async () => 1500,
      writeLastRunAt: async () => {},
      spawnProcess,
    })

    expect(launched).toBe(false)
    expect(spawnProcess).not.toHaveBeenCalled()
  })
})

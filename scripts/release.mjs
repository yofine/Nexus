import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const VALID_BUMPS = new Set(['patch', 'minor', 'major'])

export function parseReleaseArgs(args) {
  const [bump, ...flags] = args
  if (!VALID_BUMPS.has(bump)) {
    throw new Error('Expected one of: patch, minor, major')
  }

  let dryRun = false
  for (const flag of flags) {
    if (flag === '--dry-run') {
      dryRun = true
      continue
    }
    throw new Error(`Unknown flag: ${flag}`)
  }

  return { bump, dryRun }
}

export function buildReleasePlan({ bump, dryRun }) {
  return [
    ['git', 'status', '--porcelain'],
    ['pnpm', 'run', 'build'],
    ['npm', 'version', bump],
    dryRun ? ['npm', 'publish', '--dry-run'] : ['npm', 'publish'],
  ]
}

function runCommand(command, cwd) {
  const [bin, ...args] = command
  const result = spawnSync(bin, args, {
    cwd,
    stdio: 'inherit',
  })

  if (typeof result.status === 'number') {
    return result.status
  }
  return 1
}

function ensureCleanWorktree(cwd) {
  const result = spawnSync('git', ['status', '--porcelain'], {
    cwd,
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    throw new Error('Failed to check git status')
  }

  if (result.stdout.trim().length > 0) {
    throw new Error('Refusing to release with uncommitted changes')
  }
}

function main() {
  const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const options = parseReleaseArgs(process.argv.slice(2))
  const plan = buildReleasePlan(options)

  ensureCleanWorktree(cwd)

  for (const command of plan.slice(1)) {
    const exitCode = runCommand(command, cwd)
    if (exitCode !== 0) {
      process.exit(exitCode)
    }
  }
}

const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntryPoint) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

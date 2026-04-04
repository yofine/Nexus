import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { startServer } from './index.ts'

type RunCommandResult = {
  exitCode: number
  stdout: string
  stderr: string
}

type SelfUpdateCommandOptions = {
  packageName: string
  currentVersion: string
  runCommand?: (command: string, args: string[]) => Promise<RunCommandResult>
}

type LaunchBackgroundSelfUpdateOptions = {
  cliPath: string
  execPath: string
  env: NodeJS.ProcessEnv
  spawnProcess?: (command: string, args: string[], env: NodeJS.ProcessEnv) => Promise<boolean>
}

type MaybeStartBackgroundSelfUpdateOptions = {
  command: string
  alreadyUpdated: boolean
  now: number
  lastRunAt?: number | null
  throttleMs: number
  cliPath: string
  execPath: string
  env: NodeJS.ProcessEnv
  readLastRunAt?: () => Promise<number | null>
  writeLastRunAt?: (timestamp: number) => Promise<void>
  spawnProcess?: (command: string, args: string[], env: NodeJS.ProcessEnv) => Promise<boolean>
}

type SelfUpdateResult = {
  action: 'skipped' | 'updated'
}

const SELF_UPDATED_ENV = 'NEXUS_SELF_UPDATED'
const ROOT_PACKAGE_JSON = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../package.json')
const SELF_UPDATE_COMMAND = '__self-update'
const SELF_UPDATE_THROTTLE_MS = 10 * 60 * 1000
const SELF_UPDATE_STATE_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.nexus',
  'self-update-check.json',
)

function loadPublishedPackageMeta(): { name: string; version: string } {
  const raw = fs.readFileSync(ROOT_PACKAGE_JSON, 'utf-8')
  const pkg = JSON.parse(raw) as { name?: string; version?: string }
  return {
    name: pkg.name || 'nexus-console',
    version: pkg.version || '0.0.0',
  }
}

export function getCliCommandName(invokedPath?: string): 'mexus' | 'nexus' {
  const binaryName = invokedPath ? path.basename(invokedPath).toLowerCase() : ''
  return binaryName === 'nexus' ? 'nexus' : 'mexus'
}

async function runCommand(command: string, args: string[]): Promise<RunCommandResult> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => {
      resolve({ exitCode: 1, stdout, stderr: error.message })
    })
    child.on('close', (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stdout, stderr })
    })
  })
}

async function spawnDetachedProcess(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<boolean> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
      env,
      detached: true,
    })

    child.on('error', () => resolve(false))
    child.unref()
    resolve(true)
  })
}

function parseLatestVersion(stdout: string): string | null {
  const trimmed = stdout.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed) as string
    return typeof parsed === 'string' ? parsed : null
  } catch {
    return trimmed.replace(/^"+|"+$/g, '')
  }
}

async function readSelfUpdateLastRunAt(): Promise<number | null> {
  try {
    const raw = await fs.promises.readFile(SELF_UPDATE_STATE_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as { lastRunAt?: number }
    return typeof parsed.lastRunAt === 'number' ? parsed.lastRunAt : null
  } catch {
    return null
  }
}

async function writeSelfUpdateLastRunAt(timestamp: number): Promise<void> {
  await fs.promises.mkdir(path.dirname(SELF_UPDATE_STATE_FILE), { recursive: true })
  await fs.promises.writeFile(
    SELF_UPDATE_STATE_FILE,
    JSON.stringify({ lastRunAt: timestamp }),
    'utf-8',
  )
}

export function compareVersions(current: string, latest: string): number {
  const currentParts = current.split('.').map((part) => parseInt(part, 10) || 0)
  const latestParts = latest.split('.').map((part) => parseInt(part, 10) || 0)
  const length = Math.max(currentParts.length, latestParts.length)

  for (let index = 0; index < length; index++) {
    const left = currentParts[index] ?? 0
    const right = latestParts[index] ?? 0
    if (left !== right) return left - right
  }

  return 0
}

export function shouldScheduleBackgroundSelfUpdate(input: {
  command: string
  alreadyUpdated: boolean
}): boolean {
  return input.command === 'start' && !input.alreadyUpdated
}

export function shouldRunBackgroundSelfUpdate(input: {
  now: number
  lastRunAt: number | null
  throttleMs: number
}): boolean {
  if (input.lastRunAt == null) return true
  return input.now - input.lastRunAt >= input.throttleMs
}

export async function launchBackgroundSelfUpdate(
  options: LaunchBackgroundSelfUpdateOptions,
): Promise<boolean> {
  const spawnProcess = options.spawnProcess ?? spawnDetachedProcess
  return await spawnProcess(
    options.execPath,
    [options.cliPath, SELF_UPDATE_COMMAND],
    {
      ...options.env,
      [SELF_UPDATED_ENV]: '1',
    },
  )
}

export async function maybeStartBackgroundSelfUpdate(
  options: MaybeStartBackgroundSelfUpdateOptions,
): Promise<boolean> {
  if (!shouldScheduleBackgroundSelfUpdate({
    command: options.command,
    alreadyUpdated: options.alreadyUpdated,
  })) {
    return false
  }

  const readLastRunAt = options.readLastRunAt ?? readSelfUpdateLastRunAt
  const writeLastRunAt = options.writeLastRunAt ?? writeSelfUpdateLastRunAt
  const lastRunAt = options.lastRunAt ?? await readLastRunAt()
  if (!shouldRunBackgroundSelfUpdate({
    now: options.now,
    lastRunAt,
    throttleMs: options.throttleMs,
  })) {
    return false
  }

  await writeLastRunAt(options.now)
  return await launchBackgroundSelfUpdate({
    cliPath: options.cliPath,
    execPath: options.execPath,
    env: options.env,
    spawnProcess: options.spawnProcess,
  })
}

export async function runSelfUpdateCommand(
  options: SelfUpdateCommandOptions,
): Promise<SelfUpdateResult> {
  const execRunCommand = options.runCommand ?? runCommand
  const latestResult = await execRunCommand('npm', ['view', options.packageName, 'version', '--json'])
  if (latestResult.exitCode !== 0) {
    return { action: 'skipped' }
  }

  const latestVersion = parseLatestVersion(latestResult.stdout)
  if (!latestVersion || compareVersions(options.currentVersion, latestVersion) >= 0) {
    return { action: 'skipped' }
  }

  const installResult = await execRunCommand('npm', ['install', '-g', `${options.packageName}@latest`])
  if (installResult.exitCode !== 0) {
    return { action: 'skipped' }
  }

  return { action: 'updated' }
}

// Check Node.js version — node-pty requires Node 22+
const nodeVersion = parseInt(process.versions.node.split('.')[0], 10)
if (nodeVersion < 22) {
  console.error(`Error: Nexus requires Node.js >= 22, but you are running v${process.versions.node}`)
  console.error(`  Please upgrade: nvm install 22 && nvm use 22`)
  process.exit(1)
}

// Clean up parent session env so spawned PTYs don't detect nesting
delete process.env.CLAUDECODE
delete process.env.CLAUDE_CODE
delete process.env.CLAUDE_CODE_ENTRYPOINT

const DEFAULT_PORT = 7700

function printUsage(commandName: string) {
  console.log(`
  Usage: ${commandName} [command] [directory]

  Commands:
    start [dir]    Start the Nexus server (default)
    init  [dir]    Initialize .nexus/ config in a project
    status [dir]   Show workspace status
    stop           Stop the running server

  Arguments:
    dir            Path to the project directory (defaults to cwd)

  Environment:
    NEXUS_PORT     Server port (default: ${DEFAULT_PORT})

  Examples:
    ${commandName}                        # Start in current directory
    ${commandName} ~/projects/my-app      # Start with a specific project
    ${commandName} start ~/projects/app   # Explicit start command
    ${commandName} init .                 # Initialize config in cwd
`.trimEnd())
}

function findProjectRoot(startDir: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || ''

  // Walk up from startDir, prefer the highest-level match
  // (monorepo root, not a nested package)
  // Stop at HOME — never go above it
  let dir = startDir
  let bestMatch = startDir

  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir // pnpm monorepo root is definitive
    }
    if (
      fs.existsSync(path.join(dir, '.git')) ||
      fs.existsSync(path.join(dir, '.nexus'))
    ) {
      bestMatch = dir
    }
    const parent = path.dirname(dir)
    // Don't traverse above HOME directory
    if (home && parent === home && dir !== startDir) break
    dir = parent
  }

  // Warn if resolved to HOME — likely a mistake
  if (home && bestMatch === home && startDir === home) {
    console.warn(`Warning: Running Nexus in HOME directory (${home}).`)
    console.warn(`  Consider: nexus <project-path>`)
  }

  return bestMatch
}

function resolveProjectDir(dirArg?: string): string {
  if (process.env.NEXUS_PROJECT_DIR) {
    return path.resolve(process.env.NEXUS_PROJECT_DIR)
  }
  if (dirArg) {
    const resolved = path.resolve(dirArg)
    if (!fs.existsSync(resolved)) {
      console.error(`Error: directory does not exist: ${resolved}`)
      process.exit(1)
    }
    if (!fs.statSync(resolved).isDirectory()) {
      console.error(`Error: not a directory: ${resolved}`)
      process.exit(1)
    }
    return resolved
  }
  return findProjectRoot(process.cwd())
}

const COMMANDS = new Set(['start', 'init', 'status', 'stop', 'help', SELF_UPDATE_COMMAND])

async function main() {
  const args = process.argv.slice(2)
  const packageMeta = loadPublishedPackageMeta()
  const commandName = getCliCommandName(process.argv[1])

  // Parse command and directory argument
  // Support: nexus <dir>, nexus <cmd> <dir>, nexus <cmd>
  let command: string
  let dirArg: string | undefined

  if (args.length === 0) {
    command = 'start'
  } else if (args[0] === '--help' || args[0] === '-h') {
    command = 'help'
  } else if (COMMANDS.has(args[0])) {
    command = args[0]
    dirArg = args[1]
  } else {
    // First arg is not a known command — treat it as a directory
    command = 'start'
    dirArg = args[0]
  }

  if (command === 'help') {
    printUsage(commandName)
    return
  }

  if (command === SELF_UPDATE_COMMAND) {
    await runSelfUpdateCommand({
      packageName: packageMeta.name,
      currentVersion: packageMeta.version,
    })
    return
  }

  const projectDir = resolveProjectDir(dirArg)

  switch (command) {
    case 'start': {
      const port = parseInt(process.env.NEXUS_PORT || String(DEFAULT_PORT), 10)
      await startServer(port, projectDir)
      void maybeStartBackgroundSelfUpdate({
        command,
        alreadyUpdated: process.env[SELF_UPDATED_ENV] === '1',
        now: Date.now(),
        throttleMs: SELF_UPDATE_THROTTLE_MS,
        cliPath: fileURLToPath(import.meta.url),
        execPath: process.execPath,
        env: process.env,
      }).catch(() => {})

      // Auto-open browser (non-blocking, failure is ok)
      const url = `http://localhost:${port}`
      import('open').then((mod) => mod.default(url)).catch(() => {})

      // Check agent availability after server is up (non-blocking)
      const { ConfigManager: CM } = await import('./workspace/ConfigManager.ts')
      const cm = new CM(projectDir)
      cm.loadGlobalConfig()
      cm.checkAgentAvailability().then((availability) => {
        const missing = Object.entries(availability).filter(([, a]) => !a.installed)
        if (missing.length > 0) {
          console.log('\n  Optional agents not found:')
          for (const [key, info] of missing) {
            console.log(`    \u26A0 ${key} (${info.bin}) — install: ${info.installHint}`)
          }
          console.log()
        }
      }).catch(() => {})
      break
    }

    case 'init': {
      const { ConfigManager } = await import('./workspace/ConfigManager.ts')
      const configManager = new ConfigManager(projectDir)
      configManager.loadGlobalConfig()
      configManager.initWorkspace()
      console.log(`Initialized .nexus/ in ${projectDir}`)
      break
    }

    case 'status': {
      const { ConfigManager } = await import('./workspace/ConfigManager.ts')
      const configManager = new ConfigManager(projectDir)
      const wsConfig = configManager.loadWorkspaceConfig()
      if (!wsConfig) {
        console.log('No .nexus/config.yaml found. Run `nexus init` first.')
        break
      }
      console.log(`Workspace: ${wsConfig.name}`)
      console.log(`Panes: ${wsConfig.panes.length}`)
      for (const pane of wsConfig.panes) {
        console.log(`  - ${pane.id} [${pane.agent}] ${pane.name}${pane.task ? ` — ${pane.task}` : ''}`)
      }
      break
    }

    case 'stop': {
      try {
        const port = parseInt(process.env.NEXUS_PORT || String(DEFAULT_PORT), 10)
        const res = await fetch(`http://localhost:${port}/api/health`)
        if (res.ok) {
          console.log('Sending shutdown signal...')
          process.kill(process.pid, 'SIGTERM')
        }
      } catch {
        console.log('No running Nexus server found.')
      }
      break
    }

    default:
      console.error(`Unknown command: ${command}`)
      printUsage(commandName)
      process.exit(1)
  }
}

const isEntrypoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false

if (isEntrypoint) {
  main().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}

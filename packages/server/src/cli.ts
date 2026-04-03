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

type MaybeSelfUpdateOptions = {
  args: string[]
  env: NodeJS.ProcessEnv
  packageName: string
  currentVersion: string
  entryFile: string
  execPath: string
  runCommand?: (command: string, args: string[]) => Promise<RunCommandResult>
  spawnUpdatedCli?: (args: string[], env: NodeJS.ProcessEnv) => Promise<number>
}

type SelfUpdateResult = {
  action: 'continued' | 'restarted'
}

const SELF_UPDATED_ENV = 'NEXUS_SELF_UPDATED'
const ROOT_PACKAGE_JSON = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../package.json')

function loadPublishedPackageMeta(): { name: string; version: string } {
  const raw = fs.readFileSync(ROOT_PACKAGE_JSON, 'utf-8')
  const pkg = JSON.parse(raw) as { name?: string; version?: string }
  return {
    name: pkg.name || 'nexus-console',
    version: pkg.version || '0.0.0',
  }
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

async function spawnUpdatedCli(args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return await new Promise((resolve) => {
    const child = spawn('nexus', args, {
      stdio: 'inherit',
      env,
    })

    child.on('error', () => resolve(1))
    child.on('close', (exitCode) => resolve(exitCode ?? 1))
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

export function shouldSkipSelfUpdate(input: {
  alreadyUpdated: boolean
  packageName: string
  entryFile: string
  execPath: string
}): boolean {
  if (input.alreadyUpdated) return true
  if (input.entryFile.endsWith('.ts')) return true
  if (!input.packageName) return true
  if (input.execPath.toLowerCase().includes('tsx')) return true
  return !input.entryFile.includes(`/node_modules/${input.packageName}/`)
}

export async function maybeSelfUpdate(options: MaybeSelfUpdateOptions): Promise<SelfUpdateResult> {
  if (shouldSkipSelfUpdate({
    alreadyUpdated: options.env[SELF_UPDATED_ENV] === '1',
    packageName: options.packageName,
    entryFile: options.entryFile,
    execPath: options.execPath,
  })) {
    return { action: 'continued' }
  }

  const execRunCommand = options.runCommand ?? runCommand
  const execSpawnUpdatedCli = options.spawnUpdatedCli ?? spawnUpdatedCli

  const latestResult = await execRunCommand('npm', ['view', options.packageName, 'version', '--json'])
  if (latestResult.exitCode !== 0) {
    return { action: 'continued' }
  }

  const latestVersion = parseLatestVersion(latestResult.stdout)
  if (!latestVersion || compareVersions(options.currentVersion, latestVersion) >= 0) {
    return { action: 'continued' }
  }

  console.log(`[nexus] Updating ${options.packageName} from ${options.currentVersion} to ${latestVersion}`)
  const installResult = await execRunCommand('npm', ['install', '-g', `${options.packageName}@latest`])
  if (installResult.exitCode !== 0) {
    console.warn(`[nexus] Self-update failed: ${installResult.stderr || 'npm install exited non-zero'}`)
    return { action: 'continued' }
  }

  const restartCode = await execSpawnUpdatedCli(options.args, {
    ...options.env,
    [SELF_UPDATED_ENV]: '1',
  })
  if (restartCode !== 0) {
    console.warn(`[nexus] Restart after self-update failed with exit code ${restartCode}`)
  }
  return { action: 'restarted' }
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

function printUsage() {
  console.log(`
  Usage: nexus [command] [directory]

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
    nexus                        # Start in current directory
    nexus ~/projects/my-app      # Start with a specific project
    nexus start ~/projects/app   # Explicit start command
    nexus init .                 # Initialize config in cwd
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

const COMMANDS = new Set(['start', 'init', 'status', 'stop', 'help'])

async function main() {
  const args = process.argv.slice(2)
  const packageMeta = loadPublishedPackageMeta()

  try {
    const updateResult = await maybeSelfUpdate({
      args,
      env: process.env,
      packageName: packageMeta.name,
      currentVersion: packageMeta.version,
      entryFile: fileURLToPath(import.meta.url),
      execPath: process.execPath,
    })
    if (updateResult.action === 'restarted') return
  } catch (error) {
    console.warn('[nexus] Self-update skipped:', (error as Error).message)
  }

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
    printUsage()
    return
  }

  const projectDir = resolveProjectDir(dirArg)

  switch (command) {
    case 'start': {
      const port = parseInt(process.env.NEXUS_PORT || String(DEFAULT_PORT), 10)
      await startServer(port, projectDir)

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
      printUsage()
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

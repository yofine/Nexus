import path from 'node:path'
import fs from 'node:fs'
import { startServer } from './index.ts'

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

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})

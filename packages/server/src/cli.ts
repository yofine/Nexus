import path from 'node:path'
import fs from 'node:fs'
import { startServer } from './index.ts'

// Clean up parent session env so spawned PTYs don't detect nesting
delete process.env.CLAUDECODE
delete process.env.CLAUDE_CODE
delete process.env.CLAUDE_CODE_ENTRYPOINT

const DEFAULT_PORT = 7700

function findProjectRoot(startDir: string): string {
  // Walk up from startDir, prefer the highest-level match
  // (monorepo root, not a nested package)
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
      bestMatch = dir // keep walking up in case there's a monorepo root above
    }
    dir = path.dirname(dir)
  }
  return bestMatch
}

async function main() {
  const args = process.argv.slice(2)
  const command = args[0] || 'start'
  const projectDir = process.env.NEXUS_PROJECT_DIR || findProjectRoot(process.cwd())

  switch (command) {
    case 'start':
    case undefined: {
      const port = parseInt(process.env.NEXUS_PORT || String(DEFAULT_PORT), 10)
      await startServer(port, projectDir)
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
      // Send shutdown signal to running server
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
      console.log(`Unknown command: ${command}`)
      console.log('Usage: nexus [start|init|status|stop]')
      process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})

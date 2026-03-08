import Fastify from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import fastifyStatic from '@fastify/static'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ConfigManager } from './workspace/ConfigManager.ts'
import { WorkspaceManager } from './workspace/WorkspaceManager.ts'
import { AgentsYamlWriter } from './workspace/AgentsYamlWriter.ts'
import { FsWatcher } from './fs/FsWatcher.ts'
import { GitService } from './git/GitService.ts'
import { setupWsHandlers } from './ws/handlers.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function startServer(port: number, projectDir: string) {
  const fastify = Fastify({ logger: false })

  // Managers
  const configManager = new ConfigManager(projectDir)
  configManager.loadGlobalConfig()

  const workspaceManager = new WorkspaceManager(configManager)
  workspaceManager.init()

  // agents.yaml writer — updates on pane state changes
  const agentsWriter = new AgentsYamlWriter(projectDir)

  workspaceManager.onEvents({
    onPaneAdded: () => agentsWriter.update(workspaceManager.getPanes()),
    onPaneRemoved: () => agentsWriter.update(workspaceManager.getPanes()),
    onPaneStatus: () => agentsWriter.update(workspaceManager.getPanes()),
    onPaneMeta: () => agentsWriter.update(workspaceManager.getPanes()),
  })

  // File system watcher
  const fsWatcher = new FsWatcher(projectDir)
  fsWatcher.onTreeChange((tree) => {
    workspaceManager.emitFileTree(tree)
  })
  fsWatcher.start()

  // Git service
  const gitService = new GitService(projectDir)
  gitService.onDiffChange((diffs) => {
    workspaceManager.emitGitDiff(diffs)
  })
  await gitService.start()

  // WebSocket
  await fastify.register(fastifyWebsocket)

  fastify.get('/nexus-ws', { websocket: true }, (socket, req) => {
    console.log('[WS] Upgrade request from', req.ip)
    try {
      setupWsHandlers(socket, workspaceManager, gitService)

      // Send initial file tree and git diffs to new client
      const tree = fsWatcher.getTree()
      if (tree.length > 0) {
        socket.send(JSON.stringify({ type: 'fs.tree', tree }))
      }
      const diffs = gitService.getCurrentDiffs()
      if (diffs.length > 0) {
        socket.send(JSON.stringify({ type: 'git.diff', diff: diffs }))
      }
      console.log('[WS] Client connected')

      socket.on('close', (code: number, reason: Buffer) => {
        console.log(`[WS] Client disconnected: code=${code} reason=${reason.toString()}`)
      })
      socket.on('error', (err: Error) => {
        console.error('[WS] Socket error:', err)
      })
    } catch (err) {
      console.error('[WS] Error in connection handler:', err)
    }
  })

  // Health check
  fastify.get('/api/health', async () => {
    return { status: 'ok' }
  })

  // File read endpoint
  fastify.get('/api/file', async (request, reply) => {
    const { path: filePath } = request.query as { path?: string }
    if (!filePath) {
      reply.code(400)
      return { error: 'Missing path parameter' }
    }

    // Security: reject paths with .. or absolute paths
    if (filePath.includes('..') || path.isAbsolute(filePath)) {
      reply.code(403)
      return { error: 'Invalid path' }
    }

    const fullPath = path.resolve(projectDir, filePath)

    // Ensure resolved path is within projectDir
    if (!fullPath.startsWith(projectDir)) {
      reply.code(403)
      return { error: 'Path traversal not allowed' }
    }

    try {
      const content = fs.readFileSync(fullPath, 'utf-8')
      return { content, path: filePath }
    } catch {
      reply.code(404)
      return { error: 'File not found' }
    }
  })

  // Serve static frontend in production
  const webDistPath = path.resolve(__dirname, '../../web/dist')
  console.log(`  Web dist: ${webDistPath} (exists: ${fs.existsSync(webDistPath)})`)
  if (fs.existsSync(webDistPath)) {
    await fastify.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
      wildcard: false,
    })

    // Explicit root route to serve index.html
    fastify.get('/', (_req, reply) => {
      reply.sendFile('index.html')
    })

    // SPA fallback for client-side routing
    fastify.setNotFoundHandler((_req, reply) => {
      reply.sendFile('index.html')
    })
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log('\nShutting down...')
    agentsWriter.flush(workspaceManager.getPanes())
    fsWatcher.close()
    gitService.close()
    workspaceManager.shutdown()
    fastify.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  try {
    await fastify.listen({ port, host: '0.0.0.0' })
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Kill the existing process or use a different port:`)
      console.error(`  NEXUS_PORT=7800 pnpm dev`)
      console.error(`  # or find and kill: lsof -i :${port}`)
      process.exit(1)
    }
    throw err
  }
  console.log(`Nexus server running at http://localhost:${port}`)
  console.log(`  Project dir: ${projectDir}`)
  console.log(`  File tree: ${fsWatcher.getTree().length} top-level entries`)
  console.log(`  Git diffs: ${gitService.getCurrentDiffs().length} changes`)

  return { fastify, workspaceManager, configManager }
}

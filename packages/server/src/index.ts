import Fastify from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import fastifyStatic from '@fastify/static'
import path from 'node:path'
import fs from 'node:fs'
import yaml from 'js-yaml'
import { fileURLToPath } from 'node:url'
import { ConfigManager } from './workspace/ConfigManager.ts'
import { WorkspaceManager } from './workspace/WorkspaceManager.ts'
import { AgentsYamlWriter } from './workspace/AgentsYamlWriter.ts'
import { FsWatcher } from './fs/FsWatcher.ts'
import { GitService } from './git/GitService.ts'
import { setupWsHandlers } from './ws/handlers.ts'
import { DependencyAnalyzer } from './deps/DependencyAnalyzer.ts'
import { SessionRecorder } from './history/SessionRecorder.ts'
import { SessionDiscovery } from './workspace/SessionDiscovery.ts'
import type { GlobalConfig } from './types.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function startServer(port: number, projectDir: string) {
  const fastify = Fastify({ logger: false })

  // Managers
  const configManager = new ConfigManager(projectDir)
  configManager.loadGlobalConfig()

  const workspaceManager = new WorkspaceManager(configManager)
  await workspaceManager.init()

  // agents.yaml writer — updates on pane state changes
  const agentsWriter = new AgentsYamlWriter(projectDir)

  workspaceManager.onEvents({
    onPaneAdded: () => agentsWriter.update(workspaceManager.getPanes()),
    onPaneRemoved: () => agentsWriter.update(workspaceManager.getPanes()),
    onPaneStatus: () => agentsWriter.update(workspaceManager.getPanes()),
    onPaneMeta: () => agentsWriter.update(workspaceManager.getPanes()),
  })

  // Session recorder — records replay history
  const wsConfig = configManager.loadWorkspaceConfig()
  const globalConfig = configManager.loadGlobalConfig()
  const recorder = new SessionRecorder(projectDir, wsConfig?.name || 'Nexus', globalConfig.defaults.history_retention_days)

  workspaceManager.onEvents({
    onPaneAdded: (pane) => recorder.onPaneAdded(pane),
    onPaneRemoved: (paneId) => recorder.onPaneRemoved(paneId),
    onPaneStatus: (paneId, status) => {
      const panes = workspaceManager.getPanes()
      const pane = panes.find((p) => p.id === paneId)
      recorder.onPaneStatus(paneId, status, pane)
    },
    onPaneMeta: (paneId, meta) => recorder.onPaneMeta(paneId, meta),
    onTerminalData: (paneId, data) => recorder.onTerminalData(paneId, data),
    onPaneActivity: (paneId, activity) => recorder.onPaneActivity(paneId, activity),
  })

  // File system watcher
  const fsWatcher = new FsWatcher(projectDir)
  fsWatcher.onTreeChange((tree) => {
    workspaceManager.emitFileTree(tree)
  })
  fsWatcher.onFileChange((activity) => {
    workspaceManager.emitFileActivity(activity)
    // Also feed file changes to session recorder for diff capture
    recorder.onFileActivityForReplay(activity)
  })
  try {
    fsWatcher.start()
  } catch (err) {
    console.warn('[FsWatcher] Failed to start file watcher:', (err as Error).message)
  }

  // Git service
  const gitService = new GitService(projectDir)
  gitService.onDiffChange((result) => {
    workspaceManager.emitGitDiff(result)
  })
  try {
    await gitService.start()
  } catch (err) {
    console.warn('[GitService] Failed to start git service:', (err as Error).message)
  }

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
      const { unstaged, staged } = gitService.getCurrentDiffs()
      if (unstaged.length > 0 || staged.length > 0) {
        socket.send(JSON.stringify({ type: 'git.diff', unstaged, staged }))
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

  // Agent availability endpoint
  fastify.get('/api/agents', async () => {
    return await configManager.checkAgentAvailability()
  })

  // Global config endpoints
  fastify.get('/api/config', async () => {
    return configManager.loadGlobalConfig()
  })

  fastify.put('/api/config', async (request, reply) => {
    try {
      const config = request.body as GlobalConfig
      configManager.updateGlobalConfig(config)
      return { success: true }
    } catch (err) {
      reply.code(400)
      return { error: 'Invalid config' }
    }
  })

  // Session discovery (claude sessions list)
  const sessionDiscovery = new SessionDiscovery(configManager)

  fastify.get('/api/sessions', async (request) => {
    const { agent } = request.query as { agent?: string }
    const external = await sessionDiscovery.listSessions(agent || 'claudecode')
    // Merge with Nexus internal sessions, dedup by sessionId
    const internal = workspaceManager.getSessionList()
    const seen = new Set(internal.map((s) => s.sessionId))
    const merged = [
      ...internal.map((s) => ({
        sessionId: s.sessionId,
        summary: s.paneName,
        model: s.model,
        costUsd: s.costUsd,
        numTurns: undefined as number | undefined,
        createdAt: s.timestamp,
        updatedAt: s.timestamp,
        projectPath: undefined as string | undefined,
        source: 'nexus' as const,
      })),
      ...external.filter((s) => !seen.has(s.sessionId)),
    ]
    return merged
  })

  // Replay history endpoints
  fastify.get('/api/replay/sessions', async () => {
    return SessionRecorder.listSessions(projectDir)
  })

  fastify.get('/api/replay/sessions/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const session = SessionRecorder.getSession(projectDir, sessionId)
    if (!session) { reply.code(404); return { error: 'Session not found' } }
    return session
  })

  fastify.get('/api/replay/sessions/:sessionId/turns/:turnId', async (request, reply) => {
    const { sessionId, turnId } = request.params as { sessionId: string; turnId: string }
    const turn = SessionRecorder.getTurn(projectDir, sessionId, turnId)
    if (!turn) { reply.code(404); return { error: 'Turn not found' } }
    return turn
  })

  // Delete a single replay session
  fastify.delete('/api/replay/sessions/:sessionId', async (request) => {
    const { sessionId } = request.params as { sessionId: string }
    const deleted = SessionRecorder.deleteSession(projectDir, sessionId)
    return { success: deleted }
  })

  // Delete all replay sessions
  fastify.delete('/api/replay/sessions', async () => {
    const count = SessionRecorder.deleteAllSessions(projectDir)
    return { success: true, deleted: count }
  })

  // Dependency graph endpoint — cached with TTL to avoid repeated full-scan
  let depGraphCache: { graph: ReturnType<DependencyAnalyzer['analyze']>; ts: number } | null = null
  const DEP_CACHE_TTL = 30_000 // 30s

  fastify.get('/api/deps', async () => {
    const now = Date.now()
    if (depGraphCache && now - depGraphCache.ts < DEP_CACHE_TTL) {
      return depGraphCache.graph
    }
    const analyzer = new DependencyAnalyzer(projectDir)
    const graph = analyzer.analyze()
    depGraphCache = { graph, ts: now }
    return graph
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

  // Raw file endpoint — serves binary files with correct MIME type
  fastify.get('/api/file/raw', async (request, reply) => {
    const { path: filePath } = request.query as { path?: string }
    if (!filePath) {
      reply.code(400)
      return { error: 'Missing path parameter' }
    }
    if (filePath.includes('..') || path.isAbsolute(filePath)) {
      reply.code(403)
      return { error: 'Invalid path' }
    }
    const fullPath = path.resolve(projectDir, filePath)
    if (!fullPath.startsWith(projectDir)) {
      reply.code(403)
      return { error: 'Path traversal not allowed' }
    }
    if (!fs.existsSync(fullPath)) {
      reply.code(404)
      return { error: 'File not found' }
    }
    const ext = path.extname(fullPath).toLowerCase()
    const mimeMap: Record<string, string> = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
      '.bmp': 'image/bmp', '.avif': 'image/avif',
      '.pdf': 'application/pdf',
      '.svg': 'image/svg+xml',
    }
    const mime = mimeMap[ext] || 'application/octet-stream'
    const stream = fs.createReadStream(fullPath)
    reply.type(mime)
    return reply.send(stream)
  })

  // Notes CRUD — persisted to .nexus/notes.yaml
  const notesPath = path.join(projectDir, '.nexus', 'notes.yaml')

  fastify.get('/api/notes', async () => {
    try {
      const raw = fs.readFileSync(notesPath, 'utf-8')
      const data = yaml.load(raw) as { notes?: unknown[] }
      return { notes: data?.notes || [] }
    } catch {
      return { notes: [] }
    }
  })

  fastify.put('/api/notes', async (request, reply) => {
    try {
      const { notes } = request.body as { notes: unknown[] }
      fs.mkdirSync(path.dirname(notesPath), { recursive: true })
      fs.writeFileSync(notesPath, yaml.dump({ notes }, { lineWidth: -1 }), 'utf-8')
      return { success: true }
    } catch (err) {
      reply.code(400)
      return { error: 'Failed to save notes' }
    }
  })

  // Serve static frontend in production
  const webDistPath = path.resolve(__dirname, '../../web/dist')
  if (!fs.existsSync(webDistPath)) {
    console.warn(`  [Warning] Frontend not found at ${webDistPath}`)
    console.warn(`  Run 'pnpm run build:web' to build the frontend, or use dev mode.`)
  }
  if (fs.existsSync(webDistPath)) {
    await fastify.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
    })

    // SPA fallback for client-side routing
    fastify.setNotFoundHandler((_req, reply) => {
      reply.sendFile('index.html')
    })
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...')
    recorder.flush()
    agentsWriter.flush(workspaceManager.getPanes())
    fsWatcher.close()
    gitService.close()
    await workspaceManager.shutdown()
    await fastify.close()
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
  const { unstaged: u, staged: s } = gitService.getCurrentDiffs()
  console.log(`  Git diffs: ${u.length} unstaged, ${s.length} staged`)

  return { fastify, workspaceManager, configManager }
}

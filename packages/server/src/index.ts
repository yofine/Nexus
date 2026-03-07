import Fastify from 'fastify'
import fastifyWebsocket from '@fastify/websocket'
import fastifyStatic from '@fastify/static'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ConfigManager } from './workspace/ConfigManager.ts'
import { WorkspaceManager } from './workspace/WorkspaceManager.ts'
import { setupWsHandlers } from './ws/handlers.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function startServer(port: number, projectDir: string) {
  const fastify = Fastify({ logger: false })

  // Managers
  const configManager = new ConfigManager(projectDir)
  configManager.loadGlobalConfig()

  const workspaceManager = new WorkspaceManager(configManager)
  workspaceManager.init()

  // WebSocket
  await fastify.register(fastifyWebsocket)

  fastify.get('/ws', { websocket: true }, (socket) => {
    setupWsHandlers(socket, workspaceManager)
  })

  // Health check
  fastify.get('/api/health', async () => {
    return { status: 'ok' }
  })

  // Serve static frontend in production
  const webDistPath = path.resolve(__dirname, '../../web/dist')
  if (fs.existsSync(webDistPath)) {
    await fastify.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
      wildcard: false,
    })

    // SPA fallback
    fastify.setNotFoundHandler((_req, reply) => {
      reply.sendFile('index.html')
    })
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log('\nShutting down...')
    workspaceManager.shutdown()
    fastify.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  await fastify.listen({ port, host: '0.0.0.0' })
  console.log(`Nexus server running at http://localhost:${port}`)

  return { fastify, workspaceManager, configManager }
}

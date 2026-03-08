import Fastify from 'fastify'
import fastifyWebsocket from '@fastify/websocket'

const fastify = Fastify({ logger: false })

await fastify.register(fastifyWebsocket)

fastify.get('/nexus-ws', { websocket: true }, (socket) => {
  console.log('[WS] connected')
  socket.send(JSON.stringify({ type: 'hello' }))
  socket.on('close', () => console.log('[WS] disconnected'))
})

fastify.get('/api/health', async () => {
  return { status: 'ok' }
})

await fastify.listen({ port: 7700, host: '0.0.0.0' })
console.log('Test server on http://localhost:7700')

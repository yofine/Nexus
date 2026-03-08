import { useEffect, useRef, useCallback, useState } from 'react'
import type { ClientEvent, ServerEvent } from '@/types'

type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting'

interface UseWebSocketOptions {
  onMessage: (event: ServerEvent) => void
}

export function useWebSocket({ onMessage }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>()
  const reconnectDelay = useRef(1000)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws`

    console.log('[Nexus] Connecting to', wsUrl)
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('[Nexus] WebSocket connected')
      setStatus('connected')
      reconnectDelay.current = 1000
    }

    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as ServerEvent
        onMessageRef.current(event)
      } catch {
        // Invalid message, ignore
      }
    }

    ws.onclose = (e) => {
      console.log('[Nexus] WebSocket closed:', e.code, e.reason)
      setStatus('reconnecting')
      wsRef.current = null

      // Exponential backoff reconnection
      reconnectTimeout.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000)
        connect()
      }, reconnectDelay.current)
    }

    ws.onerror = (e) => {
      console.error('[Nexus] WebSocket error:', e)
      ws.close()
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current)
      wsRef.current?.close()
    }
  }, [connect])

  const send = useCallback((event: ClientEvent) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event))
    } else {
      console.warn('[Nexus] WebSocket not connected, dropping event:', event.type)
    }
  }, [])

  return { send, status }
}

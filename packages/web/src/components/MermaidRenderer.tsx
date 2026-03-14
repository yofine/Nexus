import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

let initialized = false

function ensureInit() {
  if (initialized) return
  initialized = true
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    darkMode: true,
    fontFamily: 'var(--font-mono)',
    securityLevel: 'loose',
  })
}

let idCounter = 0

interface MermaidRendererProps {
  chart: string
}

export function MermaidRenderer({ chart }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const idRef = useRef(`mermaid-${++idCounter}`)

  useEffect(() => {
    if (!chart.trim() || !containerRef.current) return
    ensureInit()

    const id = idRef.current
    let cancelled = false

    mermaid.render(id, chart.trim()).then(({ svg }) => {
      if (cancelled || !containerRef.current) return
      containerRef.current.innerHTML = svg
      setError(null)
    }).catch((err: Error) => {
      if (cancelled) return
      setError(err.message)
      // Clean up any leftover temp element mermaid may have created
      document.getElementById('d' + id)?.remove()
    })

    return () => { cancelled = true }
  }, [chart])

  if (error) {
    return (
      <div style={{ padding: 12, color: 'var(--status-error)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
        Mermaid render error: {error}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        overflow: 'auto',
      }}
    />
  )
}

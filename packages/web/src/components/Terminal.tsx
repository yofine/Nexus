import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { registerTerminalWriter, unregisterTerminalWriter } from '@/stores/terminalRegistry'

interface TerminalProps {
  paneId: string
  onData: (data: string) => void
  onResize: (cols: number, rows: number) => void
}

function resolveCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000000'
}

export function Terminal({ paneId, onData, onResize }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const onDataRef = useRef(onData)
  const onResizeRef = useRef(onResize)

  // Keep refs up to date without re-running the effect
  onDataRef.current = onData
  onResizeRef.current = onResize

  useEffect(() => {
    if (!containerRef.current) return

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Geist Mono', 'JetBrains Mono', monospace",
      allowProposedApi: true,
      scrollback: 5000,
      theme: {
        background: resolveCssVar('--term-bg'),
        foreground: resolveCssVar('--term-fg'),
        cursor: resolveCssVar('--term-cursor'),
        selectionBackground: resolveCssVar('--term-selection'),
      },
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(containerRef.current)

    // Initial fit
    requestAnimationFrame(() => {
      fitAddon.fit()
      onResizeRef.current(term.cols, term.rows)
    })

    // Forward keyboard input to server
    term.onData((data) => {
      onDataRef.current(data)
    })

    // Register write function for incoming terminal output
    registerTerminalWriter(paneId, (data: string) => {
      term.write(data)
    })

    termRef.current = term
    fitRef.current = fitAddon

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (fitRef.current && containerRef.current && containerRef.current.clientHeight > 0) {
          fitRef.current.fit()
          if (termRef.current) {
            onResizeRef.current(termRef.current.cols, termRef.current.rows)
          }
        }
      })
    })

    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      unregisterTerminalWriter(paneId)
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [paneId])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 0,
      }}
    />
  )
}

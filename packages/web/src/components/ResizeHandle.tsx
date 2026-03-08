import { useCallback, useRef } from 'react'

interface ResizeHandleProps {
  onResize: (delta: number) => void
  onResizeEnd?: () => void
}

export function ResizeHandle({ onResize, onResizeEnd }: ResizeHandleProps) {
  const dragging = useRef(false)
  const lastX = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    lastX.current = e.clientX
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const delta = ev.clientX - lastX.current
      lastX.current = ev.clientX
      onResize(delta)
    }

    const handleMouseUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      onResizeEnd?.()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [onResize, onResizeEnd])

  return (
    <div
      data-resize-handle
      onMouseDown={handleMouseDown}
      style={{
        width: 5,
        cursor: 'col-resize',
        flexShrink: 0,
        background: 'transparent',
        position: 'relative',
        zIndex: 10,
      }}
    >
      {/* Visible line */}
      <div style={{
        position: 'absolute',
        left: 2,
        top: 0,
        bottom: 0,
        width: 1,
        background: 'var(--border-subtle)',
        transition: 'background 0.15s',
      }} />
    </div>
  )
}

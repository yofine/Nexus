import { useCallback, useRef } from 'react'

interface ResizeHandleProps {
  onResize: (delta: number) => void
  onResizeEnd?: () => void
  onCycleWidth?: () => void
  onResetWidth?: () => void
}

export function ResizeHandle({ onResize, onResizeEnd, onCycleWidth, onResetWidth }: ResizeHandleProps) {
  const dragging = useRef(false)
  const lastX = useRef(0)
  const moved = useRef(false)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    dragging.current = true
    lastX.current = e.clientX
    moved.current = false
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    e.currentTarget.setPointerCapture?.(e.pointerId)

    const handlePointerMove = (ev: PointerEvent) => {
      if (!dragging.current) return
      const delta = ev.clientX - lastX.current
      if (Math.abs(delta) > 2) {
        moved.current = true
      }
      lastX.current = ev.clientX
      onResize(delta)
    }

    const handlePointerUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
      onResizeEnd?.()
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
  }, [onResize, onResizeEnd])

  return (
    <div
      data-resize-handle
      className="resize-handle"
      onPointerDown={handlePointerDown}
      onClick={() => {
        if (!moved.current) onCycleWidth?.()
      }}
      onDoubleClick={() => onResetWidth?.()}
      style={{
        cursor: 'col-resize',
        flexShrink: 0,
        background: 'transparent',
        position: 'relative',
        zIndex: 20,
        touchAction: 'none',
      }}
    >
      <div className="resize-handle__line" />
    </div>
  )
}

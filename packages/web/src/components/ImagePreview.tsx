import { useState } from 'react'

interface ImagePreviewProps {
  filePath: string
}

export function ImagePreview({ filePath }: ImagePreviewProps) {
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const [error, setError] = useState(false)
  const src = `/api/file/raw?path=${encodeURIComponent(filePath)}`

  if (error) {
    return (
      <div style={{ padding: 16, color: 'var(--status-error)', fontSize: 12 }}>
        Failed to load image
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 24,
        gap: 8,
        background: 'repeating-conic-gradient(var(--bg-surface) 0% 25%, transparent 0% 50%) 50% / 16px 16px',
      }}
    >
      <img
        src={src}
        alt={filePath}
        onLoad={(e) => {
          const img = e.currentTarget
          setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
        }}
        onError={() => setError(true)}
        style={{ maxWidth: '100%', maxHeight: 'calc(100% - 30px)', objectFit: 'contain' }}
      />
      {naturalSize && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {naturalSize.w} × {naturalSize.h}
        </span>
      )}
    </div>
  )
}

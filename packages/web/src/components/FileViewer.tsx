import { useState, useEffect } from 'react'

interface FileViewerProps {
  filePath: string
}

export function FileViewer({ filePath }: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    fetch(`/api/file?path=${encodeURIComponent(filePath)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load file')
        return res.json()
      })
      .then((data: { content: string }) => {
        setContent(data.content)
      })
      .catch((err: Error) => {
        setError(err.message)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [filePath])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Path bar */}
      <div
        style={{
          padding: '4px 12px',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={filePath}
      >
        {filePath}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-base)' }}>
        {loading && (
          <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>
            Loading...
          </div>
        )}

        {error && (
          <div style={{ padding: 16, color: 'var(--status-error)', fontSize: 12 }}>
            {error}
          </div>
        )}

        {content !== null && !loading && (
          <pre
            style={{
              margin: 0,
              padding: '8px 0',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              lineHeight: 1.5,
              color: 'var(--text-code)',
            }}
          >
            {content.split('\n').map((line, i) => (
              <div key={i} style={{ display: 'flex', padding: '0 12px' }}>
                <span
                  style={{
                    width: 40,
                    textAlign: 'right',
                    color: 'var(--text-muted)',
                    marginRight: 12,
                    flexShrink: 0,
                    userSelect: 'none',
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ whiteSpace: 'pre', overflow: 'hidden' }}>{line}</span>
              </div>
            ))}
          </pre>
        )}
      </div>
    </div>
  )
}

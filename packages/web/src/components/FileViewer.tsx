import { useState, useEffect } from 'react'
import { X, File } from 'lucide-react'
import { useWorkspaceStore } from '@/stores/workspaceStore'

export function FileViewer() {
  const { selectedFile, setSelectedFile } = useWorkspaceStore()
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedFile) {
      setContent(null)
      return
    }

    setLoading(true)
    setError(null)

    fetch(`/api/file?path=${encodeURIComponent(selectedFile)}`)
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
  }, [selectedFile])

  if (!selectedFile) return null

  const fileName = selectedFile.split('/').pop() || selectedFile

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* File header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-elevated)',
          flexShrink: 0,
        }}
      >
        <File size={12} color="var(--text-muted)" />
        <span
          style={{
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-primary)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={selectedFile}
        >
          {fileName}
        </span>
        <button
          onClick={() => setSelectedFile(null)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 2,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <X size={12} color="var(--text-muted)" />
        </button>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          background: 'var(--bg-base)',
        }}
      >
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
              counterReset: 'line',
            }}
          >
            {content.split('\n').map((line, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  padding: '0 12px',
                }}
              >
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

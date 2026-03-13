import { useState, useEffect, useRef, useMemo } from 'react'
import { createHighlighter, type Highlighter } from 'shiki'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface FileViewerProps {
  filePath: string
}

// Shared highlighter instance
let highlighterPromise: Promise<Highlighter> | null = null
function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark'],
      langs: [
        'typescript', 'javascript', 'tsx', 'jsx', 'json', 'html', 'css',
        'yaml', 'markdown', 'bash', 'python', 'go', 'rust', 'toml',
        'sql', 'graphql', 'dockerfile', 'xml',
      ],
    })
  }
  return highlighterPromise
}

function isMarkdown(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return ext === 'md' || ext === 'mdx'
}

function getLang(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    json: 'json', html: 'html', css: 'css', yaml: 'yaml', yml: 'yaml',
    md: 'markdown', sh: 'bash', bash: 'bash', zsh: 'bash',
    py: 'python', go: 'go', rs: 'rust', toml: 'toml',
    sql: 'sql', graphql: 'graphql', gql: 'graphql',
    xml: 'xml', svg: 'xml',
  }
  // Handle special filenames
  const name = filePath.split('/').pop()?.toLowerCase() || ''
  if (name === 'dockerfile') return 'dockerfile'
  return map[ext] || ''
}

export function FileViewer({ filePath }: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null)
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewRaw, setViewRaw] = useState(false)
  const codeRef = useRef<HTMLDivElement>(null)
  const isMd = useMemo(() => isMarkdown(filePath), [filePath])

  useEffect(() => {
    setLoading(true)
    setError(null)
    setHighlightedHtml(null)
    setViewRaw(false)

    fetch(`/api/file?path=${encodeURIComponent(filePath)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load file')
        return res.json()
      })
      .then((data: { content: string }) => {
        setContent(data.content)
        // Skip highlighting for markdown in preview mode
        if (isMd) return
        // Highlight asynchronously
        const lang = getLang(filePath)
        if (lang) {
          getHighlighter().then((hl) => {
            const html = hl.codeToHtml(data.content, {
              lang,
              theme: 'github-dark',
            })
            setHighlightedHtml(html)
          }).catch(() => {
            // fallback to plain text
          })
        }
      })
      .catch((err: Error) => {
        setError(err.message)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [filePath, isMd])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
        title={filePath}
      >
        <span>{filePath}</span>
        {isMd && (
          <button
            onClick={() => setViewRaw((v) => !v)}
            style={{
              background: 'var(--bg-overlay)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              fontSize: 10,
              padding: '1px 6px',
              cursor: 'pointer',
              flexShrink: 0,
              marginLeft: 8,
            }}
          >
            {viewRaw ? 'Preview' : 'Raw'}
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, background: 'var(--bg-base)' }}>
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

        {content !== null && !loading && isMd && !viewRaw && (
          <div className="markdown-body" style={{ padding: '16px 24px' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        )}

        {content !== null && !loading && (!isMd || viewRaw) && (
          highlightedHtml && !viewRaw ? (
            <div
              ref={codeRef}
              className="shiki-wrapper"
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                fontFamily: 'var(--font-mono)',
              }}
            />
          ) : (
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
          )
        )}
      </div>
    </div>
  )
}

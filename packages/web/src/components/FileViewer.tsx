import { useState, useEffect, useRef, useMemo, type ComponentPropsWithoutRef } from 'react'
import { createHighlighter, type Highlighter } from 'shiki'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MermaidRenderer } from './MermaidRenderer'

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

function isSvg(filePath: string): boolean {
  return filePath.split('.').pop()?.toLowerCase() === 'svg'
}

function isMermaid(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return ext === 'mmd' || ext === 'mermaid'
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
  const isSvgFile = useMemo(() => isSvg(filePath), [filePath])
  const isMermaidFile = useMemo(() => isMermaid(filePath), [filePath])
  const hasPreview = isMd || isSvgFile || isMermaidFile

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
        // Skip highlighting for markdown/svg in preview mode (will highlight on raw toggle)
        if (hasPreview) return
        // Highlight asynchronously
        const lang = getLang(filePath)
        if (lang) {
          getHighlighter().then((hl) => {
            const html = hl.codeToHtml(data.content, {
              lang,
              theme: 'github-dark',
            })
            setHighlightedHtml(html)
          }).catch(() => {/* fallback to plain text */})
        }
      })
      .catch((err: Error) => {
        setError(err.message)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [filePath, hasPreview])

  // Highlight on demand when switching to raw view for preview-type files
  useEffect(() => {
    if (!viewRaw || !content || highlightedHtml) return
    const lang = getLang(filePath)
    if (lang) {
      getHighlighter().then((hl) => {
        setHighlightedHtml(hl.codeToHtml(content, { lang, theme: 'github-dark' }))
      }).catch(() => {/* fallback to plain text */})
    }
  }, [viewRaw, content, filePath, highlightedHtml])

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
        {hasPreview && (
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
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }: ComponentPropsWithoutRef<'code'>) {
                  const match = /language-(\w+)/.exec(className || '')
                  if (match?.[1] === 'mermaid') {
                    return <MermaidRenderer chart={String(children)} />
                  }
                  return <code className={className} {...props}>{children}</code>
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}

        {content !== null && !loading && isMermaidFile && !viewRaw && (
          <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
            <MermaidRenderer chart={content} />
          </div>
        )}

        {content !== null && !loading && isSvgFile && !viewRaw && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              padding: 24,
              background: 'repeating-conic-gradient(var(--bg-surface) 0% 25%, transparent 0% 50%) 50% / 16px 16px',
            }}
          >
            <div
              dangerouslySetInnerHTML={{ __html: content }}
              style={{ maxWidth: '100%', maxHeight: '100%' }}
            />
          </div>
        )}

        {content !== null && !loading && (!hasPreview || viewRaw) && (
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

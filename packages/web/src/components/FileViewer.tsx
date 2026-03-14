import { useState, useEffect, useRef, useMemo, type ComponentPropsWithoutRef } from 'react'
import { createHighlighter, type Highlighter } from 'shiki'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MermaidRenderer } from './MermaidRenderer'
import { ImagePreview } from './ImagePreview'
import { HtmlPreview } from './HtmlPreview'
import { CsvTable } from './CsvTable'
import { PdfPreview } from './PdfPreview'
import { JsonTree } from './JsonTree'

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

type FileType = 'markdown' | 'svg' | 'mermaid' | 'image' | 'html' | 'csv' | 'tsv' | 'pdf' | 'json' | 'code'

function detectFileType(filePath: string): FileType {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  if (ext === 'md' || ext === 'mdx') return 'markdown'
  if (ext === 'svg') return 'svg'
  if (ext === 'mmd' || ext === 'mermaid') return 'mermaid'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif'].includes(ext)) return 'image'
  if (ext === 'htm' || ext === 'html') return 'html'
  if (ext === 'csv') return 'csv'
  if (ext === 'tsv') return 'tsv'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'json') return 'json'
  return 'code'
}

// Binary types that don't need text content fetch
const BINARY_TYPES: Set<FileType> = new Set(['image', 'pdf'])

// Types that have a preview/raw toggle
const PREVIEWABLE: Set<FileType> = new Set(['markdown', 'svg', 'mermaid', 'html', 'csv', 'tsv', 'json'])

function getLang(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    json: 'json', html: 'html', htm: 'html', css: 'css',
    yaml: 'yaml', yml: 'yaml',
    md: 'markdown', sh: 'bash', bash: 'bash', zsh: 'bash',
    py: 'python', go: 'go', rs: 'rust', toml: 'toml',
    sql: 'sql', graphql: 'graphql', gql: 'graphql',
    xml: 'xml', svg: 'xml',
  }
  const name = filePath.split('/').pop()?.toLowerCase() || ''
  if (name === 'dockerfile') return 'dockerfile'
  return map[ext] || ''
}

export function FileViewer({ filePath }: FileViewerProps) {
  const fileType = useMemo(() => detectFileType(filePath), [filePath])
  const isBinary = BINARY_TYPES.has(fileType)
  const hasPreview = PREVIEWABLE.has(fileType)

  const [content, setContent] = useState<string | null>(null)
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewRaw, setViewRaw] = useState(false)
  const codeRef = useRef<HTMLDivElement>(null)

  // Fetch text content for non-binary files
  useEffect(() => {
    if (isBinary) {
      setContent(null)
      setLoading(false)
      return
    }

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
        // Skip highlighting for previewable types (will highlight on raw toggle)
        if (hasPreview) return
        const lang = getLang(filePath)
        if (lang) {
          getHighlighter().then((hl) => {
            setHighlightedHtml(hl.codeToHtml(data.content, { lang, theme: 'github-dark' }))
          }).catch(() => {/* fallback to plain text */})
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [filePath, isBinary, hasPreview])

  // Highlight on demand when switching to raw view for previewable files
  useEffect(() => {
    if (!viewRaw || !content || highlightedHtml) return
    const lang = getLang(filePath)
    if (lang) {
      getHighlighter().then((hl) => {
        setHighlightedHtml(hl.codeToHtml(content, { lang, theme: 'github-dark' }))
      }).catch(() => {/* fallback to plain text */})
    }
  }, [viewRaw, content, filePath, highlightedHtml])

  // Render the preview content for the current file type
  const renderPreview = () => {
    if (!content) return null
    switch (fileType) {
      case 'markdown':
        return (
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
        )
      case 'mermaid':
        return (
          <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
            <MermaidRenderer chart={content} />
          </div>
        )
      case 'svg':
        return (
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', padding: 24,
              background: 'repeating-conic-gradient(var(--bg-surface) 0% 25%, transparent 0% 50%) 50% / 16px 16px',
            }}
          >
            <div
              dangerouslySetInnerHTML={{ __html: content }}
              style={{ maxWidth: '100%', maxHeight: '100%' }}
            />
          </div>
        )
      case 'html':
        return <HtmlPreview filePath={filePath} />
      case 'csv':
        return <CsvTable content={content} delimiter="," />
      case 'tsv':
        return <CsvTable content={content} delimiter={'\t'} />
      case 'json':
        return <JsonTree content={content} />
      default:
        return null
    }
  }

  // Code view (syntax highlighted or plain text with line numbers)
  const renderCode = () => {
    if (!content) return null
    if (highlightedHtml && !viewRaw) {
      return (
        <div
          ref={codeRef}
          className="shiki-wrapper"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          style={{ fontSize: 12, lineHeight: 1.5, fontFamily: 'var(--font-mono)' }}
        />
      )
    }
    return (
      <pre
        style={{
          margin: 0, padding: '8px 0',
          fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.5,
          color: 'var(--text-code)',
        }}
      >
        {content.split('\n').map((line, i) => (
          <div key={i} style={{ display: 'flex', padding: '0 12px' }}>
            <span
              style={{
                width: 40, textAlign: 'right', color: 'var(--text-muted)',
                marginRight: 12, flexShrink: 0, userSelect: 'none',
              }}
            >
              {i + 1}
            </span>
            <span style={{ whiteSpace: 'pre', overflow: 'hidden' }}>{line}</span>
          </div>
        ))}
      </pre>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Path bar */}
      <div
        style={{
          padding: '4px 12px', fontSize: 11, fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)', background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
        title={filePath}
      >
        <span>{filePath}</span>
        {hasPreview && (
          <button
            onClick={() => setViewRaw((v) => !v)}
            style={{
              background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)',
              fontSize: 10, padding: '1px 6px', cursor: 'pointer',
              flexShrink: 0, marginLeft: 8,
            }}
          >
            {viewRaw ? 'Preview' : 'Raw'}
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, background: 'var(--bg-base)' }}>
        {loading && (
          <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>Loading...</div>
        )}

        {error && (
          <div style={{ padding: 16, color: 'var(--status-error)', fontSize: 12 }}>{error}</div>
        )}

        {/* Binary previews — no text content needed */}
        {!loading && isBinary && fileType === 'image' && <ImagePreview filePath={filePath} />}
        {!loading && isBinary && fileType === 'pdf' && <PdfPreview filePath={filePath} />}

        {/* Text-based previews */}
        {content !== null && !loading && hasPreview && !viewRaw && renderPreview()}

        {/* Code / raw view */}
        {content !== null && !loading && (!hasPreview || viewRaw) && renderCode()}
      </div>
    </div>
  )
}

import { useState, useMemo, useCallback } from 'react'

interface JsonTreeProps {
  content: string
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

function JsonNode({ keyName, value, depth }: { keyName?: string; value: JsonValue; depth: number }) {
  const isExpandable = value !== null && typeof value === 'object'
  const [expanded, setExpanded] = useState(depth < 2)

  const toggle = useCallback(() => setExpanded((v) => !v), [])

  const renderValue = () => {
    if (value === null) return <span style={{ color: '#7c6af7' }}>null</span>
    if (typeof value === 'boolean') return <span style={{ color: '#7c6af7' }}>{String(value)}</span>
    if (typeof value === 'number') return <span style={{ color: '#79c0ff' }}>{value}</span>
    if (typeof value === 'string') return <span style={{ color: '#a5d6ff' }}>"{value}"</span>
    return null
  }

  const isArray = Array.isArray(value)
  const entries = isExpandable ? Object.entries(value as Record<string, JsonValue>) : []
  const bracket = isArray ? ['[', ']'] : ['{', '}']

  return (
    <div style={{ marginLeft: depth > 0 ? 16 : 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 4,
          lineHeight: 1.6,
          cursor: isExpandable ? 'pointer' : 'default',
        }}
        onClick={isExpandable ? toggle : undefined}
      >
        {isExpandable && (
          <span
            style={{
              width: 14,
              display: 'inline-block',
              color: 'var(--text-muted)',
              fontSize: 10,
              flexShrink: 0,
              userSelect: 'none',
            }}
          >
            {expanded ? '▼' : '▶'}
          </span>
        )}
        {!isExpandable && <span style={{ width: 14, display: 'inline-block', flexShrink: 0 }} />}
        {keyName !== undefined && (
          <span style={{ color: '#d2a8ff' }}>
            "{keyName}"<span style={{ color: 'var(--text-muted)' }}>: </span>
          </span>
        )}
        {isExpandable ? (
          <span style={{ color: 'var(--text-muted)' }}>
            {bracket[0]}
            {!expanded && (
              <span> {entries.length} {isArray ? 'items' : 'keys'} {bracket[1]}</span>
            )}
          </span>
        ) : (
          renderValue()
        )}
      </div>
      {isExpandable && expanded && (
        <>
          {entries.map(([k, v], i) => (
            <JsonNode
              key={`${k}-${i}`}
              keyName={isArray ? undefined : k}
              value={v}
              depth={depth + 1}
            />
          ))}
          <div style={{ marginLeft: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {bracket[1]}
          </div>
        </>
      )}
    </div>
  )
}

export function JsonTree({ content }: JsonTreeProps) {
  const parsed = useMemo(() => {
    try {
      return { value: JSON.parse(content) as JsonValue, error: null }
    } catch (e) {
      return { value: null, error: (e as Error).message }
    }
  }, [content])

  if (parsed.error) {
    return (
      <div style={{ padding: 16, color: 'var(--status-error)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
        Invalid JSON: {parsed.error}
      </div>
    )
  }

  return (
    <div
      style={{
        padding: '8px 12px',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        overflow: 'auto',
        height: '100%',
      }}
    >
      <JsonNode value={parsed.value!} depth={0} />
    </div>
  )
}

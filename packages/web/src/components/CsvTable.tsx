import { useMemo } from 'react'

interface CsvTableProps {
  content: string
  delimiter?: string
}

function parseCsv(content: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let current = ''
  let inQuotes = false
  let row: string[] = []

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    if (inQuotes) {
      if (ch === '"' && content[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === delimiter) {
        row.push(current)
        current = ''
      } else if (ch === '\n' || (ch === '\r' && content[i + 1] === '\n')) {
        row.push(current)
        current = ''
        if (row.some((c) => c !== '')) rows.push(row)
        row = []
        if (ch === '\r') i++
      } else {
        current += ch
      }
    }
  }
  // Last field/row
  row.push(current)
  if (row.some((c) => c !== '')) rows.push(row)

  return rows
}

export function CsvTable({ content, delimiter = ',' }: CsvTableProps) {
  const rows = useMemo(() => parseCsv(content, delimiter), [content, delimiter])

  if (rows.length === 0) {
    return (
      <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>
        Empty file
      </div>
    )
  }

  const header = rows[0]
  const body = rows.slice(1)

  return (
    <div style={{ overflow: 'auto', height: '100%' }}>
      <table
        style={{
          borderCollapse: 'collapse',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          width: '100%',
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                position: 'sticky',
                top: 0,
                padding: '6px 12px',
                textAlign: 'right',
                color: 'var(--text-muted)',
                background: 'var(--bg-elevated)',
                borderBottom: '2px solid var(--border-default)',
                fontWeight: 400,
                width: 40,
              }}
            >
              #
            </th>
            {header.map((cell, i) => (
              <th
                key={i}
                style={{
                  position: 'sticky',
                  top: 0,
                  padding: '6px 12px',
                  textAlign: 'left',
                  color: 'var(--text-primary)',
                  background: 'var(--bg-elevated)',
                  borderBottom: '2px solid var(--border-default)',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr
              key={ri}
              style={{ background: ri % 2 === 0 ? 'transparent' : 'var(--bg-surface)' }}
            >
              <td
                style={{
                  padding: '4px 12px',
                  textAlign: 'right',
                  color: 'var(--text-muted)',
                  borderBottom: '1px solid var(--border-subtle)',
                  userSelect: 'none',
                }}
              >
                {ri + 1}
              </td>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: '4px 12px',
                    color: 'var(--text-secondary)',
                    borderBottom: '1px solid var(--border-subtle)',
                    whiteSpace: 'pre',
                    maxWidth: 400,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

import { useState, useEffect, useCallback, useRef } from 'react'
import { X, StickyNote, Plus, Trash2, Check } from 'lucide-react'

interface NoteItem {
  id: string
  text: string
  done: boolean
  createdAt: number
}

async function fetchNotes(): Promise<NoteItem[]> {
  try {
    const res = await fetch('/api/notes')
    const data = await res.json()
    return data.notes || []
  } catch {
    return []
  }
}

async function saveNotes(notes: NoteItem[]) {
  try {
    await fetch('/api/notes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
  } catch { /* ignore */ }
}

interface NotesDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function NotesDialog({ isOpen, onClose }: NotesDialogProps) {
  const [notes, setNotes] = useState<NoteItem[]>([])
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      fetchNotes().then(setNotes)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  const addNote = useCallback(() => {
    const text = input.trim()
    if (!text) return
    const next: NoteItem[] = [
      { id: `n-${Date.now()}`, text, done: false, createdAt: Date.now() },
      ...notes,
    ]
    setNotes(next)
    saveNotes(next)
    setInput('')
  }, [input, notes])

  const toggleNote = useCallback((id: string) => {
    setNotes(prev => {
      const next = prev.map(n => n.id === id ? { ...n, done: !n.done } : n)
      saveNotes(next)
      return next
    })
  }, [])

  const removeNote = useCallback((id: string) => {
    setNotes(prev => {
      const next = prev.filter(n => n.id !== id)
      saveNotes(next)
      return next
    })
  }, [])

  if (!isOpen) return null

  const pending = notes.filter(n => !n.done)
  const done = notes.filter(n => n.done)

  return (
    <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div
        className="settings-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520, minHeight: 400 }}
      >
        {/* Header */}
        <div className="settings-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <StickyNote className="icon-md" style={{ color: 'var(--accent-primary)' }} />
            <span style={{ fontSize: 'var(--font-xl)', fontWeight: 600 }}>Notes</span>
            <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
              {pending.length} pending
            </span>
          </div>
          <button className="pane-action-btn" onClick={onClose}>
            <X className="icon-md" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* Input */}
        <div style={{
          display: 'flex',
          gap: 'var(--space-sm)',
          padding: 'var(--space-lg) var(--space-xl)',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <input
            ref={inputRef}
            className="form-input"
            style={{ flex: 1 }}
            placeholder="Write down an idea..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addNote() }}
          />
          <button
            onClick={addNote}
            disabled={!input.trim()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: input.trim() ? 'var(--accent-primary)' : 'var(--bg-overlay)',
              color: input.trim() ? '#fff' : 'var(--text-muted)',
              cursor: input.trim() ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s',
              flexShrink: 0,
            }}
          >
            <Plus size={16} />
          </button>
        </div>

        {/* List */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: 'var(--space-lg) var(--space-xl)',
          minHeight: 0,
        }}>
          {notes.length === 0 && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 'var(--space-md)',
              color: 'var(--text-muted)',
              paddingTop: 'var(--space-xxl)',
            }}>
              <StickyNote size={32} style={{ opacity: 0.3 }} />
              <span style={{ fontSize: 'var(--font-sm)' }}>No notes yet</span>
            </div>
          )}

          {pending.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
              {pending.map(note => (
                <NoteRow key={note.id} note={note} onToggle={toggleNote} onRemove={removeNote} />
              ))}
            </div>
          )}

          {done.length > 0 && (
            <>
              <div style={{
                fontSize: 'var(--font-xs)',
                color: 'var(--text-muted)',
                marginTop: pending.length > 0 ? 'var(--space-xl)' : 0,
                marginBottom: 'var(--space-sm)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                Completed ({done.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                {done.map(note => (
                  <NoteRow key={note.id} note={note} onToggle={toggleNote} onRemove={removeNote} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function NoteRow({
  note,
  onToggle,
  onRemove,
}: {
  note: NoteItem
  onToggle: (id: string) => void
  onRemove: (id: string) => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-md)',
        padding: 'var(--space-sm) var(--space-md)',
        borderRadius: 'var(--radius-sm)',
        background: hovered ? 'var(--bg-overlay)' : 'transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={() => onToggle(note.id)}
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          border: note.done
            ? '2px solid var(--accent-primary)'
            : '2px solid var(--border-default)',
          background: note.done ? 'var(--accent-primary)' : 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'all 0.15s',
        }}
      >
        {note.done && <Check size={12} style={{ color: '#fff' }} />}
      </button>

      <span style={{
        flex: 1,
        fontSize: 'var(--font-sm)',
        color: note.done ? 'var(--text-muted)' : 'var(--text-primary)',
        textDecoration: note.done ? 'line-through' : 'none',
        lineHeight: 1.4,
        wordBreak: 'break-word',
      }}>
        {note.text}
      </span>

      <button
        onClick={() => onRemove(note.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          borderRadius: 'var(--radius-sm)',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          opacity: hovered ? 0.7 : 0,
          transition: 'opacity 0.15s',
          color: 'var(--text-muted)',
          flexShrink: 0,
        }}
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}

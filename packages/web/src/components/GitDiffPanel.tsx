import { useState, useCallback, useMemo } from 'react'
import {
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileEdit,
  FileMinus,
  FileSymlink,
  ExternalLink,
  GitBranch,
  Check,
  X,
  CheckCheck,
  Trash2,
  Minus,
  Upload,
} from 'lucide-react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { ClientEvent, FileDiff } from '@/types'

interface GitDiffPanelProps {
  send: (event: ClientEvent) => void
  paneId?: string
}

const statusIcons: Record<string, typeof FilePlus> = {
  added: FilePlus,
  modified: FileEdit,
  deleted: FileMinus,
  renamed: FileSymlink,
}

const statusColors: Record<string, string> = {
  added: 'var(--status-running)',
  modified: 'var(--status-waiting)',
  deleted: 'var(--status-error)',
  renamed: 'var(--accent-primary)',
}

function DiffHunks({ hunks }: { hunks: string }) {
  if (!hunks) return null

  const lines = hunks.split('\n')

  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-xs)',
        lineHeight: 1.6,
        overflow: 'auto',
        borderTop: '1px solid var(--border-subtle)',
      }}
    >
      {lines.map((line, i) => {
        let bg = 'transparent'
        let color = 'var(--text-code)'

        if (line.startsWith('+') && !line.startsWith('+++')) {
          bg = 'var(--diff-added-bg)'
          color = 'var(--status-running)'
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          bg = 'var(--diff-removed-bg)'
          color = 'var(--status-error)'
        } else if (line.startsWith('@@')) {
          color = 'var(--accent-primary)'
        } else if (line.startsWith('diff') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++')) {
          color = 'var(--text-muted)'
        }

        return (
          <div
            key={i}
            style={{
              padding: '0 var(--space-md)',
              background: bg,
              color,
              whiteSpace: 'pre',
              minHeight: 'var(--font-xl)',
            }}
          >
            {line}
          </div>
        )
      })}
    </div>
  )
}

function ActionButton({ icon: Icon, title, onClick, color }: {
  icon: typeof Check
  title: string
  onClick: (e: React.MouseEvent) => void
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 6,
        display: 'flex',
        alignItems: 'center',
        borderRadius: 'var(--radius-sm)',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-elevated)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none'
      }}
    >
      <Icon className="icon-xs" style={{ color: color || 'var(--text-muted)' }} />
    </button>
  )
}

interface DiffFileItemProps {
  diff: FileDiff
  mode: 'unstaged' | 'staged'
  onStage?: (file: string) => void
  onUnstage?: (file: string) => void
  onDiscard?: (file: string) => void
}

function DiffFileItem({ diff, mode, onStage, onUnstage, onDiscard }: DiffFileItemProps) {
  const [expanded, setExpanded] = useState(false)
  const { openFileTab } = useWorkspaceStore()
  const Icon = statusIcons[diff.status] || FileEdit

  const handleOpenFile = (e: React.MouseEvent) => {
    e.stopPropagation()
    openFileTab(diff.file)
  }

  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          padding: 'var(--space-sm) var(--space-lg)',
          cursor: 'pointer',
          fontSize: 'var(--font-sm)',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-primary)',
          userSelect: 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-overlay)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        {expanded ? (
          <ChevronDown className="icon-xs" style={{ color: 'var(--text-muted)' }} />
        ) : (
          <ChevronRight className="icon-xs" style={{ color: 'var(--text-muted)' }} />
        )}
        <Icon className="icon-sm" style={{ color: statusColors[diff.status] }} />
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {diff.file}
        </span>
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}
        >
          <ActionButton icon={ExternalLink} title="Open file" onClick={handleOpenFile} />
          {mode === 'unstaged' && onStage && (
            <ActionButton
              icon={Check}
              title="Stage"
              onClick={(e) => { e.stopPropagation(); onStage(diff.file) }}
              color="var(--status-running)"
            />
          )}
          {mode === 'unstaged' && onDiscard && (
            <ActionButton
              icon={X}
              title="Discard changes"
              onClick={(e) => { e.stopPropagation(); onDiscard(diff.file) }}
              color="var(--status-error)"
            />
          )}
          {mode === 'staged' && onUnstage && (
            <ActionButton
              icon={Minus}
              title="Unstage"
              onClick={(e) => { e.stopPropagation(); onUnstage(diff.file) }}
              color="var(--status-waiting)"
            />
          )}
        </div>
        <span
          style={{
            fontSize: 'var(--font-xs)',
            color: statusColors[diff.status],
            textTransform: 'uppercase',
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {diff.status[0]}
        </span>
      </div>

      {expanded && diff.hunks && <DiffHunks hunks={diff.hunks} />}
    </div>
  )
}

function SectionHeader({ label, count, collapsed, onToggle, children }: {
  label: string
  count: number
  collapsed: boolean
  onToggle: () => void
  children?: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-sm)',
        padding: 'var(--space-sm) var(--space-lg)',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-primary)',
        cursor: 'pointer',
        userSelect: 'none',
        fontSize: 'var(--font-sm)',
        fontWeight: 600,
        color: 'var(--text-secondary)',
      }}
      onClick={onToggle}
    >
      {collapsed ? (
        <ChevronRight className="icon-xs" style={{ color: 'var(--text-muted)' }} />
      ) : (
        <ChevronDown className="icon-xs" style={{ color: 'var(--text-muted)' }} />
      )}
      <span style={{ flex: 1 }}>
        {label}
        <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>
          {count}
        </span>
      </span>
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 2 }}>
        {children}
      </div>
    </div>
  )
}

export function GitDiffPanel({ send, paneId }: GitDiffPanelProps) {
  const { gitDiffs, gitStagedDiffs, gitBranchInfo, panes, paneDiffs } = useWorkspaceStore()
  const [confirmDiscardAll, setConfirmDiscardAll] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [stagedCollapsed, setStagedCollapsed] = useState(false)
  const [unstagedCollapsed, setUnstagedCollapsed] = useState(false)

  const isWorktree = !!paneId
  const pane = isWorktree ? panes.find((p) => p.id === paneId) : undefined

  const unstagedDiffs = useMemo(() => {
    if (paneId && paneDiffs[paneId]) return paneDiffs[paneId]
    if (paneId) return []
    return gitDiffs
  }, [paneId, paneDiffs, gitDiffs])

  const stagedDiffs = useMemo(() => {
    if (paneId) return [] // worktree panes don't show staged for now
    return gitStagedDiffs
  }, [paneId, gitStagedDiffs])

  const handleRefresh = useCallback(() => {
    if (paneId) {
      send({ type: 'pane.diff.refresh', paneId })
    } else {
      send({ type: 'git.refresh' })
    }
  }, [send, paneId])

  const handleStageFile = useCallback((file: string) => {
    send({ type: 'git.accept', file })
  }, [send])

  const handleStageAll = useCallback(() => {
    send({ type: 'git.accept.all' })
  }, [send])

  const handleUnstageFile = useCallback((file: string) => {
    send({ type: 'git.unstage', file })
  }, [send])

  const handleUnstageAll = useCallback(() => {
    send({ type: 'git.unstage.all' })
  }, [send])

  const handleDiscardFile = useCallback((file: string) => {
    send({ type: 'git.discard', file })
  }, [send])

  const handleDiscardAll = useCallback(() => {
    if (!confirmDiscardAll) {
      setConfirmDiscardAll(true)
      setTimeout(() => setConfirmDiscardAll(false), 3000)
      return
    }
    send({ type: 'git.discard.all' })
    setConfirmDiscardAll(false)
  }, [send, confirmDiscardAll])

  const handleCommit = useCallback(() => {
    if (!commitMessage.trim() || stagedDiffs.length === 0) return
    send({ type: 'git.commit', message: commitMessage.trim() })
    setCommitMessage('')
  }, [send, commitMessage, stagedDiffs.length])

  const handlePush = useCallback(() => {
    send({ type: 'git.push' })
  }, [send])

  const totalChanges = unstagedDiffs.length + stagedDiffs.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top bar: branch info + refresh + push */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          padding: 'var(--space-sm) var(--space-lg)',
          flexShrink: 0,
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {isWorktree && pane?.branch ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 'var(--font-xs)',
              color: 'var(--accent-primary)',
              fontFamily: 'var(--font-mono)',
              background: 'var(--accent-subtle)',
              padding: '2px var(--space-sm)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <GitBranch size={11} />
            {pane.branch.replace('nexus/', '')}
          </span>
        ) : gitBranchInfo ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 'var(--font-xs)',
              color: 'var(--accent-primary)',
              fontFamily: 'var(--font-mono)',
              background: 'var(--accent-subtle)',
              padding: '2px var(--space-sm)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <GitBranch size={11} />
            {gitBranchInfo.branch}
            {gitBranchInfo.ahead > 0 && (
              <span style={{ color: 'var(--status-running)' }}>&uarr;{gitBranchInfo.ahead}</span>
            )}
            {gitBranchInfo.behind > 0 && (
              <span style={{ color: 'var(--status-waiting)' }}>&darr;{gitBranchInfo.behind}</span>
            )}
          </span>
        ) : null}

        <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', flex: 1 }}>
          {totalChanges} change{totalChanges !== 1 ? 's' : ''}
        </span>

        {/* Push button */}
        {!isWorktree && gitBranchInfo && gitBranchInfo.ahead > 0 && (
          <button
            onClick={handlePush}
            title={`Push ${gitBranchInfo.ahead} commit${gitBranchInfo.ahead !== 1 ? 's' : ''}`}
            className="pane-action-btn"
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-overlay)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
          >
            <Upload className="icon-sm" style={{ color: 'var(--status-running)' }} />
          </button>
        )}

        <button
          onClick={handleRefresh}
          title="Refresh"
          className="pane-action-btn"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-overlay)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
        >
          <RefreshCw className="icon-sm" style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Scrollable content area */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {totalChanges === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-muted)',
              fontSize: 'var(--font-sm)',
            }}
          >
            No changes
          </div>
        ) : (
          <>
            {/* ─── Staged Changes Section ─────────────────── */}
            {!isWorktree && (
              <>
                <SectionHeader
                  label="Staged Changes"
                  count={stagedDiffs.length}
                  collapsed={stagedCollapsed}
                  onToggle={() => setStagedCollapsed(!stagedCollapsed)}
                >
                  {stagedDiffs.length > 0 && (
                    <ActionButton
                      icon={Minus}
                      title="Unstage all"
                      onClick={() => handleUnstageAll()}
                      color="var(--status-waiting)"
                    />
                  )}
                </SectionHeader>

                {!stagedCollapsed && (
                  <>
                    {stagedDiffs.map((diff) => (
                      <DiffFileItem
                        key={`staged-${diff.file}`}
                        diff={diff}
                        mode="staged"
                        onUnstage={handleUnstageFile}
                      />
                    ))}

                    {/* Commit form */}
                    {stagedDiffs.length > 0 && (
                      <div style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--border-subtle)' }}>
                        <textarea
                          value={commitMessage}
                          onChange={(e) => setCommitMessage(e.target.value)}
                          placeholder="Commit message..."
                          rows={3}
                          onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                              e.preventDefault()
                              handleCommit()
                            }
                          }}
                          style={{
                            width: '100%',
                            background: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-sm)',
                            padding: 'var(--space-sm)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 'var(--font-sm)',
                            resize: 'vertical',
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-primary)' }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
                        />
                        <button
                          onClick={handleCommit}
                          disabled={!commitMessage.trim()}
                          style={{
                            marginTop: 'var(--space-sm)',
                            width: '100%',
                            padding: 'var(--space-sm) var(--space-md)',
                            background: commitMessage.trim() ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                            color: commitMessage.trim() ? '#fff' : 'var(--text-muted)',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            cursor: commitMessage.trim() ? 'pointer' : 'not-allowed',
                            fontWeight: 600,
                            fontSize: 'var(--font-sm)',
                          }}
                        >
                          Commit ({stagedDiffs.length} file{stagedDiffs.length !== 1 ? 's' : ''})
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* ─── Unstaged Changes Section ───────────────── */}
            <SectionHeader
              label="Changes"
              count={unstagedDiffs.length}
              collapsed={unstagedCollapsed}
              onToggle={() => setUnstagedCollapsed(!unstagedCollapsed)}
            >
              {!isWorktree && unstagedDiffs.length > 0 && (
                <>
                  <ActionButton
                    icon={CheckCheck}
                    title="Stage all"
                    onClick={() => handleStageAll()}
                    color="var(--status-running)"
                  />
                  <ActionButton
                    icon={Trash2}
                    title={confirmDiscardAll ? 'Click again to confirm' : 'Discard all'}
                    onClick={() => handleDiscardAll()}
                    color="var(--status-error)"
                  />
                </>
              )}
            </SectionHeader>

            {!unstagedCollapsed && unstagedDiffs.map((diff) => (
              <DiffFileItem
                key={`unstaged-${diff.file}`}
                diff={diff}
                mode="unstaged"
                onStage={handleStageFile}
                onDiscard={handleDiscardFile}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

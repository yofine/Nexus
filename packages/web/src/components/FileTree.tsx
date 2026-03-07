import { useState, useCallback } from 'react'
import { Folder, FolderOpen, File, ChevronRight, ChevronDown } from 'lucide-react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { FileNode } from '@/types'

interface FileTreeNodeProps {
  node: FileNode
  depth: number
  expanded: Set<string>
  onToggle: (path: string) => void
  onSelect: (path: string) => void
  openFilePaths: Set<string>
  activeFilePath: string | undefined
}

function FileTreeNode({ node, depth, expanded, onToggle, onSelect, openFilePaths, activeFilePath }: FileTreeNodeProps) {
  const isExpanded = expanded.has(node.path)
  const isActive = activeFilePath === node.path
  const isOpen = openFilePaths.has(node.path)
  const isDir = node.type === 'directory'

  const handleClick = () => {
    if (isDir) {
      onToggle(node.path)
    } else {
      onSelect(node.path)
    }
  }

  return (
    <>
      <div
        onClick={handleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          paddingLeft: 8 + depth * 16,
          cursor: 'pointer',
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          color: isActive ? 'var(--text-primary)' : isOpen ? 'var(--accent-primary)' : 'var(--text-secondary)',
          background: isActive ? 'var(--accent-subtle)' : 'transparent',
          borderRadius: 3,
          userSelect: 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = 'var(--bg-overlay)'
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = 'transparent'
        }}
      >
        {isDir ? (
          isExpanded ? (
            <ChevronDown size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          ) : (
            <ChevronRight size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          )
        ) : (
          <span style={{ width: 12, flexShrink: 0 }} />
        )}

        {isDir ? (
          isExpanded ? (
            <FolderOpen size={14} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
          ) : (
            <Folder size={14} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
          )
        ) : (
          <File size={14} color={isOpen ? 'var(--accent-primary)' : 'var(--text-muted)'} style={{ flexShrink: 0 }} />
        )}

        <span>{node.name}</span>
      </div>

      {isDir && isExpanded && node.children?.map((child) => (
        <FileTreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          onSelect={onSelect}
          openFilePaths={openFilePaths}
          activeFilePath={activeFilePath}
        />
      ))}
    </>
  )
}

export function FileTree() {
  const { fileTree, tabs, activeTabId, openFileTab } = useWorkspaceStore()
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    for (const node of fileTree) {
      if (node.type === 'directory') {
        initial.add(node.path)
      }
    }
    return initial
  })

  // Derive which files have open tabs and which is active
  const openFilePaths = new Set(
    tabs.filter((t) => t.type === 'file' && t.filePath).map((t) => t.filePath!)
  )
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const activeFilePath = activeTab?.type === 'file' ? activeTab.filePath : undefined

  const handleToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const handleSelect = useCallback((path: string) => {
    openFileTab(path)
  }, [openFileTab])

  if (fileTree.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--text-muted)',
          fontSize: 12,
        }}
      >
        No files
      </div>
    )
  }

  return (
    <div style={{ overflowY: 'auto', overflowX: 'hidden', padding: '4px 0' }}>
      {fileTree.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          depth={0}
          expanded={expanded}
          onToggle={handleToggle}
          onSelect={handleSelect}
          openFilePaths={openFilePaths}
          activeFilePath={activeFilePath}
        />
      ))}
    </div>
  )
}

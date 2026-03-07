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
  selectedFile: string | null
}

function FileTreeNode({ node, depth, expanded, onToggle, onSelect, selectedFile }: FileTreeNodeProps) {
  const isExpanded = expanded.has(node.path)
  const isSelected = selectedFile === node.path
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
          color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
          background: isSelected ? 'var(--accent-subtle)' : 'transparent',
          borderRadius: 3,
          userSelect: 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.background = 'var(--bg-overlay)'
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.background = 'transparent'
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
          <File size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
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
          selectedFile={selectedFile}
        />
      ))}
    </>
  )
}

export function FileTree() {
  const { fileTree, selectedFile, setSelectedFile } = useWorkspaceStore()
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Auto-expand top-level directories
    const initial = new Set<string>()
    for (const node of fileTree) {
      if (node.type === 'directory') {
        initial.add(node.path)
      }
    }
    return initial
  })

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
    setSelectedFile(path)
  }, [setSelectedFile])

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
          selectedFile={selectedFile}
        />
      ))}
    </div>
  )
}

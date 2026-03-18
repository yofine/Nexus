import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Folder,
  FolderOpen,
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileCog,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileVideo,
  ChevronRight,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react'
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

function shouldAutoExpand(node: FileNode) {
  return node.type === 'directory' && !node.name.startsWith('.')
}

function getFileIcon(name: string): LucideIcon {
  const lowerName = name.toLowerCase()
  const ext = lowerName.includes('.') ? lowerName.slice(lowerName.lastIndexOf('.') + 1) : ''

  if (lowerName === 'package.json' || lowerName === 'tsconfig.json' || lowerName.endsWith('.config.js') || lowerName.endsWith('.config.ts')) {
    return FileCog
  }

  if (
    lowerName.startsWith('.env') ||
    lowerName === '.gitignore' ||
    lowerName === '.gitattributes' ||
    lowerName === '.editorconfig' ||
    lowerName.endsWith('.yml') ||
    lowerName.endsWith('.yaml') ||
    lowerName.endsWith('.toml') ||
    lowerName === 'dockerfile'
  ) {
    return FileCog
  }

  if (ext === 'json') return FileJson
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'php', 'c', 'cc', 'cpp', 'h', 'hpp', 'cs', 'sh', 'bash', 'zsh'].includes(ext)) {
    return FileCode2
  }
  if (['css', 'scss', 'sass', 'less', 'html', 'xml'].includes(ext)) return FileCode2
  if (['md', 'mdx', 'txt', 'rst'].includes(ext) || lowerName === 'readme') return FileText
  if (['csv', 'tsv', 'xls', 'xlsx'].includes(ext)) return FileSpreadsheet
  if (ext === 'pdf') return FileText
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif'].includes(ext)) return FileImage
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return FileVideo
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return FileAudio
  if (['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar'].includes(ext)) return FileArchive

  return File
}

function FileTreeNode({ node, depth, expanded, onToggle, onSelect, openFilePaths, activeFilePath }: FileTreeNodeProps) {
  const isExpanded = expanded.has(node.path)
  const isActive = activeFilePath === node.path
  const isOpen = openFilePaths.has(node.path)
  const isDir = node.type === 'directory'
  const FileIcon = getFileIcon(node.name)

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
        className="file-tree-node"
        style={{
          paddingLeft: `calc(var(--space-md) + ${depth} * var(--space-xl))`,
          color: isActive ? 'var(--text-primary)' : isOpen ? 'var(--accent-primary)' : 'var(--text-secondary)',
          background: isActive ? 'var(--accent-subtle)' : 'transparent',
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
            <ChevronDown className="icon-xs" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          ) : (
            <ChevronRight className="icon-xs" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          )
        ) : (
          <span className="icon-xs" style={{ flexShrink: 0 }} />
        )}

        {isDir ? (
          isExpanded ? (
            <FolderOpen className="icon-sm" style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
          ) : (
            <Folder className="icon-sm" style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
          )
        ) : (
          <FileIcon className="icon-sm" style={{ color: isOpen ? 'var(--accent-primary)' : 'var(--text-muted)', flexShrink: 0 }} />
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const initializedRef = useRef(false)

  // Auto-expand two levels deep when file tree first arrives
  useEffect(() => {
    if (fileTree.length > 0 && !initializedRef.current) {
      initializedRef.current = true
      const initial = new Set<string>()
      for (const node of fileTree) {
        if (shouldAutoExpand(node)) {
          initial.add(node.path)
          if (node.children) {
            for (const child of node.children) {
              if (shouldAutoExpand(child)) {
                initial.add(child.path)
              }
            }
          }
        }
      }
      setExpanded(initial)
    }
  }, [fileTree])

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
          fontSize: 'var(--font-sm)',
        }}
      >
        No files
      </div>
    )
  }

  return (
    <div style={{ overflowY: 'auto', overflowX: 'hidden', padding: 'var(--space-xs) 0', height: '100%' }}>
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

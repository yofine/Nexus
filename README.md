# Nexus

A local web console for managing multiple CLI AI Agent instances in parallel from a single browser interface.

## Features

### 🖥️ Multi-Agent Parallel Management
- Supports multiple agents: Claude Code, OpenCode, Aider, Codex, Gemini
- Each agent runs in its own collapsible terminal pane
- Create, close, and restart agent processes
- Real-time status indicators (running / waiting / idle / stopped / error)
- Floating bottom shell terminal, always accessible

### 🔀 Git Worktree Isolation
- Each agent can work in its own isolated Git worktree
- Parallel development on independent branches without conflicts
- Branch name and file change count displayed in pane headers

### 📊 Agent Metadata Monitoring
- Automatically parses Claude Code statusline for runtime info
- Live display of model name, context usage %, cumulative cost, session ID
- All agent states written to `.nexus/agents.yaml` for cross-agent awareness

### 📁 File & Code Viewing
- Live file tree with automatic change detection (chokidar)
- Built-in code viewer with Shiki syntax highlighting
- Git diff panel for repo-level change inspection

### ⌨️ Shortcuts & Command Palette
- `Cmd/Ctrl+K` — Open command palette
- `Cmd/Ctrl+N` — New agent pane
- `Cmd/Ctrl+1-9` — Switch between panes
- `Cmd/Ctrl+G` — Open Git diff
- Theme switching via command palette

### 🎨 Themes & Layout
- Resizable four-column layout: Sidebar / Agent Panes / Editor / File Tree
- 7 built-in themes: Dark IDE, GitHub Dark, Dracula, Tokyo Night, Catppuccin, Nord, Light IDE
- Responsive scaling for large screens

### 📝 Configuration
- YAML-driven config at global (`~/.nexus/config.yaml`) and project level
- Per-agent working directory and task description
- Session restore modes: continue (`--continue`) / restart / manual

## Installation & Usage

```bash
# Install globally
npm install -g nexus-console

# Start in the current directory
nexus

# Start with a specific project path
nexus ~/projects/my-app

# Initialize project config
nexus init ~/projects/my-app

# Check workspace status
nexus status

# Stop the server
nexus stop

# Custom port
NEXUS_PORT=8080 nexus
```

### Development

```bash
# Install dependencies
pnpm install

# Dev mode (build frontend, then start server with watch)
pnpm dev

# Full dev mode (frontend + backend hot reload in parallel)
pnpm dev:full

# Production build
pnpm build

# Start production server
pnpm start
```

## Tech Stack

**Backend**
- Node.js 22+, TypeScript, Fastify 5, @fastify/websocket
- node-pty (terminal process management)
- chokidar (file watching), simple-git (Git operations)

**Frontend**
- React 18, TypeScript, Vite 6
- Tailwind CSS v4, xterm.js, Zustand
- Shiki (syntax highlighting), react-diff-view, cmdk

## Architecture

```
Browser (React + WebSocket)
    ↕
Node.js Server (Fastify)
    ↕
CLI Agent Processes (node-pty)
```

## License

MIT

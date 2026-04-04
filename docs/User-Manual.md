# Nexus User Manual

## What is Nexus?

Nexus is a local web console that lets you manage multiple CLI AI agent instances in parallel from a single browser interface.

Instead of opening several terminal windows for different coding agents, you can monitor and operate them all in one browser tab, while also tracking file changes and Git status in real time.

---

## Quick Start

### Install and Run

#### Option 1: Global install for end users

```bash
# Requires Node.js 22+
npm install -g mexus-cli

# Start in the current directory
mexus

# Start with a specific project path
mexus ~/projects/my-app

# Initialize project config
mexus init ~/projects/my-app

# Check workspace status
mexus status

# Stop the server
mexus stop

# Use a custom port
NEXUS_PORT=8080 mexus
```

On first launch, Nexus automatically opens `http://localhost:7700` in your browser.

#### Option 2: Run from source for development

```bash
# Install dependencies
pnpm install

# Dev mode
pnpm dev

# Full dev mode with frontend/backend hot reload
pnpm dev:full

# Production build
pnpm build
pnpm start
```

When running from source, Nexus also opens `http://localhost:7700` on first launch.

### Common CLI Commands

```bash
# Current directory
mexus

# Specific project directory
mexus ~/projects/my-app

# Initialize project config
mexus init ~/projects/my-app

# Custom port
NEXUS_PORT=8080 mexus
```

---

## Interface Overview

Nexus uses a four-column layout:

```
┌────┬─────────────────────┬────────────┬──────────┐
│  S │    Agent Panes      │ Diff/Notes │ File     │
│  i │   (main area)       │            │ Tree     │
│  d │                     │            │          │
└────┴─────────────────────┴────────────┴──────────┘
```

### 1. Sidebar

The 48px toolbar on the left includes:

| Icon | Action |
|------|--------|
| `+` | Add a new agent pane |
| `⚡` | Task dispatching (batch tasks / broadcast messages) |
| `📋` | Task templates |
| `⚙` | Workspace settings |

### 2. Agent Pane Area

Each agent runs inside a collapsible accordion pane and shows:

- **Status indicator**: running (green), waiting (yellow), idle (gray), error (red)
- **Agent type**: claudecode, opencode, kimi-cli, qwencode, and more
- **Task description**: the assigned task
- **Runtime metadata**: model name, context usage, cumulative cost (Claude Code specific)

You can expand a pane for the full terminal session or collapse it into a card view to scan all agents quickly.

### 3. Diff and Comments Panel

- **Git Diff**: inspect unstaged and staged changes
- **Code comments**: attach comments to specific lines and send them back to a target agent

### 4. File Tree

The file tree updates in real time and supports:

- expanding and collapsing directories
- click-to-preview files with syntax highlighting
- automatic file change detection through chokidar

---

## Core Features

### Manage Multiple Agents

**Create a new agent pane:**
1. Click the `+` icon in the sidebar
2. Choose an agent type such as `claudecode` or `opencode`
3. Set a working directory if needed
4. Enter a task description
5. Choose a restore mode: `continue`, `restart`, or `manual`

**Agent states:**
- `running`: currently executing a task
- `waiting`: waiting for user input
- `idle`: ready but inactive
- `stopped`: stopped
- `error`: failed

**Restart an agent:** right-click the pane title and choose a restart mode.

### Git Worktree Isolation

Nexus can give each agent its own Git worktree for real parallel development:

```yaml
# Example: .nexus/config.yaml
panes:
  - name: "Feature A"
    agent: claudecode
    worktreePath: ../my-app-feature-a
    branch: feature-a
    task: "Build the new feature"

  - name: "Feature B"
    agent: claudecode
    worktreePath: ../my-app-feature-b
    branch: feature-b
    task: "Build another feature"
```

This allows multiple agents to work on separate branches without interfering with each other.

### Real-Time Metadata Monitoring

Nexus parses Claude Code statusline output and displays:

- **Model**: current model, such as `claude-sonnet-4-5`
- **Context**: context usage percentage
- **Cost**: cumulative session cost in USD
- **Session ID**: session identifier

This metadata updates live in each collapsed pane header.

### Terminal Interaction

- Every agent pane includes a full xterm.js terminal
- Supports command input, scrolling, and mouse interaction
- A floating bottom shell (`__shell__`) is always available as a global terminal

### File Browsing

- **File tree**: live project structure
- **File preview**: click a file to inspect code with Shiki highlighting
- **Change detection**: create, modify, and delete events update the tree automatically

### Git Integration

- **Diff panel**: inspect staged and unstaged changes
- **Quick actions**: stage, unstage, discard, commit, push
- **Branch info**: current branch plus ahead/behind counts

---

## Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Open the command palette |
| `Cmd/Ctrl + N` | Create a new agent pane |
| `Cmd/Ctrl + 1-9` | Switch to a pane |
| `Cmd/Ctrl + G` | Open the Git Diff panel |

---

## Theme System

Nexus includes seven built-in themes that can be switched from the command palette:

1. **Dark IDE** (default): VSCode Dark+ style
2. **GitHub Dark**: GitHub dark theme
3. **Dracula**: classic purple/green contrast
4. **Tokyo Night**: popular neon-night palette
5. **Catppuccin**: soft muted tones
6. **Nord**: cool minimalist palette
7. **Light IDE**: light IDE style

To switch themes: `Cmd/Ctrl + K`, type `theme`, then choose one.

---

## Configuration Files

### Global config: `~/.nexus/config.yaml`

Defines system-wide settings and agent definitions:

```yaml
version: "1"

defaults:
  shell: /bin/zsh
  scrollback_lines: 5000
  grid_columns: 2
  theme: dark-ide

agents:
  claudecode:
    bin: claude
    continue_flag: "--continue"
    statusline: true
    env:
      ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY}"
```

### Project config: `.nexus/config.yaml`

Defines the current workspace:

```yaml
version: "1"
name: "my-app"
description: "Project description"

repository:
  path: "."
  git: true

panes:
  - id: pane-1
    name: "Refactor Task"
    agent: claudecode
    workdir: src/auth
    task: "Refactor JWT validation logic"
    restore: continue
```

### Runtime state: `.nexus/agents.yaml`

Generated and maintained automatically by Nexus, this file records real-time agent state:

```yaml
updated_at: "2026-03-16T10:00:00+08:00"

panes:
  - id: pane-1
    name: "Refactor Task"
    agent: claudecode
    pid: 12345
    status: running
    model: claude-sonnet-4-5
    context_used_pct: 35
    cost_usd: 0.15
    session_id: "abc123"
```

This file is ignored by Git and is used for cross-agent awareness.

---

## Common Scenarios

### Scenario 1: Multi-Agent Code Review

1. Create a dedicated review agent pane
2. Inspect changes in the Git Diff panel
3. Add comments directly in the diff
4. Send those comments back to the relevant agent

### Scenario 2: Parallel Feature Development

1. Create one pane per feature
2. Assign each pane its own Git worktree and branch
3. Start multiple agents in parallel
4. Track progress through `.nexus/agents.yaml`

### Scenario 3: Task Dispatch and Broadcast

1. Create a broadcast group for related agents
2. Use task dispatch to create tasks in batches
3. Send broadcast messages to the whole group

---

## Troubleshooting

### Agent Does Not Start

1. Check whether the CLI is installed: `which claude` / `which opencode`
2. Verify the agent binary path in `~/.nexus/config.yaml`
3. Inspect terminal output for errors

### Terminal Shows No Output

1. Confirm the terminal connection is still active and refresh the page
2. Resize the terminal, since some agents are sensitive to terminal dimensions

### File Tree Does Not Update

1. Check read/write permissions in the project directory
2. Confirm the file is not excluded from the visible workspace

---

## Technical Architecture

```
Browser (React + WebSocket)
    │
    ▼
Node.js Server (Fastify)
    │
    ├── PTY Manager (node-pty) ──► CLI Agent processes
    ├── File Watcher (chokidar) ──► File system
    ├── Git Service (simple-git) ──► Git repository
    └── History Manager ──► Terminal history storage
```

---

## More Information

- Source code: https://github.com/anomalyco/nexus
- Report issues: https://github.com/anomalyco/nexus/issues

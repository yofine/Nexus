# Quick Start

## 1. Install

Nexus requires Node.js 22 or newer.

```bash
npm install -g mexus-cli
```

This documentation uses `mexus` consistently in examples. The current app still accepts `nexus` as a compatible alias, but `mexus` is the recommended command name.

## 2. Start in your project

```bash
mexus
```

Or:

```bash
mexus ~/projects/my-app
```

The default port is `7700`. On first launch, Nexus will try to open `http://localhost:7700` automatically.

## 3. Initialize workspace config

If your project does not have `.nexus/config.yaml` yet:

```bash
mexus init .
```

## 4. Create your first agent pane

In the UI, click `Add Pane` in the left sidebar:

1. Pick an agent type
2. Enter a pane name
3. Choose `New Session` or `Resume Session`
4. Switch to `Worktree` if you need isolation
5. For new sessions, provide a working directory and task text if needed

## 5. Use the main workflow

The most common usage pattern is:

- watch multiple panes in the main area
- use `Review` in the editor area to inspect Git changes
- keep `Activity` open to monitor file operations
- use `Replay History` to revisit previous sessions
- keep `Notes` for shared workspace context

## Next steps

- Want the UI map: read [Interface Overview](/en/interface)
- Want workflow guides: read [Common Tasks](/en/tasks)
- Want command details: read [CLI Usage](/en/cli)

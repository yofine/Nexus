# Feature Reference

## Agent management

Supported pane agent types include:

- Claude Code
- Codex
- OpenCode
- Kimi Code
- Qoder CLI

Each pane has its own state and session lifecycle. When creating a pane you can choose either a fresh session or a resumed session.

## Status and runtime metadata

Pane states:

- `running`
- `waiting`
- `idle`
- `stopped`
- `error`

Current metadata fields:

- `model`
- `contextUsedPct`
- `costUsd`
- `sessionId`
- `cwd`

These values update as the agent runs.

## Terminals and conversation events

Each pane includes a full terminal interaction area with support for:

- command input
- continuous output
- terminal resize syncing
- scrollback replay after reconnects

The product protocol also includes conversation-event streams for messages and tool events.

## Bottom shell

The system keeps a dedicated global shell pane whose internal type is `__shell__`. It is not rendered as a standard agent pane in the workspace list, but it exists as the bottom terminal.

## File browsing and preview

The file tree updates through live watching. Current preview modes include:

- highlighted code
- Markdown
- Mermaid
- SVG
- HTML
- CSV / TSV
- PDF
- images
- JSON

## Git and workspace changes

The shared `Review` tab can display:

- unstaged diffs
- staged diffs
- current branch
- remote branch
- ahead / behind counts

Worktree panes can also expose pane-specific diffs.

## Worktree isolation

Worktree mode is designed for parallel work. Nexus creates:

- a dedicated disk path
- a dedicated branch
- a dedicated diff view

It also supports restore, merge, and discard flows.

## Replay History

The replay system records:

- session summaries
- turn lists
- terminal output
- status changes
- metadata changes
- file activity

You can inspect a replay turn in detail from the replay UI.

## Notes

Notes provide a workspace-level scratchpad for context that should stay close to the session rather than inside version-controlled source files.

## Activity views

The Activity area aggregates file activity across panes and offers multiple observation styles.

::: warning Experimental
Activity-oriented views are already present in the UI, but they are more analytical and may continue to evolve in naming, layout, or interaction details.
:::

## Settings, themes, and fonts

Settings currently contains:

- `General`
- `Shortcuts`
- `Agents`

Adjustable values include:

- theme
- monospace font
- default shell
- scrollback size
- grid columns
- history retention days
- agent bin, continue flag, resume flag, yolo flag, transport, and env

## Session resume

When a pane has a saved `sessionId`, the system prioritizes the resume flow. For agents that support explicit resume arguments, Nexus passes the configured resume flag.

# Interface Overview

## Layout

Nexus currently uses a four-part workspace layout:

1. Left sidebar
2. Agent pane area
3. Editor / observer area
4. Right-side file tree

The editor area can show `Activity`, `Review`, `Replay`, and file preview tabs.

## Sidebar

The current sidebar contains:

- `Add Pane`
- `Replay History`
- `Notes`
- `Settings`

::: warning Outdated manuals
Older manuals in the repository mention task dispatching and templates in the sidebar. The current code has replaced those entries with `Replay History` and `Notes`.
:::

## Agent pane area

Each pane represents one running agent session. It can show:

- pane name
- agent type
- current state: `running`, `waiting`, `idle`, `stopped`, `error`
- task description
- runtime metadata such as model, context, cost, and session ID
- worktree branch and change counts when isolation is enabled

## Editor area

The editor area is a tabbed observer panel rather than a source editor.

Common tabs include:

- `Activity`: file activity, timelines, and dependency-topology style views
- `Review`: Git diff for the workspace or a specific worktree pane
- `Replay`: previous sessions and replay turns
- `File`: preview for the selected file

It also supports an observer mode and layout reset actions.

## File tree

The file tree updates in real time and opens file previews on click.

Current preview types include:

- syntax-highlighted code
- Markdown
- Mermaid diagrams
- SVG
- HTML
- CSV / TSV tables
- PDF
- images
- JSON tree views

Some previewable file types support a `Preview / Raw` toggle.

## Bottom shell

In addition to pane terminals, Nexus has a persistent bottom shell for general commands. It is not treated like a normal agent pane.

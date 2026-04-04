# Common Tasks

## Create a new agent pane

1. Click `Add Pane`
2. Choose an agent type
3. Enter a name
4. Select `New Session`
5. Fill in work directory and task text if needed
6. Choose `Shared` or `Worktree`

If the selected agent is not installed, the option appears disabled.

## Resume an existing session

1. Open `Add Pane`
2. Switch `Start Mode` to `Resume Session`
3. Pick a session from the list
4. Create the pane

Resume mode prioritizes the selected `sessionId`, so it does not ask for the usual new-session task fields.

## Restart a pane

The current product includes restart / resume flows for pane lifecycle management. Typical use cases include:

- recovering after a failed session
- continuing from a previous session
- re-running the same pane as a fresh session

The exact entry point depends on pane state and UI context.

## Use worktrees for parallel development

This is the main option when multiple agents need to work on the same repository safely.

1. Create a pane and switch isolation to `Worktree`
2. Nexus creates a dedicated worktree and branch for that pane
3. Inspect pane-specific diffs in the related `Review` view
4. Merge or discard when the isolated task is finished

::: info
Worktree panes have their own branch state and diff stream instead of sharing one workspace diff.
:::

## Review Git changes

### Review the shared workspace

Open the pinned `Review` tab in the editor area.

### Review one worktree pane

Open the review tab associated with that worktree pane to inspect its isolated changes.

## Merge or discard a worktree result

For worktree panes, Nexus exposes merge / discard flows.

- `merge`: tries to merge the worktree branch back into the main repository
- `discard`: removes the isolated worktree and its branch

::: warning
These actions affect Git state. Check the diff before you run them.
:::

## Open Replay History

Click `Replay History` in the sidebar. You can:

- browse previous sessions
- open one session
- select a turn for playback
- inspect terminal output and file activity during replay

## Use Notes

Click `Notes` in the sidebar and record workspace-level context such as:

- task background
- open questions
- team conventions
- temporary operational notes

## Monitor file activity

The pinned `Activity` tab tracks recent file activity, including:

- read
- edit
- write
- create
- delete
- bash

This is useful when multiple agents are working in parallel.

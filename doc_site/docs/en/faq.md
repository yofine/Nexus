# FAQ / Troubleshooting

## Why is an agent type missing or disabled?

If the agent is not installed locally, the new-pane dialog marks it as unavailable. Install the matching CLI first, then reopen the dialog.

## Why is the resume session list empty?

Common reasons:

- no previous sessions for the selected agent
- sessions are not discoverable from the current workspace
- the agent history is not compatible with the current resume flow

## Why are the file tree or activity views not updating?

Nexus depends on file watching and terminal activity parsing. If nothing changed recently, if a path is ignored, or if an action did not produce recognizable output, updates may appear delayed or absent.

## Why can't a worktree pane be restored?

Restore depends on the original branch and worktree path still being valid. If the branch was deleted, Nexus may skip restoring that pane.

## Why is Replay empty?

Replay is for replayable agent sessions. The global shell is not treated like a normal agent pane in the replay system.

## What if `mexus stop` does not seem to work?

First confirm that Nexus is actually running on the expected port, and that you are issuing the command in the same machine and port context.

## Why do some docs pages include an Experimental label?

Because this site intentionally covers features that already exist in the repository and UI, even when parts of their interaction model are still evolving.

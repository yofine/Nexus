# Configuration

## Config file locations

### Global config

`~/.nexus/config.yaml`

### Project config

`.nexus/config.yaml`

## Example global config

```yaml
version: "1"

defaults:
  shell: /bin/zsh
  scrollback_lines: 5000
  grid_columns: 2
  history_retention_days: 14
  theme: dark-ide

agents:
  claudecode:
    bin: claude
    continue_flag: "--continue"
    resume_flag: "--resume"
    yolo_flag: "--dangerously-skip-permissions"
    statusline: true
    transport: pty
```

## Common fields

### `defaults`

- `shell`
- `scrollback_lines`
- `grid_columns`
- `history_retention_days`
- `theme`

### `agents.<name>`

- `bin`
- `continue_flag`
- `resume_flag`
- `yolo_flag`
- `statusline`
- `transport`
- `env`

## Common pane fields in project config

- `name`
- `agent`
- `workdir`
- `task`
- `restore`
- `isolation`
- `branch`
- `worktreePath`
- `sessionId`

## `restore` modes

The current code surface exposes these restoration-related modes:

- `restart`
- `resume`

The underlying types still include `continue` and `manual`, but the current new-pane dialog mainly uses the two modes above.

## `isolation` modes

- `shared`
- `worktree`

## Agent environment variables

Use `agents.<name>.env` to inject environment variables for a specific agent, such as API keys or custom runtime options.

## Relationship between UI settings and file config

The settings dialog reads and writes the global config. Project-level pane state and saved session details come from workspace config plus runtime state.

# CLI Usage

## Basic format

```bash
mexus [command] [directory]
```

If you omit the command, Nexus uses `start`.

## Common commands

### Start in the current directory

```bash
mexus
```

### Start in a specific directory

```bash
mexus ~/projects/my-app
```

### Explicit `start`

```bash
mexus start ~/projects/my-app
```

### Initialize `.nexus/`

```bash
mexus init .
```

### Show workspace status

```bash
mexus status
```

### Stop the running server

```bash
mexus stop
```

## Environment variables

### `NEXUS_PORT`

Set the HTTP server port:

```bash
NEXUS_PORT=7800 mexus
```

### `NEXUS_PROJECT_DIR`

Mostly useful for development or scripted startup flows when you want to force the project directory.

## Directory resolution rules

- If you pass a directory, Nexus uses it
- If you do not pass one, Nexus tries to find a project root by walking upward
- If it finds `pnpm-workspace.yaml`, that path wins as the project root

## Self-update behavior

The current CLI includes a background self-update check. During normal startup it runs in the background and should not block the UI from opening.

::: info Note
Whether the update succeeds depends on your local npm environment and install method.
:::

## Help

```bash
mexus --help
```

`nexus --help` still works as a compatible alias, but this site uses `mexus` consistently.

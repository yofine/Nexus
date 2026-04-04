# Installation

## Requirements

- Node.js `>= 22`
- A local Git repository or project directory you want to work in
- At least one supported CLI agent installed locally, such as Claude Code, Codex, OpenCode, Kimi Code, or Qoder CLI

## Global install

```bash
npm install -g mexus-cli
```

Available commands after install:

- `mexus`

Compatible alias:

- `nexus`

## Run from source

If you are using this repository directly:

```bash
pnpm install
pnpm dev
```

For frontend and backend hot reload together:

```bash
pnpm dev:full
```

For a production build:

```bash
pnpm build
pnpm start
```

## Port

Default port is `7700`. To change it:

```bash
NEXUS_PORT=8080 mexus
```

## Agent availability checks

Nexus checks configured agents after startup. Missing agents do not block the app itself, but those agent types may appear unavailable when creating a pane.

## Common install issues

### Node.js version too low

The CLI exits immediately. Upgrade to Node.js 22 or later and retry.

### Package installed but command missing

Make sure your global npm bin directory is in `PATH`, or use `npm ls -g mexus-cli` to confirm the package is actually installed.

### Agent command not available

Nexus does not install third-party agents for you. Install the matching CLI first, then return to Nexus.

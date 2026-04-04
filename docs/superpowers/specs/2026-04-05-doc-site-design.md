# Nexus Documentation Site Design

**Date:** 2026-04-05

## Goal

Build a user-facing documentation site under `doc_site` using VitePress. The site should cover all currently implemented product capabilities, with experimental or in-progress areas clearly labeled instead of omitted.

## Audience

Primary audience: end users of Nexus.

This site is not a developer handbook. Technical implementation details should appear only when they help users install, configure, or troubleshoot the product.

## Scope

The documentation site will include:

- Product overview and value proposition
- Installation and quick start
- CLI usage
- Interface overview
- Core workflows for everyday usage
- Feature reference covering the currently implemented UI and CLI capabilities
- Configuration reference
- Keyboard shortcuts
- FAQ and troubleshooting
- Experimental feature labeling where appropriate

The site will not include:

- Deep internal architecture documentation
- Contributor or maintainer workflow documentation
- Roadmap-only features that do not exist in the current codebase

## Information Architecture

Recommended structure: task-oriented onboarding plus complete feature reference.

Chinese and English should use mirrored navigation trees so the structure stays consistent across both languages.

### Chinese sections

1. Home
2. Quick Start
3. Installation
4. CLI Usage
5. Interface Overview
6. Common Tasks
7. Feature Reference
8. Configuration
9. Shortcuts
10. FAQ and Troubleshooting

### English sections

1. Home
2. Quick Start
3. Installation
4. CLI Usage
5. Interface Overview
6. Common Tasks
7. Feature Reference
8. Configuration
9. Shortcuts
10. FAQ and Troubleshooting

## Content Coverage

The feature reference should cover the currently visible and implemented product surface, including:

- Starting Nexus from CLI
- Opening a workspace
- Multi-pane agent management
- Agent status and runtime metadata
- Resume and restart flows
- Terminal interaction
- Bottom shell terminal
- File tree and file preview
- Syntax-highlighted viewers and preview modes where present
- Git diff and branch information
- Git worktree usage
- Replay history
- Notes
- Activity tracking and related views that are already present in the UI
- Settings and theme selection
- Keyboard shortcuts
- Workspace and global config files

If a capability exists in code but is incomplete, unstable, or partially integrated, it should still be documented with a visible status note such as "Experimental" or "Work in Progress".

## UX and Presentation

The documentation site should be straightforward and readable rather than overly branded.

Presentation decisions:

- Use VitePress default documentation patterns with light customization
- Keep navigation shallow and predictable
- Put installation and quick start near the top
- Use callouts for warnings, requirements, and experimental features
- Use mirrored Chinese and English landing pages
- Keep code blocks copyable and realistic

## Localization Strategy

The site should support full Chinese and English content.

Strategy:

- Separate `zh` and `en` content trees
- Keep filenames and navigation aligned between languages where practical
- Write Chinese as the primary source version during this task
- Produce equivalent English pages in the same pass so the shipped site is fully bilingual

## Accuracy Rules

Content must be derived from the current repository state, not only from older manual files.

Source priority:

1. Current code paths and UI components
2. Current README and existing manuals
3. Recent release notes and design documents when they describe already shipped functionality

Where existing docs and current code disagree, the current code wins.

## Technical Design

The implementation should create a self-contained VitePress site under `doc_site`.

Expected layout:

- `doc_site/package.json`
- `doc_site/docs/.vitepress/config.ts`
- `doc_site/docs/index.md`
- `doc_site/docs/zh/...`
- `doc_site/docs/en/...`

The root workspace package setup should remain minimally affected. The doc site should be runnable independently with standard VitePress commands.

## Implementation Boundaries

This task should:

- Scaffold the VitePress site
- Add bilingual navigation and pages
- Write the first complete set of user documentation pages
- Mark experimental areas clearly

This task should not:

- Replace existing `docs/*.md` files unless needed later
- Reorganize product code
- Introduce a custom docs build pipeline unless VitePress setup requires a minimal one

## Verification

Before completion, verify:

- The VitePress site installs and runs locally
- Both Chinese and English routes are reachable
- Navigation is complete in both languages
- No sidebar links are broken
- Documented commands match current CLI behavior at a high level

## Risks

- Existing manuals contain outdated feature descriptions, so content must be checked against the current UI and server code.
- Some UI surfaces may exist without fully polished workflows, requiring careful experimental labeling.
- Full bilingual coverage increases writing volume, so page structure should stay compact and reusable.

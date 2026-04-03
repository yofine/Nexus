# External Release Quality Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare a public-facing release where every visible feature is usable; fix small defects and hide larger or incomplete features instead of shipping broken behavior.

**Architecture:** This release is a quality-convergence pass, not a feature release. The plan focuses on the core pane lifecycle, removes unfinished UI entry points, tightens restart/start semantics across WebSocket, store, and pane controls, and uses manual smoke validation as the primary release gate because automated coverage is currently narrow.

**Tech Stack:** pnpm monorepo, Node.js 22+, Fastify 5, React 18, Zustand, Vite 6, Vitest (server-side only)

---

## Release Policy

- Visible features must pass an explicit verification path.
- If a feature is unfinished, semantically misleading, or cannot be verified quickly, hide it for this release.
- No net-new features or interaction redesign in this release.
- Fix only problems that improve release quality on the current main path.

## Problem Inventory

### Known Issues From Product Review

1. Agent pane `restart/start` button is invalid.
2. New pane dialog `Start Mode` is invalid.
3. Left sidebar lightning icon is unimplemented and should be hidden.
4. Left sidebar task/templates icon is unimplemented and should be hidden.

### Additional Risks Found In Code Review

1. `WorkspaceManager.restartPane()` respawns the same `paneId` and emits `pane.added`, but the frontend store appends panes instead of upserting. This can produce duplicate pane state after restart.
2. `AgentPane` restart action always sends `mode: 'restart'`, while resume/start behavior is split across separate buttons and does not align with persisted `pane.restore` semantics.
3. `AddPaneDialog` exposes only `New Session` and `Resume Session`, but runtime types support `continue`, `restart`, `manual`, and `resume`. Current UI does not match actual runtime semantics.
4. `CommandPalette` restart uses `pane.restore`, which can diverge from the visible pane header controls and produce inconsistent behavior.
5. README/positioning still describes features that are either incomplete or hidden behind disabled UI, so release messaging must be reconciled with the shipped UI.

## Release Decision Matrix

### Fix In This Release

- Pane restart/start main path
- New pane `Start Mode` semantics
- Command palette restart behavior if it remains visible
- Any state duplication or stale pane state caused by restart

### Hide In This Release

- Sidebar lightning icon / task dispatch entry
- Sidebar templates/task icon
- Any adjacent entry point discovered during implementation that still routes to unfinished task-dispatch or template flows

### Keep But Smoke-Test Carefully

- Add pane dialog basic create flow
- Resume existing session flow
- Pane close flow
- Bottom shell terminal
- Replay history entry
- Notes entry
- File tree and Git diff read-only viewing

## File Map

### Expected Code Touches

- Modify: `packages/server/src/workspace/WorkspaceManager.ts`
- Modify: `packages/web/src/stores/workspaceStore.ts`
- Modify: `packages/web/src/components/AgentPane.tsx`
- Modify: `packages/web/src/components/AddPaneDialog.tsx`
- Modify: `packages/web/src/components/CommandPalette.tsx`
- Modify: `packages/web/src/components/Sidebar.tsx`
- Modify: `README.md`

### Verification Surfaces

- Run: `pnpm --filter @nexus/server test`
- Run: `pnpm --filter @nexus/web build`
- Run: `pnpm build`
- Manual: launch `pnpm dev:full` or equivalent local release run and execute smoke cases below

## Task 1: Fix Restart/Start Main Path

**Files:**
- Modify: `packages/server/src/workspace/WorkspaceManager.ts`
- Modify: `packages/web/src/stores/workspaceStore.ts`
- Modify: `packages/web/src/components/AgentPane.tsx`
- Modify: `packages/web/src/components/CommandPalette.tsx`

- [ ] **Step 1: Normalize restart behavior on the server**

Goal: restarting an existing pane must replace the running process and state for the same pane, not create a logically new pane entry in the UI.

Implementation target:
- Keep the existing `paneId`
- Kill the old runtime cleanly
- Respawn with the resolved mode
- Emit state updates in a way the client can treat as replacement, not append-only addition

Acceptance:
- Restarting a pane never creates duplicate visible pane cards
- Status, PID, meta, and scrollback behavior are deterministic after restart

- [ ] **Step 2: Make the frontend store idempotent for pane replacement**

Goal: `addPane()` must upsert by `pane.id` instead of blindly appending.

Acceptance:
- Receiving `pane.added` for an existing `pane.id` updates that pane in place
- Active pane remains stable across restart
- Worktree/review/conversation state is not duplicated

- [ ] **Step 3: Align pane header actions with release-safe semantics**

Goal: the pane header must expose only behaviors users can understand and that map cleanly to backend modes.

Required outcome:
- `Restart` means new session
- `Resume/Continue` only appears when a valid resumable session exists or a valid latest-session path is supported
- Header actions and command palette behavior use the same mode rules

Acceptance:
- Clicking restart always produces a fresh session path
- Clicking resume/continue never silently falls back to an unrelated behavior

- [ ] **Step 4: Verify restart scenarios manually**

Run these scenarios:
1. Create pane, wait for ready state, click restart.
2. Restart a pane multiple times in sequence.
3. Use command palette restart on the active pane.
4. Restart a stopped pane.

Expected:
- No duplicate panes
- No dead buttons
- Pane status and terminal output resume normally after each action

## Task 2: Fix New Pane Start Mode Semantics

**Files:**
- Modify: `packages/web/src/components/AddPaneDialog.tsx`
- Modify: `packages/server/src/types.ts` only if labels/types need tightening
- Modify: `README.md`

- [ ] **Step 1: Define release-safe start mode options**

Release rule:
- Show only the modes that are truly supported and testable for public users
- Prefer fewer clear choices over exposing all internal enum values

Recommended public options:
- `New Session`
- `Resume Session` only when session discovery is valid for that agent

If `continue` cannot be explained or verified consistently, do not expose it in this release.

- [ ] **Step 2: Make submitted config match the chosen UI mode exactly**

Acceptance:
- Choosing `New Session` always sends `restore: 'restart'`
- Choosing `Resume Session` always requires a selected session and sends `restore: 'resume'` with `sessionId`
- No hidden fallback converts one mode into another without user intent

- [ ] **Step 3: Validate the dialog end-to-end**

Run these scenarios:
1. Create pane with `New Session`
2. Switch agents and verify mode behavior remains correct
3. Enter resume mode with and without discovered sessions
4. Submit with invalid/missing session in resume mode and confirm submit is blocked

Expected:
- The selected start mode changes actual runtime behavior
- The UI labels match the resulting behavior

## Task 3: Hide Unfinished Sidebar Features

**Files:**
- Modify: `packages/web/src/components/Sidebar.tsx`
- Modify: `README.md`

- [ ] **Step 1: Remove unfinished entry points from the visible sidebar**

Hide:
- Lightning/task dispatch icon
- Templates/task icon

Do not leave dead buttons visible with "coming soon" copy in a public release.

- [ ] **Step 2: Reconcile product messaging**

Update public-facing docs to avoid advertising hidden or unfinished flows in the release surface.

Acceptance:
- No visible sidebar entry leads to an unfinished feature
- README feature list does not claim unfinished dispatch/template functionality if it is hidden

## Task 4: Public Release Smoke Suite

**Files:**
- No code required unless smoke finds defects

- [ ] **Step 1: Verify build and tests**

Run:
```bash
pnpm --filter @nexus/server test
pnpm --filter @nexus/web build
pnpm build
```

Expected:
- Server tests pass
- Web build passes
- Root build passes

- [ ] **Step 2: Execute manual smoke checklist**

Run a local app session and verify:
1. Open app with no panes.
2. Create a pane with `New Session`.
3. Send input and observe output/status transition.
4. Restart pane from header.
5. Restart pane from command palette.
6. Close pane.
7. Create pane in resume mode with a valid session.
8. Open bottom terminal and run one command.
9. Open replay history.
10. Open notes.
11. Open file tree and file viewer.
12. Open Git diff view.

Expected:
- Every visible control completes a valid action
- No dead buttons
- No obvious console/runtime errors in the tested paths

- [ ] **Step 3: Make hide-vs-fix decisions for any newly found issues**

Rule:
- If fix is small and localized, fix it now.
- If fix is broad, ambiguous, or risky, hide the entry point for this release and note it in the release follow-up backlog.

## Task 5: Release Gate And Sign-Off

**Files:**
- Modify: `release-plans/2026-04-04-external-release-quality-plan.md`

- [ ] **Step 1: Record final decisions**

Before release, fill in:
- Fixed issues
- Hidden features
- Remaining accepted risks
- Manual smoke result

- [ ] **Step 2: Block release unless all conditions are true**

Release gate:
- Restart/start path works
- Add pane start mode works
- Unfinished sidebar entries are hidden
- Builds pass
- Manual smoke on visible features passes

- [ ] **Step 3: Capture deferred backlog for next version**

Deferred items should include:
- Task dispatch feature completion
- Templates/task center completion
- Broader automated UI coverage for pane lifecycle and dialog flows
- Audit of README and marketing copy for shipped-vs-planned feature accuracy

## Suggested Execution Order

1. Hide unfinished sidebar features immediately.
2. Fix restart/start state handling end-to-end.
3. Fix add-pane start mode semantics.
4. Align command palette with the same restart rules.
5. Reconcile README claims.
6. Run build/test/manual smoke.
7. Update this plan with final pass/fail notes before release.

/**
 * Communication Core Module
 *
 * This module encapsulates all PTY-level communication intelligence:
 *
 * - ShellReadyDetector  — Detects when a spawned shell is ready for commands
 * - AgentReadyDetector  — Detects when an Agent CLI has finished initializing
 * - StatuslineParser    — Extracts structured metadata from Agent terminal output
 * - OutputStateAnalyzer — Infers Agent behavioral state from output patterns
 *
 * Design principles:
 * 1. Event-driven, not polling — all detection is triggered by PTY data events
 * 2. Hot-path performance — onOutput/feed methods do minimal work
 * 3. Deterministic cleanup — all timers are cleared on dispose()
 * 4. Testable in isolation — no direct dependency on node-pty at runtime
 */

export { ShellReadyDetector } from './ShellReadyDetector.ts'
export type { ShellReadyOptions, ShellReadyResult } from './ShellReadyDetector.ts'

export { AgentReadyDetector } from './AgentReadyDetector.ts'
export type { AgentReadyOptions, AgentReadyResult, AgentReadyReason } from './AgentReadyDetector.ts'

export { StatuslineParser } from './StatuslineParser.ts'

export { OutputStateAnalyzer } from './OutputStateAnalyzer.ts'
export type { OutputStateOptions } from './OutputStateAnalyzer.ts'

import * as pty from 'node-pty'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { PaneConfig, PaneStatus, PaneMeta, AgentDefinition, FileActivity } from '../types.ts'
import { StatuslineParser } from '../comm/StatuslineParser.ts'
import { ShellReadyDetector } from '../comm/ShellReadyDetector.ts'
import { AgentReadyDetector } from '../comm/AgentReadyDetector.ts'
import { OutputStateAnalyzer } from '../comm/OutputStateAnalyzer.ts'
import { ActivityParser } from './ActivityParser.ts'
import type { ConfigManager } from '../workspace/ConfigManager.ts'

const MAX_SCROLLBACK_BYTES = 512 * 1024 // 512KB per pane

interface PtyEntry {
  pty: pty.IPty
  config: PaneConfig
  status: PaneStatus
  meta: PaneMeta
  parser: StatuslineParser
  activityParser: ActivityParser
  stateAnalyzer: OutputStateAnalyzer
  shellDetector: ShellReadyDetector | null
  agentDetector: AgentReadyDetector | null
  scrollback: string[]
  scrollbackBytes: number
  onDataCallbacks: Array<(data: string) => void>
  onStatusCallbacks: Array<(status: PaneStatus) => void>
  onMetaCallbacks: Array<(meta: PaneMeta) => void>
  onActivityCallbacks: Array<(activity: FileActivity) => void>
}

export class PtyManager {
  private entries = new Map<string, PtyEntry>()
  private configManager: ConfigManager

  constructor(configManager: ConfigManager) {
    this.configManager = configManager
  }

  spawn(paneId: string, config: PaneConfig, cols = 80, rows = 24): number {
    if (this.entries.has(paneId)) {
      this.kill(paneId)
    }

    const shell = this.configManager.getShell()
    console.log(`[PTY] Using shell: ${shell} for pane ${paneId}`)
    const projectDir = this.configManager.getProjectDir()
    // Worktree panes use worktreePath as base; shared panes use projectDir
    const basePath = (config.isolation === 'worktree' && config.worktreePath)
      ? config.worktreePath
      : projectDir
    let cwd = config.workdir
      ? path.resolve(basePath, config.workdir)
      : basePath

    // Validate cwd exists — posix_spawnp fails if cwd is invalid
    if (!fs.existsSync(cwd)) {
      console.warn(`[PTY] cwd does not exist: ${cwd}, falling back to ${projectDir}`)
      cwd = fs.existsSync(projectDir) ? projectDir : os.homedir()
    }

    // Validate shell binary exists, fall back gracefully
    let resolvedShell = shell
    if (!fs.existsSync(resolvedShell)) {
      const fallbacks = ['/bin/zsh', '/bin/bash', '/bin/sh']
      const found = fallbacks.find(s => fs.existsSync(s))
      console.error(`[PTY] Shell binary not found: ${resolvedShell}, falling back to ${found || '/bin/sh'}`)
      resolvedShell = found || '/bin/sh'
    }

    const agentDef = this.configManager.getAgentDefinition(config.agent)
    const isAgent = agentDef && config.agent !== '__shell__'

    // Build environment from agent definition
    // Filter out all Claude-related env vars to prevent nested session detection
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && !key.startsWith('CLAUDE') && key !== 'CLAUDECODE') {
        env[key] = value
      }
    }
    if (agentDef?.env) {
      // Block dangerous env vars that could be used for injection
      const BLOCKED_ENV_KEYS = new Set([
        'PATH', 'LD_PRELOAD', 'LD_LIBRARY_PATH',
        'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH', 'DYLD_FRAMEWORK_PATH',
      ])
      for (const [key, value] of Object.entries(agentDef.env)) {
        if (BLOCKED_ENV_KEYS.has(key)) {
          console.warn(`[PTY] Ignoring blocked env var from agent config: ${key}`)
          continue
        }
        // Resolve ${VAR} references from process.env
        const resolved = value.replace(/\$\{(\w+)\}/g, (_, varName: string) => {
          return process.env[varName] || ''
        })
        if (resolved) env[key] = resolved
      }
    }

    // Ensure PATH is set — on some systems (e.g. macOS launchd) it may be missing
    if (!env.PATH) {
      env.PATH = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
      if (process.platform === 'darwin') {
        env.PATH = '/opt/homebrew/bin:/opt/homebrew/sbin:' + env.PATH
      }
    }

    console.log(`[PTY] Spawning pane ${paneId}: shell=${resolvedShell}, cwd=${cwd}`)

    const term = pty.spawn(resolvedShell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env,
    })

    // Create communication components
    const shellDetector = isAgent
      ? new ShellReadyDetector(paneId, { stripSentinel: true })
      : null

    const stateAnalyzer = new OutputStateAnalyzer({
      idleThresholdMs: 5000,
      onStatusChange: (status) => {
        const e = this.entries.get(paneId)
        if (e) {
          e.status = status
          for (const cb of e.onStatusCallbacks) {
            cb(status)
          }
        }
      },
    })

    const entry: PtyEntry = {
      pty: term,
      config,
      status: 'running',
      meta: {},
      parser: new StatuslineParser(),
      activityParser: new ActivityParser(),
      stateAnalyzer,
      shellDetector,
      agentDetector: null, // Created after shell is ready
      scrollback: [],
      scrollbackBytes: 0,
      onDataCallbacks: [],
      onStatusCallbacks: [],
      onMetaCallbacks: [],
      onActivityCallbacks: [],
    }

    this.entries.set(paneId, entry)

    // Handle PTY output
    term.onData((data: string) => {
      // Feed shell ready detector (strips sentinel from output)
      let processedData = data
      if (entry.shellDetector && !entry.shellDetector.isDone) {
        processedData = entry.shellDetector.feed(data)
      }

      // Feed agent ready detector
      if (entry.agentDetector && !entry.agentDetector.isDone) {
        entry.agentDetector.feed(processedData)
      }

      const { cleanData, meta } = entry.parser.parse(processedData)

      if (cleanData) {
        // Feed state analyzer (hot path — just timestamp + timer reset)
        entry.stateAnalyzer.onOutput()

        // Buffer for scrollback replay
        entry.scrollback.push(cleanData)
        entry.scrollbackBytes += cleanData.length
        // Trim if over budget — batch splice instead of shift() loop to avoid O(n²)
        if (entry.scrollbackBytes > MAX_SCROLLBACK_BYTES) {
          let bytesToRemove = entry.scrollbackBytes - MAX_SCROLLBACK_BYTES
          let removeCount = 0
          while (removeCount < entry.scrollback.length - 1 && bytesToRemove > 0) {
            bytesToRemove -= entry.scrollback[removeCount].length
            entry.scrollbackBytes -= entry.scrollback[removeCount].length
            removeCount++
          }
          if (removeCount > 0) {
            entry.scrollback.splice(0, removeCount)
          }
        }

        for (const cb of entry.onDataCallbacks) {
          cb(cleanData)
        }
      }

      if (meta) {
        entry.meta = { ...entry.meta, ...meta }

        // Feed to state analyzer and agent ready detector
        entry.stateAnalyzer.onMeta(meta)
        if (entry.agentDetector && !entry.agentDetector.isDone) {
          entry.agentDetector.onMeta(meta)
        }

        for (const cb of entry.onMetaCallbacks) {
          cb(entry.meta)
        }
      }

      // Parse file activity from PTY output (attributed to this pane)
      if (config.agent !== '__shell__') {
        const activity = entry.activityParser.parse(data)
        if (activity) {
          for (const cb of entry.onActivityCallbacks) {
            cb(activity)
          }
        }
      }
    })

    // Handle PTY exit
    term.onExit(({ exitCode }) => {
      const e = this.entries.get(paneId)
      if (e) {
        e.stateAnalyzer.onExit(exitCode)
        // Dispose detectors
        e.shellDetector?.dispose()
        e.agentDetector?.dispose()
      }
    })

    // Shell ready → Agent command → Agent ready → Task
    if (isAgent && shellDetector) {
      this.startAgentSequence(paneId, config, agentDef!, shellDetector)
    }

    return term.pid
  }

  /**
   * Orchestrates the shell → agent → task startup sequence using
   * event-driven detectors instead of hardcoded setTimeout delays.
   */
  private async startAgentSequence(
    paneId: string,
    config: PaneConfig,
    agentDef: AgentDefinition,
    shellDetector: ShellReadyDetector,
  ): Promise<void> {
    const entry = this.entries.get(paneId)
    if (!entry) return

    // Step 1: Wait for shell to be ready
    const shellResult = await shellDetector.start(entry.pty)
    if (!this.entries.has(paneId)) return // pane was killed while waiting

    console.log(`[PTY] Shell ready for ${paneId}: detected=${shellResult.detected} (${shellResult.elapsedMs}ms)`)

    // Step 2: Send agent command
    this.sendAgentCommand(paneId, config, agentDef)

    // Step 3: If there's a task, wait for agent to be ready before sending
    if (config.task && config.restore !== 'manual') {
      const agentDetector = new AgentReadyDetector({
        quiescenceMs: 3000,
        hardTimeoutMs: 15000,
      })
      entry.agentDetector = agentDetector

      const agentResult = await agentDetector.start()
      if (!this.entries.has(paneId)) return // pane was killed while waiting

      console.log(`[PTY] Agent ready for ${paneId}: reason=${agentResult.reason} (${agentResult.elapsedMs}ms)`)

      // Send the task
      entry.pty.write(config.task + '\r')
    }
  }

  private sendAgentCommand(paneId: string, config: PaneConfig, agentDef: AgentDefinition): void {
    const entry = this.entries.get(paneId)
    if (!entry) return

    let cmd = agentDef.bin

    // Add resume flag with specific session ID
    if (config.restore === 'resume' && config.sessionId && agentDef.resume_flag) {
      cmd += ` ${agentDef.resume_flag} ${config.sessionId}`
    } else if (config.restore === 'continue' && agentDef.continue_flag) {
      // Add continue flag to resume latest session
      cmd += ` ${agentDef.continue_flag}`
    }

    // Add yolo flag if enabled
    if (config.yolo && agentDef.yolo_flag) {
      cmd += ` ${agentDef.yolo_flag}`
    }

    // Send the command to start the agent
    entry.pty.write(cmd + '\r')
  }

  write(paneId: string, data: string): void {
    const entry = this.entries.get(paneId)
    if (entry) {
      entry.pty.write(data)
    }
  }

  resize(paneId: string, cols: number, rows: number): void {
    const entry = this.entries.get(paneId)
    if (entry) {
      try {
        entry.pty.resize(cols, rows)
      } catch {
        // PTY may not be ready yet (ENOTTY), ignore
      }
    }
  }

  kill(paneId: string): void {
    const entry = this.entries.get(paneId)
    if (entry) {
      // Clean up comm components
      entry.stateAnalyzer.dispose()
      entry.shellDetector?.dispose()
      entry.agentDetector?.dispose()
      entry.parser.reset()

      // Clear callback arrays to break closure references and prevent leaks
      entry.onDataCallbacks.length = 0
      entry.onStatusCallbacks.length = 0
      entry.onMetaCallbacks.length = 0
      entry.onActivityCallbacks.length = 0

      try {
        entry.pty.kill()
      } catch {
        // Process may already be dead
      }
      this.entries.delete(paneId)
    }
  }

  killAll(): void {
    for (const [paneId] of this.entries) {
      this.kill(paneId)
    }
  }

  getStatus(paneId: string): PaneStatus {
    return this.entries.get(paneId)?.status || 'stopped'
  }

  getMeta(paneId: string): PaneMeta {
    return this.entries.get(paneId)?.meta || {}
  }

  getPid(paneId: string): number | undefined {
    return this.entries.get(paneId)?.pty.pid
  }

  onData(paneId: string, callback: (data: string) => void): void {
    const entry = this.entries.get(paneId)
    if (entry) {
      entry.onDataCallbacks.push(callback)
    }
  }

  onStatus(paneId: string, callback: (status: PaneStatus) => void): void {
    const entry = this.entries.get(paneId)
    if (entry) {
      entry.onStatusCallbacks.push(callback)
    }
  }

  onMeta(paneId: string, callback: (meta: PaneMeta) => void): void {
    const entry = this.entries.get(paneId)
    if (entry) {
      entry.onMetaCallbacks.push(callback)
    }
  }

  onActivity(paneId: string, callback: (activity: FileActivity) => void): void {
    const entry = this.entries.get(paneId)
    if (entry) {
      entry.onActivityCallbacks.push(callback)
    }
  }

  getScrollback(paneId: string): string {
    const entry = this.entries.get(paneId)
    if (!entry) return ''
    return entry.scrollback.join('')
  }

  has(paneId: string): boolean {
    return this.entries.has(paneId)
  }
}

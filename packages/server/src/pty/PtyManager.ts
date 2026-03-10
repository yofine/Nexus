import * as pty from 'node-pty'
import fs from 'node:fs'
import path from 'node:path'
import type { PaneConfig, PaneStatus, PaneMeta, AgentDefinition } from '../types.ts'
import { StatuslineParser } from './StatuslineParser.ts'
import type { ConfigManager } from '../workspace/ConfigManager.ts'

const MAX_SCROLLBACK_BYTES = 512 * 1024 // 512KB per pane

interface PtyEntry {
  pty: pty.IPty
  config: PaneConfig
  status: PaneStatus
  meta: PaneMeta
  parser: StatuslineParser
  scrollback: string[]
  scrollbackBytes: number
  onDataCallbacks: Array<(data: string) => void>
  onStatusCallbacks: Array<(status: PaneStatus) => void>
  onMetaCallbacks: Array<(meta: PaneMeta) => void>
}

export class PtyManager {
  private entries = new Map<string, PtyEntry>()
  private configManager: ConfigManager

  constructor(configManager: ConfigManager) {
    this.configManager = configManager
  }

  spawn(paneId: string, config: PaneConfig): number {
    if (this.entries.has(paneId)) {
      this.kill(paneId)
    }

    const shell = this.configManager.getShell()
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
      cwd = fs.existsSync(projectDir) ? projectDir : (process.env.HOME || '/')
    }

    const agentDef = this.configManager.getAgentDefinition(config.agent)

    // Build environment from agent definition
    // Filter out all Claude-related env vars to prevent nested session detection
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && !key.startsWith('CLAUDE') && key !== 'CLAUDECODE') {
        env[key] = value
      }
    }
    if (agentDef?.env) {
      for (const [key, value] of Object.entries(agentDef.env)) {
        // Resolve ${VAR} references from process.env
        const resolved = value.replace(/\$\{(\w+)\}/g, (_, varName: string) => {
          return process.env[varName] || ''
        })
        if (resolved) env[key] = resolved
      }
    }

    const term = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env,
    })

    const entry: PtyEntry = {
      pty: term,
      config,
      status: 'running',
      meta: {},
      parser: new StatuslineParser(),
      scrollback: [],
      scrollbackBytes: 0,
      onDataCallbacks: [],
      onStatusCallbacks: [],
      onMetaCallbacks: [],
    }

    this.entries.set(paneId, entry)

    // Handle PTY output
    term.onData((data: string) => {
      const { cleanData, meta } = entry.parser.parse(data)

      if (cleanData) {
        // Buffer for scrollback replay
        entry.scrollback.push(cleanData)
        entry.scrollbackBytes += cleanData.length
        // Trim if over budget
        while (entry.scrollbackBytes > MAX_SCROLLBACK_BYTES && entry.scrollback.length > 1) {
          const removed = entry.scrollback.shift()!
          entry.scrollbackBytes -= removed.length
        }

        for (const cb of entry.onDataCallbacks) {
          cb(cleanData)
        }
      }

      if (meta) {
        entry.meta = { ...entry.meta, ...meta }
        for (const cb of entry.onMetaCallbacks) {
          cb(entry.meta)
        }
      }
    })

    // Handle PTY exit
    term.onExit(({ exitCode }) => {
      const e = this.entries.get(paneId)
      if (e) {
        e.status = exitCode === 0 ? 'stopped' : 'error'
        for (const cb of e.onStatusCallbacks) {
          cb(e.status)
        }
      }
    })

    // After shell initializes, send the agent command (skip for plain shell)
    if (agentDef && config.agent !== '__shell__') {
      setTimeout(() => {
        this.sendAgentCommand(paneId, config, agentDef)
      }, 800)
    }

    return term.pid
  }

  private sendAgentCommand(paneId: string, config: PaneConfig, agentDef: AgentDefinition): void {
    const entry = this.entries.get(paneId)
    if (!entry) return

    let cmd = agentDef.bin

    // Add continue flag if restoring
    if (config.restore === 'continue' && agentDef.continue_flag) {
      cmd += ` ${agentDef.continue_flag}`
    }

    // Add yolo flag if enabled
    if (config.yolo && agentDef.yolo_flag) {
      cmd += ` ${agentDef.yolo_flag}`
    }

    // Send the command to start the agent
    entry.pty.write(cmd + '\r')

    // If there's a task, send it after a brief delay for the agent to initialize
    if (config.task && config.restore !== 'manual') {
      setTimeout(() => {
        const e = this.entries.get(paneId)
        if (e) {
          e.pty.write(config.task + '\r')
        }
      }, 2000)
    }
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

  getScrollback(paneId: string): string {
    const entry = this.entries.get(paneId)
    if (!entry) return ''
    return entry.scrollback.join('')
  }

  has(paneId: string): boolean {
    return this.entries.has(paneId)
  }
}

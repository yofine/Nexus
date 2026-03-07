import * as pty from 'node-pty'
import path from 'node:path'
import type { PaneConfig, PaneStatus, PaneMeta, AgentDefinition } from '../types.ts'
import { StatuslineParser } from './StatuslineParser.ts'
import type { ConfigManager } from '../workspace/ConfigManager.ts'

interface PtyEntry {
  pty: pty.IPty
  config: PaneConfig
  status: PaneStatus
  meta: PaneMeta
  parser: StatuslineParser
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
    const cwd = config.workdir
      ? path.resolve(projectDir, config.workdir)
      : projectDir

    const agentDef = this.configManager.getAgentDefinition(config.agent)

    // Build environment from agent definition
    const env: Record<string, string> = { ...process.env as Record<string, string> }
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
      cols: 120,
      rows: 30,
      cwd,
      env,
    })

    const entry: PtyEntry = {
      pty: term,
      config,
      status: 'running',
      meta: {},
      parser: new StatuslineParser(),
      onDataCallbacks: [],
      onStatusCallbacks: [],
      onMetaCallbacks: [],
    }

    this.entries.set(paneId, entry)

    // Handle PTY output
    term.onData((data: string) => {
      const { cleanData, meta } = entry.parser.parse(data)

      if (cleanData) {
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

    // After shell initializes, send the agent command
    if (agentDef) {
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
      entry.pty.resize(cols, rows)
    }
  }

  kill(paneId: string): void {
    const entry = this.entries.get(paneId)
    if (entry) {
      entry.pty.kill()
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

  has(paneId: string): boolean {
    return this.entries.has(paneId)
  }
}

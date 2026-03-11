import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'
import yaml from 'js-yaml'
import type { GlobalConfig, WorkspaceConfig, AgentDefinition, AgentAvailability } from '../types.ts'

const GLOBAL_DIR = path.join(os.homedir(), '.nexus')
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_DIR, 'config.yaml')

const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  version: '1',
  defaults: {
    shell: process.env.SHELL || '/bin/bash',
    scrollback_lines: 5000,
    grid_columns: 2,
    history_retention_days: 30,
    theme: 'dark-ide',
  },
  agents: {
    claudecode: {
      bin: 'claude',
      continue_flag: '--continue',
      yolo_flag: '--dangerously-skip-permissions',
      statusline: true,
      env: {},
    },
    opencode: {
      bin: 'opencode',
      continue_flag: '--continue',
      yolo_flag: '--yolo',
      statusline: false,
      env: {},
    },
  },
}

export class ConfigManager {
  private globalConfig: GlobalConfig | null = null
  private workspaceConfig: WorkspaceConfig | null = null
  private projectDir: string

  constructor(projectDir: string) {
    this.projectDir = projectDir
  }

  loadGlobalConfig(): GlobalConfig {
    if (this.globalConfig) return this.globalConfig

    if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
      const content = fs.readFileSync(GLOBAL_CONFIG_PATH, 'utf-8')
      this.globalConfig = yaml.load(content) as GlobalConfig
      // Merge in any default agents or missing fields from the saved config
      let updated = false
      for (const [key, def] of Object.entries(DEFAULT_GLOBAL_CONFIG.agents)) {
        if (!this.globalConfig.agents[key]) {
          this.globalConfig.agents[key] = def
          updated = true
        } else {
          // Merge missing fields from defaults into existing agent definition
          const existing = this.globalConfig.agents[key]
          for (const [field, value] of Object.entries(def)) {
            if (!(field in existing)) {
              (existing as Record<string, unknown>)[field] = value
              updated = true
            }
          }
        }
      }
      if (updated) {
        this.saveGlobalConfig(this.globalConfig)
      }
    } else {
      this.globalConfig = { ...DEFAULT_GLOBAL_CONFIG }
      const detected = this.detectAgents()
      if (Object.keys(detected).length > 0) {
        this.globalConfig.agents = { ...this.globalConfig.agents, ...detected }
      }
      this.saveGlobalConfig(this.globalConfig)
    }

    return this.globalConfig
  }

  private saveGlobalConfig(config: GlobalConfig): void {
    fs.mkdirSync(GLOBAL_DIR, { recursive: true })
    fs.writeFileSync(GLOBAL_CONFIG_PATH, yaml.dump(config, { lineWidth: -1 }))
  }

  loadWorkspaceConfig(): WorkspaceConfig | null {
    if (this.workspaceConfig) return this.workspaceConfig

    const configPath = path.join(this.projectDir, '.nexus', 'config.yaml')
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8')
      const parsed = yaml.load(content) as WorkspaceConfig | null
      if (parsed) {
        if (!Array.isArray(parsed.panes)) parsed.panes = []
        this.workspaceConfig = parsed
        return this.workspaceConfig
      }
    }

    return null
  }

  saveWorkspaceConfig(config: WorkspaceConfig): void {
    const nexusDir = path.join(this.projectDir, '.nexus')
    fs.mkdirSync(nexusDir, { recursive: true })
    const configPath = path.join(nexusDir, 'config.yaml')
    fs.writeFileSync(configPath, yaml.dump(config, { lineWidth: -1 }))
    this.workspaceConfig = config
  }

  initWorkspace(): WorkspaceConfig {
    const existing = this.loadWorkspaceConfig()
    if (existing) return existing

    const dirName = path.basename(this.projectDir)
    const isGit = fs.existsSync(path.join(this.projectDir, '.git'))

    const config: WorkspaceConfig = {
      version: '1',
      name: dirName,
      description: '',
      repository: {
        path: '.',
        git: isGit,
      },
      panes: [],
    }

    this.saveWorkspaceConfig(config)
    return config
  }

  detectAgents(): Record<string, AgentDefinition> {
    const agents: Record<string, AgentDefinition> = {}

    const agentBins: Array<{ key: string; bin: string; flag: string; statusline: boolean }> = [
      { key: 'claudecode', bin: 'claude', flag: '--continue', statusline: true },
      { key: 'opencode', bin: 'opencode', flag: '--continue', statusline: false },
      { key: 'kimi-cli', bin: 'kimi', flag: '--continue', statusline: false },
      { key: 'qwencode', bin: 'qwen-code', flag: '--continue', statusline: false },
    ]

    for (const agent of agentBins) {
      try {
        execSync(`which ${agent.bin}`, { stdio: 'ignore' })
        agents[agent.key] = {
          bin: agent.bin,
          continue_flag: agent.flag,
          statusline: agent.statusline,
          env: {},
        }
      } catch {
        // Agent not installed, skip
      }
    }

    return agents
  }

  getAgentDefinition(agentType: string): AgentDefinition | undefined {
    const global = this.loadGlobalConfig()
    return global.agents[agentType]
  }

  getShell(): string {
    const global = this.loadGlobalConfig()
    const configured = global.defaults.shell
    // Prefer zsh > configured > $SHELL > /bin/sh
    const candidates = ['/usr/bin/zsh', '/bin/zsh', configured, process.env.SHELL, '/bin/sh']
    for (const sh of candidates) {
      if (!sh) continue
      try {
        fs.accessSync(sh, fs.constants.X_OK)
        return sh
      } catch {
        // try next
      }
    }
    return '/bin/sh'
  }

  /**
   * Check which agents are available (installed) on the system.
   * Returns a record of agentType → { installed, bin, installHint }
   */
  checkAgentAvailability(): Record<string, AgentAvailability> {
    const global = this.loadGlobalConfig()
    const knownAgents: Array<{ key: string; bin: string; installHint: string }> = [
      { key: 'claudecode', bin: 'claude', installHint: 'npm install -g @anthropic-ai/claude-code' },
      { key: 'opencode', bin: 'opencode', installHint: 'go install github.com/opencode-ai/opencode@latest' },
      { key: 'kimi-cli', bin: 'kimi', installHint: 'pip install kimi-cli' },
      { key: 'qwencode', bin: 'qwen-code', installHint: 'pip install qwen-code' },
    ]

    const result: Record<string, AgentAvailability> = {}

    for (const agent of knownAgents) {
      const def = global.agents[agent.key]
      const bin = def?.bin || agent.bin
      let installed = false
      try {
        execSync(`which ${bin}`, { stdio: 'ignore' })
        installed = true
      } catch {
        // not installed
      }
      result[agent.key] = { installed, bin, installHint: agent.installHint }
    }

    return result
  }

  getProjectDir(): string {
    return this.projectDir
  }
}

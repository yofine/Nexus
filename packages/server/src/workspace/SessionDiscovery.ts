import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ConfigManager } from './ConfigManager.ts'

const execFileAsync = promisify(execFile)

export interface ClaudeSession {
  session_id: string
  project_path?: string
  model?: string
  cost_usd?: number
  duration_ms?: number
  created_at?: string
  updated_at?: string
  summary?: string
  num_turns?: number
}

export interface DiscoveredSession {
  sessionId: string
  summary?: string
  model?: string
  costUsd?: number
  numTurns?: number
  createdAt?: string
  updatedAt?: string
  projectPath?: string
  source: 'nexus' | 'external'
}

const CACHE_TTL = 30_000 // 30s

export class SessionDiscovery {
  private configManager: ConfigManager
  private cache: { sessions: DiscoveredSession[]; ts: number } | null = null

  constructor(configManager: ConfigManager) {
    this.configManager = configManager
  }

  async listSessions(agentType = 'claudecode'): Promise<DiscoveredSession[]> {
    const now = Date.now()
    if (this.cache && now - this.cache.ts < CACHE_TTL) {
      return this.cache.sessions
    }

    const sessions = await this.fetchSessions(agentType)
    this.cache = { sessions, ts: now }
    return sessions
  }

  private async fetchSessions(agentType: string): Promise<DiscoveredSession[]> {
    const agentDef = this.configManager.getAgentDefinition(agentType)
    if (!agentDef || agentDef.bin !== 'claude') {
      return []
    }

    try {
      const { stdout } = await execFileAsync(agentDef.bin, ['sessions', 'list', '--output', 'json'], {
        timeout: 10_000,
        env: { ...process.env },
      })

      const parsed = JSON.parse(stdout.trim())
      const items: ClaudeSession[] = Array.isArray(parsed) ? parsed : (parsed.sessions || [])

      return items.map((s) => ({
        sessionId: s.session_id,
        summary: s.summary,
        model: s.model,
        costUsd: s.cost_usd,
        numTurns: s.num_turns,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        projectPath: s.project_path,
        source: 'external' as const,
      }))
    } catch (err) {
      console.warn('[SessionDiscovery] Failed to list sessions:', (err as Error).message)
      return []
    }
  }
}

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type {
  AgentDefinition,
  ConversationEvent,
  FileActivity,
  PaneConfig,
  PaneMeta,
  PaneStatus,
} from '../types.ts'
import type { ConfigManager } from '../workspace/ConfigManager.ts'

const MAX_SCROLLBACK_BYTES = 512 * 1024

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

interface AcpEntry {
  proc: ChildProcessWithoutNullStreams
  config: PaneConfig
  status: PaneStatus
  meta: PaneMeta
  nextRequestId: number
  nextMessageId: number
  nextToolId: number
  pending: Map<number, PendingRequest>
  stdoutBuffer: string
  scrollback: string[]
  scrollbackBytes: number
  onDataCallbacks: Array<(data: string) => void>
  onStatusCallbacks: Array<(status: PaneStatus) => void>
  onMetaCallbacks: Array<(meta: PaneMeta) => void>
  onConversationCallbacks: Array<(event: ConversationEvent) => void>
  onActivityCallbacks: Array<(activity: FileActivity) => void>
}

function resolveAgentEnv(agentDef: AgentDefinition | undefined): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('CLAUDE') && key !== 'CLAUDECODE') {
      env[key] = value
    }
  }

  if (agentDef?.env) {
    const blocked = new Set([
      'PATH', 'LD_PRELOAD', 'LD_LIBRARY_PATH',
      'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH', 'DYLD_FRAMEWORK_PATH',
    ])
    for (const [key, value] of Object.entries(agentDef.env)) {
      if (blocked.has(key)) continue
      env[key] = value.replace(/\$\{(\w+)\}/g, (_, name: string) => process.env[name] || '')
    }
  }

  if (!env.PATH) {
    env.PATH = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
    if (process.platform === 'darwin') {
      env.PATH = `/opt/homebrew/bin:/opt/homebrew/sbin:${env.PATH}`
    }
  }

  return env
}

export class AcpRuntime {
  private entries = new Map<string, AcpEntry>()
  private configManager: ConfigManager

  constructor(configManager: ConfigManager) {
    this.configManager = configManager
  }

  spawn(paneId: string, config: PaneConfig): number | undefined {
    if (this.entries.has(paneId)) {
      this.kill(paneId)
    }

    const projectDir = this.configManager.getProjectDir()
    const basePath = (config.isolation === 'worktree' && config.worktreePath)
      ? config.worktreePath
      : projectDir
    let cwd = config.workdir
      ? path.resolve(basePath, config.workdir)
      : basePath

    if (!fs.existsSync(cwd)) {
      cwd = fs.existsSync(projectDir) ? projectDir : os.homedir()
    }

    const agentDef = this.configManager.getAgentDefinition(config.agent)
    if (!agentDef) {
      throw new Error(`Missing agent definition for ${config.agent}`)
    }

    const env = resolveAgentEnv(agentDef)
    const proc = spawn(agentDef.bin, ['acp'], {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const entry: AcpEntry = {
      proc,
      config,
      status: 'running',
      meta: { cwd },
      nextRequestId: 1,
      nextMessageId: 1,
      nextToolId: 1,
      pending: new Map(),
      stdoutBuffer: '',
      scrollback: [],
      scrollbackBytes: 0,
      onDataCallbacks: [],
      onStatusCallbacks: [],
      onMetaCallbacks: [],
      onConversationCallbacks: [],
      onActivityCallbacks: [],
    }

    this.entries.set(paneId, entry)

    proc.stdout.setEncoding('utf8')
    proc.stderr.setEncoding('utf8')

    proc.stdout.on('data', (chunk: string) => this.handleStdout(paneId, chunk))
    proc.stderr.on('data', (chunk: string) => {
      this.emitTerminal(paneId, `[acp stderr] ${chunk}`)
    })
    proc.on('exit', (code, signal) => {
      const e = this.entries.get(paneId)
      if (!e) return
      for (const pending of e.pending.values()) {
        pending.reject(new Error(`ACP process exited (${code ?? 'null'}${signal ? `, ${signal}` : ''})`))
      }
      e.pending.clear()
      this.setStatus(paneId, code === 0 ? 'stopped' : 'error')
    })

    this.bootstrap(paneId, cwd, config).catch((err) => {
      this.emitTerminal(paneId, `[acp error] ${(err as Error).message}\n`)
      this.setStatus(paneId, 'error')
    })

    return proc.pid
  }

  private async bootstrap(paneId: string, cwd: string, config: PaneConfig): Promise<void> {
    const initResult = await this.request(paneId, 'initialize', {
      protocolVersion: 1,
      clientInfo: { name: 'nexus', version: '0.1.0' },
      clientCapabilities: {},
    })

    const loadedSessionId = config.restore === 'resume' && config.sessionId
      ? await this.tryLoadSession(paneId, config.sessionId)
      : null

    const sessionResult = loadedSessionId
      ? { sessionId: loadedSessionId }
      : await this.request(paneId, 'session/new', {
        cwd,
      })

    const sessionId = this.extractSessionId(sessionResult) || this.extractSessionId(initResult) || config.sessionId
    if (sessionId) {
      this.updateMeta(paneId, { sessionId, cwd })
    } else {
      this.updateMeta(paneId, { cwd })
    }

    this.emitConversation(paneId, { type: 'status', status: 'idle' })
    this.setStatus(paneId, 'idle')

    if (config.task && config.restore !== 'manual') {
      await this.sendPrompt(paneId, config.task)
    }
  }

  private async tryLoadSession(paneId: string, sessionId: string): Promise<string | null> {
    try {
      const result = await this.request(paneId, 'session/load', { sessionId })
      return this.extractSessionId(result) || sessionId
    } catch {
      return null
    }
  }

  async sendPrompt(paneId: string, text: string): Promise<void> {
    const entry = this.entries.get(paneId)
    if (!entry) return

    const sessionId = entry.meta.sessionId || entry.config.sessionId
    const messageId = `user-${entry.nextMessageId++}`
    this.emitConversation(paneId, { type: 'message', messageId, role: 'user', text })
    this.emitTerminal(paneId, `\n> ${text}\n\n`)
    this.setStatus(paneId, 'running')
    this.emitConversation(paneId, { type: 'status', status: 'running' })

    const params: Record<string, unknown> = {
      prompt: [{ type: 'text', text }],
    }
    if (sessionId) params.sessionId = sessionId

    await this.request(paneId, 'session/prompt', params)

    // Some ACP servers stream updates but do not send an explicit "idle" event.
    // We leave the pane in running until an update or request completion arrives.
  }

  onData(paneId: string, cb: (data: string) => void): void {
    const entry = this.entries.get(paneId)
    if (entry) entry.onDataCallbacks.push(cb)
  }

  onStatus(paneId: string, cb: (status: PaneStatus) => void): void {
    const entry = this.entries.get(paneId)
    if (entry) entry.onStatusCallbacks.push(cb)
  }

  onMeta(paneId: string, cb: (meta: PaneMeta) => void): void {
    const entry = this.entries.get(paneId)
    if (entry) entry.onMetaCallbacks.push(cb)
  }

  onConversation(paneId: string, cb: (event: ConversationEvent) => void): void {
    const entry = this.entries.get(paneId)
    if (entry) entry.onConversationCallbacks.push(cb)
  }

  onActivity(paneId: string, cb: (activity: FileActivity) => void): void {
    const entry = this.entries.get(paneId)
    if (entry) entry.onActivityCallbacks.push(cb)
  }

  write(_paneId: string, _data: string): void {
    // ACP-backed panes do not accept raw terminal input on the primary session.
  }

  resize(_paneId: string, _cols: number, _rows: number): void {
    // No-op for the initial minimal ACP path.
  }

  getScrollback(paneId: string): string {
    const entry = this.entries.get(paneId)
    return entry ? entry.scrollback.join('') : ''
  }

  kill(paneId: string): void {
    const entry = this.entries.get(paneId)
    if (!entry) return
    entry.proc.kill()
    this.entries.delete(paneId)
  }

  killAll(): void {
    for (const paneId of this.entries.keys()) {
      this.kill(paneId)
    }
  }

  private handleStdout(paneId: string, chunk: string): void {
    const entry = this.entries.get(paneId)
    if (!entry) return

    entry.stdoutBuffer += chunk
    while (true) {
      const newline = entry.stdoutBuffer.indexOf('\n')
      if (newline === -1) break
      const line = entry.stdoutBuffer.slice(0, newline).trim()
      entry.stdoutBuffer = entry.stdoutBuffer.slice(newline + 1)
      if (!line) continue

      try {
        const message = JSON.parse(line) as Record<string, unknown>
        this.handleMessage(paneId, message)
      } catch {
        this.emitTerminal(paneId, line + '\n')
      }
    }
  }

  private handleMessage(paneId: string, message: Record<string, unknown>): void {
    const entry = this.entries.get(paneId)
    if (!entry) return

    if (typeof message.id === 'number') {
      const pending = entry.pending.get(message.id)
      if (pending) {
        entry.pending.delete(message.id)
        if ('error' in message && message.error) {
          const err = message.error as { message?: string }
          pending.reject(new Error(err?.message || 'ACP request failed'))
        } else {
          pending.resolve(message.result)
        }
      }
      return
    }

    if (message.method === 'session/update') {
      const params = (message.params || {}) as Record<string, unknown>
      this.handleSessionUpdate(paneId, params)
      return
    }
  }

  private handleSessionUpdate(paneId: string, params: Record<string, unknown>): void {
    const sessionId = this.extractSessionId(params)
    if (sessionId) {
      this.updateMeta(paneId, { sessionId })
    }

    const rawUpdate = params.update || params.delta || params.event || params
    const updates = Array.isArray(rawUpdate) ? rawUpdate : [rawUpdate]

    for (const update of updates) {
      if (!update || typeof update !== 'object') continue
      const record = update as Record<string, unknown>
      const kind = String(record.type || record.kind || '')
      const content = this.extractText(record)

      if (kind.includes('agent_message')) {
        const messageId = `assistant-${this.entries.get(paneId)?.nextMessageId ?? 1}`
        this.emitConversation(paneId, {
          type: 'message',
          messageId,
          role: 'assistant',
          text: content,
          append: true,
        })
        if (content) {
          this.emitTerminal(paneId, content)
        }
        this.setStatus(paneId, 'running')
      } else if (kind.includes('tool_call')) {
        const toolCallId = `tool-${this.entries.get(paneId)?.nextToolId ?? 1}`
        this.emitConversation(paneId, {
          type: 'tool',
          toolCallId,
          title: String(record.title || record.name || 'tool'),
          status: kind.includes('update') ? 'in_progress' : 'pending',
          text: content || undefined,
        })
        if (content) {
          this.emitTerminal(paneId, `\n[tool] ${content}\n`)
        }
      } else if (kind.includes('turn') || kind.includes('done') || kind.includes('completed')) {
        this.setStatus(paneId, 'idle')
        this.emitConversation(paneId, { type: 'status', status: 'idle' })
      }
    }
  }

  private extractText(record: Record<string, unknown>): string {
    const direct = record.text || record.delta || record.content
    if (typeof direct === 'string') return direct
    if (Array.isArray(direct)) {
      return direct
        .map((item) => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).text === 'string') {
            return String((item as Record<string, unknown>).text)
          }
          return ''
        })
        .join('')
    }
    if (direct && typeof direct === 'object' && typeof (direct as Record<string, unknown>).text === 'string') {
      return String((direct as Record<string, unknown>).text)
    }
    return ''
  }

  private request(paneId: string, method: string, params: Record<string, unknown>): Promise<unknown> {
    const entry = this.entries.get(paneId)
    if (!entry) {
      return Promise.reject(new Error(`Missing ACP entry for ${paneId}`))
    }

    const id = entry.nextRequestId++
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
    entry.proc.stdin.write(payload)

    return new Promise((resolve, reject) => {
      entry.pending.set(id, { resolve, reject })
    })
  }

  private extractSessionId(result: unknown): string | undefined {
    if (!result || typeof result !== 'object') return undefined
    const record = result as Record<string, unknown>
    if (typeof record.sessionId === 'string') return record.sessionId
    if (typeof record.session_id === 'string') return record.session_id
    if (record.session && typeof record.session === 'object') {
      const nested = record.session as Record<string, unknown>
      if (typeof nested.id === 'string') return nested.id
      if (typeof nested.sessionId === 'string') return nested.sessionId
    }
    return undefined
  }

  private emitTerminal(paneId: string, data: string): void {
    const entry = this.entries.get(paneId)
    if (!entry || !data) return

    entry.scrollback.push(data)
    entry.scrollbackBytes += data.length
    if (entry.scrollbackBytes > MAX_SCROLLBACK_BYTES) {
      let bytesToRemove = entry.scrollbackBytes - MAX_SCROLLBACK_BYTES
      let removeCount = 0
      while (removeCount < entry.scrollback.length - 1 && bytesToRemove > 0) {
        bytesToRemove -= entry.scrollback[removeCount].length
        entry.scrollbackBytes -= entry.scrollback[removeCount].length
        removeCount++
      }
      if (removeCount > 0) entry.scrollback.splice(0, removeCount)
    }

    for (const cb of entry.onDataCallbacks) {
      cb(data)
    }
  }

  private setStatus(paneId: string, status: PaneStatus): void {
    const entry = this.entries.get(paneId)
    if (!entry || entry.status === status) return
    entry.status = status
    for (const cb of entry.onStatusCallbacks) {
      cb(status)
    }
  }

  private updateMeta(paneId: string, meta: PaneMeta): void {
    const entry = this.entries.get(paneId)
    if (!entry) return
    entry.meta = { ...entry.meta, ...meta }
    for (const cb of entry.onMetaCallbacks) {
      cb(entry.meta)
    }
  }

  private emitConversation(paneId: string, event: ConversationEvent): void {
    const entry = this.entries.get(paneId)
    if (!entry) return
    for (const cb of entry.onConversationCallbacks) {
      cb(event)
    }
  }
}

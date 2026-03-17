# 会话恢复功能设计文档

> 让用户能够浏览、选择和恢复 AI Agent 历史会话，支持多种 Agent 类型的会话发现与恢复。

## 现状分析

### 已实现的基础设施

| 组件 | 位置 | 状态 |
|------|------|------|
| **StatuslineParser** | `server/src/pty/StatuslineParser.ts` | 从 Claude Code 输出提取 `session_id`，持久化到 `config.yaml` |
| **PtyManager.sendAgentCommand()** | `server/src/pty/PtyManager.ts` | 支持 `--resume <sessionId>` 和 `--continue` 标志 |
| **WorkspaceManager.init()** | `server/src/workspace/WorkspaceManager.ts` | 服务重启时，pane 有 `sessionId` 则自动用 `resume` 模式恢复 |
| **WorkspaceManager.restartPane()** | 同上 | 支持 `mode: 'resume'` + `sessionId` |
| **WorkspaceManager.createPane()** | 同上 | 接受可选 `sessionId`，传递到 PtyManager |
| **WorkspaceManager.getSessionList()** | 同上 | 从运行中 pane + config.yaml 收集可恢复会话 |
| **SessionDiscovery** | `server/src/workspace/SessionDiscovery.ts` | 调用 `claude sessions list --output json`，30s 缓存 |
| **GET /api/sessions** | `server/src/index.ts` | 合并 Nexus 内部 + 外部会话，按 sessionId 去重 |
| **session.list WS 事件** | `server/src/ws/handlers.ts` | 返回 Nexus 内部会话列表 |
| **AddPaneDialog** | `web/src/components/AddPaneDialog.tsx` | 双模式 UI（New Session / Resume Session），会话选择器 |
| **AgentPane Resume 按钮** | `web/src/components/AgentPane.tsx` | Play 图标，优先用 sessionId resume，无则 --continue |
| **类型定义** | `server/src/types.ts` + `web/src/types.ts` | `RestoreMode` 含 `'resume'`，`PaneCreateConfig` 含 `sessionId`，`DiscoveredSession` 接口 |

### 待实现功能

1. **AgentPane stopped 状态恢复覆盖层** — pane 停止后，终端区域无明确恢复引导
2. **CommandPalette 集成** — 无 "Resume Session" 命令
3. **Resume 按钮 tooltip 增强** — 未显示 session ID 片段和上下文使用率

---

## 方案设计

### 1. AgentPane 停止状态恢复覆盖层

**文件**: `packages/web/src/components/AgentPane.tsx`

当 pane 处于 `stopped` 或 `error` 状态且终端已展开时，在终端区域底部叠加恢复操作条：

```
┌──────────────────────────────────────────┐
│  [pane header]                           │
├──────────────────────────────────────────┤
│                                          │
│  (terminal output)                       │
│                                          │
│──────────────────────────────────────────│
│  Session ended ·  [▶ Resume] [↻ New] [→ Continue]  │
└──────────────────────────────────────────┘
```

**交互规则**:
- **Resume Session** — 使用已知 `sessionId` 调用 `pane.restart` mode=resume（仅当 sessionId 存在时显示）
- **New Session** — mode=restart，启动全新会话
- **Continue Latest** — mode=continue，使用 `--continue` 恢复最近会话
- 覆盖层半透明背景，不遮挡终端历史输出
- 点击任一按钮后覆盖层立即消失（pane 状态变为 running）

**实现要点**:
```tsx
// 在 Terminal body 容器内，Terminal 组件之后
{isExpanded && isStopped && (
  <div className="pane-stopped-overlay">
    <span className="pane-stopped-label">Session ended</span>
    <div className="pane-stopped-actions">
      {hasSessionId && (
        <button onClick={handleResume} className="pane-stopped-btn pane-stopped-btn--primary">
          <Play size={13} /> Resume
        </button>
      )}
      <button onClick={handleContinue} className="pane-stopped-btn">
        Continue Latest
      </button>
      <button onClick={handleRestart} className="pane-stopped-btn">
        <RotateCcw size={13} /> New Session
      </button>
    </div>
  </div>
)}
```

**新增 handler**:
```tsx
const handleContinue = (e: React.MouseEvent) => {
  e.stopPropagation()
  send({ type: 'pane.restart', paneId: pane.id, mode: 'continue' })
}
```

**CSS** (添加到 `globals.css`):
```css
.pane-stopped-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: color-mix(in srgb, var(--bg-surface) 90%, transparent);
  backdrop-filter: blur(4px);
  border-top: 1px solid var(--border-subtle);
  z-index: 5;
}

.pane-stopped-label {
  font-size: var(--font-xs);
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.pane-stopped-actions {
  display: flex;
  gap: var(--space-xs);
  margin-left: auto;
}

.pane-stopped-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  font-size: var(--font-xs);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.pane-stopped-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.pane-stopped-btn--primary {
  background: var(--accent-primary);
  color: var(--bg-primary);
  border-color: var(--accent-primary);
}

.pane-stopped-btn--primary:hover {
  opacity: 0.9;
}
```

### 2. Resume 按钮 Tooltip 增强

**文件**: `packages/web/src/components/AgentPane.tsx`

优化 header 中 Resume 按钮的 title 属性，展示更多上下文：

```tsx
// 当前
title={hasSessionId
  ? `Resume session ${(pane.meta.sessionId || pane.sessionId || '').slice(0, 12)}`
  : 'Resume (--continue)'}

// 改进：加入 context 使用率
title={hasSessionId
  ? `Resume ${(pane.meta.sessionId || pane.sessionId || '').slice(0, 8)}${pane.meta.contextUsedPct != null ? ` · ${pane.meta.contextUsedPct}% ctx` : ''}`
  : 'Continue latest session'}
```

### 3. CommandPalette 集成

**文件**: `packages/web/src/components/CommandPalette.tsx`

新增 "Resume Session..." 命令，触发后打开 AddPaneDialog 并预设为 Resume 模式：

```typescript
// 在 commands 列表中新增
{
  id: 'resume-session',
  label: 'Resume Session...',
  icon: History,
  action: () => {
    // 复用 AddPaneDialog，通过 store 打开并预设 resume 模式
    useWorkspaceStore.getState().openAddPaneDialog({ mode: 'resume' })
    setOpen(false)
  }
}
```

**Store 变更** (`workspaceStore.ts`):

```typescript
// 新增状态
addPaneDialogOpen: boolean
addPaneDialogInitialMode: 'new' | 'resume' | null

// 新增 action
openAddPaneDialog: (opts?: { mode: 'resume' }) => void
closeAddPaneDialog: () => void
```

**AddPaneDialog 变更**:
- 从 store 读取 `addPaneDialogInitialMode`
- 打开时如果 initialMode 为 'resume'，自动将 restore 设为 'resume'

---

## 数据流总览

### 会话恢复完整流程

```
用户操作                      前端                          后端
────────────────────────────────────────────────────────────────────────

[场景 A: 从 AddPaneDialog 恢复]

选择 "Resume Session"    →  fetch GET /api/sessions     → SessionDiscovery.listSessions()
                                ?agent=claudecode          + WorkspaceManager.getSessionList()
                                                           → 合并去重返回 DiscoveredSession[]
选中一个 session         →  selectedSessionId = xxx
点击 "Resume"            →  WS: pane.create              → WorkspaceManager.createPane()
                              { restore: 'resume',          → PtyManager.spawn()
                                sessionId: xxx }               → shell → `claude --resume xxx`

[场景 B: 从 stopped pane 恢复]

点击 "Resume"            →  WS: pane.restart             → WorkspaceManager.restartPane()
                              { paneId, mode: 'resume',     → PtyManager.restart()
                                sessionId: xxx }               → shell → `claude --resume xxx`

点击 "Continue Latest"   →  WS: pane.restart             → WorkspaceManager.restartPane()
                              { paneId, mode: 'continue' }   → PtyManager.restart()
                                                               → shell → `claude --continue`

[场景 C: 从 CommandPalette 恢复]

Cmd+K → "Resume Session" → openAddPaneDialog({mode:'resume'})
                          → AddPaneDialog 打开，预设 Resume 模式
                          → 同场景 A
```

### 会话 ID 生命周期

```
Claude Code 启动
    │
    ▼
StatuslineParser 提取 session_id
    │
    ▼
pane.meta.sessionId 更新 ──→ 广播 pane.meta 事件
    │                              │
    ▼                              ▼
AgentsYamlWriter 写入           前端 store 更新
.nexus/agents.yaml              pane.meta.sessionId
    │
    ▼
ConfigManager 持久化
.nexus/config.yaml
    │
    ▼
服务重启 → WorkspaceManager.init()
         → 读取 config.yaml 中的 sessionId
         → 自动以 resume 模式恢复
```

---

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/web/src/components/AgentPane.tsx` | **修改** | 添加 stopped 状态恢复覆盖层 + handleContinue handler + tooltip 增强 |
| `packages/web/src/styles/globals.css` | **修改** | 添加 `.pane-stopped-*` 样式 |
| `packages/web/src/components/CommandPalette.tsx` | **修改** | 新增 "Resume Session..." 命令 |
| `packages/web/src/stores/workspaceStore.ts` | **修改** | 新增 addPaneDialog 状态和 actions |
| `packages/web/src/components/AddPaneDialog.tsx` | **修改** | 支持从 store 读取 initialMode |

> 注：服务端 SessionDiscovery、REST API、WS 事件、类型定义均已实现，本次仅涉及前端 UI 增强。

---

## 验证方案

1. 启动 Nexus (`pnpm run dev:full`)，创建一个 claudecode pane，让它工作一会产生 sessionId
2. 关闭该 pane → 验证 stopped 覆盖层显示三个恢复按钮（Resume / Continue Latest / New Session）
3. 点击 "Resume" → 验证 `claude --resume <sessionId>` 正确发送
4. 点击 "Continue Latest" → 验证 `claude --continue` 正确发送
5. 新建 pane → Start Mode 选 "Resume Session" → 验证会话列表加载（包含 Nexus 内部 + external）
6. 选择一个外部会话 → 验证 pane 正确以 `--resume` 启动
7. Cmd+K → "Resume Session..." → 验证 AddPaneDialog 以 Resume 模式打开
8. 重启 Nexus 服务 → 验证所有带 sessionId 的 pane 自动恢复

---

## 多 Agent 会话发现扩展方案

### 现状问题

当前 `SessionDiscovery` 存在三个硬编码限制：

1. **命令硬编码** — `fetchSessions()` 只认 `claude sessions list --output json`，通过 `agentDef.bin !== 'claude'` 直接短路其他 Agent
2. **解析硬编码** — 返回结构假设 Claude Code 的 JSON schema（`session_id`, `cost_usd`, `num_turns` 等 snake_case 字段）
3. **缓存不分类** — 单一 `this.cache` 对象，不区分 Agent 类型；切换 agent 查询时返回错误缓存

### 设计目标

将 `SessionDiscovery` 改造为**可插拔的多 Agent 会话发现框架**，每种 Agent 类型注册独立的发现策略，同时保持向后兼容。

### 架构设计

```
SessionDiscovery (协调器)
    │
    ├── AgentSessionProvider (接口)
    │       ├── listSessions(): Promise<DiscoveredSession[]>
    │       └── isAvailable(): boolean
    │
    ├── ClaudeCodeProvider    — `claude sessions list --output json`
    ├── OpenCodeProvider      — 读取 ~/.opencode/sessions/ 目录 (或对应 CLI)
    ├── KimiCliProvider       — (待 Kimi CLI 支持 session list 后实现)
    └── FallbackProvider      — 仅返回 Nexus 内部记录的 session
```

### 接口定义

**文件**: `packages/server/src/workspace/SessionDiscovery.ts`

```typescript
/**
 * 每种 Agent 类型实现此接口来提供会话发现能力
 */
export interface AgentSessionProvider {
  /** Agent 类型标识 */
  readonly agentType: AgentType

  /** 检查该 Agent CLI 是否可用（bin 存在且支持 session list） */
  isAvailable(): boolean

  /**
   * 列出该 Agent 的历史会话
   * 实现方需自行处理超时和错误，返回空数组而非抛异常
   */
  listSessions(): Promise<DiscoveredSession[]>
}
```

### Provider 实现

#### ClaudeCodeProvider

```typescript
class ClaudeCodeProvider implements AgentSessionProvider {
  readonly agentType: AgentType = 'claudecode'

  constructor(private agentDef: AgentDefinition) {}

  isAvailable(): boolean {
    return !!this.agentDef.bin
  }

  async listSessions(): Promise<DiscoveredSession[]> {
    const { stdout } = await execFileAsync(
      this.agentDef.bin,
      ['sessions', 'list', '--output', 'json'],
      { timeout: 10_000 }
    )
    const parsed = JSON.parse(stdout.trim())
    const items: ClaudeSession[] = Array.isArray(parsed) ? parsed : (parsed.sessions || [])
    return items.map(s => ({
      sessionId: s.session_id,
      summary: s.summary,
      model: s.model,
      costUsd: s.cost_usd,
      numTurns: s.num_turns,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      projectPath: s.project_path,
      source: 'external',
    }))
  }
}
```

#### OpenCodeProvider（示例）

```typescript
class OpenCodeProvider implements AgentSessionProvider {
  readonly agentType: AgentType = 'opencode'

  constructor(private agentDef: AgentDefinition) {}

  isAvailable(): boolean {
    return !!this.agentDef.bin
    // 后续可检查 `opencode --version` 是否支持 session 子命令
  }

  async listSessions(): Promise<DiscoveredSession[]> {
    // 方案 A: 如果 opencode 支持 CLI 查询
    // const { stdout } = await execFileAsync(this.agentDef.bin, ['session', 'list', '--json'])

    // 方案 B: 直接读取本地存储文件（如 ~/.opencode/sessions/*.json）
    // const sessionsDir = path.join(os.homedir(), '.opencode', 'sessions')
    // ...

    return [] // 暂未实现，返回空数组
  }
}
```

#### FallbackProvider（兜底）

```typescript
/**
 * 对于没有专属 Provider 的 Agent 类型，只返回空数组
 * Nexus 内部记录的 session 由 SessionDiscovery 在合并层统一处理
 */
class FallbackProvider implements AgentSessionProvider {
  readonly agentType: AgentType

  constructor(agentType: AgentType) {
    this.agentType = agentType
  }

  isAvailable(): boolean { return false }
  async listSessions(): Promise<DiscoveredSession[]> { return [] }
}
```

### SessionDiscovery 改造

```typescript
export class SessionDiscovery {
  private providers = new Map<AgentType, AgentSessionProvider>()
  private cacheByAgent = new Map<string, { sessions: DiscoveredSession[]; ts: number }>()

  constructor(private configManager: ConfigManager) {
    this.registerBuiltinProviders()
  }

  /** 注册内置 Provider */
  private registerBuiltinProviders() {
    const agents = this.configManager.getGlobalConfig().agents

    if (agents.claudecode) {
      this.register(new ClaudeCodeProvider(agents.claudecode))
    }
    if (agents.opencode) {
      this.register(new OpenCodeProvider(agents.opencode))
    }
    // 其他 Agent 类型由 FallbackProvider 兜底
  }

  /** 注册自定义 Provider（支持第三方扩展） */
  register(provider: AgentSessionProvider) {
    this.providers.set(provider.agentType, provider)
  }

  /** 按 Agent 类型列出外部会话，带独立缓存 */
  async listSessions(agentType: AgentType = 'claudecode'): Promise<DiscoveredSession[]> {
    const now = Date.now()
    const cached = this.cacheByAgent.get(agentType)
    if (cached && now - cached.ts < CACHE_TTL) {
      return cached.sessions
    }

    const provider = this.providers.get(agentType) || new FallbackProvider(agentType)
    let sessions: DiscoveredSession[] = []

    if (provider.isAvailable()) {
      try {
        sessions = await provider.listSessions()
      } catch (err) {
        console.warn(`[SessionDiscovery] ${agentType} provider failed:`, (err as Error).message)
      }
    }

    this.cacheByAgent.set(agentType, { sessions, ts: now })
    return sessions
  }
}
```

### 关键改动点

| 改动 | 说明 |
|------|------|
| `this.cache` → `this.cacheByAgent` | 按 Agent 类型独立缓存，避免 claudecode 缓存被当作 opencode 结果返回 |
| `fetchSessions()` → Provider 模式 | 每种 Agent 自包含获取逻辑和输出解析，新增 Agent 只需实现 `AgentSessionProvider` |
| `agentDef.bin !== 'claude'` 硬编码移除 | 改由各 Provider 的 `isAvailable()` 判断 |
| `register()` 公开方法 | 允许未来通过插件/配置注册第三方 Agent 的 session provider |

### AgentDefinition 扩展

**文件**: `packages/server/src/types.ts`

```typescript
export interface AgentDefinition {
  bin: string
  continue_flag: string
  resume_flag?: string
  yolo_flag?: string
  statusline: boolean
  env?: Record<string, string>

  // 新增：会话发现配置（可选）
  session_list_cmd?: string[]    // e.g. ['sessions', 'list', '--output', 'json']
  session_list_format?: 'json' | 'jsonl' | 'csv'  // 输出格式
  session_storage_dir?: string   // 本地会话存储路径（用于文件系统发现）
}
```

这让用户可以在 `~/.nexus/config.yaml` 中声明式配置新 Agent 的 session list 能力，无需修改代码：

```yaml
agents:
  claudecode:
    bin: claude
    continue_flag: "--continue"
    resume_flag: "--resume"
    session_list_cmd: ["sessions", "list", "--output", "json"]
    statusline: true

  opencode:
    bin: opencode
    continue_flag: "--continue"
    session_list_cmd: ["session", "list", "--json"]
    statusline: false

  custom-agent:
    bin: my-agent
    continue_flag: "--resume-last"
    resume_flag: "--session"
    session_storage_dir: "~/.my-agent/sessions"
    statusline: false
```

### 通用 ConfigDrivenProvider

除了手写 Provider，还可以基于 `AgentDefinition` 中的新字段实现一个**配置驱动的通用 Provider**：

```typescript
class ConfigDrivenProvider implements AgentSessionProvider {
  readonly agentType: AgentType

  constructor(
    agentType: AgentType,
    private agentDef: AgentDefinition,
  ) {
    this.agentType = agentType
  }

  isAvailable(): boolean {
    return !!(this.agentDef.session_list_cmd || this.agentDef.session_storage_dir)
  }

  async listSessions(): Promise<DiscoveredSession[]> {
    // 优先使用 CLI 命令
    if (this.agentDef.session_list_cmd?.length) {
      const [cmd, ...args] = this.agentDef.session_list_cmd
      const bin = this.agentDef.bin
      const { stdout } = await execFileAsync(bin, args, { timeout: 10_000 })
      return this.parseOutput(stdout)
    }

    // 其次扫描本地存储目录
    if (this.agentDef.session_storage_dir) {
      return this.scanStorageDir(this.agentDef.session_storage_dir)
    }

    return []
  }

  private parseOutput(stdout: string): DiscoveredSession[] {
    // 通用 JSON 解析，尝试适配不同 Agent 的输出格式
    const parsed = JSON.parse(stdout.trim())
    const items = Array.isArray(parsed) ? parsed : (parsed.sessions || parsed.items || [])

    return items.map((s: Record<string, unknown>) => ({
      sessionId: String(s.session_id || s.sessionId || s.id || ''),
      summary: s.summary || s.description || s.name || undefined,
      model: s.model || undefined,
      costUsd: typeof s.cost_usd === 'number' ? s.cost_usd : (typeof s.cost === 'number' ? s.cost : undefined),
      numTurns: typeof s.num_turns === 'number' ? s.num_turns : (typeof s.turns === 'number' ? s.turns : undefined),
      createdAt: s.created_at || s.createdAt || undefined,
      updatedAt: s.updated_at || s.updatedAt || undefined,
      projectPath: s.project_path || s.projectPath || s.cwd || undefined,
      source: 'external' as const,
    }))
  }

  private async scanStorageDir(dir: string): Promise<DiscoveredSession[]> {
    // 展开 ~ 并扫描 JSON 文件
    const resolved = dir.replace(/^~/, os.homedir())
    // ... 读取 *.json，提取 session 信息
    return []
  }
}
```

这样 `registerBuiltinProviders()` 简化为：

```typescript
private registerBuiltinProviders() {
  const agents = this.configManager.getGlobalConfig().agents
  for (const [agentType, agentDef] of Object.entries(agents)) {
    // Claude Code 使用专属 Provider（字段映射已确定）
    if (agentType === 'claudecode') {
      this.register(new ClaudeCodeProvider(agentDef))
    }
    // 其他 Agent 使用配置驱动的通用 Provider
    else if (agentDef.session_list_cmd || agentDef.session_storage_dir) {
      this.register(new ConfigDrivenProvider(agentType as AgentType, agentDef))
    }
  }
}
```

### 前端适配

前端无需感知 Provider 细节，`GET /api/sessions?agent=xxx` 的接口和 `DiscoveredSession` 类型保持不变。AddPaneDialog 已按 agent 类型过滤请求，天然支持多 Agent。

唯一的 UI 考虑：当某个 Agent 不支持会话发现时（`sessions` 返回空数组），Resume Session 面板应显示提示：

```
No session history available for {AgentName}.
This agent may not support session listing.
```

### 实施优先级

| 阶段 | 内容 | 依赖 |
|------|------|------|
| **Phase 1** (本次) | 前端 UI 增强（覆盖层、CommandPalette、tooltip） | 无 |
| **Phase 2** | SessionDiscovery 重构为 Provider 模式 + 按 Agent 独立缓存 | Phase 1 |
| **Phase 3** | AgentDefinition 新增 `session_list_cmd` / `session_storage_dir` | Phase 2 |
| **Phase 4** | ConfigDrivenProvider + 各 Agent 适配 | Phase 3，各 Agent CLI 需支持 session list |

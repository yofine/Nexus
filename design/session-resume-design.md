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

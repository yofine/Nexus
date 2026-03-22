# Agent Pane ACP / Web Chat 改造方案

> 目标：将 Nexus 当前基于 PTY 的 Agent pane 交互，从“终端字节流”升级为“结构化 Web 对话”，同时保留对非 ACP CLI Agent 的兼容能力。

## 背景

Nexus 当前的 Agent pane 架构是：

```text
Browser (React + WebSocket + xterm.js)
        ↕
Fastify Server
        ↕
node-pty
        ↕
Shell
        ↕
Agent CLI
```

当前实现的优点：

- 技术成熟，`node-pty + xterm.js` 风险低
- 对任意 CLI 都适用，不要求 Agent 配合特定协议
- 与现有多 pane、worktree、agents.yaml 体系兼容

当前实现的核心问题：

- **只有字节流，没有语义层**。前端拿到的主要是 `terminal.output`
- **消息边界不稳定**。一条“助手回复”会被混在 ANSI 输出、状态行、工具输出里
- **计划、审批、工具执行** 都不是一等公民，只能靠输出解析或旁路事件补丁
- **聊天体验难做精细**。无法稳定实现 message list、tool cards、plan cards、permission prompts
- **不同 Agent 的能力无法归一**。现在只能统一退化成“终端屏幕”

这导致 Agent pane 虽然能用，但交互体验仍像远程终端，而不是现代 Web 对话界面。

## 调研结论

### 1. ACP 适合做结构化 Web 对话

ACP（Agent Client Protocol）是 Agent 与 Client 之间的结构化协议，核心特征：

- 基于 JSON-RPC
- 首选 `stdio` 传输
- 支持会话、消息、工具调用、终端、计划、审批等结构化事件

对 Nexus 相关的关键能力：

- `initialize`：协商能力，如 `fs`、`terminal`
- `session/new`：创建会话
- `session/prompt` / Prompt Turn：发送用户消息
- `session/update`：流式返回 assistant 文本、tool_call、plan 等更新
- `session/request_permission`：请求用户审批
- `terminal/create` / `terminal/output` / `terminal/wait_for_exit`：工具执行终端

这意味着：

- Agent 的“回答”可以作为消息渲染
- Agent 的“计划”可以作为 plan 卡片渲染
- Agent 的“工具调用”可以作为 tool 卡片渲染
- 工具内部若需要 shell，可以作为嵌入式 terminal 渲染，而不是整个 UI 都退化成终端

### 2. `opencode web` 值得参考，但不是 ACP Web 封装

OpenCode 有三条相关能力线：

1. `opencode acp`
   - 启动 ACP 子进程
   - 通过 `stdin/stdout` 与 ACP Client 通信
2. `opencode serve`
   - 启动 Headless HTTP Server
   - 暴露 OpenAPI + SSE
3. `opencode web`
   - 在 `serve` 的基础上提供 Web UI
   - Web 与 TUI 可以附着到同一服务

因此，OpenCode 的 Web 模式给我们的启发主要是：

- **Server / Client 分离**
- **Session 持久化**
- **同一后端状态可被多个前端消费**
- **Web 不必依赖 PTY 才能交互**

但它不是“ACP 套一层网页”，所以不能简单照搬为 Nexus 的通用协议层。

### 3. Nexus 需要双 Runtime，而不是直接替换 PTY

Nexus 当前支持的 Agent 不只 OpenCode。现实情况是：

- OpenCode 这类 Agent 可以优先走 ACP
- Claude Code、Aider、Gemini CLI 等未必都有 ACP 接口

因此合理方向不是“全站替换 PTY”，而是：

- **ACP Agent 走结构化聊天 Runtime**
- **非 ACP Agent 继续走 PTY Runtime**
- 前端以统一事件模型消费两者

## 设计目标

### 产品目标

- Agent pane 从“终端 pane”为主升级为“对话 pane”为主
- 将计划、工具执行、审批、状态等提升为可视化的一等对象
- 保留查看完整终端输出的能力，但降级为附属视图
- 兼容现有多 Agent、多 pane、worktree、会话恢复能力

### 技术目标

- 不破坏现有 PTY 路线，支持渐进迁移
- 新增 ACP Runtime，不影响当前已上线 Agent
- 前后端统一事件模型，避免 UI 直接依赖某种 transport
- 保持多客户端安全，仍支持 WebSocket/SSE 式广播

### 非目标

- 本阶段不尝试把所有 CLI Agent 都包装成 ACP
- 本阶段不重写整个 pane / workspace / diff / review 体系
- 本阶段不完全复刻 OpenCode Server API

## 现状分析

当前与 Agent 交互直接相关的代码边界：

- `packages/server/src/pty/PtyManager.ts`
  - 启动 shell、spawn agent、收集输出、缓冲 scrollback
- `packages/server/src/ws/handlers.ts`
  - 将 `terminal.output`、`pane.meta`、`pane.status` 等事件推给前端
- `packages/web/src/components/Terminal.tsx`
  - `xterm.js` 组件，直接消费字节流

当前协议的中心事件是：

- Client → Server
  - `terminal.input`
  - `terminal.resize`
- Server → Client
  - `terminal.output`
  - `pane.status`
  - `pane.meta`

问题不在某个局部实现，而在于**系统最核心的抽象仍是“终端”而不是“会话”**。

## 总体方案

### 核心思路

引入 `AgentRuntime` 抽象，在后端支持两类运行时：

1. `PtyRuntime`
   - 保留现有 `node-pty` 路线
   - 负责非 ACP Agent
2. `AcpRuntime`
   - 启动 `agent acp` 子进程
   - 通过 `stdin/stdout` 跑 JSON-RPC
   - 将 ACP 消息转换为 Nexus 的统一会话事件

前端不再只消费 `terminal.output`，而是消费统一的 `ConversationEvent` 流。

### 新的数据流

```text
Browser
  ↕ WebSocket
Nexus Server
  ↕
Conversation Event Bus
  ├─ PtyRuntime  ─→ Shell / CLI / PTY
  └─ AcpRuntime  ─→ agent acp (JSON-RPC over stdio)
```

对前端来说，两个 runtime 都输出同一套事件：

- 用户消息
- 助手消息增量
- 助手消息完成
- 计划更新
- 工具开始 / 更新 / 结束
- 权限请求 / 响应
- 终端附着 / 终端输出
- 会话状态变化

## 后端设计

### 1. 新增 `AgentRuntime` 抽象

建议接口：

```ts
interface AgentRuntime {
  start(paneId: string, config: PaneConfig): Promise<RuntimeHandle>
  stop(paneId: string): Promise<void>
  sendUserMessage(paneId: string, input: UserInput): Promise<void>
  resizeTerminal?(paneId: string, terminalId: string, cols: number, rows: number): Promise<void>
  sendTerminalInput?(paneId: string, terminalId: string, data: string): Promise<void>
  onEvent(listener: (event: ConversationEvent) => void): () => void
  getSnapshot(paneId: string): ConversationSnapshot | undefined
}
```

说明：

- `paneId` 仍保留，避免大改 workspace 层
- Runtime 对外输出的是 `ConversationEvent`，不是 PTY 字节流
- `terminal` 从主交互面降级为可选工具视图

### 2. `PtyRuntime`

职责：

- 基本复用 `PtyManager`
- 对现有 CLI Agent 保持兼容
- 在可能的情况下，从终端输出中提取有限结构化事件

事件映射策略：

- 原始 `terminal.output` 继续保留
- `pane.status`、`pane.meta` 沿用现有逻辑
- 用户输入通过 `sendUserMessage` 转换为写入 PTY
- 若未来对特定 Agent 有稳定解析器，可逐步补充 `message.*` 事件

结论：

- `PtyRuntime` 是兼容层，不是终局方案
- 其 UI 应默认展示 Terminal View，而不是伪装成完整 Chat View

### 3. `AcpRuntime`

职责：

- spawn `agent acp`
- 发送 `initialize`
- 根据 pane 配置创建 / 恢复 ACP session
- 发送 prompt
- 接收并解析 `session/update`、permission、terminal 等 ACP 事件
- 转换成 Nexus 内部事件总线

关键点：

- 使用 `stdio`，不要走浏览器直接连 agent
- ACP 子进程生命周期由 Nexus Server 托管
- ACP sessionId 与 Nexus paneId 需要做映射持久化

建议内部模块：

- `AcpProcess`
  - 启动 / 停止 ACP 子进程
  - 读写 nd-json / JSON-RPC 消息
- `AcpSessionManager`
  - 维护 `paneId -> acpSessionId`
  - 会话恢复 / 新建
- `AcpEventMapper`
  - 将 ACP 原始消息映射成 `ConversationEvent`
- `AcpTerminalManager`
  - 管理 ACP `terminal/*` 子终端

### 4. 统一事件模型

建议新增服务端事件类型：

```ts
type ConversationEvent =
  | { type: 'message.user'; paneId: string; messageId: string; content: string }
  | { type: 'message.assistant.chunk'; paneId: string; messageId: string; delta: string }
  | { type: 'message.assistant.done'; paneId: string; messageId: string }
  | { type: 'plan.updated'; paneId: string; items: PlanItem[] }
  | { type: 'tool.started'; paneId: string; toolCallId: string; title: string; kind: string }
  | { type: 'tool.updated'; paneId: string; toolCallId: string; status: string; content: ToolContent[] }
  | { type: 'tool.finished'; paneId: string; toolCallId: string; status: 'completed' | 'failed' | 'cancelled' }
  | { type: 'permission.requested'; paneId: string; requestId: string; payload: PermissionRequest }
  | { type: 'permission.resolved'; paneId: string; requestId: string; decision: 'allow' | 'deny' }
  | { type: 'terminal.attached'; paneId: string; terminalId: string; title?: string }
  | { type: 'terminal.output'; paneId: string; terminalId: string; data: string }
  | { type: 'session.state'; paneId: string; state: 'idle' | 'running' | 'waiting' | 'error' | 'stopped' }
```

原则：

- UI 一律消费 `ConversationEvent`
- PTY / ACP 差异被 runtime 隔离
- 历史回放直接基于事件序列，而不是依赖终端 scrollback

### 5. WebSocket 协议升级

当前 `ws/handlers.ts` 以 `terminal.output` 为中心，需要扩展为：

- Client → Server
  - `conversation.send`
  - `permission.respond`
  - `terminal.input`
  - `terminal.resize`
  - 保留 `pane.create` / `pane.close` / `pane.restart`
- Server → Client
  - `conversation.event`
  - `pane.status`
  - `pane.meta`
  - `workspace.state`

兼容策略：

- 旧前端仍可订阅 `terminal.output`
- 新前端优先消费 `conversation.event`

## 前端设计

### 1. Pane 视图从 Terminal-first 改为 Conversation-first

每个 Agent pane 拆成两个层次：

1. **Conversation View**
   - 用户消息
   - 助手回复
   - 计划卡片
   - 工具卡片
   - 权限请求卡片
2. **Terminal View**
   - 原始终端
   - 调试 / 降级 / 工具输出深挖

推荐默认行为：

- ACP pane 默认打开 Conversation View
- PTY pane 默认打开 Terminal View
- 两者都允许手动切换

### 2. 聊天区组件建议

- `MessageList`
- `Composer`
- `PlanCard`
- `ToolCallCard`
- `PermissionCard`
- `InlineTerminalCard`
- `ConversationStatusBar`

关键交互：

- assistant 增量输出按消息流式更新
- tool card 内可折叠终端输出
- permission card 原地审批
- 历史消息支持回放和恢复

### 3. Store 设计

当前 store 以 pane + terminal writer 为中心，需要补充：

- `conversationByPane[paneId]`
- `messages`
- `plans`
- `toolCalls`
- `permissions`
- `attachedTerminals`

`terminalRegistry` 仍保留，但定位改为：

- 服务于 Terminal View
- 服务于内嵌 terminal card
- 不再作为 Agent pane 的唯一交互主链路

## 与现有功能的兼容性

### 1. worktree

不冲突。

- pane 仍然绑定 `workdir` / `worktreePath`
- `AcpRuntime` 在启动 agent 时将对应目录作为 `cwd`

### 2. agents.yaml

不应删除，但职责要收敛。

保留内容：

- pane 基础状态
- pid / runtime 类型 / workdir / sessionId
- 当前状态、当前模型、最近活动时间

不建议继续把过多会话 UI 细节写入 `agents.yaml`。

### 3. session restore

现有恢复能力主要面向 CLI session。

改造后：

- PTY pane 继续使用现有 `continue / restart / manual`
- ACP pane 使用 ACP `sessionId` 恢复
- pane 配置层仍可统一暴露恢复模式，但 runtime 内部分别实现

### 4. review / file tree / git diff

这些与 transport 无直接冲突，可原样保留。

## 实施分期

### Phase 0: 文档与抽象

- 明确 runtime 抽象
- 定义统一 `ConversationEvent`
- 设计新 WS 协议

### Phase 1: 后端 Runtime 抽象落地

- 将现有 `PtyManager` 包装为 `PtyRuntime`
- `WorkspaceManager` 改为依赖 runtime 接口而非直接依赖 PTY
- 保持现有 UI 不变，先完成后端解耦

### Phase 2: 接入 `AcpRuntime`（先支持 OpenCode）

- 支持配置某个 agent 为 `transport: acp`
- 通过 `opencode acp` 跑通最小链路
- 支持：
  - 新建会话
  - 发送消息
  - 接收 assistant 文本
  - `tool / plan / permission` 基础事件

### Phase 3: 前端 `ChatPane`

- 新增 `ConversationView`
- ACP pane 切换为聊天界面
- Terminal 作为附属 tab 或折叠区域

### Phase 4: 历史回放与恢复

- 将 conversation event 序列持久化
- 支持页面刷新后恢复会话 UI
- 减少对 terminal scrollback 的依赖

### Phase 5: 兼容层增强

- 针对部分 PTY Agent 做可选解析器
- 让非 ACP Agent 也能暴露有限结构化能力

## 风险与取舍

### 风险 1：ACP Agent 覆盖率不够

影响：

- 不能一次性统一所有 agent 的体验

对策：

- 双 runtime 并存
- Chat-first 只优先覆盖 ACP Agent

### 风险 2：协议映射复杂度增加

影响：

- 后端要维护 PTY 与 ACP 两套 transport

对策：

- 强制在 runtime 层收敛为同一事件模型
- UI 层禁止感知底层 transport 细节

### 风险 3：会话恢复逻辑变复杂

影响：

- pane restore、agent session、UI history 三者需要同步

对策：

- 分开管理：
  - pane 生命周期
  - agent session 生命周期
  - UI event history

### 风险 4：前端复杂度上升

影响：

- 从一个 xterm 组件变成消息流 + 卡片 + 内嵌终端

对策：

- 第一阶段只做最小聊天骨架
- `tool card / permission card / inline terminal` 分步上线

## 推荐决策

推荐采用：

- **短期**：保留 PTY 主链路，先完成 runtime 抽象
- **中期**：优先把 OpenCode 接到 `AcpRuntime`
- **中期**：新增 ChatPane，ACP Agent 默认走 Web 对话界面
- **长期**：Nexus 成为“多 Runtime Agent 控制台”，而不是“多 PTY 终端管理器”

不推荐采用：

- 继续在 PTY 输出上叠加大量解析逻辑来模拟聊天体验
- 直接用 OpenCode 的 HTTP Server API 作为全站统一协议
- 为了统一 UI，强制所有 Agent 都走 ACP 包装层

## 对 Nexus 的直接收益

- Agent pane 交互体验从终端回显升级到结构化协作
- 计划、工具、审批可视化，用户认知负担降低
- 更适合多 Agent 并行监控，而不是逐个盯终端
- 为后续 review、broadcast、task orchestration 留出协议层空间

## 参考资料

- ACP Initialization: <https://agentclientprotocol.com/protocol/initialization>
- ACP Transports: <https://agentclientprotocol.com/protocol/transports>
- ACP Session Setup: <https://agentclientprotocol.com/protocol/session-setup>
- ACP Terminals: <https://agentclientprotocol.com/protocol/terminals>
- OpenCode CLI: <https://open-code.ai/docs/cli>
- OpenCode Web: <https://opencode.ai/docs/web>
- OpenCode Server: <https://opencode.ai/docs/server>
- OpenCode ACP Support: <https://opencode.ai/docs/acp/>

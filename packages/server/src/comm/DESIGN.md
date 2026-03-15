# Communication Core Module — 设计文档

## 定位

`comm/` 是 Nexus 与 CLI Agent 之间所有 PTY 级通信智能的核心模块。它从原始终端字节流中提取结构化信息、协调启动时序、推断 Agent 行为状态，使上层（PtyManager、WorkspaceManager、前端 UI）能够以可靠的事件驱动方式与 Agent 交互。

```
PTY 原始字节流 (node-pty onData)
        │
        ▼
┌───────────────────────────────────────────────┐
│              comm 模块处理管线                  │
│                                               │
│  ┌──────────────────┐   ┌──────────────────┐  │
│  │ ShellReadyDetector│   │ StatuslineParser │  │
│  │ (启动阶段，一次性) │   │ (全生命周期)     │  │
│  └────────┬─────────┘   └───────┬──────────┘  │
│           │                     │              │
│  ┌────────▼─────────┐   ┌──────▼───────────┐  │
│  │AgentReadyDetector │   │OutputStateAnalyzer│  │
│  │ (启动阶段，一次性) │   │ (全生命周期)     │  │
│  └──────────────────┘   └──────────────────┘  │
│                                               │
└───────────────────────────────────────────────┘
        │
        ▼
  cleanData + meta + status events → PtyManager → WebSocket → 前端
```

---

## 设计原则

1. **事件驱动，零轮询** — 所有检测由 PTY onData 事件触发，没有 setInterval。
2. **热路径极简** — `onOutput()` 和 `feed()` 在每个 PTY 数据块上调用（高频），只做最少的工作：时间戳赋值、timer reset、charCode 快速拒绝。
3. **确定性清理** — 每个组件实现 `dispose()`，由 PtyManager 在 `kill()` 和 PTY `onExit` 时统一调用，无泄漏 timer。
4. **可独立测试** — 组件不直接依赖 node-pty 运行时（仅接口类型），可用纯 mock 测试。
5. **一次性 vs 持续** — ShellReadyDetector 和 AgentReadyDetector 是一次性的（resolve 后不再消耗资源）；StatuslineParser 和 OutputStateAnalyzer 在 pane 整个生命周期内活跃。

---

## 组件详解

### ShellReadyDetector

**问题**：`pty.spawn(shell)` 后 shell 需要加载 `.bashrc`/`.zshrc`/conda init 等，之前用 `setTimeout(800ms)` 猜测完成时间，在慢环境下会失败。

**方案**：Sentinel Echo

```
spawn shell → write("echo __NEXUS_RDY_{id}_{ts}__\r") → 监听输出 → 匹配 sentinel → resolve
```

- Sentinel 命令排在 `.bashrc` 初始化之后执行（shell 按顺序处理 stdin）
- 包含 paneId + 时间戳，保证跨 pane 不碰撞
- `stripSentinel: true` 时从输出中过滤 sentinel 行，用户在终端中不会看到
- 兜底超时 8s（可配置），超时后仍继续执行（不阻塞启动）

```typescript
interface ShellReadyResult {
  detected: boolean   // sentinel 是否被检测到
  elapsedMs: number   // 实际等待时间
}
```

**性能**：
- 注入成本：单次 `pty.write()`，~50 字节
- 检测成本：每个 onData chunk 做一次 `string.includes()`，检测到后立即移除
- 内存：最多缓存最近 3 个 chunk 用于跨块匹配，检测完成后释放

---

### AgentReadyDetector

**问题**：Agent CLI 启动后有初始化过程（加载配置、连接 API、显示 banner），之前用 `setTimeout(2000ms)` 猜测完成，task 可能在 Agent 还没准备好时就发出。

**方案**：4 层检测策略（优先级从高到低）

| 层 | 策略 | 触发条件 | 适用场景 |
|---|---|---|---|
| 1 | Statusline | 收到包含 `session_id` 的 meta 事件 | Claude Code（有 statusline） |
| 2 | Prompt Pattern | 终端输出末尾匹配 `❯`、`>`、`$` 等 prompt | 所有 Agent |
| 3 | Quiescence | 连续 3s 无输出（可配置） | Agent banner 输出完毕后的沉默 |
| 4 | Hard Timeout | 15s 强制超时（可配置） | 兜底，防止永久阻塞 |

```typescript
type AgentReadyReason = 'statusline' | 'prompt' | 'quiescence' | 'timeout'

interface AgentReadyResult {
  reason: AgentReadyReason
  elapsedMs: number
}
```

**Prompt 检测细节**：
- 只检查输出的最后 200 字符（prompt 一定在末尾），避免全文扫描
- 先 strip ANSI 转义序列再匹配，处理彩色 prompt
- 支持通过 `extraPromptPatterns` 扩展自定义 Agent 的 prompt 格式

**性能**：
- 每次 `feed()` 成本：一次 ANSI strip（仅最后 200 字符）+ N 个正则测试（N=4~6）
- quiescence timer 每次 feed 重置一次（`clearTimeout` + `setTimeout`）
- 50k 次 feed 在 200ms 以内完成（实测）

---

### StatuslineParser

**问题**：旧版仅检查行是否以 `{` 开头 `}` 结尾，Agent 输出的任何 JSON 行都会被误判为 statusline。

**方案**：多层验证

```
原始行 → charCode 快速拒绝 → 长度检查(≥10) → JSON.parse → 字段计数 + 类型校验
```

已知 statusline 字段及类型：

| 字段 | 类型 | 来源 |
|---|---|---|
| `model` | string | Claude Code |
| `session_id` | string | Claude Code |
| `cost_usd` | number | Claude Code |
| `context_used_pct` | number | Claude Code |
| `cwd` | string | Claude Code |
| `tool_name` | string | Claude Code |

验证规则：
- 必须是 plain object（排除数组、null）
- 至少匹配 **2 个**已知字段，且类型正确
- 仅匹配 1 个字段的 JSON 被视为普通输出（pass through）

```typescript
// 示例：会被识别为 statusline
{"model":"claude-opus-4-6","session_id":"abc","cost_usd":0.05}  // 3 字段 ✓

// 示例：不会被误判
{"name":"test.ts","content":"..."}  // 0 个已知字段 ✗
{"model":"gpt-4"}                    // 仅 1 个字段 ✗ (低于阈值)
[1, 2, 3]                            // 数组 ✗
```

**Buffer 机制**：
- 无换行符的数据块被缓存（等待完整行）
- 有换行符时拼接 buffer 后按行处理
- `reset()` 清空 buffer（pane restart 时调用）

**性能**：
- 快速路径：行首 charCode ≠ `{` 时零开销（无 trim、无 JSON.parse）
- 100k 行混合输出（1:1000 statusline 比例）：< 200ms
- 100KB 单块数据（2000 行 + 1 statusline）：< 50ms

---

### OutputStateAnalyzer

**问题**：PaneStatus 仅在进程退出时更新，无法区分 Agent 正在思考、等待输入、还是空闲。

**方案**：基于输出模式的状态机

```
         onOutput()           idleThresholdMs           idleThresholdMs * 2
running ──────────── running ────────────────► waiting ────────────────────► idle
   ▲                                             │                            │
   │              onOutput()                     │        onOutput()          │
   └─────────────────────────────────────────────┘────────────────────────────┘

                     onExit(0)           onExit(≠0)
   any ──────────────────────► stopped     any ──────────────────► error
```

辅助信号：
- `onMeta()` 中 `context_used_pct` 增长 → 强制回到 `running`（Agent 消耗了 context，一定在工作）
- 进程退出覆盖一切推断状态
- 回调去重：同状态不重复触发 `onStatusChange`

```typescript
interface OutputStateOptions {
  idleThresholdMs?: number                    // 默认 5000ms
  onStatusChange?: (status: PaneStatus) => void
}
```

**性能**：
- `onOutput()` 是最热的路径：仅 `Date.now()` + 状态比较 + `clearTimeout`/`setTimeout`
- 无字符串操作、无正则、无内存分配
- 100k 次调用 < 500ms（实测，含 timer 重置开销）

---

## 启动时序编排

PtyManager 中的 `startAgentSequence()` 用 async/await 将三个阶段串联：

```
1. pty.spawn(shell)
       │
2. ShellReadyDetector.start(pty)  ──── echo sentinel 注入
       │                                    │
       │  ◄──── PTY onData 持续 feed ──────┘
       │
       ▼  (sentinel 检测到 或 8s 超时)
3. sendAgentCommand()  ──── "claude --continue\r"
       │
4. AgentReadyDetector.start()
       │                                    │
       │  ◄──── PTY onData + meta 持续 feed ┘
       │
       ▼  (statusline/prompt/quiescence/15s 超时)
5. pty.write(task + '\r')
```

每步之间有 `this.entries.has(paneId)` 守卫：如果 pane 在等待期间被 kill，序列立即中止。

---

## 数据流全景

```
                PTY onData(raw)
                     │
           ┌─────────▼──────────┐
           │ ShellReadyDetector  │  (仅启动阶段)
           │ feed(raw) → clean   │  strip sentinel from output
           └─────────┬──────────┘
                     │ processedData
           ┌─────────▼──────────┐
           │ AgentReadyDetector  │  (仅启动阶段)
           │ feed(processedData) │  check prompt patterns
           └─────────┬──────────┘
                     │
           ┌─────────▼──────────┐
           │  StatuslineParser   │  (全生命周期)
           │ parse(processedData)│  → { cleanData, meta }
           └──┬──────────────┬──┘
              │              │
     cleanData│         meta │
              │              │
   ┌──────────▼───┐  ┌──────▼──────────────┐
   │OutputState   │  │ OutputStateAnalyzer  │
   │Analyzer      │  │ .onMeta(meta)        │
   │.onOutput()   │  │ context_used_pct ↑   │
   │timestamp+timer│  │ → force running     │
   └──────┬───────┘  └──────┬──────────────┘
          │                  │
          ▼                  ▼
   status events       meta events
          │                  │
          └───────┬──────────┘
                  ▼
           PtyEntry callbacks
                  │
                  ▼
        WorkspaceManager.emit()
                  │
                  ▼
           WebSocket → 前端
```

---

## 性能预算

| 操作 | 频率 | 预算 | 实际 |
|---|---|---|---|
| `StatuslineParser.parse()` | 每 PTY chunk (~数百/秒) | < 1μs/非候选行 | charCode 检查，~0.1μs |
| `OutputStateAnalyzer.onOutput()` | 每 PTY chunk | < 5μs | Date.now + clearTimeout + setTimeout |
| `ShellReadyDetector.feed()` | 每 PTY chunk（仅启动阶段） | < 2μs | string.includes on 3 chunks |
| `AgentReadyDetector.feed()` | 每 PTY chunk（仅启动阶段） | < 10μs | ANSI strip(200 chars) + regex match |
| `StatuslineParser.parse()` 候选行 | ~1/1000 行 | < 50μs | JSON.parse + 字段遍历 |

总计每个 PTY chunk 的 comm 模块开销：< 20μs（非启动阶段 < 10μs）。

相比之下，xterm.js 渲染一个 chunk 的成本在 100μs~1ms 级别，comm 模块的开销可以忽略不计。

---

## 测试覆盖

```
comm/
├── ShellReadyDetector.test.ts    (11 tests)
│   ├── sentinel 注入与检测
│   ├── 跨块分片匹配
│   ├── sentinel 从输出剥离
│   ├── 超时回退
│   ├── 多实例隔离（不同 pane 不碰撞）
│   ├── dispose 清理
│   └── 性能: 10k feed 调用 < 100ms
│
├── AgentReadyDetector.test.ts    (14 tests)
│   ├── Statusline 检测 (session_id)
│   ├── Prompt 检测 (❯ / > / ANSI / 自定义)
│   ├── Quiescence 检测 (超时沉默)
│   ├── Hard timeout 兜底
│   ├── 策略优先级 (statusline > prompt > quiescence)
│   ├── dispose 安全性
│   └── 性能: 50k feed 调用 < 200ms
│
├── StatuslineParser.test.ts      (19 tests)
│   ├── 基础解析与字段提取
│   ├── 加固验证 (≥2 字段阈值, 类型校验)
│   ├── 误判防御 (Agent JSON 输出, 数组, 单字段)
│   ├── 多行与跨块 buffer 处理
│   ├── 快速拒绝路径 (非 { 开头, 短行)
│   ├── 边界情况 (空输入, 连续换行, 畸形 JSON)
│   ├── 多 statusline 合并 (last wins)
│   └── 性能: 100k 行 < 200ms, 100KB chunk < 50ms
│
└── OutputStateAnalyzer.test.ts   (15 tests)
    ├── 状态机转换 (running→waiting→idle, 回到 running)
    ├── Idle timer 重置
    ├── context_used_pct 增长信号
    ├── 进程退出状态覆盖
    ├── 回调去重 (同状态不重复触发)
    ├── dispose 后不再触发回调
    └── 性能: 100k onOutput 调用 < 500ms
```

运行测试：
```bash
pnpm --filter @nexus/server test        # 单次运行
pnpm --filter @nexus/server test:watch  # 监听模式
```

---

## 扩展点

### 新增 Agent 类型适配

在 `AgentReadyDetector` 中通过 `extraPromptPatterns` 添加自定义 prompt 正则：

```typescript
new AgentReadyDetector({
  extraPromptPatterns: [/opencode>\s*$/],
})
```

### 新增 Statusline 字段

在 `StatuslineParser.ts` 的 `KNOWN_FIELDS` 中添加：

```typescript
const KNOWN_FIELDS: Record<string, string> = {
  model: 'string',
  session_id: 'string',
  // ... existing
  new_field: 'string',  // ← 新增
}
```

同时更新 `extractMeta()` 和 `PaneMeta` 类型。

### 替代传输层

当前所有组件通过 `feed(data)` / `onOutput()` 接收文本数据。如果未来某个 Agent 支持结构化传输（如 `--output-format stream-json`），可以新建一个 `StructuredParser` 实现相同的 `PaneMeta` 输出接口，在 PtyManager 中按 Agent 能力选择使用哪个 parser。comm 模块的其余组件（OutputStateAnalyzer 等）不需要修改。

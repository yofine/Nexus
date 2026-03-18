# Nexus 稳定性审计报告

> 日期: 2026-03-19
> 范围: 全链路终端数据流 + 资源管理 + 多客户端并发

---

## 已修复的问题

| # | 问题 | 文件 | 修复方式 |
|---|------|------|----------|
| F1 | macOS/WSL2 下 `posix_spawnp failed` | `scripts/postinstall.mjs` | postinstall 恢复 `spawn-helper` 的 0755 执行权限 |
| F2 | 前端终端写入无批处理，高频输出卡死 UI | `terminalRegistry.ts` | `requestAnimationFrame` 批处理，每帧合并一次 `term.write()` |
| F3 | WebSocket 重连后终端输出重复 | `App.tsx` | 收到 `workspace.state` 时 `clearAllHistories()` |
| F4 | 服务端 scrollback trim 用 `shift()` 循环 O(n²) | `PtyManager.ts` | 改为一次性计算 removeCount 后 `splice` |
| F5 | 服务端 scrollback replay 同步阻塞事件循环 | `handlers.ts` | async + `setImmediate` 在 chunk 间让出事件循环 |
| F6 | StatuslineParser buffer 无上限 | `StatuslineParser.ts` | 加 64KB 上限 |
| F7 | 客户端 history 只限 chunk 数不限字节 | `terminalRegistry.ts` | 加 5MB/pane 字节限制 |

---

## 待修复问题

### CRITICAL — 直接影响可用性

#### C1. WebSocket 消息帧爆炸（scrollback replay）

**文件**: `packages/server/src/ws/handlers.ts`
**现象**: 初始连接或重连时，10 pane × 512KB scrollback = 80+ 个 64KB 的 WebSocket 帧，慢网络下首屏加载卡顿严重。
**原因**: `SCROLLBACK_CHUNK_SIZE` 为 64KB，每个 chunk 单独发送，JSON 编码开销 + TCP ACK 开销叠加。
**修复建议**:
- 提高 `SCROLLBACK_CHUNK_SIZE` 到 256-512KB
- 或改为每个 pane 只发一条合并消息

#### C2. PTY spawn 后 onData 注册时序问题

**文件**: `packages/server/src/pty/PtyManager.ts` (lines 109-150)
**现象**: WSL2/Docker 下 shell 初始化极快（<10ms），PTY 数据在 `onData` 注册前就产生，早期输出丢失。
**原因**: `pty.spawn()` 返回后，entry 对象构建和 `term.onData()` 注册之间有约 20 行代码的间隔。
**修复建议**:
```typescript
const term = pty.spawn(...)
// 立即注册 onData，在 entry 构建之前
const earlyBuffer: string[] = []
const earlyListener = term.onData((data) => earlyBuffer.push(data))

// ... 构建 entry ...
this.entries.set(paneId, entry)
earlyListener.dispose()

// 注册正式 listener 并回放 early buffer
term.onData((data: string) => { /* 正式处理 */ })
for (const chunk of earlyBuffer) { /* 回放 */ }
```

#### C3. ActivityParser buffer 无上限

**文件**: `packages/server/src/pty/ActivityParser.ts`
**现象**: 如果 agent 输出无换行的大量数据（如 base64 编码文件），buffer 无限增长导致 OOM。
**修复建议**: 同 StatuslineParser，加 64KB 上限。

#### C4. terminal.input 无错误处理

**文件**: `packages/server/src/ws/handlers.ts` (line 99)
**现象**: `writeToPane` 抛异常时（pane 已关闭、PTY 已退出），异常冒泡可能导致 WebSocket handler 崩溃，断开所有客户端。
**修复建议**:
```typescript
case 'terminal.input':
  try {
    workspaceManager.writeToPane(event.paneId, event.data)
  } catch (err) {
    console.error('[WS] writeToPane failed:', event.paneId, err)
  }
  break
```

#### C5. closePane 异步竞态

**文件**: `packages/server/src/workspace/WorkspaceManager.ts`
**现象**: 快速关闭多个 pane 时，config 文件写入竞态，可能导致 pane 配置丢失或残留。worktree 清理可能不完整。
**修复建议**:
- 用 Promise 链序列化 config 写入
- 在 `closePane` 中先停 git service 再删 worktree

---

### HIGH — 长时间运行后出现的问题

#### H1. PTY 事件回调数组未清理

**文件**: `packages/server/src/pty/PtyManager.ts` (lines 351-377)
**现象**: pane 关闭后 `onDataCallbacks`/`onStatusCallbacks` 等数组未清空，闭包引用可能阻止 GC。
**修复建议**: 在 `kill()` 中加 `entry.onDataCallbacks.length = 0` 等清理。

#### H2. SessionRecorder 未等待 pending diff

**文件**: `packages/server/src/history/SessionRecorder.ts`
**现象**: 服务器关闭时，正在执行的 `captureDiff` 未被等待，session 文件写入不完整。
**修复建议**: 跟踪 pending diff promises，在 `flush()` 中 await。

#### H3. Worktree 删除后 GitService watcher 泄漏

**文件**: `packages/server/src/git/WorktreeManager.ts`
**现象**: worktree pane 关闭时，如果 `stopPaneGitService()` 未在 `removeWithBranch()` 之前调用，chokidar FSWatcher 泄漏文件句柄。
**修复建议**: `closePane()` 中确保先停 git service 再删 worktree。

#### H4. 客户端 Activity 数组内存

**文件**: `packages/web/src/stores/workspaceStore.ts`
**现象**: 虽然限制了 100 条，但 `addActivity` 每次创建新数组，如果 UI 组件 memoize 不当会保留旧引用。高频 activity 事件下（每秒 10+），React 重渲染开销高。
**修复建议**: 对同文件连续 activity 做去重/合并。

#### H5. 多 pane 快速关闭 config 写入竞态

**文件**: `packages/server/src/workspace/WorkspaceManager.ts`
**现象**: 用户 Cmd+W 连续快速关闭 pane 时，并发 `removePaneFromConfig()` 调用写同一文件。
**修复建议**: config 写入用 Promise 链或 mutex 序列化。

#### H6. 环境变量注入风险

**文件**: `packages/server/src/pty/PtyManager.ts` (lines 83-91)
**现象**: agent 定义中的 `env` 字段无白名单验证，恶意配置可注入 `PATH`/`LD_PRELOAD` 等危险变量。
**修复建议**: 对 agent env 做黑名单过滤（`PATH`/`LD_PRELOAD`/`DYLD_*`），或只允许白名单变量。

---

### MEDIUM — 特定场景下的问题

#### M1. git diff 操作无超时

**文件**: `packages/server/src/git/GitService.ts`
**现象**: 大仓库（Chromium、Linux kernel）或网络文件系统上，`git diff` 可能卡住数十秒，阻塞事件循环。
**修复建议**: 用 `Promise.race` 加 10s 超时。

#### M2. FsWatcher 和 buildTree 深度不匹配

**文件**: `packages/server/src/fs/FsWatcher.ts`
**现象**: chokidar 监听 depth 5，但 `buildTree` 递归 depth 8。当 depth 5-8 范围的目录变化时，文件树不更新。
**修复建议**: 统一为 depth 5。

#### M3. 终端 refit 时容器可能 0x0

**文件**: `packages/web/src/components/AgentPane.tsx` (lines 54-65)
**现象**: 双 rAF 后容器仍可能未完成 layout（CSS 动画、慢设备），`fitAddon.fit()` 得到 0 列，发送 `terminal.resize` cols=0 到服务端。
**修复建议**: fit 前检查 `containerRef.current.clientWidth > 0`。

#### M4. pane 创建缺少服务端校验

**文件**: `packages/server/src/ws/handlers.ts`
**现象**: 恶意或异常的 `pane.create` 消息（空 name、无效 agent）直接通过，创建损坏的 pane。
**修复建议**: 服务端校验 name 非空、agent 类型有效。

---

## 架构层面的改进建议

### 1. 终端输出背压机制

当前从 PTY → WS → 前端的链路没有任何背压控制。如果一个 pane 产生大量输出（如 `cat /dev/urandom`），会拖垮整个服务器和所有客户端。

**建议**: 在 `PtyManager.onData` 中加入令牌桶限速：
- 正常模式：不限速
- 当 1 秒内输出 > 1MB 时，启动限速（每 100ms 发送一次合并 chunk）
- 发送一条 `pane.status: throttled` 通知 UI 显示提示

### 2. WebSocket 消息协议优化

当前每条消息都是独立 JSON，高频 `terminal.output` 下 JSON 编码开销占比高。

**建议**: 对 `terminal.output` 使用二进制消息格式：
```
[1 byte type][4 bytes paneId length][paneId][raw data]
```
减少约 40% 的 WS 带宽消耗。

### 3. 优雅关闭

当前 `SIGTERM` 处理只调用 `ptyManager.killAll()`。应该：
1. 停止接受新连接
2. 通知所有客户端 `server.shutdown`
3. flush SessionRecorder
4. 等待 pending config 写入
5. 清理 worktree
6. kill 所有 PTY
7. 关闭 WebSocket 连接

### 4. 健康检查与指标

添加 `/api/health` 增强版，返回：
- 活跃 pane 数量
- 每 pane 的 scrollback 大小
- WebSocket 连接数
- 事件循环延迟（`monitorEventLoopDelay`）
- 内存使用

用于监控和排查线上问题。

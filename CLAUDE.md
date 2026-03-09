# Nexus — AI Agent 多实例管理控制台

## 项目定位

Nexus 是一个**本地 Web 控制台**，用于在单个浏览器界面中同时管理多个 CLI AI Agent 实例（Claude Code、OpenCode 等）的并行协作。用户通过 `nexus` CLI 启动服务，自动打开浏览器进入管理界面。

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Node.js 22+, Fastify 5, node-pty, chokidar, simple-git, js-yaml |
| 前端 | React 18, Vite 6, xterm.js, Zustand, Tailwind CSS v4 (CSS-first), shiki, cmdk |
| 构建 | pnpm monorepo, tsx (直接运行 TS) |
| 通信 | 单 WebSocket 连接多路复用 + REST API |

## 目录结构

```
Nexus/
├── packages/
│   ├── server/src/           # 后端 (~1530 行)
│   │   ├── cli.ts            # CLI 入口 (nexus start/init/status/stop)
│   │   ├── index.ts          # Fastify 服务编排，启动所有子服务
│   │   ├── types.ts          # 全局类型定义
│   │   ├── pty/
│   │   │   ├── PtyManager.ts     # node-pty 生命周期，滚动缓冲区 (512KB/pane)
│   │   │   └── StatuslineParser.ts # 从 Claude Code 输出提取 JSON 元数据
│   │   ├── workspace/
│   │   │   ├── WorkspaceManager.ts  # 状态中心，Set-based 多客户端事件分发
│   │   │   ├── ConfigManager.ts     # YAML 配置读写，Agent CLI 自动检测
│   │   │   └── AgentsYamlWriter.ts  # 防抖写 .nexus/agents.yaml (500ms)
│   │   ├── ws/handlers.ts    # WebSocket 事件路由
│   │   ├── fs/FsWatcher.ts   # chokidar 文件树监听 (depth 5, 防抖 300ms)
│   │   ├── git/GitService.ts # simple-git diff + .git/index 监听 (防抖 1s)
│   │   └── history/          # 终端历史管理
│   │
│   └── web/src/              # 前端 (~2500 行)
│       ├── App.tsx           # 根组件，WebSocket→Store 事件路由
│       ├── types.ts          # 前端类型 (与 server 手动同步，无共享包)
│       ├── components/
│       │   ├── Layout.tsx         # 四栏布局 (Sidebar|AgentPanes|Editor|FileTree)
│       │   ├── Sidebar.tsx        # 左侧图标操作栏 (48px)
│       │   ├── AgentPane.tsx      # 单个 Agent 手风琴面板 (可折叠)
│       │   ├── Terminal.tsx       # xterm.js 封装
│       │   ├── BottomTerminal.tsx # 底部浮动 Shell (懒创建，agent='__shell__')
│       │   ├── EditorTabs.tsx     # 文件/Diff 标签页系统
│       │   ├── FileTree.tsx       # 递归文件树浏览器
│       │   ├── FileViewer.tsx     # Shiki 语法高亮代码查看器
│       │   ├── GitDiffPanel.tsx   # Git diff 展示 + 展开 hunks
│       │   ├── AddPaneDialog.tsx  # 新建 Agent Pane 弹窗
│       │   ├── CommandPalette.tsx # Cmd+K 命令面板 (cmdk)
│       │   ├── AgentIcon.tsx      # Agent 类型 SVG 图标
│       │   └── ResizeHandle.tsx   # 列拖拽分隔条
│       ├── stores/
│       │   ├── workspaceStore.ts     # Zustand 全局状态 (panes/tabs/files/diffs)
│       │   └── terminalRegistry.ts   # 全局 Map 终端写入注册表 (不走 React)
│       ├── hooks/
│       │   ├── useWebSocket.ts       # WS 连接 + 指数退避重连
│       │   └── useKeyboardShortcuts.ts # 全局快捷键
│       └── styles/globals.css        # 7 套主题 + CSS Variables + 响应式缩放
│
├── .nexus/
│   ├── config.yaml     # 项目级配置 (panes 定义，提交到 git)
│   ├── agents.yaml     # 运行时状态 (自动生成，gitignore)
│   └── history/        # 终端历史 (gitignore)
│
└── docs/               # 设计文档
```

## 核心架构

### 数据流

```
浏览器 ←──WebSocket──→ Fastify Server
  │                        │
  │  terminal.input ──→    │──→ PtyManager.write(paneId, data) ──→ node-pty
  │  ←── terminal.output   │←── PtyManager.onData callback
  │                        │
  │  pane.create ──→       │──→ WorkspaceManager.createPane()
  │  ←── workspace.state   │      → PtyManager.spawn() → Shell → Agent CLI
  │                        │      → ConfigManager.save()
  │  ←── fs.tree           │←── FsWatcher (chokidar)
  │  ←── git.diff          │←── GitService (simple-git)
  │  ←── pane.meta         │←── StatuslineParser (Claude Code JSON)
```

### 关键设计决策

1. **Shell 套壳启动** — 不直接 spawn Agent CLI，而是先启动 shell，800ms 后发送命令。确保 .bashrc/.zshrc 环境变量正确加载。

2. **终端输出旁路 React** — `terminalRegistry.ts` 用全局 `Map<paneId, writeFn>` 存储 xterm 写入函数。WebSocket 数据直接写入 xterm，不经过 React state，避免高频输出导致的性能问题。历史缓冲区限制 10000 chunks。

3. **Set-based 多客户端事件** — WorkspaceManager 的每类事件维护 `Set<listener>`。每个 WebSocket 客户端连接时注册监听器，断开时只移除自己的，互不影响。

4. **agents.yaml 互感知** — 所有 Agent pane 的运行状态实时写入 `.nexus/agents.yaml`（防抖 500ms），Agent 可以读取此文件感知其他 Agent 的存在和状态。

5. **StatuslineParser** — Claude Code 的 statusline API 会在终端输出中插入 JSON 行。Parser 检测并提取 `model/session_id/cost_usd/context_used_pct` 等字段，从输出中剥离后广播为 `pane.meta` 事件。

6. **类型手动同步** — server 和 web 各有独立的 `types.ts`，没有共享包。修改协议时需同时更新两处。

## WebSocket 事件协议

```typescript
// Client → Server
'terminal.input'   // { paneId, data }
'terminal.resize'  // { paneId, cols, rows }
'pane.create'      // { config: PaneCreateConfig }
'pane.close'       // { paneId }
'pane.restart'     // { paneId, mode: 'continue'|'restart'|'manual' }
'git.refresh'      // {}
'broadcast.send'   // { groupId, message }

// Server → Client
'terminal.output'  // { paneId, data }
'pane.status'      // { paneId, status }
'pane.meta'        // { paneId, meta: { model, contextUsedPct, costUsd, ... } }
'pane.added'       // { pane: PaneState }
'pane.removed'     // { paneId }
'workspace.state'  // { state: WorkspaceState } (初始连接时发送)
'fs.tree'          // { tree: FileNode[] }
'git.diff'         // { diffs: FileDiff[] }
```

## 状态类型

```typescript
type AgentType  = 'claudecode' | 'opencode' | 'kimi-cli' | 'qwencode' | '__shell__'
type PaneStatus = 'running' | 'waiting' | 'idle' | 'stopped' | 'error'

// __shell__ 是底部浮动终端的特殊类型，在 UI 列表中过滤掉
```

## 配置体系

- **全局** `~/.nexus/config.yaml` — Agent CLI 定义（bin 路径、continue flag、env）、默认 shell、主题
- **项目** `.nexus/config.yaml` — 项目名、panes 列表（name/agent/workdir/task/restore）
- **运行时** `.nexus/agents.yaml` — 自动生成，pane PID/状态/元数据

## 主题系统

7 套内置主题通过 `data-theme` 属性切换，所有样式基于 CSS Variables：
- `dark-ide` (默认), `github-dark`, `dracula`, `tokyo-night`, `catppuccin`, `nord`, `light-ide`
- 响应式缩放：≥1600px (+15%), ≥1920px (+25%)

## 开发

```bash
pnpm install
pnpm run dev:full          # 前后端并行开发 (server:7700, vite:7701)
pnpm run dev               # 先构建前端，再启动 server (仅 7700)
NEXUS_PORT=8080 pnpm start # 生产模式，自定义端口
```

## 当前进度

- **已完成 (P0/P1)**: CLI、PTY 管理、终端交互、文件树、Git Diff、agents.yaml、多客户端 WS、statusline 集成
- **未开始 (P2)**: Review 评论→Agent、任务分发/广播、主题切换 UI
- **未开始 (P3)**: 历史回放、任务模板、Web 端配置编辑

## 编码约定

- Tailwind CSS v4 CSS-first 配置（无 tailwind.config.js），主题 token 定义在 `globals.css`
- 组件大量使用内联 style 而非 className
- 防抖间隔：AgentsYamlWriter 500ms, FsWatcher 300ms, GitService 1000ms
- PTY 滚动缓冲区上限 512KB/pane，前端历史缓冲区上限 10000 chunks
- `__shell__` pane 在 store 层面从 panes 列表中过滤，仅 BottomTerminal 使用

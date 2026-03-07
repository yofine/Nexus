# Nexus — 完整技术方案文档

---

## 一、项目总览

| 项目 | 内容 |
|---|---|
| **名称** | Nexus |
| **定位** | 本地 CLI AI Agent 多实例管理 Web 控制台 |
| **入口** | `nexus` CLI 命令，自动打开浏览器 |
| **核心场景** | 单 Repo 多 Agent 并行协作、任务分发、代码 Review |
| **部署方式** | 本地单机，Node.js 服务 + 浏览器访问 |

---

## 二、目录结构

```
# 全局配置
~/.nexus/
  ├── config.yaml              # Agent 定义、全局默认值
  └── logs/                    # 全局运行日志

# 项目级（跟随代码库）
my-app/
  └── .nexus/
        ├── config.yaml        # Workspace 配置 ✅ 建议提交
        ├── agents.yaml        # 实时 Agent 状态 ❌ gitignore
        └── history/           # 终端历史      ❌ gitignore
              ├── pane-1.log
              └── pane-1.meta.json

# .gitignore 追加
.nexus/agents.yaml
.nexus/history/
```

---

## 三、配置文件

### `~/.nexus/config.yaml` 全局配置

```yaml
version: "1"

defaults:
  shell: /bin/zsh
  scrollback_lines: 5000
  grid_columns: 2
  history_retention_days: 30
  theme: dark-ide              # 默认主题

agents:
  claudecode:
    bin: claude
    continue_flag: "--continue"
    statusline: true           # 支持 statusline JSON API
    env:
      ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY}"

  opencode:
    bin: opencode
    continue_flag: "--continue"
    statusline: false
    env:
      OPENAI_API_KEY: "${OPENAI_API_KEY}"

  kimi-cli:
    bin: kimi
    continue_flag: "--continue"
    statusline: false
    env:
      KIMI_API_KEY: "${KIMI_API_KEY}"

  qwencode:
    bin: qwen-code
    continue_flag: "--continue"
    statusline: false
    env:
      DASHSCOPE_API_KEY: "${DASHSCOPE_API_KEY}"
```

### `.nexus/config.yaml` 项目配置

```yaml
version: "1"
name: "my-app"
description: "主应用全栈开发"

repository:
  path: "."
  git: true

panes:
  - id: pane-1
    name: "Auth 重构"
    agent: claudecode
    workdir: src/auth
    task: "重构 JWT 验证逻辑，抽离 middleware"
    restore: continue          # continue | restart | manual | none

  - id: pane-2
    name: "组件库"
    agent: claudecode
    workdir: src/components
    task: "补全 Button 组件无障碍属性"
    restore: continue

  - id: pane-3
    name: "API 文档"
    agent: opencode
    workdir: src/api
    task: "补充 OpenAPI 注释"
    restore: manual

broadcast_groups:
  - id: all
    name: "全部 Agent"
    match: "*"

  - id: claude-only
    name: "所有 Claude"
    agent_type: claudecode

  - id: auth-group
    name: "Auth 相关"
    pane_ids: [pane-1]

task_templates:
  - id: morning-sync
    name: "每日同步"
    tasks:
      - pane_id: pane-1
        prompt: "检查今日 git log，输出工作建议"
      - pane_id: pane-2
        prompt: "继续昨日未完成的任务"
```

### `.nexus/agents.yaml` 运行时状态（自动写入）

```yaml
# 自动生成，实时更新，供 Agent 感知彼此状态
updated_at: "2026-03-08T10:23:00+08:00"

panes:
  - id: pane-1
    name: "Auth 重构"
    agent: claudecode
    pid: 12345
    status: running
    workdir: /my-app/src/auth
    task: "重构 JWT 验证逻辑，抽离 middleware"
    model: "claude-sonnet-4-5"
    context_used_pct: 23
    cost_usd: 0.042
    session_id: "abc123"
    transcript_path: ".nexus/history/pane-1.jsonl"
    started_at: "2026-03-08T09:00:00+08:00"

  - id: pane-2
    name: "组件库"
    agent: claudecode
    pid: 12346
    status: waiting
    workdir: /my-app/src/components
    task: "补全 Button 组件无障碍属性"
    model: "claude-sonnet-4-5"
    context_used_pct: 8
    cost_usd: 0.011
    session_id: "def456"
    started_at: "2026-03-08T09:15:00+08:00"
```

---

## 四、实体关系

```
Workspace（持久化，.nexus/config.yaml）
  │
  ├── Repository
  │     ├── path（项目根目录）
  │     └── git（是否 git 仓库）
  │
  ├── PaneList（弹性，手风琴布局）
  │     └── AgentPane[]
  │           ├── AgentProcess（node-pty）
  │           ├── task（写入 agents.yaml，供其他 Agent 感知）
  │           ├── workdir（可选）
  │           ├── status（实时）
  │           └── TerminalHistory（.nexus/history/）
  │
  ├── FileTree（实时，chokidar 监听）
  │
  ├── GitDiffPanel（repo 级别，simple-git）
  │
  └── ReviewPanel
        └── Comment → 拼接上下文 → 发回指定 AgentPane
```

---

## 五、系统架构

```
┌──────────────────────────────────────────────────────────────┐
│                     Browser (React + TS)                      │
│                                                              │
│  ┌─────────┬──────────────────────┬────────────┬──────────┐  │
│  │Sidebar  │   Agent 手风琴区     │  Diff & CR │  File    │  │
│  │操作栏   │   (主交互区)         │            │  Viewer  │  │
│  └─────────┴──────────────────────┴────────────┴──────────┘  │
└──────────────────────────────┬───────────────────────────────┘
                               │ WebSocket + REST
┌──────────────────────────────▼───────────────────────────────┐
│                        Node.js Backend                        │
│                                                              │
│  ┌─────────────┐  ┌────────────┐  ┌──────────┐  ┌────────┐  │
│  │ PTY Manager │  │ FS Watcher │  │   Git    │  │History │  │
│  │ (node-pty)  │  │ (chokidar) │  │ Service  │  │Manager │  │
│  └─────────────┘  └────────────┘  │(simple-  │  └────────┘  │
│                                   │  git)    │              │
│  ┌─────────────┐  ┌────────────┐  └──────────┘  ┌────────┐  │
│  │  Workspace  │  │   Config   │                 │ Task   │  │
│  │  Manager    │  │  Manager   │                 │Dispatch│  │
│  └─────────────┘  └────────────┘                 └────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  agents.yaml Writer                                  │    │
│  │  PTY 状态变化 → 实时写入 .nexus/agents.yaml           │    │
│  │  claudecode statusline API → JSON pipe 解析          │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────┬───────────────────────────────┘
                               │ spawn via node-pty
┌──────────────────────────────▼───────────────────────────────┐
│                    CLI Agent Processes                        │
│        [claudecode] [opencode] [kimi-cli] [qwencode]         │
└──────────────────────────────────────────────────────────────┘
```

---

## 六、前端布局

### 主视图（四栏固定全高）

```
┌────┬──────────────────────────┬───────────────┬────────────┐
│Side│    Agent 手风琴区         │  Diff & CR    │  File      │
│bar │                          │               │  Viewer    │
│    │ ┌────────────────────┐   │ M src/auth/   │            │
│[+] │ │▼ pane-1 claude  ● │   │   index.ts    │ 📁 src     │
│    │ │  Auth重构 src/auth │   │ ────────────  │  📁 auth   │
│[⚡]│ │ ┌────────────────┐ │   │ - old line    │   📄 index │
│    │ │ │                │ │   │ + new line    │   📄 jwt   │
│[📋]│ │ │  xterm.js      │ │   │               │  📁 comp   │
│    │ │ │  Terminal      │ │   │ ┌───────────┐ │  📁 api    │
│[⚙]│ │ │                │ │   │ │ comment   │ │            │
│    │ │ │  > _           │ │   │ │ 发给:     │ │            │
│    │ │ └────────────────┘ │   │ │ [pane-1▼] │ │            │
│    │ │ [prompt...] [发送] │   │ │ [发送]    │ │            │
│    │ └────────────────────┘   │ └───────────┘ │            │
│    │                          │               │            │
│    │ ┌────────────────────┐   │ M src/comp/   │            │
│    │ │▶ pane-2 claude  ◐ │   │   Button.tsx  │            │
│    │ │  组件库  src/comp  │   │               │            │
│    │ │  补全Button无障碍  │   │               │            │
│    │ │  23% ctx · $0.04  │   │               │            │
│    │ └────────────────────┘   │               │            │
│    │                          │               │            │
│    │ ┌────────────────────┐   │               │            │
│    │ │▶ pane-3 opencode ● │   │               │            │
│    │ │  API文档  src/api  │   │               │            │
│    │ └────────────────────┘   │               │            │
│    │                          │               │            │
│    │ [+ Add Pane]             │               │            │
└────┴──────────────────────────┴───────────────┴────────────┘
```

### 折叠态卡片信息

```
┌────────────────────────────────────────────────────────┐
│ ▶  pane-2   claudecode   ◐ waiting                    │
│    组件库 · src/components · 23% ctx · $0.04          │
└────────────────────────────────────────────────────────┘
```

| 字段 | 来源 | 备注 |
|---|---|---|
| Agent 类型 | config 静态 | 始终可用 |
| 运行状态 | PTY 输出解析 | running / waiting / idle / error |
| 任务描述 | `pane.task` | 用户填写，超长截断 |
| workdir | `pane.workdir` | 相对路径显示 |
| context 使用率 | claudecode statusline API | 仅 claudecode 支持 |
| 累计费用 | claudecode statusline API | 仅 claudecode 支持 |

### Sidebar 图标说明

| 图标 | 功能 |
|---|---|
| `[+]` | 添加 Pane（选 Agent 类型 + 填 task） |
| `[⚡]` | 任务分发（批量创建 / 广播） |
| `[📋]` | 任务模板 |
| `[⚙]` | Workspace 设置 |

---

## 七、主题系统

### 内置主题列表

| 主题 ID | 名称 | 风格参考 |
|---|---|---|
| `dark-ide` | Dark IDE（默认） | VSCode Dark+ / Cursor |
| `github-dark` | GitHub Dark | GitHub 深色 |
| `dracula` | Dracula | Dracula 经典配色 |
| `tokyo-night` | Tokyo Night | 流行 VSCode 主题 |
| `catppuccin` | Catppuccin Mocha | 柔和深色 |
| `nord` | Nord | 冷色系极简 |
| `light-ide` | Light IDE | 浅色 IDE 风 |

### Design Token 结构（CSS Variables）

每套主题只需覆盖以下变量：

```css
/* 示例：dark-ide 主题 */
[data-theme="dark-ide"] {
  /* ── 基础层 ── */
  --bg-base:        #0d0d0d;   /* 最底层背景 */
  --bg-surface:     #161616;   /* 面板/侧边栏 */
  --bg-elevated:    #1e1e1e;   /* 卡片/悬浮层 */
  --bg-overlay:     #252525;   /* 折叠卡片 hover */

  /* ── 边框 ── */
  --border-subtle:  #2a2a2a;   /* 面板分割线 */
  --border-default: #3a3a3a;   /* 组件边框 */

  /* ── 文字 ── */
  --text-primary:   #e8e8e8;
  --text-secondary: #888888;
  --text-muted:     #555555;
  --text-code:      #d4d4d4;

  /* ── 强调色 ── */
  --accent-primary: #7c6af7;   /* 主操作色（紫） */
  --accent-hover:   #9580ff;
  --accent-subtle:  #7c6af71a; /* 10% 透明度背景 */

  /* ── 状态色 ── */
  --status-running: #3fb950;   /* 绿 */
  --status-waiting: #d29922;   /* 黄 */
  --status-idle:    #555555;   /* 灰 */
  --status-error:   #f85149;   /* 红 */

  /* ── Diff 专用 ── */
  --diff-added-bg:      #0d2a1a;
  --diff-added-gutter:  #0a2015;
  --diff-removed-bg:    #2a0d0d;
  --diff-removed-gutter:#200a0a;
  --diff-word-added:    #1a4d2a;
  --diff-word-removed:  #4d1a1a;

  /* ── Terminal 专用 ── */
  --term-bg:        #000000;
  --term-fg:        #cccccc;
  --term-cursor:    #7c6af7;
  --term-selection: #7c6af740;

  /* ── 字体 ── */
  --font-ui:   'Geist', system-ui, sans-serif;
  --font-mono: 'Geist Mono', 'JetBrains Mono', monospace;
  --font-size-ui:   13px;
  --font-size-mono: 13px;
}
```

### 其他主题 Token 速查

```css
[data-theme="dracula"] {
  --bg-base:        #282a36;
  --bg-surface:     #21222c;
  --bg-elevated:    #2d2f3f;
  --accent-primary: #bd93f9;
  --status-running: #50fa7b;
  --term-bg:        #1e1f29;
  --term-cursor:    #f1fa8c;
  /* ...其余同结构 */
}

[data-theme="tokyo-night"] {
  --bg-base:        #1a1b26;
  --bg-surface:     #16161e;
  --bg-elevated:    #1f2335;
  --accent-primary: #7aa2f7;
  --status-running: #9ece6a;
  --term-bg:        #13131d;
  --term-cursor:    #7aa2f7;
}

[data-theme="catppuccin"] {
  --bg-base:        #1e1e2e;
  --bg-surface:     #181825;
  --bg-elevated:    #313244;
  --accent-primary: #cba6f7;
  --status-running: #a6e3a1;
  --term-bg:        #11111b;
  --term-cursor:    #f5e0dc;
}

[data-theme="nord"] {
  --bg-base:        #2e3440;
  --bg-surface:     #272c36;
  --bg-elevated:    #3b4252;
  --accent-primary: #88c0d0;
  --status-running: #a3be8c;
  --term-bg:        #242933;
  --term-cursor:    #88c0d0;
}

[data-theme="github-dark"] {
  --bg-base:        #0d1117;
  --bg-surface:     #010409;
  --bg-elevated:    #161b22;
  --accent-primary: #58a6ff;
  --status-running: #3fb950;
  --term-bg:        #0d1117;
  --term-cursor:    #58a6ff;
}

[data-theme="light-ide"] {
  --bg-base:        #ffffff;
  --bg-surface:     #f5f5f5;
  --bg-elevated:    #ebebeb;
  --border-subtle:  #e0e0e0;
  --text-primary:   #1a1a1a;
  --text-secondary: #666666;
  --accent-primary: #6b57e8;
  --term-bg:        #1e1e1e;   /* terminal 保持深色 */
  --term-fg:        #cccccc;
}
```

---

## 八、前端技术栈

```
框架          React 18 + TypeScript + Vite
样式          Tailwind CSS v4
组件库        shadcn/ui（代码直接入项目，可任意修改）
终端          @xterm/xterm + xterm-addon-fit + xterm-addon-web-links
Diff          react-diff-view（轻量，支持 unified/split，可高亮行）
文件树        shadcn/ui Collapsible 自实现
状态管理      Zustand
WS 客户端     原生 WebSocket + 自封装 useWebSocket hook
图标          Lucide React
字体          Geist + Geist Mono（Vercel 开源）
主题切换      data-theme attribute + CSS Variables
```

### 关键依赖版本

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "@xterm/xterm": "^5.5.0",
    "xterm-addon-fit": "^0.10.0",
    "xterm-addon-web-links": "^0.11.0",
    "react-diff-view": "^3.2.0",
    "zustand": "^5.0.0",
    "lucide-react": "^0.460.0"
  },
  "devDependencies": {
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0"
  }
}
```

---

## 九、后端技术栈

```
运行时        Node.js 22+
语言          TypeScript（tsx 直接运行）
HTTP/WS       Fastify + @fastify/websocket
PTY 管理      node-pty
文件监听      chokidar
Git 操作      simple-git
配置解析      js-yaml
历史存储      追加写文件（.log）+ JSON meta
进程管理      自研 PtyManager（Map<paneId, IPty>）
```

### 后端目录结构

```
packages/server/
  ├── src/
  │     ├── index.ts               # Fastify 入口
  │     ├── pty/
  │     │     ├── PtyManager.ts    # node-pty 生命周期管理
  │     │     └── StatuslineParser.ts  # claudecode JSON pipe 解析
  │     ├── workspace/
  │     │     ├── WorkspaceManager.ts
  │     │     ├── ConfigManager.ts     # yaml 读写
  │     │     └── AgentsYamlWriter.ts  # 实时写 agents.yaml
  │     ├── git/
  │     │     └── GitService.ts        # simple-git 封装
  │     ├── fs/
  │     │     └── FsWatcher.ts         # chokidar + 文件树构建
  │     ├── history/
  │     │     └── HistoryManager.ts    # log 追加 + meta 管理
  │     ├── task/
  │     │     └── TaskDispatcher.ts    # 批量任务 / 广播
  │     └── ws/
  │           └── handlers.ts          # WebSocket 事件路由
  └── package.json
```

---

## 十、WebSocket 事件协议

```typescript
// ─── Client → Server ──────────────────────────────────────
type ClientEvent =
  | { type: 'terminal.input';   paneId: string; data: string }
  | { type: 'terminal.resize';  paneId: string; cols: number; rows: number }
  | { type: 'pane.create';      config: PaneCreateConfig }
  | { type: 'pane.close';       paneId: string }
  | { type: 'pane.restart';     paneId: string; mode: RestoreMode }
  | { type: 'broadcast.send';   groupId: string; message: string }
  | { type: 'task.dispatch';    tasks: TaskItem[] }
  | { type: 'review.comment';   paneId: string; comment: ReviewComment }
  | { type: 'git.refresh' }
  | { type: 'workspace.save' }

// ─── Server → Client ──────────────────────────────────────
type ServerEvent =
  | { type: 'terminal.output';  paneId: string; data: string }
  | { type: 'pane.status';      paneId: string; status: PaneStatus }
  | { type: 'pane.meta';        paneId: string; meta: PaneMeta }
  | { type: 'fs.tree';          tree: FileNode[] }
  | { type: 'git.diff';         diff: FileDiff[] }
  | { type: 'workspace.state';  state: WorkspaceState }

// ─── Types ────────────────────────────────────────────────
type PaneStatus   = 'running' | 'waiting' | 'idle' | 'stopped' | 'error'
type RestoreMode  = 'continue' | 'restart' | 'manual'
type AgentType    = 'claudecode' | 'opencode' | 'kimi-cli' | 'qwencode'

interface PaneMeta {
  model?:          string
  contextUsedPct?: number
  costUsd?:        number
  sessionId?:      string
  cwd?:            string
}

interface ReviewComment {
  file:    string
  line:    number
  content: string
  // 自动拼成发送给 Agent 的消息：
  // "关于文件 {file} 第 {line} 行：{content}\n请根据此反馈修改代码。"
}

interface TaskItem {
  agentType:     AgentType
  workdir?:      string
  task:          string
  createNewPane: boolean
  paneId?:       string   // 指定已有 pane，否则新建
}

interface PaneCreateConfig {
  name:      string
  agent:     AgentType
  workdir?:  string
  task?:     string
  restore:   RestoreMode
}
```

---

## 十一、CLI 命令设计

```bash
nexus                         # 启动，读取 .nexus/config.yaml
                              # 无配置 → 引导初始化 → 打开浏览器
nexus init                    # 强制重新初始化引导
nexus add                     # 快速添加 Pane（CLI 参数方式）
nexus status                  # 打印所有 Pane 状态（不打开浏览器）
nexus stop                    # 停止所有 Agent 进程，关闭 server
```

### 首次启动引导流程

```
Step 1  检测 ~/.nexus/config.yaml
        → 不存在：扫描本机已安装的 Agent CLI
          （which claude / opencode / kimi / qwen-code）
          → 选择默认 Agent → 写入 ~/.nexus/config.yaml

Step 2  检测当前目录 .nexus/config.yaml
        → 存在：直接加载
        → 不存在 + 是 git repo：
            自动创建 .nexus/config.yaml
            默认一个 AgentPane（使用全局默认 Agent）
        → 不存在 + 非 git repo：
            打开浏览器展示空 Workspace
            引导用户在 UI 上选择目录

Step 3  启动 Fastify server（默认 port 7700）
        打开浏览器 http://localhost:7700
        默认展开第一个 AgentPane，可直接交互
```

---

## 十二、历史与恢复（三级降级）

```
Level 1  Agent 自身恢复（优先）
         读取 agents.yaml 中的 session_id
         → claudecode --continue --session <id>
         → opencode   --session <id>

Level 2  Nexus 历史回放（兜底）
         .nexus/history/pane-xxx.log 终端输出存档
         重新打开时展示只读历史，可滚动回溯
         状态显示「已结束 · 点击重启」

Level 3  手动恢复
         用户点击重启，选择是否 --continue
         session 已过期则从空白开始
         历史日志仍可查阅
```

---

## 十三、开发阶段规划

| 阶段 | 模块 | 交付物 |
|---|---|---|
| **P0** | CLI 入口 + 引导流程 | `nexus` 命令可用 |
| **P0** | PTY Manager（node-pty）+ WebSocket | 进程管理基础 |
| **P0** | 手风琴 Terminal UI（xterm.js）| 可交互的 Agent 窗口 |
| **P0** | config.yaml 读写 + Workspace 加载 | 配置驱动启动 |
| **P1** | FileTree（chokidar）+ File Viewer | 实时文件树 |
| **P1** | Git Diff 面板（react-diff-view）| repo 级别 diff |
| **P1** | agents.yaml 实时写入 + 折叠卡片状态 | Agent 互感知 |
| **P1** | claudecode statusline API 集成 | ctx% / cost 展示 |
| **P2** | Review Comment → 发回 Agent | CR 流程闭环 |
| **P2** | 任务分发 + 广播组 | 批量任务 |
| **P2** | 主题系统（7套内置主题）| 主题切换 |
| **P3** | 历史回放 + 三级恢复机制 | 工作日志 |
| **P3** | 任务模板 + Web 端配置编辑 | 配置管理 |


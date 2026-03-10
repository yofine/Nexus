# Nexus

Nexus 是一个本地 Web 控制台，用于在单个浏览器界面中并行管理多个 CLI AI Agent 实例的协作。

## 功能特性

### 🖥️ 多 Agent 并行管理
- 支持多种 Agent：Claude Code、OpenCode、Aider、Codex、Gemini
- 每个 Agent 拥有独立的终端面板，支持折叠/展开
- 创建、关闭、重启 Agent 进程
- 实时状态指示（运行中/等待中/空闲/已停止/错误）
- 底部浮动 Shell 终端，随时可用

### 🔀 Git Worktree 隔离
- 每个 Agent 可选择独立的 Git Worktree 工作
- 各 Agent 在独立分支上并行开发，互不冲突
- 面板头部显示分支名和文件变更数

### 📊 Agent 元数据监控
- 自动解析 Claude Code statusline，提取运行时信息
- 实时显示：模型名称、上下文使用率、累计费用、会话 ID
- 所有 Agent 状态写入 `.nexus/agents.yaml`，Agent 间可互相感知

### 📁 文件与代码查看
- 实时文件树，自动监听文件变化（chokidar）
- 内置代码查看器，Shiki 语法高亮
- Git Diff 面板，查看仓库级别的代码变更

### ⌨️ 快捷键与命令面板
- `Cmd/Ctrl+K` 打开命令面板，快速执行操作
- `Cmd/Ctrl+N` 新建 Agent 面板
- `Cmd/Ctrl+1-9` 快速切换面板
- `Cmd/Ctrl+G` 打开 Git Diff
- 命令面板内切换主题

### 🎨 界面与主题
- 四栏可调布局：侧边栏 / Agent 面板区 / 编辑器区 / 文件树
- 7 套内置主题：Dark IDE、GitHub Dark、Dracula、Tokyo Night、Catppuccin、Nord、Light IDE
- 响应式缩放适配大屏幕

### 📝 任务与配置
- YAML 配置驱动，支持全局（`~/.nexus/config.yaml`）和项目级配置
- 为每个 Agent 分配独立的工作目录和任务描述
- 会话恢复模式：继续（`--continue`）/ 重启 / 手动

## 安装与使用

```bash
# 全局安装
npm install -g nexus-console

# 在项目目录中启动
nexus

# 指定项目路径启动
nexus ~/projects/my-app

# 初始化项目配置
nexus init ~/projects/my-app

# 查看工作区状态
nexus status

# 停止服务
nexus stop

# 自定义端口
NEXUS_PORT=8080 nexus
```

### 从源码开发

```bash
# 安装依赖
pnpm install

# 开发模式（自动构建前端并启动服务端）
pnpm dev

# 完整开发模式（前后端并行热重载）
pnpm dev:full

# 生产构建
pnpm build

# 启动生产服务
pnpm start
```

## 技术栈

**后端**
- Node.js 22+ + TypeScript (tsx)
- Fastify + @fastify/websocket
- node-pty（终端进程管理）
- chokidar（文件监听）
- simple-git（Git 操作）

**前端**
- React 18 + TypeScript + Vite
- Tailwind CSS v4
- shadcn/ui 组件库
- xterm.js（终端渲染）
- react-diff-view（代码对比）
- Zustand（状态管理）

## 架构概览

```
浏览器 (React + WebSocket)
    ↑↓
Node.js 后端 (Fastify)
    ↑↓
CLI Agent 进程 (node-pty)
```

详细技术方案请参阅 [BLUEPRINT.md](./BLUEPRINT.md)。

## 许可证

MIT

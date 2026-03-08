# Nexus

Nexus 是一个本地 Web 控制台，用于在单个代码库中并行管理多个 CLI AI Agent 实例。

## 功能特性

### 🖥️ 多 Agent 并行管理
- 同时运行多个 AI Agent（Claude、OpenCode、Kimi、Qwen 等）
- 每个 Agent 拥有独立的终端面板，互不干扰
- 支持创建、关闭、重启 Agent 进程
- 实时显示 Agent 运行状态（运行中/等待中/空闲/错误）

### 📝 任务与配置
- 基于 YAML 的配置驱动，支持全局和项目级配置
- 为每个 Agent 分配独立的工作目录和任务描述
- 支持会话恢复模式（继续/重启/手动/无）
- 批量任务分发和广播消息功能

### 📁 文件与代码查看
- 实时文件树展示，自动监听文件变化
- 内置文件查看器，支持浏览源代码
- Git Diff 面板，查看仓库级别的代码变更
- 代码审查评论可直接发送给指定 Agent

### 🎨 界面与主题
- 四栏布局：侧边栏、Agent 手风琴区、Diff & CR 面板、文件查看器
- 7 套内置主题：Dark IDE、GitHub Dark、Dracula、Tokyo Night、Catppuccin、Nord、Light IDE
- 基于 CSS Variables 的主题系统，易于扩展
- 响应式折叠卡片设计，高效利用屏幕空间

### 💾 历史与恢复
- 三级恢复机制：Agent 自身恢复 → Nexus 历史回放 → 手动恢复
- 终端历史自动存档，支持只读回溯
- 自动记录会话 ID、模型信息、上下文使用率、费用统计

## 快速开始

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

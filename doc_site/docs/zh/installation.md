# 安装

## 系统要求

- Node.js `>= 22`
- 一个本地 Git 仓库，或你希望作为工作目录的项目目录
- 至少安装一个可用的 CLI agent，例如 Claude Code、Codex、OpenCode、Kimi Code 或 Qoder CLI

## 全局安装

```bash
npm install -g mexus-cli
```

安装后可用命令：

- `mexus`

兼容别名：

- `nexus`

## 从源码运行

如果你直接使用当前仓库：

```bash
pnpm install
pnpm dev
```

需要同时启用前后端热重载时：

```bash
pnpm dev:full
```

生产构建方式：

```bash
pnpm build
pnpm start
```

## 端口

默认端口是 `7700`。如需修改：

```bash
NEXUS_PORT=8080 mexus
```

## Agent 可用性检查

启动后，Nexus 会尝试检查已配置 agent 是否可执行。缺失的 agent 不会阻止你启动，但对应类型可能在创建 pane 时被标记为不可用。

## 常见安装问题

### Node.js 版本过低

CLI 会直接报错并拒绝启动。升级到 Node.js 22 以上后重新运行。

### 安装了包但命令不存在

确认全局 npm bin 目录已经在 `PATH` 中，或者用 `npm ls -g mexus-cli` 检查是否安装成功。

### agent 命令不可用

Nexus 本身不会替你安装这些 CLI。需要按对应 agent 官方方式完成安装后再回来使用。

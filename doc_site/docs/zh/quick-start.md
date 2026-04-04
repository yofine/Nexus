# 快速开始

## 1. 安装

Nexus 需要 Node.js 22 或更高版本。

```bash
npm install -g mexus-cli
```

文档统一使用 `mexus` 作为示例命令。当前程序仍兼容 `nexus` 别名，但推荐优先使用 `mexus`。

## 2. 在项目目录启动

```bash
mexus
```

或者：

```bash
mexus ~/projects/my-app
```

默认端口是 `7700`，首次启动时会尝试自动打开 `http://localhost:7700`。

## 3. 初始化工作空间配置

如果项目还没有 `.nexus/config.yaml`，先执行：

```bash
mexus init .
```

## 4. 创建第一个 Agent Pane

启动后，在界面左侧点 `+`：

1. 选择 agent 类型
2. 输入 pane 名称
3. 选择 `New Session` 或 `Resume Session`
4. 需要隔离时把模式切到 `Worktree`
5. 为新会话填写工作目录和任务说明

## 5. 开始日常使用

最常见的操作组合是：

- 在主区域观察多个 pane 的运行状态
- 在编辑区切到 `Review` 查看 Git 变化
- 在 `Activity` 视图查看最近的文件操作
- 用左侧 `Replay History` 回看历史会话
- 用 `Notes` 记录当前任务信息

## 下一步

- 想了解界面组成：看 [界面总览](/zh/interface)
- 想按操作场景学习：看 [常见任务](/zh/tasks)
- 想查命令参数：看 [CLI 用法](/zh/cli)

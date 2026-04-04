# 界面总览

## 布局结构

Nexus 当前是一个四段式工作区：

1. 左侧 Sidebar
2. 中间 Agent Pane 区域
3. 编辑区 / 观察区
4. 右侧文件树

其中编辑区可以显示 `Activity`、`Review`、`Replay` 和文件预览标签。

## Sidebar

左侧工具栏当前包含这些入口：

- `Add Pane`：新建 agent pane
- `Replay History`：打开历史会话列表
- `Notes`：打开工作空间笔记
- `Settings`：打开设置页

::: warning 与旧手册差异
仓库里较早的手册提到“任务分发”和“模板”图标，但当前代码中的 Sidebar 已改为 `Replay History` 和 `Notes`。
:::

## Agent Pane 区域

每个 pane 代表一个运行中的 agent 会话。你会看到：

- pane 名称
- agent 类型
- 当前状态：`running`、`waiting`、`idle`、`stopped`、`error`
- 任务说明
- 运行时元信息，例如 model、context、cost、session ID
- worktree 分支和变化数量（启用隔离时）

## 编辑区

编辑区是右侧主观察区域，不是代码编辑器，而是一个多标签观察面板。

常见标签包括：

- `Activity`：查看文件活动、时间线和依赖拓扑类视图
- `Review`：查看全局或某个 worktree pane 的 Git diff
- `Replay`：回放历史会话
- `File`：预览选中的文件

编辑区还支持观察模式和布局重置。

## 文件树

文件树会实时更新，并支持点击打开文件预览。

当前文件预览能力包括：

- 普通代码文件高亮显示
- Markdown 预览
- Mermaid 图预览
- SVG 预览
- HTML 预览
- CSV / TSV 表格预览
- PDF 预览
- 图片预览
- JSON 树形预览

部分预览类型支持 `Preview / Raw` 切换。

## 底部 Shell

除了 pane 内终端，Nexus 还有一个固定的底部 shell，用于执行通用命令。它不属于任何单独 agent pane。

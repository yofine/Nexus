# 常见任务

## 新建一个 Agent Pane

1. 点击左侧 `Add Pane`
2. 选择 agent 类型
3. 输入名称
4. 选择 `New Session`
5. 需要时填写工作目录和任务说明
6. 选择 `Shared` 或 `Worktree`

如果 agent 未安装，对应选项会显示不可用。

## 恢复已有会话

1. 打开 `Add Pane`
2. 把 `Start Mode` 切到 `Resume Session`
3. 从列表里选择一个 session
4. 创建 pane

恢复模式会优先使用选中的 `sessionId`，不会再要求你填写任务说明。

## 重启一个 pane

当前产品支持 restart / resume 相关流转。常见场景是：

- 会话失效后重新拉起
- 想继续上次的 session
- 想从同一 pane 重新开始一个全新会话

具体可见入口会随 pane 状态而变化。

## 用 worktree 并行开发

适合需要多个 agent 同时改同一仓库的情况。

1. 新建 pane 时把隔离模式切成 `Worktree`
2. Nexus 会为该 pane 创建独立 worktree 和分支
3. 在 `Review` 标签里查看该 pane 的专属 diff
4. 结束时按需要合并或丢弃

::: info
worktree pane 会有自己的分支信息和独立 diff，不会和共享工作目录的 pane 混在一起。
:::

## 查看 Git 变化

### 查看全局工作区 diff

在编辑区打开固定的 `Review` 标签。

### 查看某个 worktree pane 的 diff

打开对应 pane 的 review 标签，检查该 pane 独立 worktree 的变更。

## 合并或丢弃 worktree 结果

对 worktree pane，Nexus 提供 merge / discard 流程。

- `merge`：尝试把 worktree 分支合回主仓库
- `discard`：删除该隔离 worktree 及其分支

::: warning
这类操作会影响 Git 状态。执行前先确认当前 diff 是否符合预期。
:::

## 打开 Replay History

点击左侧 `Replay History`。你可以：

- 浏览历史 session 列表
- 打开单个 session
- 选择某个 turn 进行回放
- 查看回放中的终端输出和文件活动

## 使用 Notes

点击左侧 `Notes`，记录工作空间级别的补充信息，例如：

- 当前任务背景
- 待确认事项
- 团队约定
- 临时操作记录

## 查看文件活动

默认的 `Activity` 标签会持续显示最近文件活动，包括：

- read
- edit
- write
- create
- delete
- bash

这适合观察多个 agent 的并行工作轨迹。

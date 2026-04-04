# 功能参考

## Agent 管理

支持的 pane agent 类型包括：

- Claude Code
- Codex
- OpenCode
- Kimi Code
- Qoder CLI

每个 pane 有独立状态和会话生命周期。新增 pane 时可以选择新会话或恢复历史会话。

## 状态与元信息

pane 状态包括：

- `running`
- `waiting`
- `idle`
- `stopped`
- `error`

当前元信息字段包括：

- `model`
- `contextUsedPct`
- `costUsd`
- `sessionId`
- `cwd`

这些信息会根据 agent 运行情况实时更新。

## 终端与对话

每个 pane 内都有完整终端交互区域，支持：

- 输入命令
- 接收连续输出
- 终端尺寸同步
- 会话滚动回放

产品协议中还包含 conversation event 流，用于把消息和工具事件映射到 UI。

## 底部 Shell

系统保留一个全局 shell pane，内部类型是 `__shell__`。它不会作为普通 agent pane 显示在工作区列表里，但会作为全局底部终端存在。

## 文件浏览与预览

文件树使用实时监听更新。当前预览模式包括：

- 代码高亮
- Markdown
- Mermaid
- SVG
- HTML
- CSV / TSV
- PDF
- 图片
- JSON

## Git 与工作区变更

全局 `Review` 标签可以显示：

- unstaged diff
- staged diff
- 当前分支
- 远程分支
- ahead / behind 信息

worktree pane 还支持单独的 pane diff。

## Worktree 隔离

worktree 模式适合并行开发。Nexus 会为 pane 创建：

- 独立磁盘路径
- 独立分支
- 独立 Git diff 视图

并支持恢复、合并和丢弃。

## Replay History

回放系统会记录：

- 会话摘要
- turn 列表
- 终端输出
- 状态变化
- 元信息变化
- 文件活动

回放时可以按 turn 查看细节。

## Notes

Notes 是工作空间级别的补充说明入口，适合记录上下文，而不是作为版本控制的一部分。

## Activity 视图

Activity 视图汇总多个 pane 的文件活动，并提供不同观察方式。

::: warning Experimental
Activity 相关视图已经在当前界面中存在，但它更偏观察与分析能力，交互细节可能继续迭代。
:::

## 设置、主题与字体

Settings 当前分为：

- `General`
- `Shortcuts`
- `Agents`

可调整内容包括：

- 主题
- 等宽字体
- 默认 shell
- scrollback 行数
- 网格列数
- history retention days
- agent 的 bin、continue flag、resume flag、yolo flag、transport、env

## 会话恢复

当 pane 保存了 `sessionId` 时，系统会优先走 resume 流程。对支持 resume 参数的 agent，Nexus 会传递对应的恢复标志。

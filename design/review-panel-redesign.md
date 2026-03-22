# Review Tab 增强设计

> 本文档记录 Review Tab（`GitDiffPanel.tsx`）的未来增强方向。
>
> 原活动面板中的 "Review Priority" 视图（Heatmap）已移除，其职责归入 Review Tab。

## 背景

Review Tab 当前功能：
- **Workspace Review**：staged/unstaged diff 浏览、stage/unstage/discard 操作、commit/push
- **Worktree Pane Review**：per-pane diff 浏览、merge/discard
- **行级 Comment**：hover 行号出现 "+" 按钮，写评论后发送到目标 Agent 终端
- **Inline Diff**：hunk 展开/折叠，增删行着色

## 待增强

### 1. Agent 归属标注
- 在 diff 文件列表中，用 pane 颜色标识每个文件是哪个 Agent 修改的
- 多 Agent 交叉修改的文件显示冲突标记

### 2. Review 优先级排序
- 文件列表支持按变更量排序（当前按 git 默认顺序）
- 多 Agent 交叉修改的文件自动置顶
- 入口文件、被大量 import 的文件（可从 depGraph 获取）标注更高优先级

### 3. Review 状态追踪
- 已 review / 未 review 标记（前端 state，不持久化）
- Review 进度指示（已看 N / 共 M 文件）

### 4. Comment 增强
- 评论历史可回溯（当前发送后即消失）
- Comment 区域显示 Agent 对评论的响应

*具体设计待展开*

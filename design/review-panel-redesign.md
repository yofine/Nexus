# Review 面板重设计

> 本文档预留，用于记录 Review 面板（原 EditorTabs 中的 review tab + 活动面板中的 Review Priority 视图）的整体重设计。

## 背景

当前有两个 review 相关的入口：
1. **活动面板 → Review Priority 视图**（原 Heatmap）— 按优先级排列需要 review 的文件
2. **EditorTabs → Review tab** — 点击文件后查看具体 diff

活动面板中的 Review Priority 和 EditorTabs 中的 Review 功能存在天然的上下游关系：
- Review Priority 帮你决定"先看哪个文件"
- EditorTabs Review 帮你"看具体改了什么"

## 待设计

### 需要统一考虑的问题

- Review Priority 视图是否应该直接内嵌 diff 预览，而非跳转到 EditorTabs？
- Diff Summary（按目录结构组织的变更全貌）放在哪里？作为 Review Priority 的另一种排列方式？
- 多 Agent 的变更如何在 diff 中标注是谁改的？（git blame 级别 or agent 颜色标注）
- 已 review / 未 review 状态追踪
- review 批注功能（评论 → 发送回 Agent）

### 信息整合

Review Priority 视图可展示的信息（来自多个数据源）：
- 变更行数（git diff）
- 变更文件归属（哪个 Agent 改的，pane 颜色标识）
- 冲突标记（来自 Conflicts 面板的数据）
- 文件角色/重要性（入口文件、被大量 import 的文件优先级应更高）

*具体设计待展开*

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

## 本轮 CR 经验补充

> 本次对一组 AI 辅助产出的改动做 CR，并实际执行了“发布级修复保留在主线、重大迁移拆到独立分支”的操作。这个案例说明：Review 不应只停留在 diff 浏览，而应支持“风险识别 -> 变更分级 -> 执行拆分 -> 回滚准备”的完整链路。

### 1. Review 结论不应只有“有问题/没问题”

对于 AI 生成或 AI 大量参与的改动，Review 结论至少需要分成三类：

- **问题修复（Bug Fix）**
  - 明确修复现有错误或回归
  - 应优先留在当前发布分支
- **小体验升级（Release-safe UX Polish）**
  - 改善可用性，但不改变系统核心契约
  - 可跟随 bug fix 一起发布
- **重大改动（Major Change）**
  - 涉及命名迁移、目录迁移、协议层改造、运行时模型切换、CLI 契约变化
  - 不应与修复项混发

Review 面板后续需要支持 reviewer 对文件或改动块打上这类标签，而不是只标 “reviewed”。

### 2. AI Review 的重点应从“代码风格”转向“发布风险”

本轮最有价值的发现不是格式问题，而是：

- 状态机回归
- 兼容性路径被削弱
- 前端 transient state 被错误清空
- CLI 语义退化
- rename / migration 与修复项混在同一批改动

这说明 Review 面板中的 AI 辅助应该优先输出：

- **回归风险**
- **兼容性风险**
- **发布边界风险**
- **是否需要拆分分支**

而不是优先输出“可以更优雅”“命名可优化”这类低信号建议。

### 3. Review 结果需要落地为执行计划

如果 Review 发现一批改动不适合一起发布，系统不应只停留在文本结论，而应生成一个结构化拆分计划。建议补充：

#### 3.1 变更分类清单

按文件或改动块输出：

- keep on current branch
- move to major branch
- needs fix before release
- needs explicit rollback plan

#### 3.2 变更日志模板

Review 面板应允许一键生成发布拆分日志，至少包含：

- 本次发布目标
- 保留项
- 拆出项
- 执行步骤
- 验证清单
- 回滚方案

本轮实践表明，这份日志不是“附属文档”，而是执行和验收的依据。

### 4. “reviewed” 状态不能代替“可发布”

本轮实现里已经加入了 `reviewed` 和 review progress，但实践说明还需要再建一个维度：

- `reviewed`
- `release_safe`
- `major_change`
- `blocked`

也就是说，一个文件可能已经 review 过，但仍然是阻塞发布的。

### 5. 建议新增的 Review 工作流

建议将 Review 工作流明确成以下阶段：

1. **Diff Triage**
   - 先按风险和归属排序，不急着逐行看
2. **Risk Marking**
   - 标记回归、兼容性、迁移、运行时、CLI 契约等风险
3. **Release Classification**
   - 将文件或 hunk 归类为 bug fix / UX polish / major change
4. **Execution Plan**
   - 生成变更日志、拆分计划和回滚方案
5. **Verification**
   - 绑定构建、类型检查、git diff 范围校验

### 6. 对 Review Tab 的后续增强建议

- 在文件列表中增加 `release-safe` / `major` / `blocked` badge
- 支持导出“本次 CR 结论”到 `change-logs/`
- 支持按风险类型过滤：runtime / compatibility / migration / UX
- 支持将 AI review 结论转成待执行 checklist，而不是只显示一段 prose
- 对“已 review 但不可发布”的文件用独立视觉状态标识

### 7. 设计原则修正

本次案例可以沉淀成 Review 模块的一个明确原则：

> Review 的目标不是帮助用户“看完 diff”，而是帮助用户在多 Agent、AI 参与度高的环境下做出正确的发布决策。

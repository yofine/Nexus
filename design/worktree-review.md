# Worktree 模式 Review & 用户路径设计

## 设计决策

参考 Claude Squad 的做法（worktree 隔离 + keep/remove 模型），结合 Nexus 自身的 Web Review 面板优势，确定以下方案：

- **合并方式**：本地 `git merge`（方案 A），不依赖 GitHub
- **关闭 pane 时**：默认保留 branch，不弹确认框
- **用户角色**：审查者，不操作 worktree 内部的 stage/commit
- **Review 面板**：不提供 stage/unstage/commit，只提供 Merge 和 Discard 两个决策按钮

## 用户路径

```
创建 → 工作 → 审查 → 合并/丢弃
```

| 阶段 | 用户操作 | 状态 |
|---|---|---|
| **创建** | AddPaneDialog 选 Worktree 模式 | ✅ |
| **工作** | Agent 在隔离 worktree 目录自治工作 | ✅ |
| **感知** | AgentPane header 显示 branch 名 + diff 数量 badge | ✅ |
| **审查** | 点击 diff badge 打开 per-pane Review tab，查看 total diff vs base | ✅ |
| **行级评论** | Review 面板中对 diff 行添加 comment，发送到 agent 终端 | ✅ |
| **合并** | Review 面板顶栏 Merge 按钮 / AgentPane header Merge 图标 | ✅ |
| **丢弃** | Review 面板顶栏 Discard 按钮（双击确认） | ✅ |
| **关闭** | 关闭 pane 时保留 branch（可之后在其他地方 merge） | ✅ |

## 已实现能力

### 后端

| 模块 | 能力 |
|---|---|
| `WorktreeManager.create()` | 创建 worktree + branch `nexus/{id}-{slug}` |
| `WorktreeManager.merge()` | auto-commit 未提交的更改 → merge 到 base branch，冲突时自动 abort |
| `WorktreeManager.discard()` | 删除 worktree 目录 + 删除 branch |
| `WorktreeManager.remove()` | 删除 worktree 目录，保留 branch |
| `WorkspaceManager.mergeWorktree()` | 校验 pane 类型后调 merge |
| `WorkspaceManager.discardWorktree()` | 停 GitService → 调 discard → 清除 pane 的 worktree 状态 → 清空 diff |
| `PtyManager` | worktree pane 使用 `worktreePath` 作为 cwd |
| Per-pane `GitService` | 每个 worktree pane 独立的 diff 文件监听 |
| `AgentsYamlWriter` | 输出 isolation/branch/worktree 路径供 agent 互感知 |

### WS 协议

```typescript
// Client → Server
'pane.merge'          // { paneId } — 合并 worktree branch 到 base branch
'pane.discard'        // { paneId } — 丢弃所有修改，删除 branch
'pane.diff.refresh'   // { paneId } — 刷新 per-pane diff

// Server → Client
'pane.diff'           // { paneId, diffs } — per-pane diff 变更
'pane.merge.result'   // { paneId, success, message } — merge/discard 结果
```

### 前端

| 组件 | 能力 |
|---|---|
| `AddPaneDialog` | Shared/Worktree 切换按钮 |
| `AgentPane` header | branch 名 badge + diff 数量 + Merge 图标按钮 + merge 结果横幅 |
| `GitDiffPanel` (worktree) | 顶栏显示 branch 名 + Merge 按钮 + Discard 按钮（双击确认）+ merge 结果横幅 |
| `GitDiffPanel` (worktree) | 不显示 Staged 区域，不显示 Stage/Discard 文件级按钮 |
| `workspaceStore` | `mergeResults` 状态 + `setMergeResult` / `clearMergeResult` |
| `App.tsx` | 处理 `pane.merge.result` 事件，5 秒后自动清除 |

## Merge 流程细节

```
用户点击 Merge
  → 前端发送 { type: 'pane.merge', paneId }
  → WorktreeManager.merge(paneId):
      1. 检查 worktree 中是否有未提交的更改
      2. 如有 → git add -A + auto-commit
      3. 检查 branch 相对 base 是否有新 commits
      4. 从主仓库执行 git merge branch
      5. 成功 → 返回 commit 数量信息
      6. 冲突 → git merge --abort + 返回错误信息
  → 前端显示结果横幅（5 秒后消失）
  → 刷新全局 git diff
```

## Discard 流程细节

```
用户点击 Discard（需二次确认）
  → 前端发送 { type: 'pane.discard', paneId }
  → WorkspaceManager.discardWorktree(paneId):
      1. 停止 per-pane GitService
      2. WorktreeManager.discard(): 删除 worktree 目录 + 删除 branch
      3. 清除 pane 的 worktree 状态 (isolation → shared, branch → undefined)
      4. 发送空 diffs 清空 UI
  → 前端显示结果横幅
  → 刷新全局 git diff
```

## Restore（已实现）

### 问题

服务重启后 worktree pane 无法恢复。

### 修复

三处改动：

1. **`WorktreeManager.restore(paneId, branch, worktreePath)`**
   - 检查 branch 是否存在（不存在 → 返回 false，跳过该 pane）
   - 检查 worktree 目录是否存在 → 直接复用（非 graceful shutdown 残留）
   - 目录不存在 → `git worktree prune` + 从已有 branch 重建
   - 注册到内部 Map

2. **`WorkspaceManager.init()` → `async init()`**
   - 恢复 worktree pane 时先调 `worktreeManager.restore()`
   - 成功后 `spawnPane()` + 启动 per-pane `GitService`
   - 失败时跳过并清理 config

3. **`WorkspaceManager.shutdown()`**
   - 移除 `worktreeManager.removeAll()`
   - 关闭时只停 PTY 和 GitService，**保留 worktree 目录**
   - worktree 仅在用户显式 closePane / discard 时删除

### Restore 流程

```
init() 遍历 config.yaml 中的 panes：
  pane.isolation === 'worktree' ?
    → worktreeManager.restore(id, branch, worktreePath)
      → branch 不存在？跳过，failCount++
      → worktreePath 目录存在？直接注册到 Map
      → 目录不存在？git worktree add worktreePath branch
    → spawnPane(paneConfig)
    → startPaneGitService(id, worktreePath)
  否则：
    → spawnPane(paneConfig)  // 原有逻辑
```

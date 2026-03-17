# Worktree 模式 Review & 用户路径设计

## 现有能力盘点

| 层 | 实现 | 状态 |
|---|---|---|
| **WorktreeManager** | git worktree add/remove/cleanup, branch naming `nexus/{id}-{slug}` | ✅ 完整 |
| **WorkspaceManager** | createPane 时自动创建 worktree, closePane 时清理, restart 保留 worktree | ✅ 完整 |
| **PtyManager** | worktree pane 使用 `worktreePath` 作为 cwd | ✅ 完整 |
| **Per-pane GitService** | 每个 worktree pane 独立的 diff 监听 | ✅ 完整 |
| **AgentsYamlWriter** | 输出 isolation/branch/worktree 路径 | ✅ 完整 |
| **WS 协议** | `pane.diff` / `pane.diff.refresh` 事件 | ✅ 完整 |
| **前端类型** | `IsolationMode`, PaneState 有 branch/worktreePath | ✅ 完整 |
| **AddPaneDialog** | Shared/Worktree 切换按钮 | ✅ 完整 |
| **AgentPane** | 显示 branch 名和 diff 数量 badge | ✅ 完整 |
| **GitDiffPanel** | 支持 paneId 过滤，per-pane review tab | ✅ 完整 |
| **Config 持久化** | `persistPaneConfig` 保存 isolation/worktreePath/branch | ✅ 完整 |

## 核心问题：Restore 时 worktree 没有重建

**这是 worktree "无法使用" 的根本原因。**

`WorkspaceManager.init()` 恢复 pane 时直接调用 `spawnPane()`，但：

1. **`shutdown()` 调用了 `worktreeManager.removeAll()`** — 服务关闭时所有 worktree 目录被删除
2. **`init()` 里只调 `spawnPane()`，没有重建 worktree** — cwd 指向已删除的目录，spawn 必然失败
3. **`init()` 没有启动 per-pane GitService** — worktree pane 的 diff 监听不会恢复
4. **`WorktreeManager.create()` 没有检查已存在的 worktree** — 非 graceful shutdown 残留 worktree 会导致创建报错

### 相关代码位置

```
WorkspaceManager.init()           → packages/server/src/workspace/WorkspaceManager.ts:70-104
WorkspaceManager.shutdown()       → packages/server/src/workspace/WorkspaceManager.ts:431-439
WorktreeManager.create()          → packages/server/src/git/WorktreeManager.ts
```

## 其他问题

1. **关闭 pane 后 branch 残留** — `closePane` 调 `worktreeManager.remove()`（保留 branch），但用户没有任何 UI 入口查看/合并/删除这些残留 branch
2. **没有 merge/PR 工作流** — worktree pane 的修改在独立 branch 上，但没有 merge 回主分支或创建 PR 的能力
3. **config.yaml 存了 worktreePath 绝对路径** — 项目目录移动后路径失效

## 修复方案：Restore 流程

### 最小修复

`init()` 恢复 worktree pane 时：

```
检查 paneConfig.isolation === 'worktree'
  → 检查 worktreePath 目录是否存在
    → 存在：直接使用（上次非 graceful shutdown 残留）
    → 不存在：从已有 branch 重新 checkout worktree
  → 将 entry 注册到 WorktreeManager 内部 Map
  → 启动 per-pane GitService
  → spawnPane()
```

### shutdown 策略调整

考虑 `shutdown()` **不删除 worktree**（仅在用户显式 `closePane` 时删除），这样：
- Restore 更轻量（直接复用已有目录）
- 非 graceful shutdown 不会丢失工作
- 代价是磁盘占用（每个 worktree ≈ 项目大小，不含 .git）

## 完整用户路径设计

### 理想流程

```
创建 → 工作 → 审查 → 合并/丢弃 → 清理
```

### 各阶段能力矩阵

| 阶段 | 用户操作 | 现状 | 需要做的 |
|---|---|---|---|
| **创建** | AddPaneDialog 选 Worktree 模式 | ✅ 已有 | — |
| **工作** | Agent 在隔离目录工作 | ✅ 已有 | — |
| **感知** | 看到 branch 名、diff 数量 | ✅ 已有 | — |
| **审查** | 点击 diff badge 打开 Review tab | ✅ 已有 | — |
| **合并** | 将 worktree branch merge 回主分支 | ❌ 缺失 | 见下方设计 |
| **丢弃** | 放弃修改，删除 branch | ❌ 缺失 | 见下方设计 |
| **清理** | 关闭 pane 时选择保留/删除 branch | ❌ 缺失 | 见下方设计 |

### 待设计：合并/丢弃工作流

#### 方案 A：Nexus 内 git merge

- AgentPane 操作菜单增加 "Merge to main" 按钮
- 后端执行 `git merge nexus/{branch}` 到主分支
- 冲突时展示冲突文件，用户手动解决或指派 Agent
- 优点：闭环体验
- 缺点：merge 冲突处理复杂

#### 方案 B：创建 PR（推荐）

- AgentPane 操作菜单增加 "Create PR" 按钮
- 后端执行 `git push origin nexus/{branch}` + `gh pr create`
- 优点：利用 GitHub 成熟的 review/merge 流程，实现简单
- 缺点：依赖 GitHub CLI，本地项目不适用

#### 方案 C：混合

- 默认提供 "Merge to main"（本地快速合并）
- 如果检测到 remote，额外提供 "Push & Create PR"

### 待设计：关闭 pane 时的行为

当前行为：关闭 pane 时保留 branch、删除 worktree 目录。

建议改为：

```
关闭 worktree pane 时弹确认框：
  ├── "保留 Branch" — 删除 worktree 目录，保留 branch（可以之后 merge）
  ├── "合并并关闭" — merge 到主分支，删除 worktree + branch
  └── "丢弃" — 删除 worktree + branch（不可恢复）
```

## 实施优先级建议

### P0：修复 Restore（让 worktree 基本可用）

1. `init()` 增加 worktree 恢复逻辑
2. `shutdown()` 改为不删除 worktree
3. `WorktreeManager.create()` 增加幂等性检查

### P1：关闭时确认框

4. 前端 closePane 增加 worktree 确认弹窗
5. 后端增加 `closePane` 的 mode 参数（keep-branch / merge / discard）

### P2：合并/PR 工作流

6. AgentPane 操作菜单增加 merge/PR 操作
7. 后端实现 merge 和 push+PR 逻辑

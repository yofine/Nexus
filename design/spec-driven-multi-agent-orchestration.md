# Spec-Driven Multi-Agent Orchestration Design

> 目标：基于用户需求，先由用户指定的 CLI Agent 以非交互模式生成和迭代 spec；在用户批准 spec 后，再自动生成多 Agent 执行规划并批量启动新的执行 Agent；运行期间额外启动一名环境观察员 Agent，复用 Nexus 现有多 Agent 观测能力进行冲突协调、风险上报和过程总结。

## 1. 背景与目标

Nexus 当前已经具备多 Agent 并行运行、活动观测、冲突识别、文件活动流、`.nexus/agents.yaml` 写入等基础能力，但“任务自动分析拆分并分发执行”仍未落地。

本设计将该能力升级为一套以 spec 为中心的编排系统，而不是简单的 `task.dispatch`：

1. 用户选择一个 CLI Agent 作为规划 Agent。
2. 通过非交互模式生成第一版 spec。
3. 用户反馈后，继续基于当前 spec 非交互修订，直到批准。
4. 系统基于批准后的 spec 生成多 Agent 执行规划。
5. 用户确认执行计划后，批量新开执行 Agent。
6. 额外启动一名环境观察员 Agent，持续观测执行过程，自动协调冲突或上报问题。

## 2. 核心原则

### 2.1 Spec First

系统不直接从原始需求生成任务列表，而是先沉淀成结构化 spec，再由 spec 推导执行计划。

这里的 spec 不是教条式文档，而是可执行契约：

- 人可以阅读、反馈和批准
- 系统可以稳定解析、生成 plan 和 prompts
- observer 可以据此判断越界、阻塞和重排边界

### 2.2 New Agents Only

任务分发时只新开 Agent，不复用已有 Agent。已有 Agent 的回收、复用、资源治理属于独立回收模块。

### 2.3 Shared-First, Isolation-Optional

系统倾向共享工作区协作，但不把共享视为教条，也不排斥隔离。

- 默认倾向共享
- 必要时允许隔离
- 是否共享或隔离，由任务事实和执行计划决定

多个执行 Agent 可以在共享工作区内协作，通过信息共享、边界约束、轻量 claim 和观察员协调降低冲突；当任务风险、耦合度或改动面需要时，也可以切换为隔离执行模式。

### 2.4 Human Approval Gates

至少存在两个确认点：

1. spec 批准
2. execution plan 批准

只有在用户批准后，系统才启动后续阶段。

### 2.5 Observation Reuse

现有面向人的多 Agent 观测机制不是单纯 UI，而是环境事实层。环境观察员 Agent 直接复用这套观测能力，而不是建立独立观测链路。

### 2.6 Observer as Runtime Commander

观察员不是被动旁观者，而是运行时最高指挥角色。

- 可以直接写入 worker 终端
- 可以发出暂停、避让、切换、汇报等指令
- 可以触发有限自动重排

但其所有行为必须被更严格地审查、记录和回放。

同时需要最小安全护栏：

- rate limiting，避免高频干扰 worker
- kill switch，允许用户一键冻结 observer 的控制权
- action policy，observer 的可执行动作和 scope 判定由系统策略定义，而不是完全由 observer 自判

### 2.7 Review And Release Separation

多 Agent 编排不应把“任务完成”和“可以发布”混为一谈。

- worker 的目标是完成任务
- observer 的目标是降低运行时冲突和阻塞
- reviewer / release gate 的目标是识别哪些改动可以进当前发布批次，哪些必须拆出

一次很有代表性的 CR 经验说明：AI 很容易在一轮实现里同时产出 bug fix、UX polish、协议改造、命名迁移和目录迁移。如果没有显式的发布边界，最终会把可发布修复和破坏性改动揉在一起。

因此系统层面应默认支持：

- 修复项与重大迁移分流
- 显式 change log
- 验证清单
- 回滚方案

## 3. 总体流程

```text
User Request
  -> Select Planning CLI Agent
  -> Non-interactive Spec Generation
  -> Write Spec to .nexus/specs/
  -> User Feedback
  -> Non-interactive Spec Revision
  -> Spec Approved
  -> Generate Execution Plan
  -> User Confirms Plan
  -> Spawn N Worker Agents
  -> Spawn 1 Observer Agent
  -> Runtime Coordination / Monitoring / Alerts / Replan Suggestions
```

## 4. 角色模型

### 4.1 Planner Agent

职责：

- 根据原始需求生成 spec 初稿
- 根据用户反馈继续修订 spec
- 只用于规划阶段
- 通过非交互模式调用

特点：

- 不常驻
- 不直接执行编码任务
- 不直接参与运行时协调

### 4.2 Worker Agents

职责：

- 执行批准后的 execution plan 中分配给自己的任务
- 在共享工作区中按边界和规则进行修改
- 通过 claim 和共享上下文进行自协调

特点：

- 全部为新开 Agent
- 不复用已有 pane
- 每个 Agent 持有明确的任务、目标路径、验收标准和协作规则

### 4.3 Observer Agent

职责：

- 持续观测本次大型任务的执行环境
- 发现冲突、阻塞、越界修改、共享依赖风险
- 自动协调、直接发出运行时指令或向用户上报问题
- 产出阶段性进度摘要

特点：

- 常驻 1 个
- 不承担主线业务编码任务
- 优先消费结构化观测上下文
- 享有当前执行期的最高指挥权
- 所有控制动作必须进入审计日志

### 4.4 Reviewer Agent

除 Planner / Worker / Observer 外，建议补入一个轻量 Reviewer 角色，用于收尾阶段的发布审查。

职责：

- 基于 diff、activity、dependency graph、claims 和 plan 做结构化 review
- 输出回归风险、兼容性风险、发布边界风险
- 判断哪些改动应留在当前发布链路，哪些应拆到单独分支
- 生成 change log、验证清单和回滚方案草案

特点：

- 不承担主线实现
- 不直接修改业务代码，除非用户显式切换到 remediation 模式
- 重点面向“发布决策”，而不是运行时指挥

与 Observer 的区别：

- Observer 偏运行时协调
- Reviewer 偏收尾阶段的风险收敛和发布分流

## 5. Spec 生命周期

spec 是本系统的一等对象，必须持久化、可修订、可追踪版本。

### 5.1 状态

~~最初只考虑 `draft / revising / approved / superseded / cancelled`。~~  
现在补入 `validation_failed`，将“生成成功但契约校验失败”的状态显式建模出来。

- `draft`
- `revising`
- `validation_failed`
- `approved`
- `superseded`
- `cancelled`

### 5.2 版本模型

每次修订都生成新版本，而不是原地覆盖：

- `spec.v1.md`
- `spec.v2.md`
- `spec.v3.md`

### 5.3 推荐目录结构

```text
.nexus/
  specs/
    spec-<id>/
      request.md
      spec.v1.md
      spec.v2.md
      feedback-001.md
      feedback-002.md
      approval.json
      meta.json
```

### 5.3.1 一致性校验职责与时机

~~一致性问题可以在 approve 前再处理。~~  
`SpecManager` 负责 spec 双轨一致性校验，并在 `PlanningRunner` 每次生成或修订后立即执行校验，而不是等到 approve 阶段才发现问题。

建议流程：

1. planner 产出 `spec.vN.md` 和 `spec.vN.json`
2. `SpecManager.validate(specId, version)` 立即校验必需章节、必需字段和 md/json 一致性
3. 校验成功后将该版本标记为 `draft` 或 `revising`
4. 校验失败则标记为 `validation_failed`，并触发重试、回退或人工修订

~~`md` 和 `json` 的一致性先留给 planner 自行保证。~~  
`json` 为 canonical machine format，`md` 为审阅格式。

### 5.4 Spec 双轨结构

spec 建议采用双轨产物：

- `spec.vN.md`
  - 面向用户审阅和反馈
- `spec.vN.json`
  - 面向系统消费的结构化中间表示

JSON 不追求承载全部 prose，而是承载机器必须稳定判断的字段。

### 5.5 Spec 内容结构

建议固定章节，便于后续自动拆解与验证：

- Goal
- Scope
- Non-goals
- Constraints
- Assumptions
- Acceptance Criteria
- Affected Areas
- Risks
- Open Questions
- Proposed Task Breakdown
- Coordination Notes

### 5.6 Spec JSON 建议字段

- `goal`
- `scope`
- `nonGoals`
- `constraints`
- `acceptanceCriteria`
- `affectedAreas`
- `tasks`
- `dependencies`
- `executionHints`
- `isolationHints`

## 6. Execution Plan 生命周期

spec 批准后，系统基于 spec 生成 execution plan。

### 6.1 状态

- `draft`
- `ready_for_approval`
- `approved`
- `executing`
- `paused`
- `completed`
- `aborted`
- `failed`

### 6.2 推荐目录结构

```text
.nexus/
  plans/
    plan-<id>/
      plan.json
      summary.md
      agent-prompts/
        worker-1.md
        worker-2.md
        observer.md
```

### 6.3 Execution Plan 内容

~~execution plan 只需要描述任务和 Agent 分配。~~  
现在 execution plan 还需要显式承载停止条件、失败策略和资源约束。

- 关联的 `specId`
- `specVersion`
- 任务列表
- 任务依赖关系
- worker 数量和角色
- observer 配置
- 每个 Agent 的启动 prompt
- 每个 Agent 的允许修改路径
- 每个任务或 Agent 的 `executionMode` (`shared` | `isolated`)
- 协调策略
- 升级策略
- 停止条件
- 失败处理策略

### 6.4 Review / Release Gate

execution plan 在 `approved -> executing -> completed` 之外，还应显式建模 review gate：

- `awaiting_review`
- `review_blocked`
- `release_ready`
- `split_required`

含义：

- `awaiting_review`：执行完成，等待 reviewer 或用户做发布审查
- `review_blocked`：发现回归或验证失败，必须先修复
- `release_ready`：可以进入发布路径
- `split_required`：存在可交付改动，但必须从当前批次中拆出重大变更

这能避免系统把“任务完成”错误等同为“可以直接合并或发布”。

## 7. 共享工作区协作模型

### 7.1 为什么不将共享或隔离绝对化

本方案的目标不是“最后再合并多个隔离分支”，也不是把所有任务都强行塞进共享工作区，而是根据任务事实选择更合适的执行方式。

因此：

- 共享是优先倾向，不是绝对原则
- 隔离是可用策略，不是失败兜底
- 共享与隔离可以在同一 execution plan 中并存

### 7.2 软边界

每个 worker 在 plan 中都会获得：

- `allowedPaths`
- `readFirstPaths`
- `taskIds`
- `acceptanceCriteria`

Agent 默认只在授权路径内改动文件。

### 7.3 Claim 机制

为降低共享工作区冲突，执行期间维护 `claims.yaml`：

```text
.nexus/
  runtime/
    claims.yaml
```

建议 claim 至少记录：

- `file`
- `paneId`
- `taskId`
- `mode` (`read` | `edit`)
- `reason`
- `updatedAt`
- `expiresAt`
- `heartbeatAt`

claim 是轻量可见锁，不是强事务锁。目标是让其他 Agent 和观察员知道某文件正在被谁关注或编辑，为运行时协调提供事实信号，而不是把系统变成高摩擦的锁管理器。

~~只要把 claim 暴露给 Agent，运行时冲突就能靠自治解决。~~  
实现上不应完全依赖 Agent 自觉：

- `ObservationContextBuilder` 应检测 claim 冲突、越界编辑和 stale claim
- stale claim 通过心跳和过期时间自动清理
- claim 冲突默认至少触发告警，并可由 observer 决定是否升级为暂停/避让指令

### 7.4 Release Coordination State

多 Agent 协作的难点不只发生在编码阶段，也发生在收尾阶段。

收尾期还需要共享下面这些结构化事实：

- 哪些文件被哪些 agent 改过
- 哪些文件已经 review
- 哪些文件被标为 release-safe
- 哪些文件被标为 major-change
- 哪些验证已经跑过，哪些还没跑
- 当前 change log 是否已生成，是否包含回滚方案

也就是说，claim 机制只覆盖“谁在改”，还不够；还需要一层 release coordination state，覆盖“哪些东西可以发、哪些东西要拆”。

建议增加：

```text
.nexus/
  runtime/
    review-state.yaml
```

建议字段：

- `file`
- `paneIds`
- `reviewStatus`
- `releaseClass` (`bug_fix` | `ux_polish` | `major_change`)
- `riskFlags`
- `verifiedChecks`
- `lastReviewedAt`

### 7.5 Task 完成与验收信号

~~任务是否完成可以主要靠 observer 从终端输出推断。~~  
任务执行需要显式完成信号，不能仅依赖 observer 从终端文本中猜测。

建议在运行时目录中增加结构化任务状态：

```text
.nexus/
  runtime/
    task-status.json
```

每个 task 至少包含：

- `status` (`pending` | `ready` | `running` | `blocked` | `completed` | `failed`)
- `workerPaneId`
- `startedAt`
- `updatedAt`
- `completionSignal`
- `evidence`

建议由 worker 通过约定格式上报完成信号，由 orchestrator 或 observer 消费并更新任务状态。`acceptanceCriteria` 的最终验收可分两层：

- 机器可检查项由 orchestrator / observer 自动验证
- 需要主观确认的项仍由用户最终确认

`TaskNode.dependsOn` 需要在运行时由 orchestrator 消费，决定哪些 task 可进入 `ready`。

### 7.6 Replan Trigger

以下情况触发协调或重规划建议：

- 两个 worker 同时 claim 同一关键文件
- Agent 需要修改超出 `allowedPaths` 的共享文件
- 公共类型、共享接口、核心配置被多个任务依赖
- 长时间冲突未解决
- 某 worker 多次失败或长时间无进展

## 8. 复用现有多 Agent 观测能力

Nexus 已有面向人的多 Agent 观测机制，包括但不限于：

- `ActivityMap`
- `AgentDashboard`
- `ConflictsPanel`
- `TimelineSwimlane`
- `DependencyTopology`
- `agents.yaml`
- 文件活动流
- pane 状态流
- diff 视图

本设计不新建第二套观测系统，而是将现有观测能力提升为统一的环境事实层。

### 8.1 Observation Data Layer

新增一层标准化观测上下文，供前端和观察员共用：

- 人类界面消费它做可视化
- 观察员 Agent 消费它做判断、协调和上报

### 8.2 推荐运行时产物

`agents.yaml` 的最大变化不是简单加字段，而是职责拆分。该文件不适合继续承载 observer 所需的全部环境事实，因此应保留为轻量索引层，而不是继续膨胀成全量运行时上下文。

兼容策略分两步走，并设置显式迁移窗口：

1. 兼容期双写：
   - `.nexus/agents.yaml`
   - `.nexus/runtime/agents.yaml`
2. 待 observer、prompt、文档和相关生态迁移完成后，再考虑将旧路径降级为兼容镜像或软链接。

~~兼容期双写即可，主从语义可以后补。~~  
双写由单一 writer 负责，并以 `runtime/agents.yaml` 为主写入目标，再镜像到旧路径；若镜像失败，主路径仍应成功落盘并上报告警。

在兼容期内，`.nexus/agents.yaml` 仍然作为现有 Agent 互感知和历史兼容入口，不能直接移除或静默替换。

```text
.nexus/
  agents.yaml
  runtime/
    agents.yaml
    claims.yaml
    observation.json
    observer-commands.jsonl
    issues.jsonl
    events.jsonl
```

### 8.3 职责分层

- `agents.yaml`
  - 轻量 pane/runtime 索引
  - 面向现有 Agent 互感知、历史兼容、基础状态读取
  - 不继续承担复杂聚合事实
- `claims.yaml`
  - 文件级可见锁
  - 描述谁正在读/改哪些文件
- `observation.json`
  - observer 和未来 UI 的聚合事实层
  - 承载冲突、热点文件、阻塞、依赖风险、活动摘要等高层上下文
- `observer-commands.jsonl`
  - observer 的控制动作审计日志
  - 记录对 worker 的指令、原因、目标和结果

### 8.4 observation.json 建议字段

- `spec`
- `plan`
- `agents`
- `activeTasks`
- `fileClaims`
- `recentActivities`
- `hotFiles`
- `conflicts`
- `stalledAgents`
- `dependencyRisks`
- `recentGitDiffSummary`
- `alerts`
- `reviewSummary`
- `releaseClassification`
- `verificationSummary`

### 8.5 设计原则

人类观测系统和环境观察员使用同源事实，不允许出现“UI 看到一套状态，观察员依据另一套状态行动”的分裂。

同时，`agents.yaml` 的迁移必须带兼容层。路径迁移若直接替换为 `.nexus/runtime/agents.yaml`，会破坏现有契约和外部依赖，因此必须先双写，再分阶段降级旧路径。

### 8.6 Observation 更新策略

~~`observation.json` 作为聚合事实层，更新策略可以在实现阶段再定。~~  
`ObservationContextBuilder` 应采用事件驱动 + 防抖的更新策略，避免每次细粒度变化都重建完整上下文。

建议：

- 事件源：claim 变化、pane 状态变化、diff 变化、task 状态变化、observer 命令
- 防抖窗口：默认 500ms，可配置
- 写入策略：write-then-rename，保证原子替换
- 读取策略：消费者始终读取完整快照，不读取临时文件

`observation.json` 是聚合快照，适合读取一致性；`observer-commands.jsonl` 是追加审计流，适合记录历史。两者职责不同，因此格式不同。

### 8.7 Reviewer 的最小输入与输出

如果要让 AI reviewer 真正有用，至少要给它这些输入：

- diff 范围
- 文件归属和多 agent 交叉修改信息
- 依赖图中的高影响文件
- 当前 execution plan 的目标与非目标
- 当前分支目标：是准备发布，还是允许承接迁移/实验特性
- 最近一次验证结果

否则 reviewer 很容易退化成只会给代码风格建议的通用审查器。

Reviewer 输出应尽量结构化，至少包括：

- findings
- release-safe changes
- major changes
- required fixes before release
- verification plan
- rollback notes

这样结果才能直接被转成执行动作，而不是要求用户自己再做一轮翻译。

## 9. 环境观察员 Agent 设计

### 9.1 输入

观察员至少应读取：

- 当前生效 spec
- 当前 execution plan
- `.nexus/runtime/observation.json`
- `.nexus/runtime/agents.yaml`
- `.nexus/runtime/claims.yaml`
- 必要时读取关键 diff 和 issue 记录

### 9.2 观察重点

- 哪些 worker 正在编辑哪些文件
- 是否存在文件 claim 冲突
- 是否存在跨任务边界的修改
- 哪些共享接口、类型或配置正在被多人依赖
- 哪些任务长时间停滞
- 哪些 Agent 状态异常

### 9.3 可以自动处理的事情

- 发现轻量冲突并提示相关 worker 避让
- 提示某 worker 暂停编辑高风险共享文件
- 对边界外修改进行警告
- 直接向 worker 终端写入运行时指令
- 生成阶段性执行摘要
- 在满足规则时向用户发出风险告警
- 触发有限范围的自动重排

### 9.4 不应该默认处理的事情

- 代替 worker 主动承担主线开发任务
- 擅自修改 spec
- 在未确认情况下大规模重排任务
- 直接覆盖其他 worker 的代码修改

### 9.5 输出

建议观察员输出两类结果：

- `observer.alert`
- `observer.summary`

同时，观察员的所有指挥性动作都必须进入审计日志，至少记录：

- `timestamp`
- `observerPaneId`
- `targetPaneId`
- `commandType`
- `commandText`
- `reason`
- `relatedTaskIds`
- `relatedFiles`
- `outcome`

### 9.6 有限自动重排

观察员可以触发有限自动重排，但只应限于局部、可解释、可回放的范围。

建议自动重排分级：

- `minor`
  - 例如催促汇报、局部暂停、调整短期顺序
- `local`
  - 例如标记 task blocked、局部任务转交、建议切换执行模式
- `requires_user_approval`
  - 例如大规模任务重组、改动验收标准、推翻既有 execution plan

默认仅允许观察员自动触发 `minor` 和 `local`。

### 9.7 Observer 安全护栏

~~只要记录 observer 的行为，就足以约束它。~~  
除了审计，observer 还需要运行时安全护栏：

- 每个目标 pane 在固定时间窗内有最大命令数限制
- 连续相同指令应去重或退避
- 用户可随时触发 `observer.freeze`
- observer 被 freeze 后只保留观测和告警能力，不再下发控制指令

建议默认值：

- 单个目标 pane：30 秒内最多 3 条控制指令
- 全局：60 秒内最多 10 条控制指令
- 同类指令去重窗口：10 秒

### 9.8 Observer 重启上下文恢复

~~observer 崩溃后直接按 plan 重启即可。~~  
当 observer 崩溃并按 `failurePolicy.observerCrashed = restart_observer` 重启时，新 observer 必须经过显式的上下文重建流程：

1. 读取当前 `execution plan`
2. 读取 `task-status.json`
3. 读取 `claims.yaml`
4. 读取最新 `observation.json`
5. 读取最近一段 `observer-commands.jsonl` 作为审计历史，而不是恢复完整会话记忆
6. 进入 cooldown period，在短时间内只观测不指挥

建议默认 cooldown 为 10 秒。observer 重启后的目标是基于当前事实重新接管，而不是试图恢复先前内部思维链。

## 10. CLI Agent 规划能力

### 10.1 用户选择规划 Agent

用户在发起规划时，需要先选一个 CLI Agent 类型作为规划 Agent，例如：

- `claudecode`
- `codex`
- `opencode`
- 其他已接入的 CLI Agent

### 10.2 非交互规划调用

规划阶段通过非交互模式运行选定 Agent：

- 输入：需求、历史反馈、当前 spec
- 输出：新的 `spec.vN.md` 与 `spec.vN.json`

重要原则：

- 不依赖交互式会话
- 规划 Agent 的 stdout 不是最终 spec 真值
- 最终 spec 以写入 `.nexus/specs/` 的文件为准
- ~~只要 prompt 足够严格，planner 的输出就可以直接进入后续流程。~~
- 生成结果必须经过格式校验，至少检查必需章节和结构化字段是否存在
- 失败时应支持重试、回退到上一版 spec 或降级为人工修订

### 10.3 Provider 抽象

建议为规划阶段引入 provider 抽象：

- `PlanningAgentProvider`

职责：

- 拼装不同 CLI Agent 的非交互命令
- 注入输入文件和输出路径
- 校验返回结果
- 统一错误处理

## 11. 数据模型建议

### 11.1 SpecDoc

```ts
interface SpecDoc {
  id: string
  version: number
  status: 'draft' | 'revising' | 'validation_failed' | 'approved' | 'superseded' | 'cancelled'
  title: string
  requestPath: string
  specMarkdownPath: string
  specJsonPath: string
  createdAt: string
  updatedAt: string
  plannerAgent: string
  summary?: string
  canonicalFormat?: 'json'
}
```

### 11.2 TaskNode

```ts
interface TaskNode {
  id: string
  title: string
  description: string
  acceptanceCriteria: string[]
  allowedPaths: string[]
  readFirstPaths?: string[]
  dependsOn: string[]
  executionMode?: 'shared' | 'isolated'
  priority?: 'high' | 'medium' | 'low'
}
```

### 11.3 ExecutionAgentPlan

```ts
interface ExecutionAgentPlan {
  id: string
  role: 'worker' | 'observer'
  agentType: string
  name: string
  goal: string
  taskIds: string[]
  allowedPaths: string[]
  readFirstPaths?: string[]
  executionMode?: 'shared' | 'isolated'
  startupPromptPath: string
}
```

### 11.4 ExecutionPlan

```ts
interface ExecutionPlan {
  id: string
  specId: string
  specVersion: number
  status: 'draft' | 'ready_for_approval' | 'approved' | 'executing' | 'paused' | 'completed' | 'aborted' | 'failed'
  tasks: TaskNode[]
  agents: ExecutionAgentPlan[]
  conflictPolicy: {
    useClaims: boolean
    observerEscalation: boolean
  }
  maxWorkers?: number
  allowConcurrentPlans?: boolean
  stopConditions?: string[]
  failurePolicy?: {
    allWorkersFailed: 'pause' | 'abort' | 'wait_for_user'
    observerCrashed: 'restart_observer' | 'pause_plan' | 'wait_for_user'
    userCancelled: 'graceful_stop'
  }
  replanPolicy?: {
    observerAutoScopes: Array<'minor' | 'local'>
    userApprovalScopes: Array<'requires_user_approval'>
  }
  createdAt: string
  updatedAt: string
}
```

### 11.5 FileClaim

```ts
interface FileClaim {
  file: string
  paneId: string
  taskId: string
  mode: 'read' | 'edit'
  reason?: string
  updatedAt: string
  heartbeatAt?: string
  expiresAt?: string
}
```

## 12. 协议设计建议

当前仓库中仅预留了 `task.dispatch`，不足以表达 spec 生命周期、多阶段编排和 observer 指挥行为。

建议扩展为：

### 12.1 Client -> Server

- `spec.generate`
- `spec.revise`
- `spec.approve`
- `plan.generate`
- `plan.approve`
- `plan.execute`
- `plan.pause`
- `plan.abort`
- `observer.freeze`
- `observer.resume`

### 12.2 Server -> Client

- `spec.generated`
- `spec.revised`
- `spec.approved`
- `spec.generate.failed`
- `spec.revise.failed`
- `plan.generated`
- `plan.approved`
- `plan.execution.started`
- `plan.execution.updated`
- `plan.generate.failed`
- `plan.execute.failed`
- `observer.alert`
- `observer.summary`
- `observer.command`
- `observer.frozen`
- `observer.resumed`

## 13. 服务端模块建议

建议新增以下模块：

- `packages/server/src/spec/SpecManager.ts`
- `packages/server/src/spec/PlanningRunner.ts`
- `packages/server/src/spec/PlanningAgentProvider.ts`
- `packages/server/src/plan/ExecutionPlanBuilder.ts`
- `packages/server/src/orchestrator/ExecutionOrchestrator.ts`
- `packages/server/src/runtime/ClaimManager.ts`
- `packages/server/src/runtime/ObservationContextBuilder.ts`
- `packages/server/src/runtime/ObserverCoordinator.ts`

### 13.1 模块职责

`SpecManager`

- ~~管理 spec 目录、元数据、版本、审批状态~~
- 管理 spec 目录、元数据、版本、审批状态
- 负责 spec 双轨一致性校验
- 负责 `validation_failed` 状态管理

`PlanningRunner`

- 执行一次非交互规划或修订

`PlanningAgentProvider`

- 封装不同 CLI Agent 的规划命令格式

`ExecutionPlanBuilder`

- 将 approved spec 规范化为 tasks + agents + prompts

`ExecutionOrchestrator`

- 在 plan 批准后批量创建 worker 和 observer panes

`ClaimManager`

- 维护 `claims.yaml`

`ObservationContextBuilder`

- 将现有观测能力汇总为结构化 `observation.json`
- 负责事件驱动聚合、防抖更新和原子写入

`ObserverCoordinator`

- 承接观察员相关启动、输入、告警、摘要等流程
- 承接观察员的运行时指挥、命令审计和有限自动重排

## 14. 前端模块建议

建议新增以下 UI：

- `SpecPlannerDialog`
- `SpecReviewPanel`
- `ExecutionPlanPanel`
- `ObserverAlertsPanel`

### 14.1 交互流程

1. 用户输入需求并选择规划 Agent
2. 展示生成的 spec
3. 用户反馈并触发修订
4. 用户批准 spec
5. 展示 execution plan
6. 用户批准 plan
7. 展示 worker 与 observer 的实时执行和告警

## 15. MVP 实施顺序

### Phase 1: Spec 闭环

- 支持用户选择规划 Agent
- 非交互生成 spec
- spec 落盘到 `.nexus/specs/`
- 支持用户反馈并继续修订
- 支持批准 spec

### Phase 2: Execution Plan

- approved spec -> execution plan
- 生成 worker / observer prompts
- 展示 plan 供用户确认
- 明确任务的 `shared | isolated` 执行模式
- 补齐 stop conditions / failure policy / replan policy
- 明确 `maxWorkers` 与并发 plan 策略

### Phase 3: 批量启动

- plan 批准后批量新开 worker panes
- 额外新开一个 observer pane
- 注入启动 prompt
- ~~最基础的 `claims.yaml` 写入与冲突检测可以留到运行时协调阶段。~~
- 最基础的 `claims.yaml` 写入与冲突检测必须在这一阶段就可用

### Phase 4: 运行时协调

- `observation.json`
- `observer-commands.jsonl`
- observer alerts / summary
- 自动冲突协调和上报

## 16. 风险与边界

### 16.1 没有边界约束时共享工作区会失控

如果没有 `allowedPaths`、`claims`、观察员和升级条件，多 Agent 共享工作区极易出现反复覆盖修改。

### 16.2 仅靠模型自觉不够稳定

必须有结构化 spec、执行计划和运行时事实层作为机器可检查的边界。

### 16.3 观察员虽然拥有最高指挥权，但不能成为黑箱控制面

观察员应专注运行时治理，而不是重写 spec 或主导开发。其所有动作都需要可审计、可回放、可解释。

### 16.4 协议和类型需要统一演进

当前 server / web 类型分离，编排模块落地后需要更严格地同步协议与数据模型。

### 16.5 需要明确失败和退出路径

系统必须显式覆盖：

- worker 全部失败
- observer 崩溃
- 用户主动取消
- spec revise 长时间循环

这些场景不能留给实现阶段临时兜底。

### 16.6 资源上限必须前置建模

多 Agent 编排必须显式考虑：

- 单 plan 的 worker 上限
- 是否允许并发 plan
- observer 的成本告警职责

否则系统可能在资源层面先失控。

## 17. 总结

该方案将 Nexus 的“任务分发”升级为“Spec 驱动的多 Agent 编排”：

- 前置用非交互规划 Agent 生成和修订 spec
- 用户批准后再生成执行计划
- 批量新开多个 worker Agent 执行
- 额外引入 1 个环境观察员 Agent 做运行时治理
- 默认采用共享工作区协作，不依赖 worktree 作为主路径
- 复用现有面向人的多 Agent 观测机制，作为观察员的事实层输入

这使 Nexus 从”多 Agent 控制台”向”多 Agent 任务编排系统”演进，并保持与现有架构和观测能力一致。

---

## Decision Log

### 已决

- `spec first`
  - 先生成和修订 spec，再生成 execution plan
- `spec = executable contract`
  - spec 同时服务于人和系统
- `spec dual format`
  - 保留 `spec.vN.md` + `spec.vN.json`
  - `json` 为 canonical machine format
  - `SpecManager` 在生成后立即做一致性校验
- `new agents only`
  - 分发阶段只新开 Agent，不复用已有 Agent
- `shared-first, isolation-optional`
  - 倾向共享，但允许按任务事实切换到隔离模式
- `observer as runtime commander`
  - observer 可直接写 worker 终端，并可触发有限自动重排
- `observer must be audited`
  - observer 的关键动作必须进入 `observer-commands.jsonl`
- `lightweight claims`
  - claim 是轻量可见锁，不是强事务锁
  - 由机器侧检测冲突、越界和 stale claim
- `observation as shared fact layer`
  - 人类 UI 和 observer 使用同一 observation context
- `agents.yaml compatibility`
  - 保留 `.nexus/agents.yaml`
  - 兼容期双写 `.nexus/runtime/agents.yaml`
  - 新路径为主，旧路径为镜像
- `task completion must be explicit`
  - 通过 `task-status.json` 承载运行时任务状态与完成信号
- `resource constraints must be modeled`
  - plan 需显式建模 `maxWorkers` 和并发 plan 策略

### 未决

- planner/observer 是否切换到内置 Agent Runtime
- 并发 plan 在 MVP 是否直接禁止
- worker 上限默认值设为多少更合适
- task 完成信号的具体格式和写入协议
- observer 成本告警的具体阈值和策略

### 延后决策

- `Planner / Observer built-in runtime`
  - 作为中长期演进方向单独评估
- `agents.yaml` 最终是否降级为 symlink
  - 待兼容迁移完成后再定

---

## Appendix: Review 意见

> 以下为针对本设计文档的 review 意见，供后续迭代参考。

### R1. Observer 权限过大，缺乏约束机制

Observer 被定义为”运行时最高指挥角色”，可以直接写入 worker 终端、发出暂停/避让指令。但文档只说”必须被更严格地审查”，没有给出具体约束：

- **缺少 rate limiting** — observer 如果陷入循环判断，可能对 worker 发出大量干扰指令
- **缺少 kill switch** — 用户如何紧急禁用 observer 的自动干预？
- **minor/local 自动重排的边界模糊** — “催促汇报””局部暂停”具体如何界定？observer 自己判断 scope 级别本身就不可靠

**建议**：增加 observer 的动作频率限制、用户一键冻结 observer 控制权的机制，以及明确的 scope 判定规则（不应由 observer 自己判断自己的权限级别）。

### R2. Claim 机制过于乐观

Claim 被定义为”轻量可见锁，不是强事务锁”，这意味着 worker 完全可以忽略 claim。在 LLM Agent 场景下：

- Agent 不一定会可靠地读取和遵守 `claims.yaml`
- 没有说明 claim 冲突时的**自动阻塞**还是**仅告警**
- claim 的生命周期管理缺失 — Agent 崩溃后 stale claim 如何清理？

**建议**：至少在 `ObservationContextBuilder` 层面检测 claim 违规并主动通知，而不是完全依赖 Agent 自觉。增加 claim 过期/心跳机制。

### R3. Spec 双轨（md + json）增加维护成本但收益不明确

要求同时产出 `spec.vN.md` 和 `spec.vN.json`，但：

- 两者一致性谁来保证？由 planner agent 同时生成两份，还是从 md 解析出 json？
- 如果 md 和 json 不一致，以谁为准？
- json 的 `executionHints`/`isolationHints` 等字段在 spec 阶段就确定，是否过早？

**建议**：MVP 阶段只用 md + frontmatter YAML，足以承载结构化字段。json 双轨可以延后到确实需要复杂机器消费时再引入。

### R4. 非交互规划的可靠性未充分讨论

整个方案的起点是”非交互模式调用 CLI Agent 生成 spec”，但：

- 不同 Agent 的非交互模式输出格式差异巨大（Claude Code `-p` vs Codex 等）
- 如何确保 Agent 输出的 spec 符合 §5.5 的固定章节结构？仅靠 prompt 不够稳定
- 生成失败、格式错误、超时的容错策略没有提及

**建议**：增加 spec 输出的**格式校验步骤**（至少检查必需章节是否存在），以及失败重试/降级策略。

### R5. `agents.yaml` 双写迁移方案有隐患

§8.2 提出兼容期双写两个 `agents.yaml`，但：

- 双写的一致性谁保证？写入一个成功另一个失败怎么办？
- 现有 `AgentsYamlWriter` 的防抖 500ms 逻辑要同时维护两个文件路径
- “再考虑将旧路径降级”没有明确时间线，容易变成永久双写

**建议**：用 symlink 而非双写，或者直接在 `runtime/` 下写，旧路径做 symlink 指向新路径。一步到位比”兼容期”更干净。

### R6. 缺少关键的失败/退出路径

文档覆盖了正常流程，但以下场景缺失：

- **Worker 全部失败**时怎么办？自动 abort plan 还是等用户？
- **Observer 自身崩溃**怎么办？谁来监控监控者？
- **用户中途想取消**时，如何优雅停止所有 worker + observer？
- **Spec revise 无限循环**（用户一直不满意）的退出条件？

**建议**：补充异常流程的状态机转换和兜底策略。

### R7. 实施顺序建议调整

Phase 3（批量启动）和 Phase 4（运行时协调）之间的依赖被低估了。没有 claim 和 observation 机制就批量启动多个 worker，等于在没有交通信号灯的情况下放行所有车辆。

**建议**：Phase 3 至少要包含最基础的 `claims.yaml` 写入和冲突检测，而不是等到 Phase 4。

### R8. 小问题

- §11.2 `TaskNode.priority` 在文档其他部分从未被消费，observer 和 plan 都没用到它
- §12 协议缺少错误事件（如 `spec.generate.failed`、`plan.execute.failed`）
- §6.3 execution plan 的”停止条件”没有在数据模型中体现

---

## Appendix: Review 回复

### 对 R1 的回复

采纳。

Observer 的高权限必须配套系统级安全护栏，不能只写“加强审查”。方案已补入：

- rate limiting
- kill switch（`observer.freeze` / `observer.resume`）
- action policy 不由 observer 自判
- observer freeze 后退化为仅观测和告警

### 对 R2 的回复

采纳。

Claim 不能完全依赖 Agent 自觉。方案已补入：

- claim 心跳与过期时间
- stale claim 自动清理
- `ObservationContextBuilder` 主动检测冲突、越界和 stale claim
- claim 冲突默认至少触发告警，再由 observer 决定是否升级

保持“轻量 claim”这一原则不变，但补强机器侧检测。

### 对 R3 的回复

部分采纳。

Review 提出的“一致性成本”是成立的，但当前方案仍保留 `md + json` 双轨，原因是本设计明确把 spec 视为同时面向人和系统的执行契约。单靠 md + frontmatter 可以覆盖 MVP，但会把机器消费和契约演进继续绑在同一文本格式里，长期上限较低。

优化后的判断是：

- 继续保留 `spec.vN.md` 和 `spec.vN.json`
- 以 `json` 为 canonical machine format
- `md` 面向审阅
- 必须增加一致性校验，而不是依赖 planner 一次性同时写对两份

### 对 R4 的回复

采纳。

非交互规划是整个链路的入口，必须有格式校验和失败策略。方案已补入：

- 必需章节和结构化字段校验
- 失败重试
- 回退到上一版 spec
- 必要时降级为人工修订

### 对 R5 的回复

部分采纳。

关于双写的批评成立，但这里暂不改成“一步到位 symlink”，原因是当前生态对旧路径仍有依赖，直接切换 symlink 风险更高。当前方案调整为：

- 兼容期双写保留
- 由单一 writer 负责
- 以 `runtime/agents.yaml` 为主目标
- 旧路径作为镜像
- 镜像失败不影响主路径落盘，但必须告警

同时明确这是有迁移窗口的兼容策略，而不是永久双写。

### 对 R6 的回复

采纳。

方案已补入失败和退出路径：

- `failed` 状态
- `failurePolicy`
- worker 全部失败
- observer 崩溃
- 用户取消
- spec revise 长循环

这些场景后续还需要在状态机设计里进一步具体化。

### 对 R7 的回复

采纳。

实施顺序已调整：最基础的 `claims.yaml` 写入和冲突检测必须在批量启动阶段就具备，不能完全后移到运行时协调阶段。

### 对 R8 的回复

采纳。

方案已补入：

- 错误事件（如 `spec.generate.failed`、`plan.execute.failed`）
- `stopConditions`
- `failurePolicy`

`TaskNode.priority` 当前仍保留，但后续需要在 observer 调度、告警优先级或 plan 排序中明确消费，否则应删除，避免保留无效字段。

---

## Appendix: Review 意见（第二轮）

> 基于第一轮 review 回复及文档修订后的跟进意见。

### R9. Observer 崩溃恢复缺少上下文重建路径

§11.4 `failurePolicy` 新增了 `observerCrashed: 'restart_observer'`，但自动重启的 observer 如何恢复上下文？

当前 observer 的输入依赖 `observation.json`、`claims.yaml`、`observer-commands.jsonl` 等运行时产物，这些文件在崩溃时可能处于不一致状态。新 observer 启动后：

- 是否需要重放 `observer-commands.jsonl` 来恢复已发出指令的记忆？
- 如何判断哪些指令已经被 worker 执行、哪些被忽略？
- `observation.json` 的更新依赖 `ObservationContextBuilder`，如果 builder 也没有及时刷新，新 observer 拿到的可能是过时快照

**建议**：明确 observer 启动（含重启）时的上下文加载协议 — 至少包括：从哪些文件恢复状态、是否需要 checkpoint 机制、重启后的 cooldown period（避免立即基于过时数据发出指令）。

### R10. Spec 双轨一致性校验的时机和职责未落地

对 R3 的回复中承诺"必须增加一致性校验"，但当前文档中没有明确：

- **谁来做校验** — `SpecManager`？`PlanningRunner`？还是一个独立的 validator？
- **何时校验** — 生成后立即校验？还是 approve 前校验？两者差异很大：前者可以及时重试，后者可能让用户审阅了一份和 json 不一致的 md
- **校验失败怎么办** — 重新生成？只保留 json 丢弃 md？还是标记为 validation_failed 等用户决策？

**建议**：在 §10.2 或 §13.1 `SpecManager` 职责中明确校验时机为"生成后立即校验"，校验职责归 `SpecManager`，失败则触发重试或降级。不要留到 approve 阶段才发现不一致。

### R11. `observation.json` 的更新频率和写入成本未讨论

§8.4 列出了 `observation.json` 的大量字段（spec、plan、agents、activeTasks、fileClaims、conflicts、hotFiles、stalledAgents...），这是一个重量级聚合文件。但文档没有讨论：

- **更新频率** — 每次 claim 变化都重建？定时轮询？还是事件驱动？
- **写入性能** — 多个 worker 并行时，文件系统写入的冲突和性能问题（JSON 不支持追加写入，每次都是全量覆盖）
- **消费者竞争** — observer 读取时 builder 正在写入，是否会读到半写文件？

对比 `observer-commands.jsonl` 用了 JSONL 格式（追加友好），`observation.json` 却选择了全量 JSON，两者的设计考量不一致。

**建议**：明确 `ObservationContextBuilder` 的更新策略（建议事件驱动 + 防抖，类似现有 `AgentsYamlWriter` 的 500ms 防抖模式）。写入时使用 write-then-rename 保证原子性，避免 observer 读到半写文件。

### R12. `FileClaim` 数据模型与正文描述不一致

§7.3 中 claim 字段已更新为包含 `expiresAt` 和 `heartbeatAt`（第 299-300 行），但 §11.5 的 `FileClaim` interface（第 611-619 行）仍然缺少这两个字段：

```ts
// §11.5 当前定义，缺少 expiresAt 和 heartbeatAt
interface FileClaim {
  file: string
  paneId: string
  taskId: string
  mode: 'read' | 'edit'
  reason?: string
  updatedAt: string
}
```

**建议**：将 `FileClaim` 补齐为与正文描述一致。

### R13. Worker 完成判定和任务验收机制缺失

文档详细描述了任务分发和运行时协调，但对于"任务何时算完成"几乎没有讨论：

- Worker 如何上报自己的任务完成？通过终端输出？写入某个状态文件？还是 observer 判断？
- `acceptanceCriteria` 由谁来验证？是 observer 自动检查还是等用户确认？
- 单个 task 完成后，是否需要触发依赖它的下游 task 启动？当前 `TaskNode.dependsOn` 定义了依赖关系，但没有执行引擎来消费这个依赖图

这是整个编排系统的闭环问题 — 如果没有明确的完成信号和验收流程，`ExecutionPlan.status` 永远无法可靠地从 `executing` 转移到 `completed`。

**建议**：补充 task 完成上报机制（建议由 worker 写入结构化完成信号到 runtime 目录，observer 或 orchestrator 消费），以及依赖图的运行时调度逻辑（哪些 task 阻塞、哪些可以启动）。

### R14. 资源上限和并发 plan 的约束

文档假设单次编排就是一个 spec → 一个 plan → N 个 worker + 1 个 observer，但没有讨论：

- **最大 worker 数** — 如果 spec 拆出 20 个 task，是否真的开 20 个 Agent？node-pty 和系统资源的上限是什么？
- **并发 plan** — 用户能否同时运行多个 execution plan？如果不能，如何防止？如果能，`claims.yaml` 和 `observation.json` 如何区分不同 plan 的数据？
- **成本控制** — 多个 Agent 并行运行会迅速消耗 API token，是否需要一个成本预估或上限告警？

**建议**：MVP 阶段至少明确单 plan 的 worker 上限（建议硬限制 + 可配置），以及是否允许并发 plan。成本预估可以延后，但上限告警应纳入 observer 的职责。

### R15. 小问题

- §9.7 observer 安全护栏提到"固定时间窗内有最大命令数限制"，但没有给出建议默认值，实现时容易被忽略或设成无效值
- §6.1 `ExecutionPlan.status` 新增了 `failed`，但 §11.4 的 status union type（第 587 行）没有同步更新，仍然缺少 `failed`
- §12 协议中 `observer.freeze` / `observer.resume` 是 Client→Server 事件，但缺少对应的 Server→Client 确认事件（如 `observer.frozen` / `observer.resumed`），客户端无法确认 freeze 是否生效

### R16. 建议引入内置 Agent Runtime 替代外部 CLI Agent 做 Planner/Observer

当前方案的 Planner 和 Observer 都通过 node-pty 启动外部 CLI Agent（Claude Code、Codex 等），这带来了多个结构性问题：

1. **非交互调用不可靠**（R4 已指出）— 依赖外部 Agent 按固定格式输出 spec，仅靠 prompt 约束不稳定
2. **Observer 链路过长** — observer 作为终端里的 CLI Agent，要通过文件系统读写 `observation.json`、`claims.yaml` 等运行时产物，再通过终端文本发出指令，中间环节多、延迟高、容易出错
3. **成本高** — 每个 CLI Agent session 有自己的上下文管理和 token 开销，Planner 和 Observer 不需要完整的 CLI Agent 能力（文件编辑、shell 执行等），用完整 Agent 是浪费
4. **协议难约束** — 外部 Agent 的输出格式只能靠 prompt 引导，无法用 TypeScript 类型系统强约束

**建议方案**：参考 [pi-mono](https://github.com/badlogic/pi-mono)（OpenClaw 的核心 Agent 框架）的设计，在 Nexus server 内构建一个轻量的内置 Agent Runtime，用于驱动 Planner 和 Observer 角色。

核心思路：

```
packages/server/src/agent/
  ├── AgentRuntime.ts        # 通用 tool-use loop 引擎
  ├── tools/                 # 内置工具集
  │   ├── spec.ts            # 读写 spec 文件
  │   ├── plan.ts            # 读写 execution plan
  │   ├── claim.ts           # 操作 claims.yaml
  │   ├── observe.ts         # 读取 observation.json
  │   ├── command.ts         # 向 worker 终端发送指令
  │   ├── codebase.ts        # 读文件、搜索代码（只读）
  │   └── report.ts          # 发出 alert / summary
  ├── roles/
  │   ├── planner.ts         # Planner 的 system prompt + tool set 配置
  │   └── observer.ts        # Observer 的 system prompt + tool set 配置
  └── providers/
      └── api.ts             # SOTA 模型 API 调用（Claude/GPT/etc）
```

**关键设计点**：

- **依然使用 SOTA 模型**（Claude Opus / Sonnet 等），不是用小模型替代，而是通过直接 API 调用替代启动完整 CLI Agent session
- **Planner 和 Observer 只是不同的 role 配置**（system prompt + 可用 tool 子集），共享同一个 AgentRuntime 引擎
- **Observer 可以直接调用 Nexus 内部 API** — 读取 `ClaimManager`、`ObservationContextBuilder` 的内存数据，而不是通过文件系统中转，延迟更低、一致性更好
- **Planner 的输出通过 tool-use 结构化返回** — 例如调用 `writeSpec({ markdown, json })` tool，而不是"希望 Agent 在 stdout 中按格式输出"，彻底解决 R4 和 R10 的可靠性问题
- **和现有外部 CLI Agent worker 共存** — 内置 Agent 只用于 Planner/Observer，实际编码执行仍由用户选择的外部 CLI Agent（Claude Code 等）完成

**对现有方案的影响**：

- `PlanningRunner` + `PlanningAgentProvider` + `ObserverCoordinator` 三个模块可合并简化为 `AgentRuntime` + role config
- §10 的"非交互规划调用"变为内置 Agent 的 tool-use 调用，格式校验问题自然消解
- §9 的 observer 安全护栏（rate limiting、freeze 等）可以在 AgentRuntime 层面统一实现，而不是依赖外部 Agent 自觉
- observer 崩溃恢复（R9）也更简单 — 内置 Agent 重启只需重新加载 runtime 状态，不需要恢复整个 CLI Agent session

**需要进一步调研**：pi-mono 的具体 tool-use loop 实现、工具注册机制、流式输出处理等，以评估复用程度和适配成本。

---

## Appendix: Review 回复（第二轮）

### 对 R9 的回复

采纳。

方案已补入 observer 重启后的上下文恢复协议：

- 读取 execution plan、task-status、claims、observation 快照
- 读取最近一段 observer command 审计历史
- 不恢复完整会话记忆，只基于当前事实重新接管
- 引入 cooldown period，避免基于过时数据立即发令

### 对 R10 的回复

采纳。

方案已明确：

- 一致性校验职责归 `SpecManager`
- 校验时机是每次生成/修订后立即校验
- 校验失败进入 `validation_failed`
- 失败后触发重试、回退或人工修订

这条不会再留到 approve 阶段才发现问题。

### 对 R11 的回复

采纳。

方案已补入 `ObservationContextBuilder` 的更新策略：

- 事件驱动 + 防抖
- 默认 500ms 窗口
- write-then-rename 原子写入
- 快照文件与审计流使用不同格式，并明确了职责差异

### 对 R12 的回复

采纳。

`FileClaim` 数据模型已补齐 `heartbeatAt` 和 `expiresAt`，与正文一致。

### 对 R13 的回复

采纳。

方案已新增 `task-status.json` 和结构化 task 状态机，明确：

- worker 需要显式上报完成信号
- orchestrator / observer 消费完成信号并推进任务状态
- 机器可检查项与用户主观确认项分层处理
- `dependsOn` 由运行时调度逻辑消费，而不是停留在静态字段

### 对 R14 的回复

采纳。

方案已补入：

- `maxWorkers`
- `allowConcurrentPlans`
- 资源上限前置建模
- observer 承担成本告警职责

MVP 阶段至少需要限制单 plan 的 worker 上限，并明确是否允许并发 plan。

### 对 R15 的回复

采纳。

方案已补入：

- observer rate limit 默认值
- `ExecutionPlan.status` 的 `failed`
- `observer.frozen` / `observer.resumed` 确认事件

### 对 R16 的回复

部分采纳，作为中长期演进方向。

这条 review 提出的是路线级建议，不是局部修订。其核心判断是成立的：Planner 和 Observer 这两个角色，对“内置 runtime + tool-use”架构的适配性，确实高于“完整外部 CLI Agent session”。

当前阶段的判断是：

- Worker 继续以外部 CLI Agent 为主
- Planner 和 Observer 仍先按当前方案落地，保持与现有 Nexus 架构一致
- 同时将“内置 Agent Runtime for Planner/Observer”列为后续重点调研方向

暂不在本版方案中直接切换到内置 runtime，原因有三点：

1. 当前方案首先要解决的是编排模型和运行时边界，而不是一次性替换所有执行载体
2. 内置 runtime 会显著改变现有 server 架构和模型调用路径，适合单独立项
3. 先保留外部 CLI Agent 路径，有利于验证 spec / plan / observer 这三层模型本身是否成立

但这条建议的价值很高，后续若进入实现阶段，应优先评估：

- Planner 是否先切换到内置 runtime
- Observer 是否优先切换到内置 runtime
- Worker 是否继续保留外部 CLI Agent

这很可能是 Nexus 从“编排外部 Agent”进一步演进到“拥有部分内建智能角色”的关键一步。

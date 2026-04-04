# 配置

## 配置文件位置

### 全局配置

`~/.nexus/config.yaml`

### 项目配置

`.nexus/config.yaml`

## 全局配置示例

```yaml
version: "1"

defaults:
  shell: /bin/zsh
  scrollback_lines: 5000
  grid_columns: 2
  history_retention_days: 14
  theme: dark-ide

agents:
  claudecode:
    bin: claude
    continue_flag: "--continue"
    resume_flag: "--resume"
    yolo_flag: "--dangerously-skip-permissions"
    statusline: true
    transport: pty
```

## 常见字段

### `defaults`

- `shell`
- `scrollback_lines`
- `grid_columns`
- `history_retention_days`
- `theme`

### `agents.<name>`

- `bin`
- `continue_flag`
- `resume_flag`
- `yolo_flag`
- `statusline`
- `transport`
- `env`

## 项目配置中常见 pane 字段

- `name`
- `agent`
- `workdir`
- `task`
- `restore`
- `isolation`
- `branch`
- `worktreePath`
- `sessionId`

## `restore` 模式

当前代码面里可见的恢复相关模式包括：

- `restart`
- `resume`

底层类型中还保留了 `continue` 和 `manual`，但你在当前新建 pane 对话框里主要会使用前两种。

## `isolation` 模式

- `shared`
- `worktree`

## Agent 环境变量

你可以在 `agents.<name>.env` 中为某种 agent 注入环境变量，例如 API key 或自定义选项。

## 设置页与文件配置的关系

设置页会读取并保存全局配置；项目级 pane 状态和 session 信息则由工作空间配置与运行时状态共同决定。

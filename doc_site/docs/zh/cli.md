# CLI 用法

## 基本格式

```bash
mexus [command] [directory]
```

如果省略 `command`，默认执行 `start`。

## 常用命令

### 启动当前目录

```bash
mexus
```

### 启动指定目录

```bash
mexus ~/projects/my-app
```

### 显式使用 `start`

```bash
mexus start ~/projects/my-app
```

### 初始化 `.nexus/`

```bash
mexus init .
```

### 查看当前工作空间状态

```bash
mexus status
```

### 停止运行中的服务

```bash
mexus stop
```

## 环境变量

### `NEXUS_PORT`

设置 HTTP 服务端口：

```bash
NEXUS_PORT=7800 mexus
```

### `NEXUS_PROJECT_DIR`

主要用于源码开发或脚本场景，强制指定工作目录。

## 路径解析规则

- 传入目录时，CLI 会使用该目录
- 不传目录时，CLI 会尝试从当前路径向上寻找项目根
- 如果找到 `pnpm-workspace.yaml`，会优先把它视为项目根

## 自更新行为

当前版本包含后台自更新检查逻辑。正常启动时，这个检查在后台执行，不会阻塞 UI 打开。

::: info 说明
自更新属于产品行为的一部分，但是否更新成功取决于本机 npm 环境和安装方式。
:::

## 帮助

```bash
mexus --help
```

当前程序也兼容 `nexus --help`，但文档统一使用 `mexus`。

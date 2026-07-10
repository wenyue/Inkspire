---
name: worktree-environment-setup
description: Prepare dependencies and validate required checked-in assets inside an already-created linked Inkspire Git worktree.
---

# Worktree Environment Setup

用于已创建的 Inkspire linked worktree。只准备环境，不修改项目实现或生成资产。

## Procedure

1. 定位仓库：
   - 运行 `git rev-parse --show-toplevel`。
   - 切换到返回的仓库根目录。
   - 若命令失败，立即停止并按“失败报告”输出。

2. 确认 linked worktree：
   - 运行 `git rev-parse --path-format=absolute --git-dir`。
   - 运行 `git rev-parse --path-format=absolute --git-common-dir`。
   - 规范化两个绝对路径后比较；路径不同时，视为 linked worktree。
   - 若 Git 不支持上述参数、命令失败或结果有歧义，则检查
     `git worktree list --porcelain`。
   - fallback 仅在当前仓库根目录对应次级 worktree 条目时接受；主工作树不合格。
   - 无法确认 linked worktree 时立即停止。

3. 检查工具链：
   - 运行 `node --version`，解析 major version，必须为 `20` 或更高。
   - 运行 `npm --version`，必须成功。
   - 检查根目录存在 `package.json` 与 `package-lock.json`。
   - 任一条件不满足时立即停止。

4. 安装锁定依赖：
   - 仅在仓库根目录运行 `npm ci`。
   - 不得改用 `npm install`，不得更新 lockfile。
   - 安装失败时立即停止。

5. 检查必需资产：
   - 确认 `config/classic-artworks.json` 是文件。
   - 确认 `client/public/classic-artworks` 是目录。
   - 缺失时立即停止；不得下载或重建。

6. 成功输出：
   - 报告仓库根目录、linked worktree 已确认、Node/npm 版本、`npm ci` 成功，
     以及两个资产路径存在。
   - 到此停止，不运行其他步骤。

## Failure Report

任何步骤失败时，必须原样报告：

- `Step`: 失败步骤名称。
- `Command`: 实际运行的命令；纯文件检查写明检查路径。
- `Exit code`: 命令退出码；不适用时写 `N/A`。
- `Output`: 与失败直接相关的 stdout/stderr 或缺失条件。
- `Action`: 用户需要执行的最小修复动作。

不得隐藏输出、猜测成功、继续后续步骤或自动采用替代方案。

## Prohibited Scope

不得运行基线测试、类型检查或构建；不得实现、提交或集成代码；不得清理文件；
不得创建或删除 worktree；不得同步 agents；不得下载或重建经典艺术品资源。

# Project Structure

Strength: Advisory

## Ownership

- `client/`：浏览器应用，包含 UI、客户端 API 适配与客户端领域代码。
- `server/`：Express 服务，包含 API、runtime、storage、jobs、prompts 与 Codex runner。
- `config/`：客户端 fallback 与服务端 loader 共用的产品配置。
- `scripts/`：仓库自动化、资源构建与资源验证的所有者。
- `e2e/`：Playwright 场景及其确定性测试栈管理。
- `docs/superpowers/`：设计与实施文档，不作为运行时代码依赖。
- `client/public/classic-artworks/`：脚本生成的经典艺术品静态资源。

## Dependency Direction

- 客户端 UI 依赖客户端 API 与 domain 边界，不依赖服务端内部模块。
- 客户端 API 代码处理网络交互，不承载服务端业务实现。
- 服务端 API 适配 HTTP 请求，并向内部 runtime、storage、jobs、prompts 或 runner 委派。
- storage 不应依赖 UI 或 HTTP 表示。
- jobs 可以协调存储、提示词与执行器，但必须保持并发和所有权边界。
- prompts 负责生成输入，不负责 HTTP 生命周期或持久化所有权。
- Codex runner 负责外部命令执行，不负责 UI 表示或数据库结构决策。
- 共享产品配置从 `config/` 读取；避免在 client 与 server 各自复制来源。
- 自动化脚本可以拥有生成物，但运行时代码不应反向依赖脚本实现。

## Placement Guidance

- 浏览器交互与展示放入 `client/`。
- 服务端接口适配放入 server API 区域。
- 数据库、上传与路径管理放入 server storage 区域。
- 长时间生成、队列和状态协调放入 server jobs/runtime 区域。
- 提示词构造放入 server prompts 区域。
- Codex 进程调用与结果适配放入 server runner 区域。
- 跨端产品数据放入 `config/`，不要放入某一端作为唯一来源。
- 可重复的仓库维护流程放入 `scripts/`。
- 端到端用户流程放入 `e2e/`，不要借用生产模块隐藏测试专用行为。

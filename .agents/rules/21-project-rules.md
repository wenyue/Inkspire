# Project Rules

Strength: Default

## Shared Product Configuration

- `config/` 是客户端 fallback 与服务端 loader 共用的产品数据源。
- 修改共享配置时，保持客户端与服务端对同一字段、默认值和兼容行为的一致理解。
- 支持的 locale 为 `zh-Hans`、`zh-Hant`、`en`；新增用户可见产品数据时保持三者一致。

## API And Domain

- HTTP 接口保持在 `/api` 命名空间内，健康状态保持由 `/api/health` 提供。
- UI 不应直接承担服务端存储、任务调度、提示词组装或 Codex 执行职责。
- 客户端 API 层负责传输边界，domain 层负责领域表达，UI 层负责交互与展示。
- 服务端 API 层应把请求交给对应 runtime、storage、jobs、prompts 或 Codex runner。
- 保持请求、持久化记录与文件路径中的 ID 安全；不得把未经验证的 ID 拼接为路径。

## Persistence

- 运行时 SQLite 位于数据目录下的 `inkspire.db`，保存 records、uploads 与 orders。
- `INKSPIRE_DATA_DIR` 可改变数据根目录；不得假设数据总在仓库内的固定绝对路径。
- 保持旧版 JSON 导入兼容，除非任务明确包含迁移或移除该能力。
- 数据库记录、上传文件和订单之间的引用必须保持一致。
- 文件写入必须限制在选定的数据或生成根目录内，避免路径逃逸。

## Jobs And Lifecycle

- 保持现有任务并发限制、任务所有权和状态生命周期。
- 不得通过 UI 重试、进程重启或错误恢复绕过并发与所有权检查。
- 启动、关闭和测试栈管理应继续由各自现有生命周期组件负责。
- E2E 的确定性模式与真实 Codex 模式必须保持显式分离。
- 真实生成失败应保留可诊断信息，不得静默退回模拟生成。

## Framework Conventions

- 客户端保持 React 18、Vite 与严格 TypeScript 约束。
- 服务端保持 CommonJS 模块约定，除非任务明确要求迁移模块系统。
- 测试应放在其所属 client、server 或 e2e 边界内，并验证可观察行为。
- 图片处理继续通过服务端既有图像依赖与 WebP 输出约定完成。

## Generated Content

- 经典艺术品清单和静态目录是脚本拥有的生成物。
- 修改生成物需求时应修改拥有它们的构建或验证逻辑，再由明确的资产任务重建。
- 普通功能开发、测试修复与环境 setup 不得顺带刷新远程艺术品资源。

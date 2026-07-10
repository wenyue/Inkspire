# Project Tools

Strength: Mandatory

## Toolchain

- 本仓库要求 Node.js `>=20`，使用 npm workspace 与根目录 `package-lock.json`。
- workspace 包含 `client` 与 `server`；依赖安装必须以仓库根目录锁文件为准。
- 仓库未配置 lint、formatter、CI 或 MCP；不得假设这些能力存在。

## Root Scripts

- `dev`：启动本地开发栈。
- `start`：启动应用。
- `test`：运行项目测试。
- `test:server`：运行服务端测试。
- `test:client`：运行客户端测试。
- `e2e`：运行 Playwright 端到端测试。
- `verify:real`：使用真实 Codex 验证生成流程。
- `validate:classic-artworks`：验证经典艺术品清单及其静态资源。

## Client

- React 18、Vite、严格 TypeScript。
- Vitest 使用 jsdom。
- client 脚本包括 `dev`、`build`、`typecheck`、`test`。
- `build` 必须先通过类型检查，再执行 Vite 构建。
- Vite `/api` 代理默认指向 `127.0.0.1:3001`。

## Server And Runtime

- 服务端为 CommonJS Express。
- 测试使用 `node:test` 与 Supertest。
- 运行时依赖包括 `better-sqlite3`、`sharp`、`pngjs`、`multer`。
- `PORT` 默认值为 `3001`。
- `INKSPIRE_DATA_DIR` 默认值为 `data`。
- API 前缀为 `/api`，健康检查为 `/api/health`。

## Generation And E2E

- E2E 自动化负责启动和关闭确定性的 `INKSPIRE_E2E=1` 测试栈。
- E2E 端口从约 `3101` 与 `5173` 附近选择，不得硬编码其必然空闲。
- `INKSPIRE_REAL_CODEX=1` 才启用真实生成。
- `verify:real` 要求已配置可执行的 Codex 命令。
- `config/app.json` 使用 Codex `gpt-5.5`；生成根目录默认位于 `CODEX_HOME` 下。
- 生成图片格式为 WebP。

## Generated Assets

- `config/classic-artworks.json` 与 `client/public/classic-artworks/` 由
  `scripts/build-classic-artworks.mjs` 统一拥有。
- 验证使用 `validate:classic-artworks`。
- 构建脚本会下载公开的 Met 资源，不属于普通工作树初始化步骤。
- 不得手工修改、自动重建或在常规 setup 中下载这些资产。

## Verification

- 客户端类型检查以 `npm run typecheck --workspace client` 为准。
- 根据改动范围选择现有的 client、server、E2E 或真实生成验证。
- 不得以不存在的 lint、formatter 或 CI 检查替代项目现有验证。

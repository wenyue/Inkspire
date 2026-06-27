# Inkspire 流程修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复结果页继续调整、制作入口不可达、生成前状态不清晰这三个会让完整流程断开的点。

**Architecture:** 保持现有 `App` 管全局记录和页签、`Studio` 管创作草稿的边界。新增一个轻量的结果迭代种子，把从结果页或藏卷打开的作品答案同步到 `Studio`，避免继续调整落回照片步骤。

**Tech Stack:** React 18、TypeScript、Vitest、Playwright。

---

### Task 1: 结果页继续调整回归测试

**Files:**
- Modify: `client/tests/app.test.tsx`

- [ ] 写测试：当本地草稿停在照片步骤、用户从藏卷打开作品后，点击“补充要求”应显示备注框并保留结果图。
- [ ] 写测试：同样场景点击“按这张图继续调整”应进入“基于上次生成”的备注页，而不是照片步骤。
- [ ] 运行 `npm test --workspace client -- --run client/tests/app.test.tsx`，确认新测试先失败。

### Task 2: 同步结果记录到 Studio 草稿

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/Studio.tsx`

- [ ] 在 `App` 中保存待继续调整的结果记录。
- [ ] 给 `Studio` 传入当前结果或待继续记录。
- [ ] `Studio` 在收到继续请求时，用记录的 `type`、`answers`、照片路径和推荐尺寸恢复草稿，并强制进入补充要求页。
- [ ] 运行同一个 Vitest 命令，确认回归测试通过。

### Task 3: 生成前状态摘要

**Files:**
- Modify: `client/src/components/Studio.tsx`
- Modify: `client/src/i18n.ts`
- Modify: `client/tests/app.test.tsx`

- [ ] 在补充要求页显示“将生成作品图”或“将生成作品图 + 效果图”。
- [ ] 增加测试覆盖跳过照片和上传照片两个分支。

### Task 4: 打通制作入口

**Files:**
- Modify: `config/app.json`
- Modify: `e2e/inkspire.spec.ts`

- [ ] 给本地产品配置补上默认制作微信，打开 `productionAvailable`。
- [ ] 更新 e2e：结果页应显示“制作作品”，雅匠页应能用当前作品进入制作弹窗。

### Task 5: 验证

**Commands:**
- `npm test --workspace client -- --run client/tests/app.test.tsx`
- `npm test --workspace client`
- `npm run e2e`

# 墨起 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个本机单用户 React/Vite + Express 网页应用，用 Codex 图片生成能力生成中国书法/国画作品、可选照片融合图，并提供藏卷与专家制作引导。

**Architecture:** 前端在 `client/` 中负责移动端触控 UI、l10n、卷轴问答、粒子动效和结果展示。后端在 `server/` 中负责配置读取、本机文件存储、生成任务、Codex 图片生成适配、PNG 校验、WebP 转换和 API。根目录用 npm workspaces/脚本统一启动、测试和浏览器验证。

**Tech Stack:** Node.js、Express、React、Vite、TypeScript、Vitest、React Testing Library、Playwright、Sharp、pngjs。

## Global Constraints

- 不自动提交 Git；所有任务跳过 commit 步骤，只更新文件和测试记录。
- 本机单用户运行，后端调用本机 `codex exec --enable image_generation`。
- 主页三 Tab：`画案`、`藏卷`、`雅匠`。
- 支持简体中文、繁体中文、英文 UI l10n。
- 视觉方向为园林卷轴：浅青绿、屏风层次、卷轴式问答、柔和粒子、雅致转场。
- 国画 / 书法二选一分支问答。
- 生成独立作品图；如果用户提供照片，继续生成照片雅化后的融合图。
- 图片最终保存为 WebP。
- 专家、联系方式、价格估算从配置读取。
- 首位专家为用户提供的“广东省吴嘉茵艺术家”；公开资料不足的字段不得编造。
- 不实现登录、多用户、支付、正式订单、后台管理页、云端部署、社交发布。
- 前端不直接调用 Codex，真实图片生成必须通过后端封装。
- 计划中的测试必须先写并确认失败，再实现生产代码。

---

## File Structure

- `package.json`：根脚本，管理安装、开发、测试、浏览器验证。
- `.gitignore`：忽略 `node_modules/`、`data/`、`.superpowers/`、测试截图产物。
- `config/app.json`：默认语言、Codex 命令、模型、WebP 质量、生成尺寸。
- `config/experts.json`：吴嘉茵专家配置、两档服务、价格规则、联系方式配置默认值。
- `config/questions.json`：国画/书法分支问题、三语文案、预览键。
- `config/i18n/*.json`：UI 三语文案。
- `config/prompts/*.json`：国画、书法、融合图中文提示词模板。
- `server/src/config.js`：配置加载与校验。
- `server/src/storage.js`：`data/` 记录、图片路径、藏卷索引读写。
- `server/src/imagePipeline.js`：PNG 识别、WebP 转换、照片归档。
- `server/src/codexRunner.js`：Codex 进程、生成事件读取、新 PNG 查找、诊断。
- `server/src/prompts.js`：把问答/对话组装为作品和融合提示词。
- `server/src/jobs.js`：生成锁、任务状态、作品/融合阶段编排。
- `server/src/app.js`：Express app 与 API。
- `server/src/index.js`：启动服务。
- `server/tests/*.test.js`：配置、存储、图片、任务、API 测试。
- `client/src/i18n.ts`：前端三语字典与语言状态。
- `client/src/api.ts`：API client。
- `client/src/domain.ts`：前端类型、问答状态和派生逻辑。
- `client/src/App.tsx`：应用布局与三 Tab。
- `client/src/components/*`：画案、藏卷、雅匠、结果、制作弹窗、粒子背景。
- `client/src/styles.css`：园林卷轴视觉系统和响应式布局。
- `client/tests/*.test.tsx`：前端行为测试。
- `e2e/inkspire.spec.ts`：Playwright 手机视口和核心流程验证。

---

### Task 1: Project Scaffold, Config, and Static Contracts

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `server/package.json`
- Create: `client/package.json`
- Create: `client/index.html`
- Create: `client/vite.config.ts`
- Create: `client/tsconfig.json`
- Create: `client/vitest.setup.ts`
- Create: `config/app.json`
- Create: `config/experts.json`
- Create: `config/questions.json`
- Create: `config/i18n/zh-Hans.json`
- Create: `config/i18n/zh-Hant.json`
- Create: `config/i18n/en.json`
- Create: `config/prompts/painting.json`
- Create: `config/prompts/calligraphy.json`
- Create: `config/prompts/fusion.json`
- Create: `server/src/config.js`
- Test: `server/tests/config.test.js`

**Interfaces:**
- Produces: `loadConfig(projectRoot: string): AppConfig`
- Produces: `publicConfig(config: AppConfig): PublicConfig`
- Produces config object with keys `app`, `experts`, `questions`, `i18n`, `prompts`.

- [ ] **Step 1: Write failing config tests**

Create `server/tests/config.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { loadConfig, publicConfig } = require("../src/config");

const root = path.resolve(__dirname, "../..");

test("loads required Inkspire configuration", () => {
  const config = loadConfig(root);
  assert.equal(config.app.name, "墨起");
  assert.equal(config.app.defaultLocale, "zh-Hans");
  assert.equal(config.app.runtime.codexCommand, "codex");
  assert.equal(config.app.runtime.codexModel, "gpt-5");
  assert.equal(config.app.runtime.codexReasoningEffort, "medium");
  assert.equal(config.app.runtime.generatedImagesRoot, "generated_images");
  assert.deepEqual(config.app.runtime.generationCanvas, {
    width: 1024,
    height: 1536,
    aspectRatio: "2:3"
  });
  assert.equal(config.app.image.outputFormat, "webp");
  assert.equal(config.app.image.webpQuality, 82);
  assert.equal(config.experts[0].name, "吴嘉茵");
  assert.equal(config.experts[0].region, "广东省");
  assert.deepEqual(config.experts[0].services.map((service) => service.id), [
    "expert_custom",
    "expert_guided"
  ]);
  assert.ok(config.questions.painting.length >= 5);
  assert.ok(config.questions.calligraphy.length >= 5);
  assert.equal(config.i18n["zh-Hans"].tabs.studio, "画案");
  assert.equal(config.i18n["zh-Hant"].tabs.library, "藏卷");
  assert.equal(config.i18n.en.tabs.experts, "Artisans");
  assert.match(config.prompts.painting.system, /中国画/);
  assert.match(config.prompts.calligraphy.system, /书法/);
  assert.match(config.prompts.fusion.system, /融合图/);
});

test("public config exposes only UI-safe fields", () => {
  const exposed = publicConfig(loadConfig(root));
  assert.equal(exposed.name, "墨起");
  assert.equal(exposed.defaultLocale, "zh-Hans");
  assert.equal(exposed.experts[0].name, "吴嘉茵");
  assert.equal(exposed.experts[0].services[0].id, "expert_custom");
  assert.equal(Object.hasOwn(exposed, "codex"), false);
  assert.equal(Object.hasOwn(exposed, "runtime"), false);
  assert.equal(Object.hasOwn(exposed, "codexCommand"), false);
  assert.equal(Object.hasOwn(exposed, "codexModel"), false);
  assert.equal(Object.hasOwn(exposed, "codexReasoningEffort"), false);
  assert.equal(Object.hasOwn(exposed, "generatedImagesRoot"), false);
  assert.equal(Object.hasOwn(exposed, "generationCanvas"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace server -- config.test.js`

Expected: FAIL because `server/package.json` and `server/src/config.js` do not exist.

- [ ] **Step 3: Add project scaffold and config implementation**

Create root `package.json`:

```json
{
  "name": "inkspire",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["client", "server"],
  "scripts": {
    "dev": "concurrently \"npm run dev --workspace server\" \"npm run dev --workspace client\"",
    "start": "npm run start --workspace server",
    "test": "npm test --workspaces --if-present",
    "test:server": "npm test --workspace server",
    "test:client": "npm test --workspace client",
    "e2e": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.45.0",
    "concurrently": "^8.2.2"
  }
}
```

Create `.gitignore`:

```gitignore
node_modules/
data/
.superpowers/
test-results/
playwright-report/
coverage/
dist/
.DS_Store
```

Create `server/package.json`:

```json
{
  "name": "@inkspire/server",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "dev": "node src/index.js",
    "start": "node src/index.js",
    "test": "node --test tests/*.test.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "multer": "^2.2.0",
    "pngjs": "^7.0.0",
    "sharp": "^0.33.4"
  },
  "devDependencies": {
    "supertest": "^7.0.0"
  }
}
```

Create `client/package.json`:

```json
{
  "name": "@inkspire/client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.3.3",
    "typescript": "^5.5.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "lucide-react": "^0.468.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.6",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "jsdom": "^24.1.0",
    "vitest": "^1.6.0"
  }
}
```

Create Vite and config files with minimal React setup, then create JSON config files matching the test assertions.

Create `server/src/config.js`:

```js
const fs = require("node:fs");
const path = require("node:path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function requireArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
  return value;
}

function loadConfig(projectRoot = path.resolve(__dirname, "../..")) {
  const configDir = path.join(projectRoot, "config");
  const app = readJson(path.join(configDir, "app.json"));
  const experts = requireArray(readJson(path.join(configDir, "experts.json")), "experts");
  const questions = readJson(path.join(configDir, "questions.json"));
  const i18n = {
    "zh-Hans": readJson(path.join(configDir, "i18n", "zh-Hans.json")),
    "zh-Hant": readJson(path.join(configDir, "i18n", "zh-Hant.json")),
    en: readJson(path.join(configDir, "i18n", "en.json"))
  };
  const prompts = {
    painting: readJson(path.join(configDir, "prompts", "painting.json")),
    calligraphy: readJson(path.join(configDir, "prompts", "calligraphy.json")),
    fusion: readJson(path.join(configDir, "prompts", "fusion.json"))
  };

  requireArray(questions.painting, "painting questions");
  requireArray(questions.calligraphy, "calligraphy questions");

  return { app, experts, questions, i18n, prompts };
}

function publicConfig(config) {
  return {
    name: config.app.name,
    defaultLocale: config.app.defaultLocale,
    image: config.app.image,
    experts: config.experts,
    questions: config.questions,
    i18n: config.i18n
  };
}

module.exports = { loadConfig, publicConfig };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm install && npm test --workspace server -- config.test.js`

Expected: PASS for both config tests.

- [ ] **Step 5: Status recording**

Do not commit. Record completed files and passing command in sub-agent report.

---

### Task 2: Server Storage, Image Pipeline, and Prompt Assembly

**Files:**
- Create: `server/src/storage.js`
- Create: `server/src/imagePipeline.js`
- Create: `server/src/prompts.js`
- Test: `server/tests/storage.test.js`
- Test: `server/tests/imagePipeline.test.js`
- Test: `server/tests/prompts.test.js`

**Interfaces:**
- Consumes: `AppConfig` from Task 1.
- Produces: `createStorage(dataDir: string): Storage`
- Produces: `archiveSourcePhoto(inputPath, outputPath, quality): Promise<void>`
- Produces: `convertPngToWebp(pngPath, webpPath, quality): Promise<void>`
- Produces: `buildArtworkPrompt({ type, answers, conversationNotes, config }): string`
- Produces: `buildFusionPrompt({ record, config }): string`

- [ ] **Step 1: Write failing storage, image, and prompt tests**

Create tests that assert:

```js
// storage.test.js
// createStorage(temp).ensureStore() creates library.json and records dir.
// saveRecord(record) writes data/records/<id>/record.json and updates library.json.
// getRecord(id) returns the saved record.
// listLibrary() returns lightweight summaries sorted newest first.
```

```js
// imagePipeline.test.js
// write a tiny PNG with pngjs, convertPngToWebp(), assert output starts with RIFF and contains WEBP.
// archiveSourcePhoto() accepts PNG input and writes source-photo.webp.
// invalid PNG input rejects with a helpful error.
```

```js
// prompts.test.js
// painting prompt contains 中国画, selected answers, and user notes.
// calligraphy prompt contains 书法, selected answers, and user notes.
// fusion prompt contains 融合图, 雅化, 美光, original photo path, and artwork path.
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace server -- storage.test.js imagePipeline.test.js prompts.test.js`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement storage, image pipeline, and prompt assembly**

Implement `storage.js` with atomic directory creation and JSON writes. Use IDs as path segments only after validating `/^[a-z0-9-]+$/i`.

Implement `imagePipeline.js` with `sharp` for WebP conversion and `pngjs` PNG readability validation. Preserve original PNG only when caller asks; conversion output is WebP.

Implement `prompts.js` with deterministic string assembly. Use Chinese prompt templates from config and include answers as label/value lines.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace server -- storage.test.js imagePipeline.test.js prompts.test.js`

Expected: PASS.

- [ ] **Step 5: Status recording**

Do not commit. Record completed files and passing command in sub-agent report.

---

### Task 3: Codex Runner, Jobs, and API

**Files:**
- Create: `server/src/codexRunner.js`
- Create: `server/src/jobs.js`
- Create: `server/src/app.js`
- Create: `server/src/index.js`
- Test: `server/tests/codexRunner.test.js`
- Test: `server/tests/jobs.test.js`
- Test: `server/tests/app.test.js`

**Interfaces:**
- Consumes: storage, image pipeline, prompt assembly.
- Produces: `createApp(options): express.Application`
- Produces: `createJobManager({ config, storage, runner }): JobManager`
- Produces: `runCodexImageGeneration(options): Promise<{ pngPath, diagnostics }>`
- API endpoints from design spec.

- [ ] **Step 1: Write failing Codex runner and API tests**

Tests must avoid real Codex by injecting a fake runner.

Codex runner tests:

```js
// extracts latest image_generation_end PNG base64 from JSONL events.
// finds newest generated PNG under a generated_images root when events have no result.
// returns diagnostic possible_safety_block when stderr contains policy/refusal text.
```

Jobs tests:

```js
// create artwork job writes artwork.webp and record.json using fake runner PNG.
// fusion job preserves existing artwork and writes fusion.webp.
// concurrent job creation returns a locked/busy result.
// artwork failure records failed status and diagnostics.
```

API tests:

```js
// GET /api/health returns ok and public readiness fields.
// GET /api/config/public returns tabs/questions/experts without codex internals.
// POST /api/generations creates a job and eventually a record with artwork.
// GET /api/library returns the generated record.
// POST /api/records/:id/production-estimate returns expert_custom > expert_guided.
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace server -- codexRunner.test.js jobs.test.js app.test.js`

Expected: FAIL because modules/endpoints do not exist.

- [ ] **Step 3: Implement Codex runner**

Implement a runner modeled after `OtakuRoomRobot/src/codexRunner.js`:

- Build args with `exec -m <model> --enable image_generation --json`.
- Write stdout JSONL to events path and stderr to output path.
- Read PNG from latest `image_generation_end` base64 result.
- Fallback to newest new PNG in configured `generatedImagesRoot`.
- Validate PNG signature and size before returning.
- Provide `diagnoseCodexImageGeneration()` with reason, event counts, safety flag, stderr tail.

- [ ] **Step 4: Implement job manager**

Implement global generation lock. A job has:

```js
{
  id,
  recordId,
  stage: "artwork" | "fusion_render",
  status: "queued" | "running" | "succeeded" | "failed",
  error: "",
  diagnostics: null
}
```

Run stages synchronously inside API calls for MVP tests, but keep job objects and `GET /api/jobs/:id` for UI polling. Fake runner tests must be able to inject deterministic PNG generation.

- [ ] **Step 5: Implement Express API**

Implement endpoints:

- `GET /api/health`
- `GET /api/config/public`
- `GET /api/library`
- `GET /api/records/:id`
- `GET /api/records/:id/images/:kind`
- `POST /api/uploads/photo`
- `POST /api/generations`
- `POST /api/records/:id/fusion`
- `POST /api/records/:id/regenerate`
- `GET /api/jobs/:id`
- `POST /api/records/:id/favorite`
- `POST /api/records/:id/production-estimate`

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test --workspace server -- codexRunner.test.js jobs.test.js app.test.js`

Expected: PASS.

- [ ] **Step 7: Status recording**

Do not commit. Record completed files and passing command in sub-agent report.

---

### Task 4: Client Domain, l10n, and Mobile UI

**Files:**
- Create: `client/src/main.tsx`
- Create: `client/src/App.tsx`
- Create: `client/src/api.ts`
- Create: `client/src/domain.ts`
- Create: `client/src/i18n.ts`
- Create: `client/src/components/Studio.tsx`
- Create: `client/src/components/Library.tsx`
- Create: `client/src/components/Experts.tsx`
- Create: `client/src/components/ResultView.tsx`
- Create: `client/src/components/ProductionDialog.tsx`
- Create: `client/src/components/ParticleBackdrop.tsx`
- Create: `client/src/styles.css`
- Test: `client/tests/domain.test.ts`
- Test: `client/tests/i18n.test.ts`
- Test: `client/tests/app.test.tsx`

**Interfaces:**
- Consumes: `/api/config/public`, `/api/generations`, `/api/library`, `/api/records/:id/production-estimate`.
- Produces: usable React app with three tabs and mobile-first flow.

- [ ] **Step 1: Write failing client tests**

Domain tests:

```ts
// first question is work type.
// selecting painting returns only painting follow-up questions.
// selecting calligraphy returns only calligraphy follow-up questions.
// result layout mode returns "stacked" below 700px and "split" at 700px+.
```

i18n tests:

```ts
// zh-Hans tabs are 画案/藏卷/雅匠.
// zh-Hant and en have non-empty translations for the same keys.
// missing key falls back to zh-Hans.
```

App tests:

```tsx
// renders 墨起 and three tabs.
// language switch updates visible tab text.
// clicking 国画 advances the question flow.
// default suggestion "可以开始生成" appears after questions complete.
// production dialog shows 专家定制 and 专家指导.
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace client`

Expected: FAIL because client source files do not exist.

- [ ] **Step 3: Implement domain and l10n**

Load public config from API when available. For tests, export pure helpers:

- `getInitialQuestion(config)`
- `nextQuestion(config, answers)`
- `isQuestionFlowComplete(config, answers)`
- `resultLayoutForWidth(width)`
- `createTranslator(locale, dictionaries)`

- [ ] **Step 4: Implement UI**

Implement:

- Garden-scroll app shell.
- Bottom tabs `画案` / `藏卷` / `雅匠`.
- Photo upload/camera input with skip path.
- One-question-at-a-time wizard with preview panel.
- Conversation suggestion chips after completion.
- Generate button calling API.
- Result view showing artwork and optional fusion.
- Library list.
- Experts page from config.
- Production dialog with two service tiers and estimate API.
- Particle backdrop using canvas, `requestAnimationFrame`, and reduced-motion fallback.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace client`

Expected: PASS.

- [ ] **Step 6: Status recording**

Do not commit. Record completed files and passing command in sub-agent report.

---

### Task 5: End-to-End Integration, Browser Verification, and Polish

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/inkspire.spec.ts`
- Modify: `server/src/index.js`
- Modify: `server/src/app.js`
- Modify: `client/src/styles.css`
- Modify as needed: client/server integration files from earlier tasks.

**Interfaces:**
- Consumes complete server and client.
- Produces runnable local app and verified mobile browser flow.

- [ ] **Step 1: Write failing Playwright test**

Create `e2e/inkspire.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("mobile user can complete Inkspire creation flow with mocked generation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("墨起")).toBeVisible();
  await expect(page.getByRole("button", { name: "画案" })).toBeVisible();
  await page.getByRole("button", { name: "国画" }).click();
  await page.getByText("可以开始生成").click();
  await page.getByRole("button", { name: /生成/ }).click();
  await expect(page.getByText(/制作作品/)).toBeVisible({ timeout: 30000 });
  await page.getByText("制作作品").click();
  await expect(page.getByText("专家定制")).toBeVisible();
  await expect(page.getByText("专家指导")).toBeVisible();
});
```

Configure test mode so server uses a fake deterministic generator unless `INKSPIRE_REAL_CODEX=1`.

- [ ] **Step 2: Run Playwright to verify it fails**

Run: `npm run e2e`

Expected: FAIL because Playwright config and app serving integration are incomplete.

- [ ] **Step 3: Implement dev/prod serving integration**

In Express:

- Serve built client from `client/dist` when available.
- In test mode, expose deterministic fake image generation that still writes WebP records.
- Keep real Codex path as default outside test mode.

In Vite:

- Proxy `/api` to Express dev server.
- Ensure mobile layout has stable button sizes and no text overlap.

- [ ] **Step 4: Add visual and motion assertions**

Extend Playwright:

- Check particle canvas exists and has non-zero dimensions.
- Check no horizontal overflow at 390px.
- Check language switch to English changes `画案` to `Studio`.
- Check result page stacks images vertically on mobile.

- [ ] **Step 5: Run all automated tests**

Run:

```bash
npm test
npm run e2e
```

Expected: PASS.

- [ ] **Step 6: Real Codex smoke verification**

Run local app:

```bash
npm run dev
```

Then perform at least one real generation from the browser with `INKSPIRE_REAL_CODEX=1` or by running the normal server mode. Confirm:

- `data/records/<id>/artwork.webp` exists.
- UI displays the generated WebP.
- `data/library.json` includes the record.
- If a sample photo is provided, `fusion.webp` exists and displays.

- [ ] **Step 7: Status recording**

Do not commit. Record completed files, passing commands, browser URL, and any real Codex limitations in sub-agent report.

---

## Plan Self-Review

Spec coverage:

- 架构、三语 UI、三 Tab、园林卷轴视觉、分支问答、对话补充、真实生成、融合图、WebP、本机存储、专家配置、两档服务、错误处理和浏览器验证均有任务覆盖。

完整性扫描:

- 本计划没有未填内容或未定义的关键接口。

Type consistency:

- 后端任务围绕 `loadConfig`、`createStorage`、`buildArtworkPrompt`、`buildFusionPrompt`、`createJobManager`、`createApp`。
- 前端任务围绕 public config、domain helpers、React components。

Execution note:

- 用户已要求后续 plan review 自动通过，并要求使用 sub-agent 开始实现。计划完成后直接进入 subagent-driven-development，不再等待人工计划审阅。

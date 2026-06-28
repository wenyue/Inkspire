# Generation Time And Title Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 更新 Inkspire 的生成耗时显示、书法标题单行省略展示、国画雅致命名规则。

**Architecture:** 前端只负责根据现有生成会话 payload 选择 30 秒或 50 秒文案，并用 CSS 让标题按真实容器宽度单行省略。服务端仍在 `titleFromRequest()` 中生成 record/job 标题，书法保存完整正文，国画用本地确定性 helper 生成雅致标题，不新增 API 字段或异步命名流程。

**Tech Stack:** React 18 + TypeScript + Vitest/jsdom, CommonJS Node.js + node:test, Express job manager, CSS.

---

## 文件结构

- Modify: `client/src/components/GeneratingView.tsx`
  - 接收一个布尔 prop，例如 `expectsPreviewGeneration?: boolean`，选择单图或双图耗时文案。
- Modify: `client/src/App.tsx`
  - 从当前 `GenerationSession.payload.source_photo_path` 和 `operation` 推导 `expectsPreviewGeneration`，传给 `GeneratingView`。
- Modify: `client/src/i18n.ts`
  - 把 `generationLoading.estimate` 从字符串改为 `{ single, double }`，同步简体、繁体、英文文案。
- Modify: `client/src/styles.css`
  - 给藏卷标题和活跃任务摘要标题补齐单行省略样式。
- Modify: `server/src/jobs.js`
  - 增加国画标题生成 helper，并在 `titleFromRequest()` 中使用。
- Test: `client/tests/generatingView.test.tsx`
  - 覆盖单图 30 秒和双图 50 秒。
- Test: `client/tests/app.test.tsx`
  - 更新已有生成中页面断言；新增带环境图生成显示 50 秒的断言。
- Test: `client/tests/library.test.tsx`
  - 继续确认长标题完整渲染文本，CSS 省略由样式测试覆盖。
- Test: `client/tests/mobile-css.test.ts` 或新增样式断言所在的现有样式测试
  - 检查标题容器包含 `white-space: nowrap`、`overflow: hidden`、`text-overflow: ellipsis`。
- Test: `server/tests/jobs.test.js`
  - 覆盖书法完整标题、国画雅致标题和确定性。

## Task 1: 生成耗时文案

**Files:**
- Modify: `client/src/components/GeneratingView.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/i18n.ts`
- Test: `client/tests/generatingView.test.tsx`
- Test: `client/tests/app.test.tsx`

- [ ] **Step 1: 写 `GeneratingView` 失败测试**

在 `client/tests/generatingView.test.tsx` 中把 copy 改成嵌套 key，并新增双图测试：

```ts
const copy: Record<string, string> = {
  "generationLoading.estimate.single": "Usually about 30 seconds. Please wait.",
  "generationLoading.estimate.double": "Usually about 50 seconds. Please wait.",
  "generationLoading.retry": "Try again",
  "generationLoading.failedTitle": "Generation did not finish",
  "generationLoading.failedHint": "Try again, or switch to another page first.",
  "generationLoading.create.painting": "The artist is painting",
  "generationLoading.adjust.adjustDetails": "The artist is refining the new draft"
};
```

在现有 running 测试中断言 `generationLoading.estimate.single` 文案。新增：

```ts
it("shows the longer estimate when one user action will generate artwork and preview", () => {
  vi.setSystemTime(new Date("2026-06-27T10:00:10.000Z"));

  render(
    <GeneratingView
      originTab="studio"
      operation="create"
      jobId="job-create-preview"
      startedAt={new Date("2026-06-27T10:00:00.000Z").getTime()}
      status="running"
      locale="en"
      t={t}
      expectsPreviewGeneration
    />
  );

  expect(screen.getByText("Usually about 50 seconds. Please wait.")).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行失败测试**

Run: `npm test --workspace client -- generatingView.test.tsx`

Expected: FAIL，TypeScript 报 `expectsPreviewGeneration` prop 不存在，或测试找不到 50 秒文案。

- [ ] **Step 3: 实现 `GeneratingView` 文案选择**

在 `GeneratingViewProps` 增加：

```ts
  expectsPreviewGeneration?: boolean;
```

函数参数解构增加默认值：

```ts
  expectsPreviewGeneration = false
```

替换段落文案：

```tsx
const estimateKey = expectsPreviewGeneration
  ? "generationLoading.estimate.double"
  : "generationLoading.estimate.single";
```

```tsx
<p>{failed ? error || t("generationLoading.failedHint") : t(estimateKey)}</p>
```

- [ ] **Step 4: 更新 i18n 文案**

在 `client/src/i18n.ts` 三套 `generationLoading` 中把 `estimate` 改为：

```ts
estimate: {
  single: "通常约 30 秒，请稍候。",
  double: "通常约 50 秒，请稍候。"
}
```

繁体：

```ts
estimate: {
  single: "通常約 30 秒，請稍候。",
  double: "通常約 50 秒，請稍候。"
}
```

英文：

```ts
estimate: {
  single: "Usually about 30 seconds. Please wait.",
  double: "Usually about 50 seconds. Please wait."
}
```

- [ ] **Step 5: 从 `App.tsx` 传入双图标记**

在 `App.tsx` 增加 helper：

```ts
function expectsPreviewGeneration(session: GenerationSession | undefined): boolean {
  return Boolean(
    session
    && session.operation === "create"
    && session.payload.source_photo_path
  );
}
```

在 `<GeneratingView />` 上传入：

```tsx
expectsPreviewGeneration={expectsPreviewGeneration(activeTabSession)}
```

- [ ] **Step 6: 更新 App 测试断言**

把 `client/tests/app.test.tsx` 中已有 “通常约 30 秒，请稍候。” 断言保留给无环境图任务。新增或扩展带环境图创建测试，确保用户选择环境图后 loading 页显示：

```ts
expect(await screen.findByText("通常约 50 秒，请稍候。")).toBeInTheDocument();
```

已有只生成作品图、调整作品、恢复 active job 的断言仍应是 30 秒。

- [ ] **Step 7: 运行前端局部测试**

Run: `npm test --workspace client -- generatingView.test.tsx app.test.tsx`

Expected: PASS。

## Task 2: 服务端作品标题规则

**Files:**
- Modify: `server/src/jobs.js`
- Test: `server/tests/jobs.test.js`

- [ ] **Step 1: 写标题规则失败测试**

在 `server/tests/jobs.test.js` 追加三个测试：

```js
test("calligraphy title preserves the full submitted text", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: fakeRunner()
    });
    const text = "明月松间照清泉石上流竹喧归浣女莲动下渔舟";

    const { record } = await manager.createArtwork({ type: "calligraphy", answers: { text } });
    const stored = await storage.getRecord(record.id);

    assert.equal(record.title, text);
    assert.equal(stored.title, text);
  });
});
```

```js
test("painting title becomes an elegant artwork name instead of the subject category", async () => {
  await withTempStore(async (temp) => {
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner: fakeRunner()
    });

    const { job, record } = await manager.createArtwork({
      type: "painting",
      answers: {
        painting_subject: "山水",
        painting_mood: "清雅",
        painting_palette: "水墨"
      }
    });

    assert.notEqual(record.title, "山水");
    assert.notEqual(record.title, "中国画作品");
    assert.equal(job.title, record.title);
    assert.match(record.title, /云|溪|山|岫|清|泉|烟|雨/);
  });
});
```

```js
test("painting title is deterministic for the same answers", async () => {
  await withTempStore(async (temp) => {
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner: fakeRunner()
    });
    const answers = {
      painting_subject: "花鸟",
      painting_mood: "温润",
      painting_palette: "浅绛",
      painting_composition: "斗方"
    };

    const first = await manager.createArtwork({ type: "painting", answers });
    const second = await manager.createArtwork({ type: "painting", answers });

    assert.equal(first.record.title, second.record.title);
    assert.notEqual(first.record.title, "花鸟");
  });
});
```

- [ ] **Step 2: 运行失败测试**

Run: `npm test --workspace server -- jobs.test.js`

Expected: FAIL，国画标题仍为 “山水” 或 “花鸟”。

- [ ] **Step 3: 实现国画标题 helper**

在 `server/src/jobs.js` 的 `titleFromRequest()` 前加入：

```js
const DEFAULT_DECIDE_VALUES = new Set(["由墨起决定", "由墨起決定", "Let Inkspire decide"]);

const PAINTING_TITLE_POOLS = {
  "山水": ["云岫清音", "溪山入梦", "烟雨归岚", "松风远壑"],
  "花鸟": ["花影和鸣", "春枝含韵", "疏香栖羽", "晴芳入画"],
  "人物": ["高士临风", "古意风骨", "清谈入画", "松下逸思"],
  default: ["墨韵清居", "晴窗入画", "素卷含章", "清境生香"]
};
```

加入 helper：

```js
function meaningfulAnswer(value) {
  return typeof value === "string" && value.trim() && !DEFAULT_DECIDE_VALUES.has(value.trim())
    ? value.trim()
    : "";
}

function stableIndex(parts, count) {
  if (count <= 0) return 0;
  const source = parts.filter(Boolean).join("|") || "inkspire";
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(31, hash) + source.charCodeAt(index);
  }
  return Math.abs(hash) % count;
}

function paintingTitleFromAnswers(answers = {}) {
  const subject = meaningfulAnswer(answers.painting_subject);
  const mood = meaningfulAnswer(answers.painting_mood);
  const palette = meaningfulAnswer(answers.painting_palette);
  const composition = meaningfulAnswer(answers.painting_composition);
  const detail = meaningfulAnswer(answers.painting_detail);
  const pool = PAINTING_TITLE_POOLS[subject] || PAINTING_TITLE_POOLS.default;
  return pool[stableIndex([subject, mood, palette, composition, detail], pool.length)];
}
```

更新 `titleFromRequest()`：

```js
function titleFromRequest(type, answers = {}) {
  if (type === "calligraphy" && answers.text) return answers.text;
  if (type === "painting") return paintingTitleFromAnswers(answers);
  return type === "calligraphy" ? "书法作品" : "中国画作品";
}
```

- [ ] **Step 4: 运行服务端标题测试**

Run: `npm test --workspace server -- jobs.test.js`

Expected: PASS。

## Task 3: 标题单行省略样式

**Files:**
- Modify: `client/src/styles.css`
- Test: `client/tests/library.test.tsx`
- Test: `client/tests/mobile-css.test.ts`

- [ ] **Step 1: 写样式失败测试**

在 `client/tests/mobile-css.test.ts` 中加入类似断言：

```ts
it("keeps library titles to one line with ellipsis", async () => {
  const css = await readFile(resolve(process.cwd(), "src/styles.css"), "utf8");
  expect(css).toMatch(/\.library-copy\s+strong\s*{[^}]*min-width:\s*0/);
  expect(css).toMatch(/\.library-copy\s+strong\s*{[^}]*overflow:\s*hidden/);
  expect(css).toMatch(/\.library-copy\s+strong\s*{[^}]*text-overflow:\s*ellipsis/);
  expect(css).toMatch(/\.library-copy\s+strong\s*{[^}]*white-space:\s*nowrap/);
});
```

如果 `mobile-css.test.ts` 当前没有 `readFile/resolve` import，按现有文件模式补齐：

```ts
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
```

- [ ] **Step 2: 补充组件渲染测试**

在 `client/tests/library.test.tsx` 增加：

```ts
it("keeps the full calligraphy title in the rendered text", () => {
  const longTitle = "明月松间照清泉石上流竹喧归浣女莲动下渔舟";

  render(
    <Library
      records={[{
        id: "record-long-calligraphy",
        type: "calligraphy",
        title: longTitle,
        thumbnail_path: "records/record-long-calligraphy/artwork.webp",
        status: "succeeded"
      }]}
      locale="zh-Hans"
      emptyLabel="暂无作品"
      labels={labels}
    />
  );

  expect(screen.getByText(longTitle)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: new RegExp(longTitle) })).toBeInTheDocument();
});
```

- [ ] **Step 3: 运行失败测试**

Run: `npm test --workspace client -- mobile-css.test.ts library.test.tsx`

Expected: FAIL，样式断言找不到 `.library-copy strong` 的单行省略规则。

- [ ] **Step 4: 实现 CSS 单行省略**

在 `client/src/styles.css` 的 `.library-copy` 附近补：

```css
.library-copy {
  min-width: 0;
}

.library-copy strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

如果活跃任务摘要标题也缺同类样式，在对应类名附近补同一组规则，避免任务摘要长书法正文换行挤压底部导航。

- [ ] **Step 5: 运行样式和藏卷测试**

Run: `npm test --workspace client -- mobile-css.test.ts library.test.tsx`

Expected: PASS。

## Task 4: 全量相关验证

**Files:**
- No source edits.

- [ ] **Step 1: 运行服务端测试**

Run: `npm test --workspace server`

Expected: PASS。

- [ ] **Step 2: 运行前端测试**

Run: `npm test --workspace client`

Expected: PASS。

- [ ] **Step 3: 检查真实生成验证是否需要**

本次不改 `server/src/prompts.js`、`server/src/codexRunner.js` 或真实图片 pipeline。若实际 diff 仍只包含标题、前端文案和 CSS，则记录 `npm run verify:real` 未运行，理由是未改变真实 Codex 生成路径。

## 自检

- Spec 目标 1、2 由 Task 1 覆盖。
- Spec 目标 3 由 Task 3 覆盖，且 Task 2 保证书法完整标题入库。
- Spec 目标 4 由 Task 2 覆盖。
- 没有新增 API 字段、异步命名请求、生成队列改动或 prompt 改动。
- 计划未包含 git commit 步骤，因为项目规则要求未经用户明确要求不得自动提交。

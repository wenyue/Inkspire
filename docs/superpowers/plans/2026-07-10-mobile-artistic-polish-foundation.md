# Mobile Artistic Polish Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Inkspire's first mobile refinement batch reliably completable on compact phones while aligning canvas, terminology, prompts, and classic-artwork references with serious Chinese painting and calligraphy practice.

**Architecture:** Keep the React workspace responsible for mobile task visibility and terminology, and add one server-owned artwork-format module as the source of truth for generation canvas decisions. Prompt policy remains data-driven under `config/prompts/`, while the server resolves trusted classic-artwork assets from config rather than accepting client-supplied paths.

**Tech Stack:** React 18, TypeScript, CSS, Vitest/jsdom, Node.js CommonJS, Express job pipeline, Node test runner, Playwright.

---

## File responsibility map

- `client/src/components/Studio.tsx`: creation-step markup and the persistent generation action.
- `client/src/components/ResultView.tsx`: result action hierarchy.
- `client/src/components/ProductionDialog.tsx`: fixed header/body/footer dialog structure.
- `client/src/styles.css`: compact-phone layout, safe-area spacing, and sticky action surfaces.
- `client/src/i18n.ts`: UI terminology for density and calligraphy form.
- `config/questions.json`: question wording and option labels shared by client and server.
- `server/src/artworkFormat.js`: trusted format-to-orientation-and-canvas mapping.
- `server/src/sizeEstimation.js`: consumes the shared orientation mapping.
- `server/src/codexRunner.js`: honors a per-job canvas override.
- `server/src/prompts.js`: assembles structured prompt policy and classic-reference boundaries.
- `config/prompts/painting.json`: serious Chinese-painting positive and negative constraints.
- `config/prompts/calligraphy.json`: exact-text, no-fake-inscription calligraphy constraints.
- `server/src/config.js`: retains the non-public project root for trusted asset resolution.
- `server/src/jobs.js`: passes dynamic canvas and trusted classic reference images to the runner.
- `client/tests/mobile-css.test.ts`, `client/tests/app.test.tsx`, `client/tests/i18n.test.ts`: mobile and terminology regressions.
- `server/tests/artworkFormat.test.js`, `server/tests/codexRunner.test.js`, `server/tests/prompts.test.js`, `server/tests/jobs.test.js`: backend format, prompt, and reference regressions.
- `e2e/inkspire.spec.ts`: compact-phone task completion checks.

### Task 1: Keep primary mobile actions continuously reachable

**Files:**
- Modify: `client/src/components/Studio.tsx`
- Modify: `client/src/components/ResultView.tsx`
- Modify: `client/src/components/ProductionDialog.tsx`
- Modify: `client/src/styles.css`
- Test: `client/tests/app.test.tsx`
- Test: `client/tests/mobile-css.test.ts`
- Test: `e2e/inkspire.spec.ts`

- [ ] **Step 1: Write failing structural tests for persistent action regions**

Add assertions that the notes action, result actions, and production confirmation expose stable classes:

```tsx
expect(document.querySelector(".conversation-actions.mobile-action-surface")).not.toBeNull();
expect(document.querySelector(".result-actions.mobile-action-surface")).not.toBeNull();
expect(document.querySelector(".production-dialog-body")).not.toBeNull();
expect(document.querySelector(".production-dialog-footer")).not.toBeNull();
```

Add CSS contract checks:

```ts
expect(css).toMatch(/\.mobile-action-surface\s*\{[^}]*position:\s*sticky/);
expect(css).toMatch(/\.production-dialog\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto/);
expect(css).toMatch(/padding-bottom:\s*calc\([^;]*safe-area-inset-bottom/);
```

- [ ] **Step 2: Run the focused client tests and verify RED**

Run:

```bash
npm test --workspace client -- tests/mobile-css.test.ts tests/app.test.tsx
```

Expected: FAIL because the new classes and dialog regions do not exist.

- [ ] **Step 3: Add stable action-region markup**

Apply `mobile-action-surface` to the Studio and Result action containers. Split the production dialog into explicit regions:

```tsx
<section className="production-dialog" role="dialog" aria-modal="true" aria-label={title}>
  <header className="production-dialog-header">...</header>
  <div className="production-dialog-body">...</div>
  <footer className="production-dialog-footer">
    <button className="primary-action" type="button" onClick={confirmProductionIntent}>
      {confirmLabel}
    </button>
  </footer>
</section>
```

The existing success state may render its own body content, but it must retain the fixed header and must not duplicate the confirmation footer.

- [ ] **Step 4: Implement compact-phone sticky layout**

Add a reusable action surface and convert the production dialog into a three-row grid:

```css
.mobile-action-surface {
  position: sticky;
  bottom: 0;
  z-index: 3;
  margin-inline: -1px;
  padding: 10px 1px calc(2px + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, rgba(255, 250, 240, 0), #fffaf0 28%);
}

.production-dialog {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
}

.production-dialog-body {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.production-dialog-footer {
  padding-top: 10px;
  padding-bottom: env(safe-area-inset-bottom);
  background: #fffaf0;
}
```

On `max-width: 420px`, keep result actions to one column and reduce secondary-button padding without reducing the 44px touch target.

- [ ] **Step 5: Add compact Playwright assertions**

Extend the existing mobile flow with a `320×568` viewport. Assert the primary action bounding box sits fully above the bottom navigation:

```ts
const generateBox = await page.getByRole("button", { name: "生成", exact: true }).boundingBox();
const navBox = await page.locator(".bottom-tabs").boundingBox();
expect(generateBox).not.toBeNull();
expect(navBox).not.toBeNull();
expect(generateBox!.y + generateBox!.height).toBeLessThanOrEqual(navBox!.y);
```

Repeat the same relationship for “制作作品” and for the production confirmation button.

- [ ] **Step 6: Run focused tests and E2E**

Run:

```bash
npm test --workspace client -- tests/mobile-css.test.ts tests/app.test.tsx
npm run e2e -- e2e/inkspire.spec.ts --project=chromium
```

Expected: PASS with no compact-phone action overlap.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/Studio.tsx client/src/components/ResultView.tsx client/src/components/ProductionDialog.tsx client/src/styles.css client/tests/app.test.tsx client/tests/mobile-css.test.ts e2e/inkspire.spec.ts
git commit -m "fix: keep mobile creation actions reachable"
```

### Task 2: Correct density and calligraphy terminology

**Files:**
- Modify: `client/src/i18n.ts`
- Modify: `config/questions.json`
- Modify: `server/src/prompts.js`
- Test: `client/tests/i18n.test.ts`
- Test: `client/tests/app.test.tsx`
- Test: `server/tests/prompts.test.js`

- [ ] **Step 1: Write failing terminology tests**

Assert all locales express density rather than quality and calligraphy form rather than composition:

```ts
expect(translations["zh-Hans"].studio.complexityTitle).toBe("希望画面如何安排疏密？");
expect(translations["zh-Hans"].studio.complexitySmall).toBe("疏朗");
expect(translations["zh-Hans"].studio.complexityLarge).toBe("繁密");
```

Assert `config/questions.json` contains `想要哪种形制？` and `碑拓肌理` in simplified Chinese, with corresponding traditional and English wording.

- [ ] **Step 2: Run terminology tests and verify RED**

Run:

```bash
npm test --workspace client -- tests/i18n.test.ts tests/app.test.tsx
npm test --workspace server -- --test-name-pattern="prompt"
```

Expected: FAIL on the old “丰富/章法/碑拓” wording.

- [ ] **Step 3: Replace density copy in all locales**

Use these simplified-Chinese contracts:

```ts
complexityTitle: "希望画面如何安排疏密？",
complexityHint: "没有环境照片时，疏密与虚实会帮助墨起估算画面信息量和制作尺寸。",
complexitySmall: "疏朗",
complexitySmallHint: "主体集中，虚处充分，保留清楚气口。",
complexityMedium: "均衡",
complexityMediumHint: "主次明确，疏密相间。",
complexityLarge: "繁密",
complexityLargeHint: "层次丰富但仍保留虚处，不填满画面。"
```

Translate the same meaning naturally into `zh-Hant` and `en`.

- [ ] **Step 4: Correct calligraphy form and material wording**

Change the calligraphy question title to “想要哪种形制？” / “想要哪種形制？” / “Which format should it take?”. Change “碑拓” to “碑拓肌理” and the English label to “Rubbing Texture”. Update `preview_prompt` so it says `书法形制` rather than `书法章法`.

- [ ] **Step 5: Align backend density prompt copy**

Replace `GENERATION_COMPLEXITY_COPY` with:

```js
const GENERATION_COMPLEXITY_COPY = {
  small: "疏朗：主体集中，虚处充分，信息量较低。",
  medium: "均衡：主次明确，疏密相间，保留气口。",
  large: "繁密：层次丰富但仍有虚处，不以填满画面为目标。"
};
```

- [ ] **Step 6: Run focused tests and commit**

Run:

```bash
npm test --workspace client -- tests/i18n.test.ts tests/app.test.tsx
npm test --workspace server -- --test-name-pattern="prompt"
```

Expected: PASS.

```bash
git add client/src/i18n.ts config/questions.json server/src/prompts.js client/tests/i18n.test.ts client/tests/app.test.tsx server/tests/prompts.test.js
git commit -m "fix: use precise artistic terminology"
```

### Task 3: Use the selected format as the actual generation canvas

**Files:**
- Create: `server/src/artworkFormat.js`
- Create: `server/tests/artworkFormat.test.js`
- Modify: `server/src/sizeEstimation.js`
- Modify: `server/src/jobs.js`
- Modify: `server/src/codexRunner.js`
- Test: `server/tests/sizeEstimation.test.js`
- Test: `server/tests/jobs.test.js`
- Test: `server/tests/codexRunner.test.js`

- [ ] **Step 1: Write failing format-to-canvas tests**

Create table-driven tests for painting and calligraphy:

```js
assert.deepEqual(resolveArtworkCanvas({ answers: { work_type: "painting", painting_format: "横幅" } }), {
  width: 1536, height: 1024, aspectRatio: "3:2", orientation: "landscape"
});
assert.deepEqual(resolveArtworkCanvas({ answers: { work_type: "painting", painting_format: "手卷" } }), {
  width: 1536, height: 768, aspectRatio: "2:1", orientation: "landscape"
});
assert.deepEqual(resolveArtworkCanvas({ answers: { work_type: "calligraphy", calligraphy_layout: "斗方" } }), {
  width: 1024, height: 1024, aspectRatio: "1:1", orientation: "square"
});
```

Also cover 立轴, 扇面, 册页, English labels, and the default portrait fallback.

- [ ] **Step 2: Run the new server test and verify RED**

Run:

```bash
node --test server/tests/artworkFormat.test.js
```

Expected: FAIL because `server/src/artworkFormat.js` does not exist.

- [ ] **Step 3: Implement the shared format map**

Create a pure module with immutable canvas values:

```js
const CANVASES = Object.freeze({
  portrait: Object.freeze({ width: 1024, height: 1536, aspectRatio: "2:3", orientation: "portrait" }),
  landscape: Object.freeze({ width: 1536, height: 1024, aspectRatio: "3:2", orientation: "landscape" }),
  square: Object.freeze({ width: 1024, height: 1024, aspectRatio: "1:1", orientation: "square" }),
  handscroll: Object.freeze({ width: 1536, height: 768, aspectRatio: "2:1", orientation: "landscape" })
});
```

Export `orientationForArtworkFormat(value)` and `resolveArtworkCanvas({ answers, resolvedOrientation, fallbackCanvas })`. An explicit `resolvedOrientation` from user notes overrides the question format, except handscroll remains `2:1` when the resolved orientation is landscape.

- [ ] **Step 4: Reuse the orientation source in size estimation**

Replace the duplicated legacy string arrays in `server/src/sizeEstimation.js` with `orientationForArtworkFormat`. Preserve note priority and existing public return values.

- [ ] **Step 5: Pass canvas through the job runner**

Before the artwork runner call, compute:

```js
const canvas = resolveArtworkCanvas({
  answers: record.answers,
  resolvedOrientation: record.resolved_orientation,
  fallbackCanvas: config.app.runtime.generationCanvas
});
```

Pass `canvas` only for artwork render stages. In `runCodexImageGeneration`, change the prompt input to `canvas: options.canvas || runtime.generationCanvas`.

- [ ] **Step 6: Add runner regression tests**

Capture the artwork runner options in `server/tests/jobs.test.js` and assert a selected 横幅 receives `1536×1024`. In `server/tests/codexRunner.test.js`, assert an explicit square canvas produces `Target canvas: 1024x1024 pixels, 1:1 aspect ratio`.

- [ ] **Step 7: Run server tests and commit**

Run:

```bash
npm test --workspace server
```

Expected: 0 failures.

```bash
git add server/src/artworkFormat.js server/src/sizeEstimation.js server/src/jobs.js server/src/codexRunner.js server/tests/artworkFormat.test.js server/tests/sizeEstimation.test.js server/tests/jobs.test.js server/tests/codexRunner.test.js
git commit -m "feat: generate artwork in its selected format"
```

### Task 4: Replace vague and contradictory art prompt policy

**Files:**
- Modify: `config/prompts/painting.json`
- Modify: `config/prompts/calligraphy.json`
- Modify: `server/src/prompts.js`
- Test: `server/tests/prompts.test.js`

- [ ] **Step 1: Write failing prompt-policy tests**

Add assertions for painting structure and calligraphy exact text:

```js
assert.match(paintingPrompt, /构图经营/);
assert.match(paintingPrompt, /勾、皴、擦、点、染/);
assert.match(paintingPrompt, /统一暖黄仿古滤镜/);
assert.match(paintingPrompt, /默认不生成落款和印章/);

assert.match(calligraphyPrompt, /正文必须逐字使用用户输入/);
assert.match(calligraphyPrompt, /不得增删、替换或重排/);
assert.match(calligraphyPrompt, /电脑字体贴图/);
assert.match(calligraphyPrompt, /默认不生成落款和印章/);
```

Add a negative regression ensuring neither prompt says that internal signatures should be generated “按用户选择” when no signature question exists.

- [ ] **Step 2: Run prompt tests and verify RED**

Run:

```bash
node --test --test-name-pattern="prompt" server/tests/prompts.test.js
```

Expected: FAIL on missing serious-art constraints and the old signature wording.

- [ ] **Step 3: Structure the painting policy**

Add config sections named `构图经营`, `笔墨组织`, `设色与材质`, and `题款边界`. Keep positive direction first. Include this exact boundary intent:

```json
{
  "title": "题款边界",
  "lines": [
    "默认不生成落款和印章，不添加不可读装饰文字。",
    "不使用统一暖黄仿古滤镜、电影光效、3D 浮雕墨迹或无结构的廉价泼墨特效。",
    "烟云、飞白与墨色变化必须服务于构图和气韵，不能作为随机装饰。"
  ]
}
```

- [ ] **Step 4: Structure the calligraphy policy**

Add `正文准确性`, `书写语言`, `形制与纸墨`, and `题款边界` sections. The exact-text section must state that the supplied text is the only正文 and that no extra English, numbers, pseudo-characters, signatures, or seals may appear.

- [ ] **Step 5: Remove the prompt contradiction**

Change the generic artwork boundary in both configs from allowing internal 落款 to explicitly keeping paper, blank space, and ink while defaulting to no inscription and no seal.

- [ ] **Step 6: Run prompt tests and commit**

Run:

```bash
npm test --workspace server -- --test-name-pattern="prompt"
```

Expected: PASS.

```bash
git add config/prompts/painting.json config/prompts/calligraphy.json server/src/prompts.js server/tests/prompts.test.js
git commit -m "feat: enforce serious painting and calligraphy prompts"
```

### Task 5: Send the selected classic artwork to the image runner

**Files:**
- Modify: `server/src/config.js`
- Modify: `server/src/jobs.js`
- Test: `server/tests/config.test.js`
- Test: `server/tests/jobs.test.js`

- [ ] **Step 1: Write failing trusted-reference tests**

In `server/tests/config.test.js`, assert `loadConfig(root).projectRoot === root` and `publicConfig(...)` does not expose `projectRoot`.

In `server/tests/jobs.test.js`, create a temporary trusted classic asset and config record, then assert the artwork runner receives:

```js
assert.deepEqual(artworkRenderCall.referenceImages, {
  classicArtwork: path.join(projectRoot, "client", "public", "classic-artworks", "classic.webp")
});
```

Also assert a free painting has no `classicArtwork` reference and an unknown classic id cannot produce an arbitrary filesystem path.

- [ ] **Step 2: Run focused server tests and verify RED**

Run:

```bash
node --test --test-name-pattern="classic|projectRoot" server/tests/config.test.js server/tests/jobs.test.js
```

Expected: FAIL because config does not retain the project root and artwork jobs do not pass classic images.

- [ ] **Step 3: Retain a private project root**

Return the resolved root from `loadConfig`:

```js
return { projectRoot, app, experts, questions, classicArtworks, i18n, prompts };
```

Do not add it to `publicConfig`.

- [ ] **Step 4: Resolve the trusted classic asset**

In `jobs.js`, look up `answers.classic_artwork_id` in `config.classicArtworks`. Resolve only paths beginning with `/classic-artworks/` against `path.join(config.projectRoot, "client", "public")`. Normalize the result and reject any path that escapes that base. Return an empty object when the job is not a classic-reference job.

- [ ] **Step 5: Merge trusted references into artwork render options**

The artwork stage should pass:

```js
referenceImages: {
  ...classicArtworkReferenceImages(record.answers, config)
}
```

Environment photos remain inputs to size estimation and fusion only; they must not silently become artwork-style references.

- [ ] **Step 6: Run server tests and commit**

Run:

```bash
npm test --workspace server
```

Expected: 0 failures.

```bash
git add server/src/config.js server/src/jobs.js server/tests/config.test.js server/tests/jobs.test.js
git commit -m "feat: use selected classic artwork as generation reference"
```

### Task 6: Verify the foundation as one user-visible batch

**Files:**
- Modify only if verification exposes a regression in a file already owned by Tasks 1–5.

- [ ] **Step 1: Run all client and server tests**

```bash
npm test --workspace client
npm test --workspace server
```

Expected: 198 client tests plus newly added tests pass; 121 server tests plus newly added tests pass.

- [ ] **Step 2: Run Chromium E2E**

```bash
npm run e2e -- e2e/inkspire.spec.ts --project=chromium
```

Expected: all Inkspire mobile creation, result, production, navigation, and image-viewer scenarios pass.

- [ ] **Step 3: Build the client**

```bash
npm run build --workspace client
```

Expected: TypeScript and Vite exit 0 with no errors.

- [ ] **Step 4: Check formatting and unintended files**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only planned files differ from the branch base.

- [ ] **Step 5: Perform fresh mobile visual verification**

Capture and inspect `320×568` and `390×844` for Studio notes, Result, Production, classic selection, and calligraphy selection. Confirm no horizontal overflow, all primary actions remain reachable, and no newly introduced text or layout is clipped.

- [ ] **Step 6: Request final subagent review**

Dispatch one spec-compliance reviewer for this plan, then a code-quality reviewer. Resolve every Critical or Important finding and rerun the affected commands before integration.

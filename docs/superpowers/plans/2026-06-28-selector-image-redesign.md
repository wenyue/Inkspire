# 画案选择图片重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将画案选择页红区从选项图拼接改为单张高质量主视觉，并替换入口、国画、书法的蓝区选项图资产。

**Architecture:** 前端继续使用现有 `Question.preview_image` 和 `Question.option_preview_images` 数据结构。`Studio.tsx` 只负责渲染红区单图和蓝区选项图，不再从蓝区选项图派生拼接横幅；静态 WebP 资产继续放在 `client/public/previews/questions/` 和 `client/public/previews/options/`。

**Tech Stack:** React 18 + TypeScript + Vite；Vitest/jsdom；CSS；静态 WebP 资产。

---

## 项目约束

- 当前仓库规则要求没有明确请求时不执行版本提交。本计划只包含代码、资产和验证步骤。
- 资产必须是手机端优先规格：红区主图 `1024 x 576`，蓝区选项图 `320 x 240`。
- 完成后至少运行 `npm test --workspace client`。
- 如修改后需要看真实移动端布局，额外运行 `npm run e2e` 或说明未运行原因。

## 文件结构

- Modify: `client/src/components/Studio.tsx`
  - 删除 `montagePreviewImages()`。
  - 红区只渲染 `localizedPreviewImage(question, locale)` 对应的单张图片。
- Modify: `client/src/styles.css`
  - 删除 `.preview-montage`、`.montage-cell`、`.montage-tile` 相关样式。
  - 为红区单图新增 `.preview-hero-image` 样式。
- Modify: `client/tests/app.test.tsx`
  - 覆盖红区使用 `preview_image` 而不是 `option_preview_images`。
  - 保留蓝区选项图数量和路径断言。
- Modify: `client/tests/mobile-css.test.ts`
  - 更新样式测试，确认不再依赖 `.preview-montage`，红区图片不使用背景图。
- Replace assets:
  - `client/public/previews/questions/*.webp`
  - `client/public/previews/options/*.webp`

## Task 1: 写红区单图渲染测试

**Files:**
- Modify: `client/tests/app.test.tsx`

- [ ] **Step 1: 在 `App` describe 内添加失败测试**

在现有测试 `"uses localized preview copy and option images for the active locale"` 附近添加一个更明确的测试。测试应先失败，因为当前红区会渲染多张 `.montage-tile`，不会渲染 `.preview-hero-image`。

```tsx
it("renders the question preview image as one hero image instead of a stitched option montage", async () => {
  const user = userEvent.setup();
  const { container } = renderApp();

  const workTypeHero = await screen.findByRole("img", { name: "选择国画或书法创作方向" });
  expect(workTypeHero).toHaveClass("preview-hero-image");
  expect(workTypeHero).toHaveAttribute("src", "/previews/questions/work-type.webp");
  expect(container.querySelectorAll(".preview-montage")).toHaveLength(0);
  expect(container.querySelectorAll(".montage-tile")).toHaveLength(0);

  const workTypeOptionImages = [...container.querySelectorAll(".option-preview-image")]
    .map((image) => image.getAttribute("src"));
  expect(workTypeOptionImages).toEqual([
    "/previews/options/work-type-0-painting.webp",
    "/previews/options/work-type-1-calligraphy.webp"
  ]);

  await user.click(screen.getByRole("button", { name: "国画" }));

  const subjectHero = await screen.findByRole("img", { name: "想画什么主题？" });
  expect(subjectHero).toHaveClass("preview-hero-image");
  expect(subjectHero).toHaveAttribute("src", "/previews/questions/painting-subject.webp");
  expect(container.querySelectorAll(".preview-montage")).toHaveLength(0);
  expect(container.querySelectorAll(".montage-tile")).toHaveLength(0);

  const subjectOptionImages = [...container.querySelectorAll(".option-preview-image")]
    .map((image) => image.getAttribute("src"));
  expect(subjectOptionImages).toEqual([
    "/previews/options/painting-subject-0-landscape.webp",
    "/previews/options/painting-subject-1-birds-flowers.webp",
    "/previews/options/painting-subject-2-figures.webp",
    "/previews/options/painting-subject-3-inkspire-decide.webp"
  ]);
});
```

- [ ] **Step 2: 运行该测试并确认失败**

Run:

```powershell
npm test --workspace client -- app.test.tsx -t "renders the question preview image as one hero image"
```

Expected: FAIL，原因包含 `.preview-hero-image` 不存在或 `.preview-montage` 仍存在。

## Task 2: 写 CSS 约束测试

**Files:**
- Modify: `client/tests/mobile-css.test.ts`

- [ ] **Step 1: 更新图片 loading surface 测试**

把当前测试中的 `.preview-montage` 检查改为 `.preview-hero-image`。修改后的测试片段应为：

```ts
it("keeps image loading surfaces empty instead of patterned placeholders", () => {
  expect(blockFor(".preview-ink")).not.toMatch(/background:/);
  expect(blockFor(".preview-hero-image")).not.toMatch(/background:/);
  expect(blockFor(".option-preview-frame")).not.toMatch(/background:/);
  expect(blockFor(".expert-sample-frame")).not.toMatch(/background:/);
  expect(blockFor(".result-grid img,\n.image-placeholder")).not.toMatch(/background:/);
});
```

- [ ] **Step 2: 添加拼接样式删除测试**

在同一 describe 内添加：

```ts
it("does not keep stitched montage styles for question previews", () => {
  expect(css).not.toContain(".preview-montage");
  expect(css).not.toContain(".montage-cell");
  expect(css).not.toContain(".montage-tile");
});
```

- [ ] **Step 3: 运行样式测试并确认失败**

Run:

```powershell
npm test --workspace client -- mobile-css.test.ts
```

Expected: FAIL，原因是 `.preview-hero-image` 样式还不存在，且 CSS 仍包含 montage 类。

## Task 3: 修改 `Studio.tsx` 红区渲染

**Files:**
- Modify: `client/src/components/Studio.tsx`

- [ ] **Step 1: 删除 `montagePreviewImages()`**

删除整个函数：

```ts
function montagePreviewImages(question: Question, locale: Locale): string[] {
  const images = (question.option_preview_images ?? [])
    .filter((src): src is string => typeof src === "string" && src.length > 0)
    .filter((src) => !src.includes("inkspire-decide"));
  return images.length > 0 ? images : [localizedPreviewImage(question, locale)];
}
```

- [ ] **Step 2: 替换红区 JSX**

把当前红区：

```tsx
<div
  className="preview-ink"
  role="img"
  aria-label={localizedPreviewText(question, locale)}
>
  <div
    className="preview-montage"
    data-count={montagePreviewImages(question, locale).length}
    aria-hidden="true"
  >
    {montagePreviewImages(question, locale).map((src, index) => (
      <span key={`${src}-${index}`} className="montage-cell" aria-hidden="true">
        <img className="montage-tile" src={src} alt="" aria-hidden="true" />
      </span>
    ))}
  </div>
</div>
```

替换为：

```tsx
<div className="preview-ink">
  <img
    className="preview-hero-image"
    src={localizedPreviewImage(question, locale)}
    alt={localizedPreviewText(question, locale)}
  />
</div>
```

- [ ] **Step 3: 运行红区测试并确认通过**

Run:

```powershell
npm test --workspace client -- app.test.tsx -t "renders the question preview image as one hero image"
```

Expected: PASS。

## Task 4: 修改红区 CSS

**Files:**
- Modify: `client/src/styles.css`

- [ ] **Step 1: 删除 montage 样式块**

删除以下选择器对应的样式：

```css
.preview-montage { ... }
.preview-montage[data-count="1"] { ... }
.preview-montage[data-count="2"] { ... }
.preview-montage[data-count="3"] { ... }
.preview-montage[data-count="4"] { ... }
.montage-cell { ... }
.montage-tile { ... }
@media (prefers-reduced-motion: reduce) {
  .preview-montage { ... }
}
```

如果 `@keyframes previewReveal` 删除后没有其他引用，也一起删除。

- [ ] **Step 2: 添加红区单图样式**

在 `.preview-ink` 后添加：

```css
.preview-hero-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

保留 `.preview-ink` 的 `aspect-ratio`、`overflow`、阴影和响应式规则。

- [ ] **Step 3: 运行 CSS 测试并确认通过**

Run:

```powershell
npm test --workspace client -- mobile-css.test.ts
```

Expected: PASS。

## Task 5: 替换静态图片资产

**Files:**
- Replace: `client/public/previews/questions/*.webp`
- Replace: `client/public/previews/options/*.webp`

- [ ] **Step 1: 生成红区主图资产**

生成并覆盖以下红区主图，规格为 `1024 x 576` WebP，单张不超过 `180 KB`：

```text
client/public/previews/questions/work-type.webp
client/public/previews/questions/painting-subject.webp
client/public/previews/questions/painting-palette.webp
client/public/previews/questions/painting-mood.webp
client/public/previews/questions/painting-composition.webp
client/public/previews/questions/painting-detail.webp
client/public/previews/questions/calligraphy-script.webp
client/public/previews/questions/calligraphy-energy.webp
client/public/previews/questions/calligraphy-layout.webp
client/public/previews/questions/calligraphy-paper.webp
client/public/previews/questions/calligraphy-ink.webp
```

红区提示词统一约束：

```text
手机端艺术选择页主视觉，一张完整画面，不是拼贴，不是多图并排。墨起品牌气质，克制、雅致、文人审美，宣纸肌理，留白，细腻层次。避免廉价国潮、旅游纪念品山水、招牌字、江湖体、夸张飞白、过度金色、过度装饰、伪水印、伪签名、模仿具体在世艺术家。
```

- [ ] **Step 2: 生成蓝区选项图资产**

生成并覆盖所有 `client/public/previews/options/*.webp`，规格为 `320 x 240` WebP，单张不超过 `80 KB`。必须覆盖入口、国画、书法全部选项：

```text
work-type-0-painting.webp
work-type-1-calligraphy.webp
painting-subject-0-landscape.webp
painting-subject-1-birds-flowers.webp
painting-subject-2-figures.webp
painting-subject-3-inkspire-decide.webp
painting-palette-0-ink-wash.webp
painting-palette-1-blue-green.webp
painting-palette-2-light-umber.webp
painting-palette-3-inkspire-decide.webp
painting-mood-0-refined.webp
painting-mood-1-grand.webp
painting-mood-2-gentle.webp
painting-mood-3-inkspire-decide.webp
painting-composition-0-horizontal.webp
painting-composition-1-vertical.webp
painting-composition-2-square.webp
painting-composition-3-inkspire-decide.webp
painting-detail-0-sparse.webp
painting-detail-1-balanced.webp
painting-detail-2-dense.webp
painting-detail-3-inkspire-decide.webp
calligraphy-script-0-regular.webp
calligraphy-script-1-running.webp
calligraphy-script-2-cursive.webp
calligraphy-script-3-inkspire-decide.webp
calligraphy-energy-0-steady.webp
calligraphy-energy-1-lively.webp
calligraphy-energy-2-forceful.webp
calligraphy-energy-3-inkspire-decide.webp
calligraphy-layout-0-vertical.webp
calligraphy-layout-1-horizontal.webp
calligraphy-layout-2-plaque.webp
calligraphy-layout-3-inkspire-decide.webp
calligraphy-paper-0-plain-xuan.webp
calligraphy-paper-1-gold-flecked.webp
calligraphy-paper-2-antique.webp
calligraphy-paper-3-inkspire-decide.webp
calligraphy-ink-0-deep-ink.webp
calligraphy-ink-1-light-ink.webp
calligraphy-ink-2-dry-wet.webp
calligraphy-ink-3-inkspire-decide.webp
```

书法蓝区提示词必须包含：

```text
文人书房气质，碑帖气，克制章法，干净宣纸，墨色有层次，可入居室。禁止江湖体、招牌字、商业门头字、粗暴黑色大字、夸张飞白、廉价印章感、不可读乱草、模仿具体在世艺术家。
```

- [ ] **Step 3: 审计资产尺寸和体积**

Run:

```powershell
node -e "const sharp=require('sharp');const fs=require('fs');const path=require('path');(async()=>{const checks=[['client/public/previews/questions',1024,576,180*1024],['client/public/previews/options',320,240,80*1024]];let failed=false;for(const [dir,w,h,max] of checks){for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.webp'))){const full=path.join(dir,file);const meta=await sharp(full).metadata();const size=fs.statSync(full).size;if(meta.width!==w||meta.height!==h||size>max){failed=true;console.error(`${full} ${meta.width}x${meta.height} ${size} bytes`);}}}if(failed)process.exit(1);console.log('preview assets ok');})().catch(e=>{console.error(e);process.exit(1);})"
```

Expected: `preview assets ok`。

## Task 6: 全量前端验证

**Files:**
- Verify: `client/src/components/Studio.tsx`
- Verify: `client/src/styles.css`
- Verify: `client/public/previews/**`

- [ ] **Step 1: 运行前端测试**

Run:

```powershell
npm test --workspace client
```

Expected: PASS。

- [ ] **Step 2: 运行资产审计命令**

Run Task 5 Step 3 的 Node 命令。

Expected: `preview assets ok`。

- [ ] **Step 3: 手机端人工抽查**

启动本地 dev server：

```powershell
npm run dev
```

打开 `http://127.0.0.1:5173`，用手机宽度或浏览器移动端视口检查：

```text
1. 入口红区是一张完整主视觉，不是国画和书法左右拼接。
2. 国画流程每一步红区都不是拼接图。
3. 书法流程蓝区缩略图没有江湖风、招牌字、粗暴大字。
4. 短屏下红区和蓝区不遮挡标题、按钮或底部导航。
```

---

## Self-Review

- Spec coverage: 红区单图、蓝区独立选项图、书法避开江湖风、手机端尺寸、测试和人工验证均有对应任务。
- Placeholder scan: 计划不包含 TBD/TODO/待定项。
- Type consistency: 使用现有 `preview_image`、`option_preview_images`、`.option-preview-image`、`.preview-ink` 命名；新增类名统一为 `.preview-hero-image`。
- Version-control behavior: 已按项目规则省略版本提交步骤。

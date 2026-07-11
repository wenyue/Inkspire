# Unified Selector Visual System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inconsistent selector artwork with one gallery-to-album visual system, review all 45 options, reorder the painting questions, and render every mobile option image at a unified 100×75px.

**Architecture:** Keep `config/questions.json`, `Question.preview_image`, and `Question.option_preview_images` as the runtime contract. Produce static WebP assets in the existing public directories, add repository validation and contact-sheet tools, and make only the minimum Studio/CSS changes needed for question order and mobile sizing. Visual generation is sample-gated: approve one coherent scene and one complete option group before generating the remaining batches.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Playwright, Node.js 20, Sharp, static WebP assets, OpenAI image generation.

---

## File Map

- Modify `config/questions.json`: reorder painting questions while preserving IDs, localized labels, values, and asset paths.
- Modify `client/src/domain.ts`: give the classic-reference entry its own option image.
- Modify `client/src/styles.css`: use a single 100×75px option image size and 92px button height on every phone height.
- Modify `client/tests/domain.test.ts`: lock the new painting question order.
- Modify `client/tests/mobile-css.test.ts`: lock the unified mobile dimensions and removal of short-screen image shrinking.
- Modify `client/tests/app.test.tsx`: lock the third work-type image and observable question sequence.
- Modify `e2e/inkspire.spec.ts`: cover 320px and 390px flow order, image geometry, and overflow.
- Create `scripts/selector-asset-contract.mjs`: enumerate configured hero and option assets in one reusable validation boundary.
- Create `scripts/validate-selector-assets.mjs`: verify paths, WebP format, dimensions, and option/image counts.
- Create `scripts/build-selector-contact-sheet.mjs`: generate named 320×240 and 100×75 review sheets without editing source assets.
- Create `scripts/selector-asset-contract.test.mjs`: test contract extraction and validation failures with temporary fixtures.
- Modify `package.json`: expose selector validation, contact-sheet, and focused contract-test commands.
- Replace files under `client/public/previews/questions/`: unified hero scenes.
- Replace files under `client/public/previews/options/`: unified option artwork.
- Create `client/public/previews/options/work-type-2-classics.webp`: dedicated classic-reference entry artwork.

## Task 1: Lock the painting flow and classic-entry asset contract

**Files:**
- Modify: `client/tests/domain.test.ts`
- Modify: `client/tests/app.test.tsx`
- Modify: `config/questions.json`
- Modify: `client/src/domain.ts`

- [ ] **Step 1: Write the failing painting-order test**

Add this test to `client/tests/domain.test.ts`:

```ts
it("orders painting decisions from subject and format into brushwork, palette, and mood", () => {
  expect((questions as QuestionConfig["questions"]).painting.map((question) => question.id)).toEqual([
    "painting_subject",
    "painting_format",
    "painting_brushwork",
    "painting_palette",
    "painting_mood"
  ]);
});
```

- [ ] **Step 2: Write the failing classic-entry image test**

Update the work-type image assertion in `client/tests/app.test.tsx` to require these exact paths:

```ts
expect(getInitialQuestion({ questions: fallbackConfig.questions }).option_preview_images).toEqual([
  "/previews/options/work-type-0-painting.webp",
  "/previews/options/work-type-1-calligraphy.webp",
  "/previews/options/work-type-2-classics.webp"
]);
```

- [ ] **Step 3: Run the focused tests and verify both fail**

Run:

```powershell
npm test --workspace client -- --run tests/domain.test.ts tests/app.test.tsx -t "orders painting decisions|work type"
```

Expected: FAIL because `painting_format` is last and the third work-type image still points to the painting-subject hero.

- [ ] **Step 4: Reorder the existing painting question objects**

Move the complete existing `painting_format` object in `config/questions.json` directly after `painting_subject`. Do not edit the object bodies. The resulting ID order must be:

```json
[
  "painting_subject",
  "painting_format",
  "painting_brushwork",
  "painting_palette",
  "painting_mood"
]
```

- [ ] **Step 5: Give the classic entry a dedicated asset path**

Change only the third item in `WORK_TYPE_QUESTION.option_preview_images` in `client/src/domain.ts`:

```ts
option_preview_images: [
  "/previews/options/work-type-0-painting.webp",
  "/previews/options/work-type-1-calligraphy.webp",
  "/previews/options/work-type-2-classics.webp"
],
```

- [ ] **Step 6: Generate the dedicated classic-entry candidate**

Use image generation with this exact prompt and export the selected result as `client/public/previews/options/work-type-2-classics.webp` at 320×240 WebP:

```text
Create a refined museum study-table image for the “Draw from Masterworks” entry: one closed archival box, one mounted historical Chinese painting reproduction, and restrained catalog materials under soft natural side light. Warm xuan-paper white, aged dark wood, museum-grade presentation, no text labels, no pseudo-calligraphy, no seals, no collage seam. Keep every object inside a 12% safe area and make the mounted historical painting the clear focal point at 100×75.
```

Task 4 may regenerate this candidate if it does not match the approved establishing scene, but the file committed here must already satisfy the final semantic and dimension contract.

- [ ] **Step 7: Run the focused tests**

Run:

```powershell
npm test --workspace client -- --run tests/domain.test.ts tests/app.test.tsx -t "orders painting decisions|work type"
```

Expected: PASS.

- [ ] **Step 8: Commit the flow contract**

```powershell
git add config/questions.json client/src/domain.ts client/tests/domain.test.ts client/tests/app.test.tsx client/public/previews/options/work-type-2-classics.webp
git commit -m "feat: order selector decisions by viewing scale"
```

## Task 2: Make every mobile option image 100×75px

**Files:**
- Modify: `client/tests/mobile-css.test.ts`
- Modify: `client/src/styles.css`
- Modify: `e2e/inkspire.spec.ts`

- [ ] **Step 1: Write the failing CSS contract test**

Add this test to `client/tests/mobile-css.test.ts`:

```ts
it("uses one 100 by 75 option image size on every phone height", () => {
  const baseButton = blockFor(".option-grid button {");
  const baseFrame = blockFor(".option-preview-frame");
  const shortPhoneRules = css.slice(css.indexOf("@media (max-height: 740px)"));

  expect(baseButton).toContain("grid-template-columns: 100px minmax(0, 1fr)");
  expect(baseButton).toContain("gap: 12px");
  expect(baseButton).toContain("min-height: 92px");
  expect(baseFrame).toContain("width: 100px");
  expect(baseFrame).toContain("height: 75px");
  expect(shortPhoneRules).not.toMatch(/\.option-preview-frame\s*{[^}]*(?:width|height):/s);
  expect(shortPhoneRules).not.toMatch(/\.option-grid button\s*{[^}]*grid-template-columns:/s);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm test --workspace client -- --run tests/mobile-css.test.ts -t "100 by 75"
```

Expected: FAIL with the existing 76×60, 64×50, and 56×44 declarations.

- [ ] **Step 3: Implement the unified base dimensions**

Replace the base option-button and frame dimensions in `client/src/styles.css` with:

```css
.option-grid button {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  min-height: 92px;
  padding: 8px;
  text-align: left;
}

.option-preview-frame {
  position: relative;
  display: grid;
  place-items: center;
  width: 100px;
  height: 75px;
  overflow: hidden;
  border-radius: 8px;
  box-shadow: inset 0 0 0 1px rgba(48, 78, 67, 0.12);
}
```

Delete only the `grid-template-columns`, `min-height`, `width`, and `height` overrides for `.option-grid button` and `.option-preview-frame` from the `max-height: 740px` and `max-height: 640px` media queries. Keep their compact gap, padding, title, and hero-ratio rules.

- [ ] **Step 4: Add E2E geometry assertions**

In the existing 320px and 390px creation-action test in `e2e/inkspire.spec.ts`, assert:

```ts
const optionFrame = page.locator(".option-preview-frame").first();
await expect(optionFrame).toHaveCSS("width", "100px");
await expect(optionFrame).toHaveCSS("height", "75px");
await expect(page.locator(".option-grid button").first()).toHaveCSS("min-height", "92px");
expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm test --workspace client -- --run tests/mobile-css.test.ts
npm run e2e -- --project=chromium --grep "320px phone|390px phone"
```

Expected: all focused tests pass and no horizontal overflow is reported.

- [ ] **Step 6: Commit the layout change**

```powershell
git add client/src/styles.css client/tests/mobile-css.test.ts e2e/inkspire.spec.ts
git commit -m "feat: enlarge mobile selector artwork"
```

## Task 3: Add a reusable selector-asset validation contract

**Files:**
- Create: `scripts/selector-asset-contract.mjs`
- Create: `scripts/selector-asset-contract.test.mjs`
- Create: `scripts/validate-selector-assets.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing contract tests**

Create `scripts/selector-asset-contract.test.mjs` with tests that verify:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { collectSelectorAssets, validateSelectorAssetMetadata } from "./selector-asset-contract.mjs";

test("collects hero and option assets while allowing image-free script options", () => {
  const questions = {
    painting: [{ id: "subject", preview_image: "/previews/questions/subject.webp", option_preview_images: ["/previews/options/subject.webp"], options: { "zh-Hans": ["山水"] } }],
    calligraphy: [{ id: "script", options: { "zh-Hans": ["楷书"] } }]
  };
  assert.deepEqual(collectSelectorAssets(questions, ["/previews/options/work.webp"]), [
    { kind: "hero", questionId: "subject", path: "/previews/questions/subject.webp" },
    { kind: "option", questionId: "subject", optionIndex: 0, path: "/previews/options/subject.webp" },
    { kind: "option", questionId: "work_type", optionIndex: 0, path: "/previews/options/work.webp" }
  ]);
});

test("rejects wrong selector asset dimensions", () => {
  assert.throws(
    () => validateSelectorAssetMetadata({ kind: "option", path: "/bad.webp" }, { format: "webp", width: 300, height: 240 }),
    /expected 320x240/
  );
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run:

```powershell
node --test scripts/selector-asset-contract.test.mjs
```

Expected: FAIL because `selector-asset-contract.mjs` does not exist.

- [ ] **Step 3: Implement the reusable contract**

Create `scripts/selector-asset-contract.mjs` exporting:

```js
export function collectSelectorAssets(questions, workTypeOptionImages) {
  const assets = [];
  for (const branch of Object.values(questions)) {
    for (const question of branch) {
      if (typeof question.preview_image === "string") {
        assets.push({ kind: "hero", questionId: question.id, path: question.preview_image });
      }
      const optionCount = question.options?.["zh-Hans"]?.length ?? 0;
      const optionImages = question.option_preview_images ?? [];
      if (optionImages.length > 0 && optionImages.length !== optionCount) {
        throw new Error(`${question.id}: expected ${optionCount} option images, found ${optionImages.length}`);
      }
      optionImages.forEach((path, optionIndex) => assets.push({ kind: "option", questionId: question.id, optionIndex, path }));
    }
  }
  workTypeOptionImages.forEach((path, optionIndex) => assets.push({ kind: "option", questionId: "work_type", optionIndex, path }));
  return assets;
}

export function validateSelectorAssetMetadata(asset, metadata) {
  const expected = asset.kind === "hero" ? { width: 1024, height: 576 } : { width: 320, height: 240 };
  if (metadata.format !== "webp") throw new Error(`${asset.path}: expected WebP`);
  if (metadata.width !== expected.width || metadata.height !== expected.height) {
    throw new Error(`${asset.path}: expected ${expected.width}x${expected.height}, found ${metadata.width}x${metadata.height}`);
  }
}
```

- [ ] **Step 4: Implement the repository validator**

Create `scripts/validate-selector-assets.mjs` that imports `sharp`, reads `config/questions.json`, supplies the three work-type paths explicitly, resolves each `/previews/...` path under `client/public`, rejects missing files and duplicate paths assigned to different option slots, calls `validateSelectorAssetMetadata`, and prints:

```text
Validated 45 selector options: 40 visual options, 5 verified text-only script options.
```

The three work-type paths must be:

```js
const WORK_TYPE_OPTION_IMAGES = [
  "/previews/options/work-type-0-painting.webp",
  "/previews/options/work-type-1-calligraphy.webp",
  "/previews/options/work-type-2-classics.webp"
];
```

- [ ] **Step 5: Add root scripts**

Add these entries to the root `package.json` scripts object:

```json
"test:selector-assets": "node --test scripts/selector-asset-contract.test.mjs",
"validate:selector-assets": "node scripts/validate-selector-assets.mjs",
"contact-sheet:selector-assets": "node scripts/build-selector-contact-sheet.mjs"
```

- [ ] **Step 6: Run tests and validation**

Run:

```powershell
npm run test:selector-assets
npm run validate:selector-assets
```

Expected: both commands pass; the validator reports all 45 options.

- [ ] **Step 7: Commit the validation boundary**

```powershell
git add scripts/selector-asset-contract.mjs scripts/selector-asset-contract.test.mjs scripts/validate-selector-assets.mjs package.json
git commit -m "test: validate selector artwork contract"
```

## Task 4: Produce and approve the visual-system sample batch

**Files:**
- Replace: `client/public/previews/questions/work-type.webp`
- Replace: `client/public/previews/questions/painting-subject.webp`
- Replace: `client/public/previews/options/work-type-0-painting.webp`
- Replace: `client/public/previews/options/work-type-1-calligraphy.webp`
- Replace: `client/public/previews/options/work-type-2-classics.webp`
- Replace: `client/public/previews/options/painting-subject-0-landscape.webp`
- Replace: `client/public/previews/options/painting-subject-1-birds-flowers.webp`
- Replace: `client/public/previews/options/painting-subject-2-figures.webp`
- Replace: `client/public/previews/options/painting-subject-3-animals-fish.webp`
- Replace: `client/public/previews/options/painting-subject-4-studio-objects.webp`

- [ ] **Step 1: Generate the establishing hero sample**

Use image generation for `work-type.webp` with this prompt contract:

```text
Create a refined 16:9 establishing view of one quiet East Asian art museum interior. The largest scene shows a coherent gallery with a Chinese painting section and a verified-calligraphy display section, natural side light, warm xuan-paper whites, aged dark wood, restrained ink-blue gray, no gold spectacle, no tourists, no text labels, no pseudo-calligraphy, no collage seams. Keep all important displays inside the central 70% safe area so a 2:1 or 3:1 crop remains meaningful. The scene must feel scholarly and museum-grade, not a commercial guochao set.
```

Generate at high resolution, select one composition, then export exactly 1024×576 WebP.

- [ ] **Step 2: Generate the subject-gallery hero sample**

Use this prompt contract for `painting-subject.webp`:

```text
Create the next camera position inside the same museum: a medium-wide thematic gallery wall. Five physically separate mounted works suggest landscape, birds-and-flowers, a complete standing figure, animals beside water with visible fish, and studio objects. One landscape work carries about 60% visual weight, two works carry about 25%, and the remaining works are smaller but recognizable. Keep identical architecture, wood, paper color, side light, lens, and grain as the establishing scene. Do not merge the subjects into one painting. No labels, pseudo-writing, seals, collage edges, or cropped bodies.
```

Export exactly 1024×576 WebP.

- [ ] **Step 3: Generate the five subject options independently**

Generate five separate 4:3 images, never a multi-panel atlas. Apply the shared contract: warm xuan-paper ground, museum-catalog lighting, subject bounding box inside a 12% safe area, no text, no seal, no frame fragment, no neighboring image.

Use these exact semantic prompts:

```text
Landscape: one clear mountain-water composition with a pavilion focal point, readable at 100×75.
Birds and flowers: one complete bird on a flowering branch, with beak, tail, branch, and blossoms inside the safe area.
Figures: one complete standing scholar from headwear to shoes, occupying 65–75% of the image height, with only restrained rock or pine context.
Animals and fish: one coherent stream-bank scene, a complete deer or small animal on the bank and two or three visible fish in the water, connected by the shoreline, never split left/right.
Studio objects: brush, inkstone, restrained vessel, and one modest scholar's rock; the tools, not the rock, are the primary subject.
```

Export each exactly 320×240 WebP to its existing path.

- [ ] **Step 4: Generate three independent work-type options**

Create separate 320×240 catalog images:

```text
Painting: a complete mounted Chinese painting in the same museum light.
Calligraphy: a physical mounted calligraphy display with the writing area left blank for later verified-source compositing; do not generate glyphs.
Classics: a museum study table holding a closed archival box and one mounted historical painting reproduction, signaling study from masterworks without reusing the subject hero.
```

For the calligraphy option, composite a verified historical calligraphy crop after generation; do not ask image generation to render or alter the glyphs.

- [ ] **Step 5: Run sample validation**

Run:

```powershell
npm run validate:selector-assets
```

Expected: PASS with every sample at the required dimensions and paths.

- [ ] **Step 6: Inspect samples at both review sizes**

Inspect the ten sample files directly with the local image viewer at 320×240, then render the same files in the running 100×75 option frames. Reject the batch if any figure is incomplete, any neighboring strip remains, or the hero scenes do not look like the same physical museum.

- [ ] **Step 7: Commit the approved sample batch**

```powershell
git add client/public/previews/questions/work-type.webp client/public/previews/questions/painting-subject.webp client/public/previews/options/work-type-*.webp client/public/previews/options/painting-subject-*.webp
git commit -m "feat: establish unified selector art direction"
```

## Task 5: Produce the remaining painting heroes and options

**Files:**
- Replace: `client/public/previews/questions/painting-format.webp`
- Replace: `client/public/previews/questions/painting-brushwork.webp`
- Replace: `client/public/previews/questions/painting-palette.webp`
- Replace: `client/public/previews/questions/painting-mood.webp`
- Replace: all configured `painting-format-*.webp`, `painting-brushwork-*.webp`, `painting-palette-*.webp`, and `painting-mood-*.webp`

- [ ] **Step 1: Generate the four sequential hero scenes**

Generate each hero as a new camera position in the approved sample environment:

```text
Format room: real horizontal hanging work, hanging scroll, square work, handscroll, and fan displayed at truthful physical proportions; no repeated square image inside fake props.
Connoisseur's desk: four separate sheets compare meticulous gongbi, freehand xieyi, plain outline baimiao, and boneless mogu; same subject family and neutral paper.
Color album: an open sample album compares ink wash, blue-green, light umber, and rich color using the same composition and subject.
Album close-up: a continuous folding album compares refined, ethereal, grand, archaic, and luminous spatial rhythm on clearly bounded leaves.
```

Keep the approved architecture, materials, light, and grade. Export each exactly 1024×576 WebP.

- [ ] **Step 2: Generate five format options independently**

Create truthful 320×240 catalog views of horizontal, hanging scroll, square, handscroll, and fan formats. Each image must show the complete physical outline with 12% safe space. Handscroll must read horizontally; hanging scroll must read vertically; no neighboring strips or reused square insert.

- [ ] **Step 3: Generate four brushwork options independently**

Use the same subject family across all four images. Gongbi shows precise contour and layered color; xieyi shows abbreviated brush and ink modulation; baimiao shows one or two complete subjects in clean line only; mogu shows color-and-ink form without contour. Export 320×240 WebP.

- [ ] **Step 4: Generate four palette options independently**

Hold composition and subject constant. Change only the color system: ink wash, mineral blue-green, light umber, and restrained rich color. Rich color must be clearly distinct from blue-green without commercial saturation. Export 320×240 WebP.

- [ ] **Step 5: Generate five mood options independently**

Use the same landscape subject family. Refined is sparse and lucid; ethereal uses deep recession and open mist; grand uses monumental structure and layered ink; archaic uses simplified form and sober line; luminous uses clean light and clear restrained color. Export 320×240 WebP.

- [ ] **Step 6: Validate and inspect the painting batch**

Run:

```powershell
npm run validate:selector-assets
npm test --workspace client -- --run tests/domain.test.ts tests/app.test.tsx tests/mobile-css.test.ts
```

Expected: PASS. Inspect every painting option at 100×75 and reject any pair whose meaning cannot be distinguished without reading the label.

- [ ] **Step 7: Commit the painting batch**

```powershell
git add client/public/previews/questions/painting-*.webp client/public/previews/options/painting-*.webp
git commit -m "feat: unify painting selector artwork"
```

## Task 6: Produce the verified calligraphy visual batch

**Files:**
- Replace: `client/public/previews/questions/calligraphy-text.webp`
- Replace: `client/public/previews/questions/calligraphy-spirit.webp`
- Replace: `client/public/previews/questions/calligraphy-layout.webp`
- Replace: `client/public/previews/questions/calligraphy-material.webp`
- Replace: all configured `calligraphy-spirit-*.webp`, `calligraphy-layout-*.webp`, and `calligraphy-material-*.webp`
- Preserve: image-free `calligraphy_script` options and their `option_source_notes` in `config/questions.json`

- [ ] **Step 1: Freeze the verified-glyph boundary**

Before generating anything, confirm `calligraphy_script` still has no `option_preview_images` and still has five localized `option_source_notes`. Add this assertion to `client/tests/domain.test.ts`:

```ts
it("keeps script selection image-free unless verified calligraphy sources are supplied", () => {
  const script = (questions as QuestionConfig["questions"]).calligraphy.find((question) => question.id === "calligraphy_script");
  expect(script?.option_preview_images).toBeUndefined();
  expect(script?.option_source_notes).toHaveLength(5);
});
```

- [ ] **Step 2: Generate blank calligraphy hero environments**

Generate the four hero settings without glyphs: a writing room for text, a mounted-comparison wall for spirit, a truthful format display for layout, and a paper-material album for material. Match the approved museum world. Leave clean, correctly perspective-matched paper surfaces for verified-source compositing. Export base scenes at 1024×576.

- [ ] **Step 3: Composite verified historical calligraphy only**

Use museum or institutional primary-source images that correspond to the existing script source notes. Crop complete two-to-three-column passages, preserve glyph geometry, and composite them into the blank paper regions with Sharp or an image editor that does not regenerate pixels inside the glyph area. Do not use image generation after the verified calligraphy has been composited.

- [ ] **Step 4: Produce five spirit options on a controlled script baseline**

Use verified historical fragments with comparable script families and complete local章法. Express dignified, graceful, forceful, archaic, and warm through spacing, structure, stroke pressure, ink, and rhythm. Do not equate archaic with seal script, warm with cursive, or forceful with enlarged cropped characters. Export each 320×240.

- [ ] **Step 5: Produce five truthful layout options**

Create complete physical views for hanging scroll, horizontal, square, handscroll, and album. Use verified calligraphy surfaces, truthful proportions, and 12% safe space. Do not reuse one square work inside multiple prop templates. Export each 320×240.

- [ ] **Step 6: Produce four material options**

Hold calligraphy scale and crop constant while changing the surface: plain xuan, antique paper, restrained gold-flecked paper, and rubbing texture. The rubbing image must retain a visible rubbing boundary and readable字口/纹样 rather than becoming black noise. Export each 320×240.

- [ ] **Step 7: Validate and inspect the calligraphy batch**

Run:

```powershell
npm run validate:selector-assets
npm test --workspace client -- --run tests/domain.test.ts src/components/Studio.test.ts
```

Expected: PASS. Manually reject clipped glyphs, fake writing, inconsistent paper perspective, and any spirit option that is distinguishable only by changing script type.

- [ ] **Step 8: Commit the verified calligraphy batch**

```powershell
git add client/public/previews/questions/calligraphy-*.webp client/public/previews/options/calligraphy-*.webp client/tests/domain.test.ts
git commit -m "feat: unify verified calligraphy selector artwork"
```

## Task 7: Build named visual-QA contact sheets

**Files:**
- Create: `scripts/build-selector-contact-sheet.mjs`
- Modify: `scripts/selector-asset-contract.test.mjs`

- [ ] **Step 1: Add a failing contact-sheet layout test**

Extend `scripts/selector-asset-contract.test.mjs` to test an exported `contactSheetGeometry(count, tileWidth, tileHeight)` helper:

```js
test("builds five-column contact-sheet geometry", () => {
  assert.deepEqual(contactSheetGeometry(40, 320, 240), {
    columns: 5,
    rows: 8,
    width: 1680,
    height: 2240
  });
});
```

Use 16px horizontal padding and 40px label space per tile; the exact helper must account for those values and make the test expectation true.

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npm run test:selector-assets
```

Expected: FAIL because `contactSheetGeometry` is missing.

- [ ] **Step 3: Implement the contact-sheet builder**

Create `scripts/build-selector-contact-sheet.mjs` using Sharp. It must:

- collect all 40 visual option assets through `collectSelectorAssets`;
- exclude hero assets from the option sheets;
- create a five-column sheet with a UTF-8 SVG label containing `questionId`, option index, and configured Chinese option label;
- write `selector-options-320x240.webp` and `selector-options-100x75.webp` under `.runtime/selector-review/`;
- never overwrite source assets;
- print both absolute output paths.

Export `contactSheetGeometry` for the test. Keep the `.runtime/` outputs untracked.

- [ ] **Step 4: Run the contact-sheet and validation commands**

Run:

```powershell
npm run test:selector-assets
npm run validate:selector-assets
npm run contact-sheet:selector-assets
```

Expected: all commands pass and both review sheets exist under `.runtime/selector-review/`.

- [ ] **Step 5: Perform the full 45-option review**

Review the 40 visual options on both sheets and the five image-free script options in the live UI. For each option verify subject completeness, semantic accuracy, distinction from neighboring options, unified paper/light treatment, absence of atlas strips, and readability at 100×75. Reject and regenerate any failure before continuing.

- [ ] **Step 6: Commit the QA tooling**

```powershell
git add scripts/build-selector-contact-sheet.mjs scripts/selector-asset-contract.test.mjs
git commit -m "test: add selector artwork contact sheets"
```

## Task 8: Run full regression and mobile visual verification

**Files:**
- Verify: `client/tests/app.test.tsx`
- Verify: `e2e/inkspire.spec.ts`
- No production change is allowed solely to silence a stale test.

- [ ] **Step 1: Run complete client tests**

Run:

```powershell
npm test --workspace client
```

Expected: every client test passes.

- [ ] **Step 2: Run the production build**

Run:

```powershell
npm run build --workspace client
```

Expected: TypeScript checks and Vite production build pass.

- [ ] **Step 3: Run selector asset validation**

Run:

```powershell
npm run test:selector-assets
npm run validate:selector-assets
```

Expected: contract tests pass and the validator reports 45 options, 40 visual and 5 verified text-only.

- [ ] **Step 4: Run full cross-browser E2E**

Run:

```powershell
npm run e2e
```

Expected: all Chromium, Firefox, and WebKit scenarios pass, including 320px/390px geometry and no horizontal overflow.

- [ ] **Step 5: Capture the complete mobile flow**

Capture every painting step at 320×844 and 390×844, plus calligraphy spirit, layout, and material. Verify the camera progression reads as museum → wall → format room → desk → album → close-up, option images remain 100×75 on short screens, and the sticky action/navigation surfaces do not hide the last option.

- [ ] **Step 6: Restart the full development stack**

Use the project restart workflow: inspect the current 3001/5173 process trees, stop only the verified Inkspire dev trees, start server and client workspaces with `.runtime` logs, then verify `/api/health` reports `ok: true` with `codex`, `dataDirWritable`, and `webp` ready and the frontend returns HTTP 200.

## Final Acceptance Checklist

- [ ] All 45 selectable options were reviewed, not only the originally reported examples.
- [ ] All 40 visual options use the unified 320×240 source contract and 100×75 mobile display.
- [ ] Five script options remain image-free unless verified source images are explicitly supplied.
- [ ] No option asset contains a clipped body, neighboring atlas strip, arbitrary frame fragment, or misleading semantic.
- [ ] Painting order is subject → format → brushwork → palette → mood.
- [ ] Hero scenes read from the largest museum view to the closest album view.
- [ ] The 320px and 390px layouts have no horizontal overflow.
- [ ] Client tests, production build, selector validation, and full E2E pass.
- [ ] The fresh backend and frontend listeners own ports 3001 and 5173 and both health checks succeed.

# Classic Artwork Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增“古代名作”第三创作方式，用户从 100 张真实古代名作中选择参考作品后，跳过现有风格问答并直接进入上传效果图步骤。

**Architecture:** 名作选择是 Studio 内部的独立前端路径，选择完成后仍提交 `type: "painting"`。名作数据通过 `config/classic-artworks.json` 进入 server public config 和 client fallback config；生成 prompt 根据 `answers.creation_mode === "classic_reference"` 增加名作参考约束。

**Tech Stack:** React 18、TypeScript、Vite、Vitest、Express CommonJS、Node test runner、Sharp、现有 npm workspace。

---

## Project Overrides

- 不创建或切换 git worktree。
- 不自动提交 commit；每个任务末尾只检查改动范围。
- 所有设计和计划文档使用中文正文；本计划保留技能要求的英文标题头。
- 资源获取和 AI 轻度修复属于实现任务的一部分，但最终必须落到本地 `client/public/classic-artworks/` 和 `config/classic-artworks.json`。
- 100 张古代名作只选择绘画作品，不选择以书法为主体的作品。题跋、印章可以作为绘画原作的一部分保留。

## File Map

- Create: `config/classic-artworks.json`  
  100 张名作的结构化数据源。
- Create: `scripts/validate-classic-artworks.mjs`  
  校验 100 条配置、id 唯一、必填字段、图片路径存在。
- Optional create: `scripts/process-classic-artwork-assets.mjs`  
  用 Sharp 批量输出统一 WebP；需要人工/AI 先完成去框、去边、轻度修复时可跳过或只用于最终转码。
- Create directory: `client/public/classic-artworks/`  
  存放处理后的大图和缩略图。
- Modify: `server/src/config.js`  
  读取并暴露 `classicArtworks`。
- Modify: `server/tests/config.test.js`  
  覆盖 public config 和 100 条数据校验。
- Modify: `client/src/api.ts`  
  增加名作类型、fallback config import。
- Modify: `client/src/domain.ts`  
  增加第三入口、选择器临时流程值、跳过问题流判断。
- Modify: `client/src/components/Studio.tsx`  
  接入 `ClassicArtworkPicker`、选择后跳到 photo、返回状态和 draft 持久化。
- Create: `client/src/components/ClassicArtworkPicker.tsx`  
  双排瀑布流、分类筛选、详情视图、选择回调。
- Modify: `client/src/styles.css`  
  名作列表、详情、响应式布局样式。
- Modify: `client/tests/domain.test.ts`  
  覆盖第三入口和 classic reference 跳过问题流。
- Modify: `client/tests/app.test.tsx`  
  覆盖完整用户路径和生成 payload。
- Modify: `server/src/prompts.js`  
  增加名作参考 prompt 段。
- Modify: `server/tests/prompts.test.js`  
  覆盖新 prompt 约束，确认旧 prompt 不回归。

---

### Task 1: Add Classic Artwork Data Contract And Validation

**Files:**
- Create: `config/classic-artworks.json`
- Create: `scripts/validate-classic-artworks.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create the initial JSON file with schema-conformant records**

Create `config/classic-artworks.json` as a JSON array. During implementation, populate exactly 100 real records. Start with this shape and keep every record complete:

```json
[
  {
    "id": "fan-kuan-travelers-among-mountains-and-streams",
    "title": {
      "zh-Hans": "溪山行旅图",
      "zh-Hant": "谿山行旅圖",
      "en": "Travelers among Mountains and Streams"
    },
    "artist": {
      "zh-Hans": "范宽",
      "zh-Hant": "范寬",
      "en": "Fan Kuan"
    },
    "period": {
      "zh-Hans": "北宋",
      "zh-Hant": "北宋",
      "en": "Northern Song dynasty"
    },
    "region": {
      "zh-Hans": "中国",
      "zh-Hant": "中國",
      "en": "China"
    },
    "category": "山水",
    "description": {
      "zh-Hans": "北宋山水巨作，以高耸主峰、细密皴法和层层推进的空间形成沉雄气象。适合作为山体结构、笔墨层次和宏阔构图的参考。",
      "zh-Hant": "北宋山水巨作，以高聳主峰、細密皴法和層層推進的空間形成沉雄氣象。適合作為山體結構、筆墨層次和宏闊構圖的參考。",
      "en": "A monumental Northern Song landscape known for its towering central peak, layered spatial depth, and powerful brush texture."
    },
    "image": "/classic-artworks/fan-kuan-travelers-among-mountains-and-streams.webp",
    "thumbnail": "/classic-artworks/fan-kuan-travelers-among-mountains-and-streams-thumb.webp",
    "reference_focus": "参考其高远构图、山体结构、皴法层次和沉雄气象，生成新的中国画作品。",
    "source_note": "处理后图片只保留作品本体，去除扫描边和陈列背景。"
  }
]
```

- [ ] **Step 2: Write the validation script**

Create `scripts/validate-classic-artworks.mjs`:

```js
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "config", "classic-artworks.json");
const publicDir = path.join(root, "client", "public");
const requiredLocales = ["zh-Hans", "zh-Hant", "en"];
const requiredLocalizedFields = ["title", "artist", "period", "region", "description"];
const requiredStringFields = ["id", "category", "image", "thumbnail", "reference_focus", "source_note"];
const disallowedCategories = new Set(["书法", "calligraphy", "Calligraphy"]);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function readArtworks() {
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function assertLocalized(record, field) {
  const value = record[field];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${record.id || "(missing id)"}: ${field} must be a localized object`);
    return;
  }
  for (const locale of requiredLocales) {
    if (typeof value[locale] !== "string" || value[locale].trim().length === 0) {
      fail(`${record.id}: ${field}.${locale} is required`);
    }
  }
}

function assertAsset(record, field) {
  const value = record[field];
  if (typeof value !== "string" || !value.startsWith("/classic-artworks/") || !value.endsWith(".webp")) {
    fail(`${record.id}: ${field} must be a /classic-artworks/*.webp path`);
    return;
  }
  const fullPath = path.join(publicDir, value.replace(/^\//, ""));
  if (!fs.existsSync(fullPath)) {
    fail(`${record.id}: missing asset ${value}`);
  }
}

const records = readArtworks();
if (!Array.isArray(records)) {
  fail("classic-artworks.json must be an array");
} else if (records.length !== 100) {
  fail(`classic-artworks.json must contain exactly 100 records, found ${records.length}`);
}

const ids = new Set();
for (const record of records) {
  for (const field of requiredStringFields) {
    if (typeof record[field] !== "string" || record[field].trim().length === 0) {
      fail(`${record.id || "(missing id)"}: ${field} is required`);
    }
  }
  if (ids.has(record.id)) {
    fail(`duplicate artwork id: ${record.id}`);
  }
  ids.add(record.id);
  if (disallowedCategories.has(record.category)) {
    fail(`${record.id}: classic artworks must be paintings; calligraphy category is not allowed`);
  }
  for (const field of requiredLocalizedFields) {
    assertLocalized(record, field);
  }
  assertAsset(record, "image");
  assertAsset(record, "thumbnail");
}

if (!process.exitCode) {
  console.log(`Validated ${records.length} classic artworks.`);
}
```

- [ ] **Step 3: Add a root validation script**

Modify `package.json` scripts:

```json
"validate:classic-artworks": "node scripts/validate-classic-artworks.mjs"
```

Keep existing scripts unchanged.

- [ ] **Step 4: Run the validator and capture expected failure**

Run:

```bash
npm run validate:classic-artworks
```

Expected before all assets are populated: failure that reports the current count is not 100 or that asset files are missing.

- [ ] **Step 5: Check changed files**

Run:

```bash
rg -n "validate:classic-artworks|classic-artworks" package.json scripts config
```

Expected: only the new script, config file, and package script references are shown.

---

### Task 2: Curate And Prepare The 100 Artwork Assets

**Files:**
- Modify: `config/classic-artworks.json`
- Create: `client/public/classic-artworks/*.webp`
- Optional create: `scripts/process-classic-artwork-assets.mjs`

- [ ] **Step 1: Populate the 100-record manifest**

Use only ancient painting works, mostly Chinese with a smaller East Asian set. Keep the distribution near:

```text
中国古代绘画: 80
日本/朝鲜等东亚古代绘画: 20
```

Each entry must represent a real ancient painting and include complete localized fields. Use stable ids built from artist/title English slugs. Avoid museum wall photos and framed photos. Do not include works whose primary subject is calligraphy.

- [ ] **Step 2: Prepare artwork-only WebP files**

For every record, create:

```text
client/public/classic-artworks/<id>.webp
client/public/classic-artworks/<id>-thumb.webp
```

Processing rules:

```text
Remove: frame, wall, mat, display case, scan black border, unrelated background.
Preserve: full painting subject, original composition, visible brushwork, inscriptions and seals when part of the painting.
Adjust lightly: white balance, exposure, paper tone, contrast, dust and stains.
Do not: repaint content, crop the main subject, unify into a new invented style.
```

- [ ] **Step 3: Use Sharp only for final mechanical sizing when useful**

If source images are already cleaned and tone-normalized, create `scripts/process-classic-artwork-assets.mjs` only for WebP conversion and thumbnails:

```js
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sourceDir = path.join(root, "assets", "classic-artworks-cleaned");
const outputDir = path.join(root, "client", "public", "classic-artworks");

await fs.mkdir(outputDir, { recursive: true });
const files = (await fs.readdir(sourceDir)).filter((name) => /\.(png|jpe?g|webp)$/i.test(name));

for (const file of files) {
  const id = path.basename(file, path.extname(file));
  const input = path.join(sourceDir, file);
  await sharp(input)
    .rotate()
    .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 86 })
    .toFile(path.join(outputDir, `${id}.webp`));
  await sharp(input)
    .rotate()
    .resize({ width: 720, height: 720, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(path.join(outputDir, `${id}-thumb.webp`));
}

console.log(`Processed ${files.length} classic artwork assets.`);
```

Run:

```bash
node scripts/process-classic-artwork-assets.mjs
```

Expected: `Processed 100 classic artwork assets.` if one cleaned source file exists per id.

- [ ] **Step 4: Run asset validation**

Run:

```bash
npm run validate:classic-artworks
```

Expected: `Validated 100 classic artworks.`

- [ ] **Step 5: Manually inspect a representative sample**

Open at least 12 files across categories from `client/public/classic-artworks/`. Confirm:

```text
No frame or wall.
No scan black border.
Main artwork is not cropped.
Tone is visually consistent with the set.
Long scrolls and album leaves remain legible.
```

---

### Task 3: Expose Classic Artworks Through Shared Config

**Files:**
- Modify: `server/src/config.js`
- Modify: `server/tests/config.test.js`
- Modify: `client/src/api.ts`

- [ ] **Step 1: Write failing server config tests**

In `server/tests/config.test.js`, add:

```js
test("classic artworks config contains exactly 100 complete records", () => {
  const config = loadConfig();
  assert.equal(config.classicArtworks.length, 100);
  const ids = new Set();
  for (const artwork of config.classicArtworks) {
    assert.equal(typeof artwork.id, "string");
    assert.ok(artwork.id.length > 0);
    assert.ok(!ids.has(artwork.id));
    ids.add(artwork.id);
    for (const field of ["title", "artist", "period", "region", "description"]) {
      assert.ok(artwork[field]["zh-Hans"]);
      assert.ok(artwork[field]["zh-Hant"]);
      assert.ok(artwork[field].en);
    }
    assert.match(artwork.image, /^\/classic-artworks\/.+\.webp$/);
    assert.match(artwork.thumbnail, /^\/classic-artworks\/.+\.webp$/);
    assert.ok(artwork.reference_focus);
  }
});

test("public config exposes classic artworks", () => {
  const config = loadConfig();
  const publicPayload = publicConfig(config);
  assert.equal(publicPayload.classicArtworks.length, 100);
});
```

Ensure the file imports `publicConfig` if it does not already:

```js
const { loadConfig, publicConfig } = require("../src/config");
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test --workspace server -- tests/config.test.js
```

Expected: FAIL because `classicArtworks` is not loaded yet.

- [ ] **Step 3: Load and expose the data**

Modify `server/src/config.js`:

```js
const classicArtworks = requireArray(readJson(path.join(configDir, "classic-artworks.json")), "classic artworks");
```

Return it from `loadConfig()`:

```js
return { app, experts, questions, classicArtworks, i18n, prompts };
```

Expose it from `publicConfig()`:

```js
classicArtworks: config.classicArtworks,
```

- [ ] **Step 4: Add client types and fallback import**

Modify `client/src/api.ts`:

```ts
import classicArtworks from "../../config/classic-artworks.json";
```

Add interfaces near existing config types:

```ts
export interface ClassicArtwork {
  id: string;
  title: Record<string, string>;
  artist: Record<string, string>;
  period: Record<string, string>;
  region: Record<string, string>;
  category: string;
  description: Record<string, string>;
  image: string;
  thumbnail: string;
  reference_focus: string;
  source_note: string;
}
```

Extend `PublicConfig`:

```ts
classicArtworks: ClassicArtwork[];
```

Extend `fallbackConfig`:

```ts
classicArtworks: classicArtworks as ClassicArtwork[],
```

- [ ] **Step 5: Run server and client type checks**

Run:

```bash
npm test --workspace server -- tests/config.test.js
npm run build --workspace client
```

Expected: server config tests pass; client typecheck and Vite build pass.

---

### Task 4: Extend Domain Flow For The Third Entry

**Files:**
- Modify: `client/src/domain.ts`
- Modify: `client/tests/domain.test.ts`

- [ ] **Step 1: Write failing domain tests**

Add tests in `client/tests/domain.test.ts`:

```ts
it("starts with painting, calligraphy, and classic artwork choices", () => {
  const question = getInitialQuestion(config);

  expect(question.options?.["zh-Hans"]).toEqual(["国画", "书法", "古代名作"]);
  expect(question.options?.en).toEqual(["Painting", "Calligraphy", "Classic Artworks"]);
});

it("maps the third work type option to the classic reference picker", () => {
  const question = getInitialQuestion(config);

  expect(optionValueForQuestion(question, "古代名作", "zh-Hans")).toBe("classic_reference");
  expect(optionValueForQuestion(question, "Classic Artworks", "en")).toBe("classic_reference");
});

it("does not ask painting style questions while choosing a classic reference", () => {
  const answers = { work_type: "classic_reference" };

  expect(nextQuestion(config, answers)).toBeNull();
  expect(isQuestionFlowComplete(config, answers)).toBe(false);
});

it("treats a selected classic reference as a completed painting branch", () => {
  const answers = {
    work_type: "painting",
    creation_mode: "classic_reference",
    classic_artwork_id: "fan-kuan-travelers-among-mountains-and-streams"
  };

  expect(nextQuestion(config, answers)).toBeNull();
  expect(isQuestionFlowComplete(config, answers)).toBe(true);
});
```

Import `optionValueForQuestion` if needed.

- [ ] **Step 2: Run failing domain tests**

Run:

```bash
npm test --workspace client -- client/tests/domain.test.ts
```

Expected: FAIL because the third entry and classic helpers do not exist yet.

- [ ] **Step 3: Implement domain helpers**

Modify `client/src/domain.ts`:

```ts
export type WorkType = "painting" | "calligraphy";
export type WorkTypeChoice = WorkType | "classic_reference";
```

Update `WORK_TYPE_QUESTION` option previews and localized labels:

```ts
option_preview_images: [
  "/previews/options/work-type-0-painting.webp",
  "/previews/options/work-type-1-calligraphy.webp",
  "/previews/questions/painting-subject.webp"
],
preview_prompt: {
  "zh-Hans": "选择国画、书法或古代名作参考",
  "zh-Hant": "選擇國畫、書法或古代名作參考",
  en: "Preview the creation direction"
},
options: {
  "zh-Hans": ["国画", "书法", "古代名作"],
  "zh-Hant": ["國畫", "書法", "古代名作"],
  en: ["Painting", "Calligraphy", "Classic Artworks"]
}
```

Update `optionValueForQuestion()`:

```ts
if (question.id !== "work_type") {
  return option;
}

const index = question.options?.[locale]?.indexOf(option) ?? -1;
if (index === 1) return "calligraphy";
if (index === 2) return "classic_reference";
return "painting";
```

Add:

```ts
export function isChoosingClassicReference(answers: Answers): boolean {
  return answers.work_type === "classic_reference";
}

export function isClassicReferenceComplete(answers: Answers): boolean {
  return answers.work_type === "painting"
    && answers.creation_mode === "classic_reference"
    && typeof answers.classic_artwork_id === "string"
    && answers.classic_artwork_id.length > 0;
}
```

Update `nextQuestion()` before `workTypeFromAnswers()` question lookup:

```ts
if (isChoosingClassicReference(answers) || isClassicReferenceComplete(answers)) {
  return null;
}
```

Update `isQuestionFlowComplete()`:

```ts
if (isClassicReferenceComplete(answers)) {
  return true;
}
return Boolean(workTypeFromAnswers(answers)) && nextQuestion(config, answers) === null;
```

- [ ] **Step 4: Run domain tests**

Run:

```bash
npm test --workspace client -- client/tests/domain.test.ts
```

Expected: PASS.

---

### Task 5: Build The ClassicArtworkPicker Component

**Files:**
- Create: `client/src/components/ClassicArtworkPicker.tsx`
- Modify: `client/src/styles.css`
- Test through `client/tests/app.test.tsx` in Task 7

- [ ] **Step 1: Create the component**

Create `client/src/components/ClassicArtworkPicker.tsx`:

```tsx
import { ChevronLeft } from "lucide-react";
import { useMemo, useState } from "react";
import type { ClassicArtwork } from "../api";
import type { Locale } from "../domain";

interface ClassicArtworkPickerProps {
  artworks: ClassicArtwork[];
  locale: Locale;
  onBack: () => void;
  onSelect: (artwork: ClassicArtwork) => void;
}

function localizedText(value: Record<string, string>, locale: Locale): string {
  return value[locale] ?? value["zh-Hans"] ?? Object.values(value)[0] ?? "";
}

function categoryLabel(category: string, locale: Locale): string {
  if (locale === "en") {
    const labels: Record<string, string> = {
      "山水": "Landscape",
      "花鸟": "Birds and Flowers",
      "人物": "Figures",
      "佛道": "Buddhist and Daoist",
      "宫廷/风俗": "Court and Genre",
      "日本绘画": "Japanese Painting",
      "朝鲜绘画": "Korean Painting"
    };
    return labels[category] ?? category;
  }
  return category;
}

function allLabel(locale: Locale): string {
  if (locale === "en") return "All";
  if (locale === "zh-Hant") return "全部";
  return "全部";
}

function selectLabel(locale: Locale): string {
  if (locale === "en") return "Use this artwork";
  if (locale === "zh-Hant") return "選擇此作品";
  return "选择此作品";
}

function headingLabel(locale: Locale): string {
  if (locale === "en") return "Choose a classic artwork";
  if (locale === "zh-Hant") return "選擇古代名作";
  return "选择古代名作";
}

function backLabel(locale: Locale): string {
  if (locale === "en") return "Back";
  if (locale === "zh-Hant") return "上一步";
  return "上一步";
}

export default function ClassicArtworkPicker({ artworks, locale, onBack, onSelect }: ClassicArtworkPickerProps) {
  const [category, setCategory] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const categories = useMemo(
    () => Array.from(new Set(artworks.map((artwork) => artwork.category))).filter(Boolean),
    [artworks]
  );
  const visibleArtworks = category ? artworks.filter((artwork) => artwork.category === category) : artworks;
  const selected = artworks.find((artwork) => artwork.id === selectedId) ?? null;

  if (selected) {
    const title = localizedText(selected.title, locale);
    const artist = localizedText(selected.artist, locale);
    const period = localizedText(selected.period, locale);
    const region = localizedText(selected.region, locale);
    return (
      <div className="classic-picker classic-detail">
        <button className="back-action classic-back" type="button" onClick={() => setSelectedId("")}>
          <ChevronLeft aria-hidden="true" size={16} />
          {backLabel(locale)}
        </button>
        <img className="classic-detail-image" src={selected.image} alt={title} />
        <div className="classic-detail-copy">
          <p className="classic-meta">{[artist, period, region, categoryLabel(selected.category, locale)].filter(Boolean).join(" · ")}</p>
          <h2>{title}</h2>
          <p>{localizedText(selected.description, locale)}</p>
          <button className="primary-action" type="button" onClick={() => onSelect(selected)}>
            {selectLabel(locale)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="classic-picker">
      <div className="classic-picker-header">
        <button className="back-action classic-back" type="button" onClick={onBack}>
          <ChevronLeft aria-hidden="true" size={16} />
          {backLabel(locale)}
        </button>
        <h2>{headingLabel(locale)}</h2>
      </div>
      <div className="classic-category-row" aria-label={headingLabel(locale)}>
        <button type="button" aria-pressed={!category} onClick={() => setCategory("")}>
          {allLabel(locale)}
        </button>
        {categories.map((item) => (
          <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>
            {categoryLabel(item, locale)}
          </button>
        ))}
      </div>
      <div className="classic-masonry">
        {visibleArtworks.map((artwork) => {
          const title = localizedText(artwork.title, locale);
          return (
            <button key={artwork.id} className="classic-card" type="button" onClick={() => setSelectedId(artwork.id)}>
              <img src={artwork.thumbnail || artwork.image} alt={title} loading="lazy" />
              <span className="classic-card-copy">
                <strong>{title}</strong>
                <span>{localizedText(artwork.artist, locale)} · {localizedText(artwork.period, locale)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add styles**

Append focused styles to `client/src/styles.css` near Studio styles:

```css
.classic-picker {
  display: grid;
  gap: 16px;
}

.classic-picker-header {
  display: grid;
  gap: 10px;
}

.classic-back {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.classic-category-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.classic-category-row button {
  border: 1px solid rgba(61, 52, 39, 0.18);
  background: rgba(255, 255, 255, 0.72);
  color: var(--ink);
  border-radius: 999px;
  padding: 8px 12px;
  white-space: nowrap;
}

.classic-category-row button[aria-pressed="true"] {
  background: var(--ink);
  color: #fffaf0;
}

.classic-masonry {
  column-count: 2;
  column-gap: 10px;
}

.classic-card {
  width: 100%;
  break-inside: avoid;
  display: inline-grid;
  gap: 8px;
  margin: 0 0 10px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}

.classic-card img {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 6px;
  background: rgba(61, 52, 39, 0.08);
}

.classic-card-copy {
  display: grid;
  gap: 2px;
  padding: 0 2px 4px;
  font-size: 13px;
}

.classic-card-copy strong {
  font-size: 14px;
  line-height: 1.35;
}

.classic-card-copy span {
  color: var(--muted);
}

.classic-detail {
  gap: 14px;
}

.classic-detail-image {
  width: 100%;
  max-height: min(62vh, 720px);
  object-fit: contain;
  border-radius: 6px;
  background: rgba(61, 52, 39, 0.08);
}

.classic-detail-copy {
  display: grid;
  gap: 10px;
}

.classic-meta {
  color: var(--muted);
  margin: 0;
}

@media (min-width: 860px) {
  .classic-masonry {
    column-count: 3;
  }

  .classic-detail {
    grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
    align-items: start;
  }

  .classic-detail .classic-back {
    grid-column: 1 / -1;
  }
}
```

- [ ] **Step 3: Run client tests to catch syntax issues**

Run:

```bash
npm test --workspace client -- client/tests/app.test.tsx
```

Expected before Studio integration: component compiles only if not imported; this task may not affect tests until next task.

---

### Task 6: Integrate Picker Into Studio State And Navigation

**Files:**
- Modify: `client/src/components/Studio.tsx`
- Modify: `client/src/domain.ts`

- [ ] **Step 1: Import helpers and component**

Modify imports in `client/src/components/Studio.tsx`:

```ts
import ClassicArtworkPicker from "./ClassicArtworkPicker";
```

Import domain helpers:

```ts
isChoosingClassicReference,
isClassicReferenceComplete,
```

- [ ] **Step 2: Add draft field for selected detail context**

Extend `StudioDraft`:

```ts
classicArtworkDetailId?: string;
```

Add state:

```ts
const [classicArtworkDetailId, setClassicArtworkDetailId] = useState(() => readStudioDraft().classicArtworkDetailId ?? "");
```

Include it in `writeStudioDraft()` and the effect dependency list.

- [ ] **Step 3: Reset classic state when starting over**

In reset effects and `resetStudioDraft()`, add:

```ts
setClassicArtworkDetailId("");
```

- [ ] **Step 4: Add classic picker visibility**

Near other derived state:

```ts
const showClassicPicker = isChoosingClassicReference(answers);
```

Update `question` memo so the initial question does not render while choosing a classic reference:

```ts
const question = useMemo(() => {
  if (isChoosingClassicReference(answers)) {
    return null;
  }
  if (!answers.work_type) {
    return getInitialQuestion(config);
  }
  return nextQuestion(config, answers);
}, [answers, config]);
```

- [ ] **Step 5: Handle choosing the third work type**

In `answerQuestion()`, after computing `value`, preserve existing branch behavior and add:

```ts
if (question.id === "work_type" && value === "classic_reference") {
  const nextAnswers = { work_type: "classic_reference" };
  setAnswers(nextAnswers);
  setPhotoStepComplete(false);
  setGenerationComplexity(undefined);
  setComplexityStepComplete(false);
  setClassicArtworkDetailId("");
  navigate("/studio?step=classic");
  return;
}
```

Then keep the existing `nextAnswers` path for painting/calligraphy.

- [ ] **Step 6: Extend URL step parsing**

Extend `StudioStepQuery`:

```ts
| { step: "classic" }
```

Update `readStudioStepQuery()`:

```ts
if (step === "classic") {
  return { step };
}
```

Update URL effect:

```ts
if (studioStep.step === "classic") {
  setAnswers({ work_type: "classic_reference" });
  setPhotoStepComplete(false);
  setGenerationComplexity(undefined);
  setComplexityStepComplete(false);
  return;
}
```

- [ ] **Step 7: Add select handler**

Add:

```ts
const selectClassicArtwork = (artwork: PublicConfig["classicArtworks"][number]) => {
  const nextAnswers = {
    work_type: "painting",
    creation_mode: "classic_reference",
    classic_artwork_id: artwork.id,
    classic_artwork_title: localizedText(artwork.title, locale),
    classic_artwork_artist: localizedText(artwork.artist, locale),
    classic_artwork_period: localizedText(artwork.period, locale),
    classic_artwork_region: localizedText(artwork.region, locale),
    classic_artwork_category: artwork.category,
    classic_artwork_reference: artwork.reference_focus
  };
  setAnswers(nextAnswers);
  setClassicArtworkDetailId(artwork.id);
  setPhotoStepComplete(false);
  setGenerationComplexity(undefined);
  setComplexityStepComplete(false);
  setError("");
  navigate("/studio?step=photo");
};
```

- [ ] **Step 8: Render picker before normal question rendering**

Inside the main render under `.scroll-question`, before `{question ? (...) : showPhotoStep ? (...)`, add:

```tsx
{showClassicPicker ? (
  <ClassicArtworkPicker
    artworks={config.classicArtworks}
    locale={locale}
    onBack={() => {
      setAnswers({});
      setClassicArtworkDetailId("");
      navigate("/studio?step=work_type");
    }}
    onSelect={selectClassicArtwork}
  />
) : question ? (
```

Adjust the corresponding closing ternary so existing branches remain unchanged.

- [ ] **Step 9: Update go back behavior**

At the start of `goToPreviousStudioStep()`:

```ts
if (isChoosingClassicReference(answers)) {
  setAnswers({});
  setClassicArtworkDetailId("");
  setError("");
  return;
}
if (isClassicReferenceComplete(answers) && photoStepComplete) {
  setAnswers({ work_type: "classic_reference" });
  setPhotoStepComplete(false);
  setGenerationComplexity(undefined);
  setComplexityStepComplete(false);
  setError("");
  return;
}
```

Update `previousStudioStepUrlForState()` with an early branch:

```ts
if (answers.work_type === "classic_reference") {
  return "/studio?step=work_type";
}
if (answers.creation_mode === "classic_reference" && answers.classic_artwork_id && photoStepComplete) {
  return "/studio?step=classic";
}
```

- [ ] **Step 10: Ensure generation type remains painting**

No change is needed in `generate()` if `selectClassicArtwork()` rewrites `answers.work_type` to `painting`. Confirm `const type = answers.work_type as WorkType` produces `"painting"` for selected classics.

- [ ] **Step 11: Run targeted client tests**

Run:

```bash
npm test --workspace client -- client/tests/domain.test.ts client/tests/app.test.tsx
```

Expected: current app tests may fail until Task 7 updates expected two-entry assertions.

---

### Task 7: Add Frontend Regression Tests For The Full Classic Path

**Files:**
- Modify: `client/tests/app.test.tsx`
- Modify: `client/tests/domain.test.ts`

- [ ] **Step 1: Update existing tests that expect two work-type options**

In tests that expect two option images or exact labels, update expected values to include the third option:

```ts
expect(workTypeOptionImages).toEqual([
  "/previews/options/work-type-0-painting.webp",
  "/previews/options/work-type-1-calligraphy.webp",
  "/previews/questions/painting-subject.webp"
]);
```

Update visible labels:

```ts
expect(screen.getByRole("button", { name: "古代名作" })).toBeInTheDocument();
```

- [ ] **Step 2: Add a compact test config helper**

Near `publicConfig`, add two test artworks:

```ts
const classicArtworkSample = Array.from({ length: 100 }, (_, index) => ({
  id: `classic-${index + 1}`,
  title: {
    "zh-Hans": index === 0 ? "溪山行旅图" : `古画 ${index + 1}`,
    "zh-Hant": index === 0 ? "谿山行旅圖" : `古畫 ${index + 1}`,
    en: index === 0 ? "Travelers among Mountains and Streams" : `Classic Artwork ${index + 1}`
  },
  artist: {
    "zh-Hans": index === 0 ? "范宽" : "佚名",
    "zh-Hant": index === 0 ? "范寬" : "佚名",
    en: index === 0 ? "Fan Kuan" : "Anonymous"
  },
  period: {
    "zh-Hans": index === 0 ? "北宋" : "古代",
    "zh-Hant": index === 0 ? "北宋" : "古代",
    en: index === 0 ? "Northern Song" : "Ancient"
  },
  region: {
    "zh-Hans": index < 80 ? "中国" : "日本",
    "zh-Hant": index < 80 ? "中國" : "日本",
    en: index < 80 ? "China" : "Japan"
  },
  category: index < 40 ? "山水" : index < 80 ? "花鸟" : "日本绘画",
  description: {
    "zh-Hans": "用于测试的古代名作介绍，强调作品本体、构图、笔墨和气韵。",
    "zh-Hant": "用於測試的古代名作介紹，強調作品本體、構圖、筆墨和氣韻。",
    en: "Classic artwork description for tests."
  },
  image: `/classic-artworks/classic-${index + 1}.webp`,
  thumbnail: `/classic-artworks/classic-${index + 1}-thumb.webp`,
  reference_focus: "参考构图、笔墨和气韵，生成新的作品。",
  source_note: "测试数据"
}));
```

Ensure `publicConfig` includes:

```ts
classicArtworks: classicArtworkSample,
```

- [ ] **Step 3: Add full path test**

Add:

```ts
it("selects a classic artwork and jumps directly to the photo step", async () => {
  const user = userEvent.setup();
  renderApp();

  await user.click(await screen.findByRole("button", { name: "古代名作" }));

  expect(await screen.findByRole("heading", { name: "选择古代名作" })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /古画|溪山行旅图/ }).length).toBeGreaterThanOrEqual(1);

  await user.click(screen.getByRole("button", { name: /溪山行旅图/ }));

  expect(await screen.findByRole("img", { name: "溪山行旅图" })).toHaveAttribute(
    "src",
    "/classic-artworks/classic-1.webp"
  );
  expect(screen.getByText(/范宽/)).toBeInTheDocument();
  expect(screen.getByText(/用于测试的古代名作介绍/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "选择此作品" }));

  expect(await screen.findByText("上传空间照片")).toBeInTheDocument();
  expect(screen.getByLabelText("相册")).toBeInTheDocument();
  expect(screen.queryByText("想画什么内容？")).not.toBeInTheDocument();
  expect(screen.queryByText("偏好哪种笔墨？")).not.toBeInTheDocument();
});
```

Use the exact photo heading from current `config/i18n/zh-Hans.json`; if it is not `上传空间照片`, replace with the current `studio.photo` value.

- [ ] **Step 4: Add generation payload test**

Add:

```ts
it("submits classic artwork generation as painting with classic reference answers", async () => {
  const user = userEvent.setup();
  renderApp();

  await user.click(await screen.findByRole("button", { name: "古代名作" }));
  await user.click(await screen.findByRole("button", { name: /溪山行旅图/ }));
  await user.click(await screen.findByRole("button", { name: "选择此作品" }));
  await user.click(screen.getByRole("button", { name: "不需要效果图，直接生成" }));
  await user.click(screen.getByRole("button", { name: /均衡/ }));
  await user.click(screen.getByRole("button", { name: "生成" }));

  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith("/api/generations", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"type\":\"painting\"")
    }));
  });

  const body = generationRequestBodies()[0];
  expect(body.type).toBe("painting");
  expect(body.answers).toMatchObject({
    work_type: "painting",
    creation_mode: "classic_reference",
    classic_artwork_id: "classic-1",
    classic_artwork_title: "溪山行旅图",
    classic_artwork_artist: "范宽"
  });
});
```

- [ ] **Step 5: Add back behavior test**

Add:

```ts
it("can go back from the classic photo step to the classic picker", async () => {
  const user = userEvent.setup();
  renderApp();

  await user.click(await screen.findByRole("button", { name: "古代名作" }));
  await user.click(await screen.findByRole("button", { name: /溪山行旅图/ }));
  await user.click(await screen.findByRole("button", { name: "选择此作品" }));

  expect(await screen.findByLabelText("相册")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "上一步" }));

  expect(await screen.findByRole("heading", { name: "选择古代名作" })).toBeInTheDocument();
});
```

- [ ] **Step 6: Run app tests**

Run:

```bash
npm test --workspace client -- client/tests/app.test.tsx
```

Expected: PASS.

---

### Task 8: Add Classic Reference Prompt Support

**Files:**
- Modify: `server/src/prompts.js`
- Modify: `server/tests/prompts.test.js`

- [ ] **Step 1: Write failing prompt test**

Add to `server/tests/prompts.test.js`:

```js
test("classic reference prompt asks for a new artwork without frames or direct copying", () => {
  const prompt = buildArtworkPrompt({
    type: "painting",
    answers: {
      work_type: "painting",
      creation_mode: "classic_reference",
      classic_artwork_title: "溪山行旅图",
      classic_artwork_artist: "范宽",
      classic_artwork_period: "北宋",
      classic_artwork_region: "中国",
      classic_artwork_category: "山水",
      classic_artwork_reference: "参考其高远构图、山体结构、皴法层次和沉雄气象。"
    },
    conversationNotes: "",
    generationComplexity: "medium",
    config
  });

  assert.match(prompt, /古代名作参考/);
  assert.match(prompt, /溪山行旅图/);
  assert.match(prompt, /范宽/);
  assert.match(prompt, /生成一幅新的/);
  assert.match(prompt, /不直接复制原作/);
  assert.match(prompt, /不要画框、展墙、相框、博物馆陈列背景/);
});
```

- [ ] **Step 2: Run failing server prompt test**

Run:

```bash
npm test --workspace server -- tests/prompts.test.js
```

Expected: FAIL because prompt builder does not output classic reference section yet.

- [ ] **Step 3: Add helper functions**

Modify `server/src/prompts.js`:

```js
function isClassicReference(answers = {}) {
  return answers.creation_mode === "classic_reference" && answers.classic_artwork_id;
}

function classicReferenceLines(answers = {}) {
  if (!isClassicReference(answers)) return [];
  return compactLines([
    "古代名作参考:",
    `参考作品: ${answers.classic_artwork_title || "未指定"}`,
    `作者: ${answers.classic_artwork_artist || "未指定"}`,
    `年代: ${answers.classic_artwork_period || "未指定"}`,
    `地域: ${answers.classic_artwork_region || "未指定"}`,
    `分类: ${answers.classic_artwork_category || "未指定"}`,
    answers.classic_artwork_reference ? `参考重点: ${answers.classic_artwork_reference}` : "",
    "请参考该绘画作品的构图、笔墨、设色、气韵与空间关系，生成一幅新的 Inkspire 中国画或东亚绘画作品。",
    "不直接复制原作，不照搬题跋印章，不把原作图片贴入画面。",
    "只生成作品本身，不要画框、展墙、相框、博物馆陈列背景。"
  ]);
}
```

In `buildArtworkPrompt()`, insert after `"用户选择:"` and `...answerLines(...)` or immediately before it:

```js
...classicReferenceLines(answers),
```

- [ ] **Step 4: Run prompt tests**

Run:

```bash
npm test --workspace server -- tests/prompts.test.js
```

Expected: PASS.

---

### Task 9: Full Verification

**Files:**
- No new files unless failures require focused fixes.

- [ ] **Step 1: Validate assets**

Run:

```bash
npm run validate:classic-artworks
```

Expected: `Validated 100 classic artworks.`

- [ ] **Step 2: Run frontend tests**

Run:

```bash
npm test --workspace client
```

Expected: PASS.

- [ ] **Step 3: Run server tests**

Run:

```bash
npm test --workspace server
```

Expected: PASS.

- [ ] **Step 4: Run e2e because this changes navigation and responsive user flow**

Run:

```bash
npm run e2e
```

Expected: PASS. If this is skipped because the environment lacks browser dependencies, record the exact error and keep client/server test results in the final report.

- [ ] **Step 5: Manual UI check**

Start the dev stack:

```bash
npm run dev
```

Open the Vite URL and verify:

```text
Studio first step shows 国画 / 书法 / 古代名作.
古代名作 opens a double-column masonry-like picker on mobile width.
Cards show painting-only artwork images without frame/wall/background.
Detail view shows a full artwork image, metadata, description, and 选择此作品.
Selecting jumps to the upload photo step.
Skipping photo and generating sends type painting with classic reference answers.
```

- [ ] **Step 6: Check changed file scope**

Run:

```bash
git status --short
```

Expected: changed files are limited to config/data/assets, Studio frontend flow, prompt support, tests, scripts, and the design/plan docs. Do not commit automatically.

---

## Self-Review Notes

- Spec coverage: the plan covers the third entry, 100 real painting records, artwork-only local images, light tone normalization, picker UI, direct jump to photo, generation as painting, prompt constraints, and verification.
- No placeholders: tasks avoid open placeholder steps; the only broad work is curation of 100 real painting works, which is the required content task rather than a code placeholder.
- Type consistency: `classic_reference` is a temporary frontend work-type choice before selection; after selection, generation payload uses `type: "painting"` and `answers.work_type: "painting"` with `answers.creation_mode: "classic_reference"`.

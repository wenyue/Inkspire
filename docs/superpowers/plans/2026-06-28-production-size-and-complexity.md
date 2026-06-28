# 作品复杂度与制作参考尺寸 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Inkspire 增加独立的作品生成复杂度、基于环境图片的 AI 制作参考尺寸估算，以及无环境图片时基于作品比例的推荐尺寸预填。

**Architecture:** 后端新增尺寸与方向估算模块，`generation_complexity` 作为独立字段贯穿 API、record、job、prompt 和前端 session。前端 Studio 在无环境图片分支增加复杂度选择页；制作弹窗只消费 `record.recommended_artwork_size`，并按作品比例动态生成尺寸预设。

**Tech Stack:** React 18 + TypeScript + Vite + Vitest；Node.js CommonJS + Express + node:test + supertest；`sharp` 用于图片尺寸读取；现有 Codex runner 用于 AI 图像/估算能力。

---

## 文件结构

- 创建 `server/src/sizeEstimation.js`
  - 负责复杂度规范化、方向解析、尺寸规范化、无环境图尺寸计算、AI 环境估算 fallback。
- 修改 `server/src/prompts.js`
  - 作品图 prompt 增加独立复杂度和最终方向段落。
  - AI 效果图 prompt 增加制作参考尺寸段落。
  - 增加环境估算 prompt 构建函数。
- 修改 `server/src/jobs.js`
  - record/job 克隆保留 `generation_complexity`、方向字段和推荐尺寸。
  - 创建作品任务前处理环境估算或保存用户选择复杂度。
  - 作品图成功后在无环境图流程计算 `recommended_artwork_size`。
  - 新环境图效果图任务前重新估算尺寸。
- 修改 `server/src/app.js`
  - `/api/generations` 读取 `generation_complexity`。
  - `/api/records/:id/fusion` 保持接口简单，估算逻辑在 job 层完成。
- 修改 `client/src/api.ts`
  - 增加 `GenerationComplexity`、record/payload/session 类型字段。
- 修改 `client/src/generationSession.ts`
  - session payload 持久化 `generation_complexity`。
- 修改 `client/src/components/Studio.tsx`
  - 无环境图分支增加复杂度选择 step。
  - 复杂度进入 draft、URL/back、generate payload。
- 修改 `client/src/components/ProductionDialog.tsx`
  - 尺寸 preset 从当前作品比例动态生成。
  - `size.reason` 优先显示。
- 修改 `client/src/i18n.ts`
  - 增加复杂度选择页文案。
- 修改测试：
  - `server/tests/sizeEstimation.test.js`
  - `server/tests/prompts.test.js`
  - `server/tests/jobs.test.js`
  - `server/tests/app.test.js`
  - `client/tests/generationSession.test.ts`
  - `client/tests/app.test.tsx`
  - `e2e/inkspire.spec.ts`

---

### Task 1: 后端尺寸估算核心模块

**Files:**
- Create: `server/src/sizeEstimation.js`
- Test: `server/tests/sizeEstimation.test.js`

- [ ] **Step 1: 写失败测试，覆盖复杂度、方向、尺寸计算**

创建 `server/tests/sizeEstimation.test.js`：

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeGenerationComplexity,
  resolveOrientation,
  sizeFromComplexityAndAspectRatio,
  normalizeArtworkSizeCandidate
} = require("../src/sizeEstimation");

test("normalizes generation complexity with medium fallback", () => {
  assert.equal(normalizeGenerationComplexity("small"), "small");
  assert.equal(normalizeGenerationComplexity("medium"), "medium");
  assert.equal(normalizeGenerationComplexity("large"), "large");
  assert.equal(normalizeGenerationComplexity("huge"), "medium");
  assert.equal(normalizeGenerationComplexity(undefined), "medium");
});

test("resolves orientation from notes before question answers", () => {
  assert.deepEqual(
    resolveOrientation({
      answers: { work_type: "painting", painting_composition: "横幅" },
      conversationNotes: "最后改成竖幅，更适合挂起来"
    }),
    { orientation: "portrait", source: "notes" }
  );
});

test("maps configured question orientation answers without treating subject Landscape as orientation", () => {
  assert.deepEqual(
    resolveOrientation({
      answers: { work_type: "painting", painting_subject: "Landscape", painting_composition_orientation: "unknown" },
      conversationNotes: ""
    }),
    { orientation: "portrait", source: "default" }
  );
  assert.deepEqual(
    resolveOrientation({
      answers: { work_type: "calligraphy", calligraphy_layout: { id: "plaque" } },
      conversationNotes: ""
    }),
    { orientation: "landscape", source: "question" }
  );
});

test("does not accept negated orientation phrases as positive intent", () => {
  assert.deepEqual(
    resolveOrientation({
      answers: { work_type: "painting", painting_composition: "竖幅" },
      conversationNotes: "不要横幅"
    }),
    { orientation: "portrait", source: "question" }
  );
});

test("computes production size from target area and aspect ratio", () => {
  assert.deepEqual(
    sizeFromComplexityAndAspectRatio({
      generationComplexity: "medium",
      aspectRatio: 2 / 3,
      orientation: "portrait"
    }),
    {
      preset_id: "complexity_medium",
      label: "均衡参考尺寸",
      width_cm: 45,
      height_cm: 70,
      reason: "按作品复杂度和画面比例估算，适合作为均衡作品制作参考。"
    }
  );
});

test("keeps square sizes square and rounds to 5cm", () => {
  const size = sizeFromComplexityAndAspectRatio({
    generationComplexity: "medium",
    aspectRatio: 1.05,
    orientation: "square"
  });
  assert.equal(size.width_cm, size.height_cm);
  assert.equal(size.width_cm % 5, 0);
});

test("normalizes and enforces AI artwork size orientation", () => {
  const normalized = normalizeArtworkSizeCandidate({
    preset_id: "ai_scene",
    label: "环境估算",
    width_cm: 80,
    height_cm: 45,
    reason: "按客厅墙面估算"
  }, "portrait");
  assert.deepEqual(normalized, {
    preset_id: "ai_scene",
    label: "环境估算",
    width_cm: 45,
    height_cm: 80,
    reason: "按客厅墙面估算"
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test --workspace server -- sizeEstimation.test.js`

Expected: FAIL，错误包含 `Cannot find module '../src/sizeEstimation'`。

- [ ] **Step 3: 实现 `server/src/sizeEstimation.js`**

```js
const COMPLEXITIES = new Set(["small", "medium", "large"]);
const TARGET_AREAS = {
  small: 30 * 45,
  medium: 45 * 68,
  large: 60 * 90
};
const LABELS = {
  small: "简洁参考尺寸",
  medium: "均衡参考尺寸",
  large: "丰富参考尺寸"
};
const REASONS = {
  small: "按作品复杂度和画面比例估算，适合作为简洁作品制作参考。",
  medium: "按作品复杂度和画面比例估算，适合作为均衡作品制作参考。",
  large: "按作品复杂度和画面比例估算，适合作为丰富作品制作参考。"
};

function normalizeGenerationComplexity(value) {
  return COMPLEXITIES.has(value) ? value : "medium";
}

function hasNegationNear(text, index) {
  const start = Math.max(0, index - 8);
  const prefix = text.slice(start, index).toLowerCase();
  return /不要|别|不要做成|不想要|no\s+$|not\s+$/.test(prefix);
}

function noteOrientation(notes = "") {
  const checks = [
    { orientation: "portrait", patterns: [/竖幅/g, /竖向/g, /vertical format/gi, /portrait orientation/gi] },
    { orientation: "landscape", patterns: [/横幅/g, /横向/g, /horizontal format/gi, /landscape orientation/gi] },
    { orientation: "square", patterns: [/斗方/g, /方形/g, /square format/gi] }
  ];
  for (const check of checks) {
    for (const pattern of check.patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(notes);
      if (match && !hasNegationNear(notes, match.index)) {
        return check.orientation;
      }
    }
  }
  return "unknown";
}

function answerOrientation(answers = {}) {
  if (answers.work_type === "painting") {
    const value = answers.painting_composition;
    if (["横幅", "橫幅", "Horizontal"].includes(value)) return "landscape";
    if (["竖幅", "豎幅", "Vertical"].includes(value)) return "portrait";
    if (["斗方", "Square"].includes(value)) return "square";
    return "unknown";
  }
  if (answers.work_type === "calligraphy") {
    const value = answers.calligraphy_layout;
    if (["竖排", "豎排", "Vertical"].includes(value)) return "portrait";
    if (["横排", "橫排", "Horizontal", "匾额", "匾額", "Plaque"].includes(value)) return "landscape";
  }
  return "unknown";
}

function resolveOrientation({ answers = {}, conversationNotes = "", aspectRatio = 0 } = {}) {
  const fromNotes = noteOrientation(conversationNotes);
  if (fromNotes !== "unknown") return { orientation: fromNotes, source: "notes" };
  const fromQuestion = answerOrientation(answers);
  if (fromQuestion !== "unknown") return { orientation: fromQuestion, source: "question" };
  if (Number.isFinite(aspectRatio) && aspectRatio > 0) {
    if (aspectRatio > 1.1) return { orientation: "landscape", source: "artwork_aspect" };
    if (aspectRatio < 0.9) return { orientation: "portrait", source: "artwork_aspect" };
    return { orientation: "square", source: "artwork_aspect" };
  }
  return { orientation: "portrait", source: "default" };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundToFive(value) {
  return Math.max(5, Math.round(value / 5) * 5);
}

function ratioForOrientation(aspectRatio, orientation) {
  let ratio = Number(aspectRatio);
  if (!Number.isFinite(ratio) || ratio <= 0) ratio = 2 / 3;
  if (orientation === "square") return 1;
  if (orientation === "portrait") {
    if (ratio > 1) ratio = 1 / ratio;
    return clamp(ratio, 0.45, 0.9);
  }
  if (orientation === "landscape") {
    if (ratio < 1) ratio = 1 / ratio;
    return clamp(ratio, 1.1, 2.2);
  }
  return clamp(ratio, 0.45, 2.2);
}

function sizeFromComplexityAndAspectRatio({ generationComplexity = "medium", aspectRatio = 2 / 3, orientation = "unknown" } = {}) {
  const complexity = normalizeGenerationComplexity(generationComplexity);
  const ratio = ratioForOrientation(aspectRatio, orientation);
  const area = TARGET_AREAS[complexity];
  let height = Math.sqrt(area / ratio);
  let width = height * ratio;
  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);
  if (shortSide < 25) {
    const scale = 25 / shortSide;
    width *= scale;
    height *= scale;
  }
  if (Math.max(width, height) > 120) {
    const scale = 120 / Math.max(width, height);
    width *= scale;
    height *= scale;
  }
  let widthCm = roundToFive(width);
  let heightCm = roundToFive(height);
  if (orientation === "portrait" && widthCm >= heightCm) heightCm = widthCm + 5;
  if (orientation === "landscape" && heightCm >= widthCm) widthCm = heightCm + 5;
  if (orientation === "square") {
    const side = roundToFive((widthCm + heightCm) / 2);
    widthCm = side;
    heightCm = side;
  }
  return {
    preset_id: `complexity_${complexity}`,
    label: LABELS[complexity],
    width_cm: widthCm,
    height_cm: heightCm,
    reason: REASONS[complexity]
  };
}

function normalizeArtworkSizeCandidate(value, orientation = "unknown") {
  if (!value || typeof value !== "object") return null;
  const width = Number(value.width_cm);
  const height = Number(value.height_cm);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 300 || height > 300) {
    return null;
  }
  const normalized = {
    preset_id: typeof value.preset_id === "string" && value.preset_id ? value.preset_id : "ai_scene",
    label: typeof value.label === "string" && value.label ? value.label : "环境估算尺寸",
    width_cm: roundToFive(width),
    height_cm: roundToFive(height),
    ...(typeof value.reason === "string" && value.reason ? { reason: value.reason } : {})
  };
  return enforceArtworkSizeOrientation(normalized, orientation);
}

function enforceArtworkSizeOrientation(size, orientation) {
  if (!size) return null;
  const next = { ...size };
  if (orientation === "portrait" && next.width_cm > next.height_cm) {
    [next.width_cm, next.height_cm] = [next.height_cm, next.width_cm];
  } else if (orientation === "portrait" && next.width_cm === next.height_cm) {
    if (next.height_cm < 300) next.height_cm += 5;
    else next.width_cm -= 5;
  } else if (orientation === "landscape" && next.height_cm > next.width_cm) {
    [next.width_cm, next.height_cm] = [next.height_cm, next.width_cm];
  } else if (orientation === "landscape" && next.height_cm === next.width_cm) {
    if (next.width_cm < 300) next.width_cm += 5;
    else next.height_cm -= 5;
  } else if (orientation === "square") {
    const side = roundToFive((next.width_cm + next.height_cm) / 2);
    next.width_cm = side;
    next.height_cm = side;
  }
  return next;
}

module.exports = {
  normalizeGenerationComplexity,
  resolveOrientation,
  sizeFromComplexityAndAspectRatio,
  normalizeArtworkSizeCandidate,
  enforceArtworkSizeOrientation
};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test --workspace server -- sizeEstimation.test.js`

Expected: PASS。

- [ ] **Step 5: checkpoint**

不要提交 git commit。本仓库规则禁止自动 commit。记录本任务改动文件：

```text
server/src/sizeEstimation.js
server/tests/sizeEstimation.test.js
```

---

### Task 2: API 类型和前端 session 持久化

**Files:**
- Modify: `client/src/api.ts`
- Modify: `client/src/generationSession.ts`
- Test: `client/tests/generationSession.test.ts`

- [ ] **Step 1: 写失败测试，验证 session 保存复杂度**

在 `client/tests/generationSession.test.ts` 的 `preserves valid payload fields and removes unknown nested fields` 用例中加入 `generation_complexity: "large"`，并在期望 payload 中加入同字段。新增一个非法字段用例：

```ts
{ generation_complexity: "huge" }
```

Expected behavior:

```ts
payload: {
  type: "calligraphy",
  answers: { work_type: "calligraphy", text: "松风" },
  conversationNotes: "make it lighter",
  source_photo_path: "uploads/source.webp",
  generation_complexity: "large",
  recommended_artwork_size: {
    preset_id: "medium",
    label: "Medium",
    width_cm: 30,
    height_cm: 40,
    reason: "balanced"
  }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test --workspace client -- generationSession.test.ts`

Expected: FAIL，`generation_complexity` 未被保留或非法值未被拒绝。

- [ ] **Step 3: 修改 `client/src/api.ts` 类型**

加入类型并挂到 record/payload：

```ts
export type GenerationComplexity = "small" | "medium" | "large";

export interface LibraryRecord {
  // existing fields...
  generation_complexity?: GenerationComplexity;
}

export async function createGeneration(payload: {
  type: WorkType;
  answers: Answers;
  conversationNotes: string;
  source_photo_path?: string;
  recommended_artwork_size?: ArtworkSize | null;
  generation_complexity?: GenerationComplexity;
  origin_tab?: OriginTab;
  operation?: GenerationOperation;
}): Promise<GenerationStartResult> {
  return requestJson("/api/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: payload.type,
      answers: payload.answers,
      conversationNotes: payload.conversationNotes,
      source_photo_path: payload.source_photo_path ?? "",
      recommended_artwork_size: payload.recommended_artwork_size ?? null,
      generation_complexity: payload.generation_complexity,
      origin_tab: payload.origin_tab ?? "studio",
      operation: payload.operation ?? "create"
    })
  });
}
```

- [ ] **Step 4: 修改 `client/src/generationSession.ts` 解析**

增加常量、类型字段和校验：

```ts
import type { GenerationComplexity, GenerationOperation, GenerationRecord, OriginTab } from "./api";

const GENERATION_COMPLEXITIES: GenerationComplexity[] = ["small", "medium", "large"];

export interface GenerationSessionPayload {
  type?: WorkType;
  answers?: Answers;
  conversationNotes?: string;
  source_photo_path?: string;
  generation_complexity?: GenerationComplexity;
  recommended_artwork_size?: GenerationRecord["recommended_artwork_size"] | null;
}

function isGenerationComplexity(value: unknown): value is GenerationComplexity {
  return GENERATION_COMPLEXITIES.includes(value as GenerationComplexity);
}
```

在 `parseGenerationSessionPayload` 中加入：

```ts
|| (value.generation_complexity !== undefined && !isGenerationComplexity(value.generation_complexity))
```

在 payload 构建中加入：

```ts
if (value.generation_complexity !== undefined) {
  payload.generation_complexity = value.generation_complexity;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test --workspace client -- generationSession.test.ts`

Expected: PASS。

- [ ] **Step 6: checkpoint**

不要提交 git commit。记录本任务改动文件：

```text
client/src/api.ts
client/src/generationSession.ts
client/tests/generationSession.test.ts
```

---

### Task 3: 后端 prompt 支持复杂度、方向和参考尺寸

**Files:**
- Modify: `server/src/prompts.js`
- Test: `server/tests/prompts.test.js`

- [ ] **Step 1: 写失败测试**

在 `server/tests/prompts.test.js` 追加：

```js
test("artwork prompt includes generation complexity before user notes", () => {
  const prompt = buildArtworkPrompt({
    type: "painting",
    answers: { painting_subject: "山水" },
    conversationNotes: "最后改成竖幅",
    generationComplexity: "large",
    resolvedOrientation: { orientation: "portrait", source: "notes" },
    config: loadConfig(root)
  });

  assert.match(prompt, /画面复杂度/);
  assert.match(prompt, /丰富/);
  assert.match(prompt, /最终方向：portrait/);
  assert.ok(prompt.indexOf("画面复杂度") < prompt.indexOf("用户补充"));
});

test("fusion prompt includes recommended artwork size", () => {
  const prompt = buildFusionPrompt({
    record: {
      id: "fusion-size",
      source_photo_path: "records/fusion-size/source-photo.webp",
      artwork_path: "records/fusion-size/artwork.webp",
      recommended_artwork_size: {
        preset_id: "ai_scene",
        label: "环境估算",
        width_cm: 45,
        height_cm: 70,
        reason: "按墙面估算"
      }
    },
    config: loadConfig(root)
  });

  assert.match(prompt, /45 × 70 cm/);
  assert.match(prompt, /真实尺寸感/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test --workspace server -- prompts.test.js`

Expected: FAIL，prompt 不包含复杂度/方向/尺寸。

- [ ] **Step 3: 修改 `buildArtworkPrompt` 签名和段落**

在 `server/src/prompts.js` 中加入：

```js
const COMPLEXITY_COPY = {
  small: "简洁：画面克制，留白明确，细节密度较低。",
  medium: "均衡：细节与留白平衡，适合常规作品生成。",
  large: "丰富：层次更充分，细节承载更多，适合主视觉作品。"
};

function complexityLine(value) {
  return COMPLEXITY_COPY[value] || COMPLEXITY_COPY.medium;
}
```

修改函数签名：

```js
function buildArtworkPrompt({
  type,
  answers = {},
  conversationNotes = "",
  generationComplexity = "medium",
  resolvedOrientation = null,
  config
}) {
```

在 `用户选择` 段落之后、`用户补充` 之前插入：

```js
lines.push("画面复杂度:", complexityLine(generationComplexity));
if (resolvedOrientation?.orientation && resolvedOrientation.orientation !== "unknown") {
  lines.push(
    "最终方向:",
    `${resolvedOrientation.orientation}，来源：${resolvedOrientation.source || "unknown"}。该方向必须优先于早期构图选择和环境图片判断。`
  );
}
```

- [ ] **Step 4: 修改 `buildFusionPrompt` 尺寸段落**

在 `buildFusionPrompt` 的要求数组中加入：

```js
record.recommended_artwork_size
  ? `作品建议制作尺寸约 ${record.recommended_artwork_size.width_cm} × ${record.recommended_artwork_size.height_cm} cm，请按这个真实尺寸感摆放到环境图片中。`
  : "",
```

确保最终 `.filter(Boolean)` 保留现有行为。

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test --workspace server -- prompts.test.js`

Expected: PASS。

- [ ] **Step 6: checkpoint**

不要提交 git commit。记录本任务改动文件：

```text
server/src/prompts.js
server/tests/prompts.test.js
```

---

### Task 4: 后端 job 流程写入复杂度和推荐尺寸

**Files:**
- Modify: `server/src/app.js`
- Modify: `server/src/jobs.js`
- Test: `server/tests/jobs.test.js`
- Test: `server/tests/app.test.js`

- [ ] **Step 1: 写 jobs 失败测试：无环境图生成后计算尺寸**

在 `server/tests/jobs.test.js` 增加：

```js
test("artwork job stores generation complexity and computes production size without environment image", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "inkspire-job-"));
  const storage = createStorage(temp);
  const manager = createJobManager({
    config: testConfig,
    storage,
    runner: async ({ outputPngPath }) => {
      await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
      await fs.writeFile(outputPngPath, pngBuffer(80, { width: 80, height: 120 }));
      return { pngPath: outputPngPath, diagnostics: { reason: "artwork_success" } };
    }
  });

  const { job } = await manager.createArtwork({
    userId: "user-a",
    type: "painting",
    answers: { work_type: "painting", painting_composition: "竖幅" },
    generationComplexity: "large"
  });
  await waitUntil(() => manager.getJob(job.id, "user-a").status === "succeeded");
  const record = await storage.getRecordForUser(job.recordId, "user-a");

  assert.equal(record.generation_complexity, "large");
  assert.equal(record.recommended_artwork_size.preset_id, "complexity_large");
  assert.ok(record.recommended_artwork_size.height_cm > record.recommended_artwork_size.width_cm);
});
```

在该测试文件中新增专用 helper，后续本计划涉及不同图片比例的 jobs 测试都使用它：

```js
function sizedPngBuffer(width, height, red = 80) {
  const png = new PNG({ width, height });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = red;
    png.data[index + 1] = 80;
    png.data[index + 2] = 80;
    png.data[index + 3] = 255;
  }
  return PNG.sync.write(png);
}
```

- [ ] **Step 2: 写 app 失败测试：API 接收复杂度**

在 `server/tests/app.test.js` 增加或扩展 generation metadata 测试，mock jobs 接收 payload：

```js
test("POST /api/generations forwards generation complexity", async () => {
  let captured;
  const app = createApp({
    projectRoot: root,
    dataDir: temp,
    jobs: {
      createArtwork: async (payload) => {
        captured = payload;
        return {
          job: {
            id: "job-complexity",
            recordId: "record-complexity",
            stage: "artwork",
            status: "queued",
            origin_tab: "studio",
            operation: "create"
          }
        };
      },
      listActiveJobs: () => [],
      getJob: () => null
    }
  });

  await request(app)
    .post("/api/generations")
    .send({
      type: "painting",
      answers: { work_type: "painting" },
      conversationNotes: "",
      generation_complexity: "large"
    })
    .expect(201);

  assert.equal(captured.generationComplexity, "large");
});
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```powershell
npm test --workspace server -- jobs.test.js app.test.js
```

Expected: FAIL，复杂度未传递，record 未写入推荐尺寸。

- [ ] **Step 4: 修改 `server/src/app.js` 传递字段**

在 `/api/generations` 调用 `jobs.createArtwork` 中加入：

```js
generationComplexity: req.body.generation_complexity
```

- [ ] **Step 5: 修改 `server/src/jobs.js` createArtwork 参数和 record**

引入 helper：

```js
const sharp = require("sharp");
const {
  normalizeGenerationComplexity,
  resolveOrientation,
  sizeFromComplexityAndAspectRatio
} = require("./sizeEstimation");
```

扩展 `cloneRecord`：

```js
generation_complexity: record.generation_complexity,
resolved_orientation: record.resolved_orientation,
orientation_source: record.orientation_source,
```

扩展 `createArtwork` 参数：

```js
generationComplexity = "medium"
```

创建 record 前解析：

```js
const normalizedComplexity = normalizeGenerationComplexity(generationComplexity);
const orientationIntent = resolveOrientation({ answers, conversationNotes });
```

record 中加入：

```js
generation_complexity: normalizedComplexity,
resolved_orientation: orientationIntent.orientation,
orientation_source: orientationIntent.source,
```

queued task 中加入：

```js
generationComplexity: normalizedComplexity,
resolvedOrientation: orientationIntent
```

- [ ] **Step 6: 在 artwork 成功后计算无环境图尺寸**

在 `startTask` 中 `convertPngToWebp` 后、`task.record.status = "succeeded"` 前加入：

```js
if (task.stage === "artwork" && !task.record.source_photo_path) {
  const metadata = await sharp(result.pngPath).metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  const aspectRatio = width && height ? width / height : 2 / 3;
  const orientationIntent = resolveOrientation({
    answers: task.answers,
    conversationNotes: task.conversationNotes,
    aspectRatio
  });
  task.record.resolved_orientation = orientationIntent.orientation;
  task.record.orientation_source = orientationIntent.source;
  task.record.recommended_artwork_size = sizeFromComplexityAndAspectRatio({
    generationComplexity: task.generationComplexity,
    aspectRatio,
    orientation: orientationIntent.orientation
  });
}
```

- [ ] **Step 7: 传 prompt 参数**

在 `buildArtworkPrompt` 调用中加入：

```js
generationComplexity: task.generationComplexity,
resolvedOrientation: task.resolvedOrientation,
```

For legacy immediate path, pass `generationComplexity` and `resolvedOrientation` similarly in `runImmediateArtwork`.

- [ ] **Step 8: 运行测试确认通过**

Run:

```powershell
npm test --workspace server -- jobs.test.js app.test.js prompts.test.js sizeEstimation.test.js
```

Expected: PASS。

- [ ] **Step 9: checkpoint**

不要提交 git commit。记录本任务改动文件：

```text
server/src/app.js
server/src/jobs.js
server/tests/jobs.test.js
server/tests/app.test.js
```

---

### Task 5: 环境图片 AI 估算和效果图前覆盖尺寸

**Files:**
- Modify: `server/src/sizeEstimation.js`
- Modify: `server/src/prompts.js`
- Modify: `server/src/jobs.js`
- Test: `server/tests/sizeEstimation.test.js`
- Test: `server/tests/jobs.test.js`

- [ ] **Step 1: 写失败测试：环境估算解析和 fallback**

在 `server/tests/sizeEstimation.test.js` 追加：

```js
const { estimateFromEnvironment } = require("../src/sizeEstimation");

test("estimateFromEnvironment normalizes AI result and enforces orientation", async () => {
  const result = await estimateFromEnvironment({
    runner: async () => ({
      json: {
        generation_complexity: "large",
        recommended_artwork_size: {
          preset_id: "ai_scene",
          label: "环境估算",
          width_cm: 90,
          height_cm: 50,
          reason: "按沙发墙估算"
        }
      }
    }),
    record: { id: "record-ai" },
    resolvedOrientation: { orientation: "portrait", source: "question" },
    fallbackSize: null
  });

  assert.equal(result.generation_complexity, "large");
  assert.equal(result.recommended_artwork_size.width_cm, 50);
  assert.equal(result.recommended_artwork_size.height_cm, 90);
});

test("estimateFromEnvironment falls back to medium and existing size on AI failure", async () => {
  const fallbackSize = {
    preset_id: "old",
    label: "旧尺寸",
    width_cm: 45,
    height_cm: 70
  };
  const result = await estimateFromEnvironment({
    runner: async () => { throw new Error("model unavailable"); },
    record: { id: "record-ai" },
    resolvedOrientation: { orientation: "portrait", source: "question" },
    fallbackSize
  });

  assert.equal(result.generation_complexity, "medium");
  assert.deepEqual(result.recommended_artwork_size, fallbackSize);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test --workspace server -- sizeEstimation.test.js`

Expected: FAIL，`estimateFromEnvironment` 未定义。

- [ ] **Step 3: 实现 `estimateFromEnvironment` 的 runner seam**

在 `server/src/sizeEstimation.js` 增加：

```js
const DEFAULT_SIZE = {
  preset_id: "medium",
  label: "中幅雅作",
  width_cm: 45,
  height_cm: 68,
  reason: "估算失败，先按常用中幅预填。"
};

async function estimateFromEnvironment({
  runner,
  record,
  prompt = "",
  resolvedOrientation = { orientation: "portrait", source: "default" },
  fallbackSize = null
}) {
  try {
    const result = await runner({ prompt, record, stage: "size_estimation" });
    const payload = typeof result.json === "object" && result.json ? result.json : JSON.parse(result.text || "{}");
    const complexity = normalizeGenerationComplexity(payload.generation_complexity);
    const normalizedSize = normalizeArtworkSizeCandidate(
      payload.recommended_artwork_size,
      resolvedOrientation.orientation
    );
    return {
      generation_complexity: complexity,
      recommended_artwork_size: normalizedSize || fallbackSize || DEFAULT_SIZE
    };
  } catch {
    return {
      generation_complexity: "medium",
      recommended_artwork_size: fallbackSize || DEFAULT_SIZE
    };
  }
}
```

Export it.

- [ ] **Step 4: 写 jobs 失败测试：fusion 前更新尺寸**

在 `server/tests/jobs.test.js` 增加：

```js
test("fusion job estimates and stores recommended size before AI render", async () => {
  const calls = [];
  const manager = createJobManager({
    config: testConfig,
    storage,
    runner: async ({ stage, outputPngPath, record }) => {
      calls.push({ stage, size: record.recommended_artwork_size });
      if (stage === "size_estimation") {
        return {
          json: {
            generation_complexity: "medium",
            recommended_artwork_size: {
              preset_id: "ai_scene",
              label: "环境估算",
              width_cm: 60,
              height_cm: 90,
              reason: "按环境估算"
            }
          }
        };
      }
      await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
      await fs.writeFile(outputPngPath, sizedPngBuffer(80, 120));
      return { pngPath: outputPngPath, diagnostics: { reason: `${stage}_success` } };
    }
  });

  const uploadRecordId = "upload-fusion-size";
  const sourcePhotoPath = `records/${uploadRecordId}/source-photo.webp`;
  await fs.mkdir(path.join(temp, "records", uploadRecordId), { recursive: true });
  await fs.writeFile(path.join(temp, sourcePhotoPath), "WEBP_SOURCE");

  const created = await manager.createArtwork({ userId: "user-a", type: "painting", answers: { work_type: "painting" } });
  await waitUntil(() => manager.getJob(created.job.id, "user-a").status === "succeeded");
  await manager.createFusion({ userId: "user-a", recordId: created.job.recordId, sourcePhotoPath });
  await waitUntil(() => calls.some((call) => call.stage === "fusion_render"));

  const fusionCall = calls.find((call) => call.stage === "fusion_render");
  assert.deepEqual(fusionCall.size, {
    preset_id: "ai_scene",
    label: "环境估算",
    width_cm: 60,
    height_cm: 90,
    reason: "按环境估算"
  });
});
```

- [ ] **Step 5: 在 jobs 中调用环境估算**

在 `createArtwork` 中，如果 `ownedSourcePhotoPath` 存在，在保存 record 前调用：

```js
const estimate = await estimateFromEnvironment({
  runner,
  record,
  prompt: buildSizeEstimationPrompt({ record, answers, conversationNotes, resolvedOrientation: orientationIntent, config }),
  resolvedOrientation: orientationIntent,
  fallbackSize: recommendedArtworkSize
});
record.generation_complexity = estimate.generation_complexity;
record.recommended_artwork_size = estimate.recommended_artwork_size;
```

在 `createFusion` 中，复制新环境图后、保存 record 前调用同样估算，但只覆盖 `recommended_artwork_size`，并保留已有 `generation_complexity` fallback：

```js
const orientationIntent = resolveOrientation({
  answers: record.answers || {},
  conversationNotes: record.conversation_notes || "",
  aspectRatio: record.artwork_aspect_ratio || 0
});
const estimate = await estimateFromEnvironment({
  runner,
  record,
  prompt: buildSizeEstimationPrompt({ record, answers: record.answers || {}, conversationNotes: record.conversation_notes || "", resolvedOrientation: orientationIntent, config }),
  resolvedOrientation: orientationIntent,
  fallbackSize: record.recommended_artwork_size || null
});
record.generation_complexity = estimate.generation_complexity || record.generation_complexity || "medium";
record.recommended_artwork_size = estimate.recommended_artwork_size;
```

- [ ] **Step 6: 增加 `buildSizeEstimationPrompt`**

在 `server/src/prompts.js` 增加并导出：

```js
function buildSizeEstimationPrompt({ record, answers = {}, conversationNotes = "", resolvedOrientation, config }) {
  return [
    "你是墨起的制作参考尺寸估算助手。",
    "请根据环境图片、作品方向意图、用户选择和补充说明，估算作品在真实物理空间中的参考制作尺寸。",
    "只返回 JSON，不要返回 markdown。",
    `最终方向: ${resolvedOrientation?.orientation || "unknown"}`,
    `方向来源: ${resolvedOrientation?.source || "none"}`,
    "当方向来源是 notes 或 question 时，不能因为环境图片改变方向。",
    "JSON schema:",
    "{\"generation_complexity\":\"small|medium|large\",\"recommended_artwork_size\":{\"preset_id\":\"ai_scene\",\"label\":\"环境估算尺寸\",\"width_cm\":45,\"height_cm\":68,\"reason\":\"一句中文说明\"}}",
    "用户选择:",
    ...answerLines(answers, questionMap(config, record.type)),
    conversationNotes ? `用户补充:\n${conversationNotes}` : ""
  ].filter(Boolean).join("\n");
}
```

- [ ] **Step 7: 运行后端测试**

Run:

```powershell
npm test --workspace server -- sizeEstimation.test.js jobs.test.js prompts.test.js app.test.js
```

Expected: PASS。

- [ ] **Step 8: checkpoint**

不要提交 git commit。记录本任务改动文件：

```text
server/src/sizeEstimation.js
server/src/prompts.js
server/src/jobs.js
server/tests/sizeEstimation.test.js
server/tests/jobs.test.js
```

---

### Task 6: Studio 无环境图复杂度选择 UI

**Files:**
- Modify: `client/src/components/Studio.tsx`
- Modify: `client/src/i18n.ts`
- Test: `client/tests/app.test.tsx`

- [ ] **Step 1: 写失败测试：跳过环境图后显示复杂度选择**

在 `client/tests/app.test.tsx` 增加：

```ts
it("asks for generation complexity only after skipping the environment photo", async () => {
  const user = userEvent.setup();
  renderApp();

  await completePaintingQuestions(user);
  await user.click(screen.getByRole("button", { name: "不需要效果图，直接生成" }));

  expect(screen.getByRole("heading", { name: "选择画面复杂度" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /简洁/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /均衡/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /丰富/ })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /丰富/ }));
  await user.click(screen.getByRole("button", { name: "生成" }));

  expect(generationRequestBodies()[0].generation_complexity).toBe("large");
});
```

如果 `completePaintingQuestions` 不存在，在测试 helper 区新增：

```ts
async function completePaintingQuestions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "国画" }));
  for (const option of ["山水", "水墨", "清雅", "竖幅", "适中"]) {
    await user.click(screen.getByRole("button", { name: option }));
  }
  expect(screen.getByRole("heading", { name: "可选：添加摆放环境照片" })).toBeInTheDocument();
}
```

- [ ] **Step 2: 写失败测试：有环境图不显示复杂度选择**

```ts
it("does not ask for generation complexity when an environment photo is provided", async () => {
  const user = userEvent.setup();
  renderApp();

  await completePaintingWithPhoto(user);

  expect(screen.queryByRole("heading", { name: "选择画面复杂度" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "生成" }));

  expect(generationRequestBodies()[0].generation_complexity).toBeUndefined();
  expect(generationRequestBodies()[0].source_photo_path).toBe("records/upload-1/source-photo.webp");
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test --workspace client -- app.test.tsx`

Expected: FAIL，复杂度选择页不存在。

- [ ] **Step 4: 增加 i18n 文案**

在 `client/src/i18n.ts` 的 `studio` 下新增：

```ts
complexityTitle: "选择画面复杂度",
complexityHint: "这会影响作品图的画面承载量，不是最终制作尺寸；制作尺寸后续仍可调整。",
complexitySmall: "简洁",
complexitySmallHint: "画面更克制，适合小空间点缀。",
complexityMedium: "均衡",
complexityMediumHint: "细节和留白平衡，适合常规作品。",
complexityLarge: "丰富",
complexityLargeHint: "层次更充分，适合主视觉作品。"
```

同时补 zh-Hant 和 en。

- [ ] **Step 5: 修改 Studio 状态和 draft**

在 `StudioDraft` 加：

```ts
generationComplexity?: GenerationComplexity;
complexityStepComplete?: boolean;
```

导入类型：

```ts
type GenerationComplexity
```

新增 state：

```ts
const [generationComplexity, setGenerationComplexity] = useState<GenerationComplexity | "">(
  () => readStudioDraft().generationComplexity ?? ""
);
const [complexityStepComplete, setComplexityStepComplete] = useState(
  () => readStudioDraft().complexityStepComplete ?? false
);
```

draft 写入加入两个字段。

- [ ] **Step 6: 调整 Studio step 逻辑**

新增：

```ts
const needsComplexityStep = complete && photoStepComplete && !sourcePhotoPath && !complexityStepComplete;
const showConversationStep = complete && photoStepComplete && (sourcePhotoPath || complexityStepComplete);
```

`skipPhotoStep` 改为进入复杂度：

```ts
const skipPhotoStep = () => {
  setPhotoStepComplete(true);
  setComplexityStepComplete(false);
  setError("");
  navigate("/studio?step=complexity");
};
```

扩展 `StudioStepQuery`：

```ts
| { step: "complexity" }
```

`studioStepUrlForState` 可接受第三参数，或者在当前 task 中只对 skip 直接导航。后续如果支持 back URL，推荐扩展函数：

```ts
function studioStepUrlForState(config, answers, photoStepComplete, complexityStepComplete, sourcePhotoPath) {
  // complete branches...
  if (!photoStepComplete) return "/studio?step=photo";
  if (!sourcePhotoPath && !complexityStepComplete) return "/studio?step=complexity";
  return "/studio?step=notes";
}
```

- [ ] **Step 7: 渲染复杂度选择 UI**

在 photo step 和 conversation step 之间加入：

```tsx
) : needsComplexityStep ? (
  <div className="complexity-step">
    <h2>{t("studio.complexityTitle")}</h2>
    <p className="photo-step-hint">{t("studio.complexityHint")}</p>
    <div className="option-grid complexity-options">
      {[
        ["small", t("studio.complexitySmall"), t("studio.complexitySmallHint")],
        ["medium", t("studio.complexityMedium"), t("studio.complexityMediumHint")],
        ["large", t("studio.complexityLarge"), t("studio.complexityLargeHint")]
      ].map(([value, label, hint]) => (
        <button
          key={value}
          type="button"
          onClick={() => {
            setGenerationComplexity(value as GenerationComplexity);
            setComplexityStepComplete(true);
            navigate("/studio?step=notes");
          }}
        >
          <span className="option-label">{label}</span>
          <span>{hint}</span>
        </button>
      ))}
    </div>
  </div>
```

- [ ] **Step 8: 生成 payload 携带复杂度**

在 `generate` 中加入：

```ts
generation_complexity: sourcePhotoPath ? undefined : generationComplexity || "medium",
```

- [ ] **Step 9: 运行客户端测试**

Run: `npm test --workspace client -- app.test.tsx generationSession.test.ts`

Expected: PASS。

- [ ] **Step 10: checkpoint**

不要提交 git commit。记录本任务改动文件：

```text
client/src/components/Studio.tsx
client/src/i18n.ts
client/tests/app.test.tsx
```

---

### Task 7: App generation session 和 retry payload 贯穿复杂度

**Files:**
- Modify: `client/src/App.tsx`
- Test: `client/tests/app.test.tsx`

- [ ] **Step 1: 写失败测试：刷新/排队保留复杂度**

在 `client/tests/app.test.tsx` 增加：

```ts
it("keeps generation complexity in the stored Studio loading session", async () => {
  queuedGenerationJob = {
    id: "job-complexity-session",
    recordId: "record-1",
    stage: "artwork",
    origin_tab: "studio",
    operation: "create",
    status: "queued"
  };
  const user = userEvent.setup();
  renderApp();

  await completePaintingQuestions(user);
  await user.click(screen.getByRole("button", { name: "不需要效果图，直接生成" }));
  await user.click(screen.getByRole("button", { name: /丰富/ }));
  await user.click(screen.getByRole("button", { name: "生成" }));

  await waitFor(() => {
    const sessions = JSON.parse(window.localStorage.getItem("inkspire.generationSessions.v1") ?? "{}");
    expect(sessions.studio.payload.generation_complexity).toBe("large");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test --workspace client -- app.test.tsx`

Expected: FAIL，session payload 缺少复杂度。

- [ ] **Step 3: 修改 `generationPayloadForSession`**

在 `client/src/App.tsx` 中加入：

```ts
generation_complexity: payload.generation_complexity,
```

在 `activeTabSessionRetry` 中传回：

```ts
generation_complexity: session.payload.generation_complexity,
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test --workspace client -- app.test.tsx`

Expected: PASS。

- [ ] **Step 5: checkpoint**

不要提交 git commit。记录本任务改动文件：

```text
client/src/App.tsx
client/tests/app.test.tsx
```

---

### Task 8: 制作页动态尺寸预设和 reason 优先

**Files:**
- Modify: `client/src/components/ProductionDialog.tsx`
- Test: `client/tests/app.test.tsx`

- [ ] **Step 1: 写失败测试：reason 优先显示**

在 production dialog 相关 describe 中增加：

```ts
it("shows the record recommended size reason before preset hints", async () => {
  recordOneRecommendedArtworkSize = {
    preset_id: "medium",
    label: "环境估算尺寸",
    width_cm: 50,
    height_cm: 80,
    reason: "根据沙发墙尺度估算，适合作为中幅挂画。"
  };
  const user = userEvent.setup();
  renderApp({ initialRoute: "/records/record-1?from=studio" });

  await user.click(await screen.findByRole("button", { name: "制作作品" }));

  expect(screen.getByText("根据沙发墙尺度估算，适合作为中幅挂画。")).toBeInTheDocument();
});
```

如果测试文件当前没有可变的 `recordOneRecommendedArtworkSize`，在 fetch mock 的共享 fixture 区新增：

```ts
let recordOneRecommendedArtworkSize: GenerationRecord["recommended_artwork_size"] = {
  preset_id: "square_scene",
  label: "方形点景",
  width_cm: 50,
  height_cm: 50,
  reason: "根据环境图片比例推算，适合作为方形点景作品。"
};
```

并把 mock `record-1` 响应中的 `recommended_artwork_size` 改为：

```ts
recommended_artwork_size: recordOneRecommendedArtworkSize,
```

- [ ] **Step 2: 写失败测试：动态预设按当前比例**

```ts
it("computes production size presets from the selected artwork ratio", async () => {
  recordOneRecommendedArtworkSize = {
    preset_id: "complexity_medium",
    label: "均衡参考尺寸",
    width_cm: 80,
    height_cm: 40,
    reason: "按作品复杂度和画面比例估算。"
  };
  const user = userEvent.setup();
  renderApp({ initialRoute: "/records/record-1?from=studio" });

  await user.click(await screen.findByRole("button", { name: "制作作品" }));
  await user.click(screen.getByRole("button", { name: "调整尺寸" }));

  expect(screen.getByRole("radio", { name: /简洁.*约 50 × 25 cm/ })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /均衡.*约 80 × 40 cm/ })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /丰富.*约 105 × 50 cm/ })).toBeInTheDocument();
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test --workspace client -- app.test.tsx`

Expected: FAIL，仍显示固定 preset 或固定 hint。

- [ ] **Step 4: 在 `ProductionDialog.tsx` 增加动态 preset helper**

添加本地 helper，保持和后端规则一致：

```ts
const TARGET_AREAS = { small: 1350, medium: 3060, large: 5400 };

function dynamicSizeFromArea(key: "small" | "medium" | "large", baseRatio: number, locale: Locale): ProductionSize {
  const ratio = Math.min(Math.max(baseRatio || 2 / 3, 0.45), 2.2);
  const area = TARGET_AREAS[key];
  const height = Math.sqrt(area / ratio);
  const width = height * ratio;
  const round = (value: number) => Math.max(5, Math.round(value / 5) * 5);
  const widthCm = round(width);
  const heightCm = round(height);
  const names = {
    small: { "zh-Hans": "简洁", "zh-Hant": "簡潔", en: "Simple" },
    medium: { "zh-Hans": "均衡", "zh-Hant": "均衡", en: "Balanced" },
    large: { "zh-Hans": "丰富", "zh-Hant": "豐富", en: "Rich" }
  };
  const hints = {
    small: { "zh-Hans": "较克制的制作参考尺寸。", "zh-Hant": "較克制的製作參考尺寸。", en: "A restrained production reference size." },
    medium: { "zh-Hans": "细节和留白平衡的制作参考尺寸。", "zh-Hant": "細節和留白平衡的製作參考尺寸。", en: "A balanced production reference size." },
    large: { "zh-Hans": "更有存在感的制作参考尺寸。", "zh-Hant": "更有存在感的製作參考尺寸。", en: "A more prominent production reference size." }
  };
  return {
    preset_id: key,
    label: names[key]["zh-Hans"],
    labelText: names[key],
    width_cm: widthCm,
    height_cm: heightCm,
    hint: hints[key]
  };
}
```

- [ ] **Step 5: reason 优先**

修改 `sizeHint`：

```ts
function sizeHint(size: ArtworkSize, locale: Locale): string {
  if (size.reason) {
    return locale === "en" && /[\u3400-\u9fff]/.test(size.reason)
      ? "Suggested from the artwork size estimate."
      : size.reason;
  }
  const preset = SIZE_OPTIONS.find((option) => option.preset_id === size.preset_id);
  // existing fallback...
}
```

- [ ] **Step 6: 替换 `presetOptions`**

在 `ProductionDialog` 中：

```ts
const artworkRatio = inferredSize.width_cm > 0 && inferredSize.height_cm > 0
  ? inferredSize.width_cm / inferredSize.height_cm
  : 2 / 3;
const presetOptions = useMemo(() => [
  dynamicSizeFromArea("small", artworkRatio, locale),
  dynamicSizeFromArea("medium", artworkRatio, locale),
  dynamicSizeFromArea("large", artworkRatio, locale)
], [artworkRatio, locale]);
```

非标准 `preset_id` 的 `selectedSize` 仍只在主页面的 selected panel 中展示；调整页只显示动态生成的小、中、大三个 preset 和自定义尺寸入口。

- [ ] **Step 7: 运行客户端测试**

Run: `npm test --workspace client -- app.test.tsx`

Expected: PASS。

- [ ] **Step 8: checkpoint**

不要提交 git commit。记录本任务改动文件：

```text
client/src/components/ProductionDialog.tsx
client/tests/app.test.tsx
```

---

### Task 9: 端到端和全量相关验证

**Files:**
- Modify: `e2e/inkspire.spec.ts`
- Test: `client/tests/mobile-css.test.ts`

- [ ] **Step 1: 更新 E2E 无环境图流程**

在 `e2e/inkspire.spec.ts` 增加一条或扩展现有 mobile flow：

```ts
test("user can skip environment photo, choose complexity, and open production with a prefilled size", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await completePaintingFlow(page);
  await page.getByRole("button", { name: "不需要效果图，直接生成" }).click();
  await expect(page.getByRole("heading", { name: "选择画面复杂度" })).toBeVisible();
  await page.getByRole("button", { name: /均衡/ }).click();
  await page.getByRole("button", { name: "生成", exact: true }).click();

  await expect(page.getByRole("img", { name: "作品图" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "制作作品" }).click();
  await expect(page.getByRole("dialog", { name: "制作作品" })).toBeVisible();
  await expect(page.getByText(/均衡|中幅|参考尺寸/)).toBeVisible();
});
```

- [ ] **Step 2: 更新 E2E 有环境图流程**

在现有有图 flow 中确认仍自动生成效果图：

```ts
await expect(page.getByRole("img", { name: "效果图" })).toBeVisible();
await expect(page.getByRole("button", { name: "重新上传环境照片" })).toBeVisible();
```

- [ ] **Step 3: 跑相关测试**

Run:

```powershell
npm test --workspace server -- sizeEstimation.test.js prompts.test.js jobs.test.js app.test.js
npm test --workspace client -- generationSession.test.ts app.test.tsx mobile-css.test.ts
npm run e2e
git diff --check
```

Expected: all PASS。

- [ ] **Step 4: 如果 `npm run e2e` 因 5173 端口旧服务失败**

按仓库现有做法，先识别具体 5173 监听进程，不做 broad Node sweep：

```powershell
Get-NetTCPConnection -LocalPort 5173 -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess
Get-Process -Id (Get-NetTCPConnection -LocalPort 5173 -State Listen).OwningProcess | Select-Object Id,ProcessName,Path,CommandLine
```

只停止确认是 Inkspire Vite 的进程：

```powershell
$vite = Get-NetTCPConnection -LocalPort 5173 -State Listen | Select-Object -First 1
Stop-Process -Id $vite.OwningProcess -Force
npm run e2e
```

E2E 后如需要恢复本地前端：

```powershell
Start-Process -FilePath npm.cmd -ArgumentList @('run','dev','--workspace','client','--','--host','0.0.0.0') -WorkingDirectory 'D:\Inkspire' -WindowStyle Hidden
```

- [ ] **Step 5: checkpoint**

不要提交 git commit。最终报告列出通过的测试命令和未验证项。

---

## 自检覆盖

- 有环境图片：Task 4 和 Task 5 覆盖后端估算、record 写入、AI 效果图 prompt 使用参考尺寸。
- 无环境图片：Task 6 覆盖复杂度选择；Task 4 覆盖作品成功后计算推荐尺寸。
- 制作页：Task 8 覆盖 `recommended_artwork_size` 预填、reason 优先、动态尺寸 preset。
- 方向判断：Task 1 覆盖 notes/question/aspect/default 优先级；Task 3 和 Task 5 覆盖 prompt 和 AI 返回校验。
- 持久化：Task 2 和 Task 7 覆盖 API 类型、session、retry payload。
- 验证：Task 9 覆盖前后端目标测试、E2E、diff check。

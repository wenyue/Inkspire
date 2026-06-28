# Prompt Config Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move prompt rules from `server/src/prompts.js` into `config/prompts/*.json`, add `config/prompts/sizeEstimationPrompt.json`, and keep the existing prompt builder API stable.

**Architecture:** `server/src/config.js` loads all prompt config JSON files. `server/src/prompts.js` remains the only prompt entrypoint and becomes a small renderer: it fills templates, renders configured sections, and injects runtime-only record data. `server/src/jobs.js` keeps calling the same three exported functions.

**Tech Stack:** CommonJS Node.js, built-in `node:test`, JSON config files under `config/prompts/`.

---

## File Map

- Modify: `config/prompts/painting.json`
  - Add `brief` and `sections`, including the artwork-only boundary rule.
- Modify: `config/prompts/calligraphy.json`
  - Add `brief` and `sections`, including the artwork-only boundary rule.
- Modify: `config/prompts/fusion.json`
  - Add `brief` and `sections` for static fusion requirements.
- Create: `config/prompts/sizeEstimationPrompt.json`
  - Holds the static JSON-only size-estimation contract and schema.
- Modify: `server/src/config.js`
  - Load `sizeEstimationPrompt`.
- Modify: `server/src/prompts.js`
  - Replace hardcoded static rule blocks with config-driven rendering helpers.
- Modify: `server/tests/config.test.js`
  - Assert `sizeEstimationPrompt` is loaded.
- Modify: `server/tests/prompts.test.js`
  - Add/adjust tests that prove output is driven by config while keeping current prompt contracts.

Project rule override: do not create worktrees or commits automatically.

---

### Task 1: Add Failing Config-Load Test

**Files:**
- Modify: `server/tests/config.test.js`

- [ ] **Step 1: Write the failing test**

Add these assertions near the existing `config.prompts.*.system` checks in `loads required Inkspire configuration`:

```js
  assert.match(config.prompts.painting.brief, /中国画/);
  assert.ok(Array.isArray(config.prompts.painting.sections));
  assert.match(config.prompts.calligraphy.brief, /书法作品/);
  assert.ok(Array.isArray(config.prompts.calligraphy.sections));
  assert.match(config.prompts.fusion.brief, /真实摆放效果图/);
  assert.ok(Array.isArray(config.prompts.fusion.sections));
  assert.equal(config.prompts.sizeEstimationPrompt.system, "你是墨起的环境图片尺寸与复杂度估算助手。");
  assert.match(config.prompts.sizeEstimationPrompt.responseRules[0], /只返回 JSON/);
  assert.equal(config.prompts.sizeEstimationPrompt.schema.generation_complexity, "small | medium | large");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test --workspace server -- config.test.js
```

Expected: FAIL because `sizeEstimationPrompt` is not loaded and existing prompt JSON files do not yet have `brief` / `sections`.

---

### Task 2: Add Prompt Config Data

**Files:**
- Modify: `config/prompts/painting.json`
- Modify: `config/prompts/calligraphy.json`
- Modify: `config/prompts/fusion.json`
- Create: `config/prompts/sizeEstimationPrompt.json`
- Modify: `server/src/config.js`

- [ ] **Step 1: Update artwork prompt configs**

Change `config/prompts/painting.json` to:

```json
{
  "system": "你是墨起的中国画生成提示词助手。根据用户选择组织中国画提示词，强调水墨、设色、留白、笔墨层次和传统审美。避免水印、伪签名、假品牌，不仿作具体在世艺术家。",
  "brief": "创作一幅中国画：主题={{subject}}，设色={{palette}}，气质={{mood}}，构图={{composition}}，细节={{detail}}。",
  "sections": [
    {
      "title": "作品边界",
      "lines": [
        "只生成作品本身，不要添加作品外的装饰、外部装裱边框、相框、墙面、展台、灯光、室内环境或其他摆放场景。",
        "作品内部的纸张、留白、笔墨、落款等按用户选择和作品类型生成。"
      ]
    }
  ]
}
```

Change `config/prompts/calligraphy.json` to:

```json
{
  "system": "你是墨起的书法生成提示词助手。根据用户输入文字和选择组织书法提示词，尊重用户文本，强调书法章法、笔势、墨色、飞白和宣纸质感。避免违法或仇恨内容，避免水印、伪签名、假品牌。",
  "brief": "创作一幅书法作品：文字={{text}}，书体={{script}}，笔势={{energy}}，章法={{layout}}，纸张={{paper}}，墨色={{ink}}。",
  "sections": [
    {
      "title": "作品边界",
      "lines": [
        "只生成作品本身，不要添加作品外的装饰、外部装裱边框、相框、墙面、展台、灯光、室内环境或其他摆放场景。",
        "作品内部的纸张、留白、笔墨、落款等按用户选择和作品类型生成。"
      ]
    }
  ]
}
```

- [ ] **Step 2: Update fusion prompt config**

Change `config/prompts/fusion.json` to:

```json
{
  "system": "你是墨起的真实效果图/融合图生成提示词助手。以环境照片和作品图为参考，重新渲染作品挂在或摆放在环境中的真实摆放效果，不做简单叠加、贴图或平面覆盖。避免水印、伪签名、假品牌，不仿作具体在世艺术家。",
  "brief": "创作一幅真实摆放效果图：把艺术作品={{painting}}自然挂入或摆放到环境图片的合适位置，书法或文字信息={{calligraphy}}，整体关系={{relationship}}。",
  "sections": [
    {
      "title": "融合图要求",
      "lines": [
        "生成真实摆放效果图：以环境照片和作品图作为参考，重新渲染摆放作品挂在或摆放在环境中的真实效果。",
        "这不是简单叠加、贴图或把作品平面覆盖到底图上；需要匹配环境的透视、尺度、墙面或陈设位置、遮挡关系、阴影、反光与光照方向。",
        "优先保持环境照片的真实空间结构，适度雅化原始照片并保留人物或物件神韵。",
        "使用自然美光并加入灯光烘托，避免廉价滤镜感。",
        "保持作品内容完整清晰，不裁剪作品主体。"
      ]
    }
  ]
}
```

- [ ] **Step 3: Create size estimation prompt config**

Create `config/prompts/sizeEstimationPrompt.json`:

```json
{
  "system": "你是墨起的环境图片尺寸与复杂度估算助手。",
  "task": "根据环境图片参考，估算艺术作品在真实空间中合适的制作尺寸和生成复杂度。",
  "responseRules": [
    "只返回 JSON，不要返回 Markdown、解释文字或代码块。"
  ],
  "orientationRules": [
    "该最终方向是硬约束。环境图片不能改变用户补充说明或问题选择已经确定的方向，只能在该方向内估算尺寸。"
  ],
  "schema": {
    "generation_complexity": "small | medium | large",
    "recommended_artwork_size": {
      "preset_id": "string",
      "label": "string",
      "width_cm": "number",
      "height_cm": "number",
      "reason": "string"
    }
  },
  "sizeRules": [
    "width_cm 和 height_cm 使用厘米，必须是合理正数；按最终方向输出，portrait 高于宽，landscape 宽于高，square 宽高相等。"
  ],
  "complexityRules": [
    "generation_complexity 只允许 small、medium、large；按环境可承载的作品细节和视觉主次估算。"
  ],
  "recordSectionTitle": "记录信息:",
  "answersSectionTitle": "用户答案:",
  "rawAnswersSectionTitle": "用户答案原始字段:",
  "notesSectionTitle": "用户补充:"
}
```

- [ ] **Step 4: Load the new config**

In `server/src/config.js`, change the `prompts` object to:

```js
  const prompts = {
    painting: readJson(path.join(configDir, "prompts", "painting.json")),
    calligraphy: readJson(path.join(configDir, "prompts", "calligraphy.json")),
    fusion: readJson(path.join(configDir, "prompts", "fusion.json")),
    sizeEstimationPrompt: readJson(path.join(configDir, "prompts", "sizeEstimationPrompt.json"))
  };
```

- [ ] **Step 5: Run config test to verify it passes**

Run:

```powershell
npm test --workspace server -- config.test.js
```

Expected: PASS for the config loading assertions.

---

### Task 3: Add Failing Prompt Rendering Tests

**Files:**
- Modify: `server/tests/prompts.test.js`

- [ ] **Step 1: Add tests proving config-driven prompt sections**

Add this test after `artwork prompt asks to generate only the artwork without external decorations`:

```js
test("artwork prompt renders configured sections instead of hardcoded rule blocks", () => {
  const config = loadConfig(root);
  config.prompts.painting.sections = [
    {
      title: "测试规则",
      lines: ["配置规则 {{painting_subject}}"]
    }
  ];

  const prompt = buildArtworkPrompt({
    type: "painting",
    answers: {
      painting_subject: "山水"
    },
    config
  });

  assert.match(prompt, /测试规则/);
  assert.match(prompt, /配置规则 山水/);
});
```

Add this test after `fusion prompt asks for a rendered placement instead of a flat overlay`:

```js
test("fusion prompt renders static requirement sections from config", () => {
  const config = loadConfig(root);
  config.prompts.fusion.sections = [
    {
      title: "测试融合规则",
      lines: ["配置融合规则 {{relationship}}"]
    }
  ];

  const prompt = buildFusionPrompt({
    record: {
      id: "fusion-config",
      source_photo_path: "records/fusion-config/source-photo.webp",
      artwork_path: "records/fusion-config/artwork.webp",
      relationship: "挂入玄关"
    },
    config
  });

  assert.match(prompt, /测试融合规则/);
  assert.match(prompt, /配置融合规则 挂入玄关/);
});
```

Add this test after `size estimation prompt asks for JSON only with final orientation, answers, and notes`:

```js
test("size estimation prompt renders rules and schema from config", () => {
  const config = loadConfig(root);
  config.prompts.sizeEstimationPrompt.responseRules = ["配置响应规则"];
  config.prompts.sizeEstimationPrompt.schema = {
    custom_field: "string"
  };

  const prompt = buildSizeEstimationPrompt({
    record: { id: "record-size-config", type: "painting" },
    answers: {
      work_type: "painting"
    },
    resolvedOrientation: { orientation: "square", source: "test" },
    config
  });

  assert.match(prompt, /配置响应规则/);
  assert.match(prompt, /custom_field/);
  assert.match(prompt, /square/);
  assert.match(prompt, /test/);
});
```

- [ ] **Step 2: Run prompt tests to verify they fail**

Run:

```powershell
npm test --workspace server -- prompts.test.js
```

Expected: FAIL because `prompts.js` still renders some sections from hardcoded arrays and does not read `sizeEstimationPrompt`.

---

### Task 4: Refactor `server/src/prompts.js`

**Files:**
- Modify: `server/src/prompts.js`

- [ ] **Step 1: Replace the implementation with config-driven helpers**

Update `server/src/prompts.js` to this structure:

```js
function questionMap(config, type) {
  const questions = config.questions[type] || [];
  return new Map(questions.map((question) => [question.id, question.title["zh-Hans"]]));
}

function answerLabel(id, labels) {
  if (id === "text") {
    return "文字";
  }
  return labels.get(id) || id;
}

function answerLines(answers, labels) {
  return Object.keys(answers || {})
    .sort()
    .map((id) => `${answerLabel(id, labels)}: ${answers[id]}`);
}

function fillTemplate(template = "", answers = {}) {
  return String(template).replace(/\{\{([a-z0-9_]+)\}\}/gi, (match, key) => answers[key] || "由墨起决定");
}

function compactLines(lines) {
  return lines.filter((line) => typeof line === "string" && line.length > 0);
}

function renderSections(sections = [], variables = {}) {
  return sections.flatMap((section) => {
    const lines = compactLines((section.lines || []).map((line) => fillTemplate(line, variables)));
    if (lines.length === 0) return [];
    return compactLines([section.title, ...lines]);
  });
}

function jsonBlock(value) {
  return JSON.stringify(value || {}, null, 2);
}

function promptBrief(promptConfig, variables) {
  return fillTemplate(promptConfig.brief || promptConfig.template || "", variables);
}

const GENERATION_COMPLEXITY_COPY = {
  small: "简洁：画面克制，留白明确，细节密度较低。",
  medium: "均衡：细节与留白平衡，适合常规作品生成。",
  large: "丰富：层次更充分，细节承载更多，适合主视觉作品。"
};

function generationComplexityCopy(value) {
  return GENERATION_COMPLEXITY_COPY[value] || GENERATION_COMPLEXITY_COPY.medium;
}
```

Then implement `buildArtworkPrompt` with:

```js
function buildArtworkPrompt({
  type,
  answers = {},
  conversationNotes = "",
  generationComplexity = "medium",
  recommendedArtworkSize = null,
  resolvedOrientation = null,
  config
}) {
  const promptConfig = config.prompts[type];
  if (!promptConfig) {
    throw new Error(`Unknown artwork prompt type: ${type}`);
  }

  const labels = questionMap(config, type);
  const lines = compactLines([
    promptConfig.system,
    promptBrief(promptConfig, answers),
    ...renderSections(promptConfig.sections, answers),
    "用户选择:",
    ...answerLines(answers, labels),
    "画面复杂度:",
    generationComplexityCopy(generationComplexity)
  ]);

  if (recommendedArtworkSize?.width_cm != null && recommendedArtworkSize?.height_cm != null) {
    lines.push(
      "建议制作尺寸:",
      `约 ${recommendedArtworkSize.width_cm} × ${recommendedArtworkSize.height_cm} cm。`,
      recommendedArtworkSize.reason ? `依据: ${recommendedArtworkSize.reason}` : "该尺寸来自环境图片估算或制作建议。"
    );
  }

  if (resolvedOrientation?.orientation && resolvedOrientation.orientation !== "unknown") {
    lines.push(
      "最终方向:",
      `方向: ${resolvedOrientation.orientation}`,
      `来源: ${resolvedOrientation.source || "unknown"}`,
      "该最终方向必须覆盖此前构图选择与环境图片判断。"
    );
  }

  if (conversationNotes) {
    lines.push("用户补充:", conversationNotes);
  }

  return lines.join("\n");
}
```

Implement `buildSizeEstimationPrompt` with:

```js
function buildSizeEstimationPrompt({
  record,
  answers = {},
  conversationNotes = "",
  resolvedOrientation = { orientation: "portrait", source: "default" },
  config
}) {
  const promptConfig = config.prompts?.sizeEstimationPrompt;
  if (!promptConfig) {
    throw new Error("Missing sizeEstimationPrompt config");
  }
  const type = record?.type || answers.work_type || "artwork";
  const labels = config?.questions?.[type] ? questionMap(config, type) : new Map();
  const readableAnswers = answerLines(answers, labels);
  return compactLines([
    promptConfig.system,
    promptConfig.task,
    ...(promptConfig.responseRules || []),
    "最终方向:",
    `orientation: ${resolvedOrientation.orientation || "portrait"}`,
    `source: ${resolvedOrientation.source || "default"}`,
    ...(promptConfig.orientationRules || []),
    "JSON schema:",
    jsonBlock(promptConfig.schema),
    "尺寸要求:",
    ...(promptConfig.sizeRules || []),
    ...(promptConfig.complexityRules || []),
    promptConfig.recordSectionTitle || "记录信息:",
    jsonBlock({
      id: record?.id || "",
      type,
      title: record?.title || ""
    }),
    promptConfig.answersSectionTitle || "用户答案:",
    readableAnswers.length ? readableAnswers.join("\n") : "无",
    promptConfig.rawAnswersSectionTitle || "用户答案原始字段:",
    jsonBlock(answers || {}),
    promptConfig.notesSectionTitle || "用户补充:",
    conversationNotes || "无"
  ]).join("\n");
}
```

Implement `buildFusionPrompt` with:

```js
function buildFusionPrompt({ record, config, referenceImages = {} }) {
  const promptConfig = config.prompts?.fusion || {
    system: "你是墨起的效果图生成提示词助手。",
    brief: "创作一幅效果图：把艺术作品={{painting}}真实摆放到环境图片中，书法或文字信息={{calligraphy}}，整体关系={{relationship}}。"
  };
  const variables = {
    painting: record.painting_description || record.artwork_path || "由墨起决定",
    calligraphy: record.calligraphy_description || record.artwork_path || "由墨起决定",
    relationship: record.relationship || "雅化原图气韵，融合中国画、书法与美光"
  };
  const recommendedArtworkSize = record.recommended_artwork_size;
  const recommendedArtworkSizeLine = recommendedArtworkSize?.width_cm != null && recommendedArtworkSize?.height_cm != null
    ? `作品建议制作尺寸约 ${recommendedArtworkSize.width_cm} × ${recommendedArtworkSize.height_cm} cm，请按这个真实尺寸感摆放到环境图片中。`
    : "";

  return compactLines([
    promptConfig.system,
    promptBrief(promptConfig, variables),
    ...renderSections(promptConfig.sections, variables),
    recommendedArtworkSizeLine,
    `原始照片: ${record.source_photo_path}`,
    `艺术作品: ${record.artwork_path}`,
    referenceImages.environment ? `环境照片参考图文件: ${referenceImages.environment}` : "",
    referenceImages.artwork ? `作品参考图文件: ${referenceImages.artwork}` : ""
  ]).join("\n");
}

module.exports = { buildArtworkPrompt, buildFusionPrompt, buildSizeEstimationPrompt };
```

- [ ] **Step 2: Run prompt tests to verify they pass**

Run:

```powershell
npm test --workspace server -- prompts.test.js
```

Expected: PASS for prompt rendering tests.

---

### Task 5: Verify Full Server Behavior

**Files:**
- No additional edits expected.

- [ ] **Step 1: Run full server test suite**

Run:

```powershell
npm test --workspace server
```

Expected: PASS. The server workspace currently runs `node --test tests/*.test.js`.

- [ ] **Step 2: Inspect changed prompt files for hardcoded static rule drift**

Run:

```powershell
rg -n "只生成作品本身|真实摆放效果图|只返回 JSON|JSON schema|尺寸要求|融合图要求" server/src/prompts.js config/prompts
```

Expected:

- Most static rule text is found in `config/prompts/*.json`.
- `server/src/prompts.js` may still contain runtime section labels such as `JSON schema:` and `尺寸要求:` only where they are renderer structure or fallback labels.

- [ ] **Step 3: Decide whether to skip real Codex verification**

Because this refactor does not change `server/src/codexRunner.js` or the Codex invocation path, `npm run verify:real` can be skipped. Report that it was skipped for scope reasons.

---

## Self-Review Checklist

- [ ] Spec goal covered: static prompt rules move to config.
- [ ] `sizeEstimationPrompt.json` created and loaded.
- [ ] `prompts.js` remains the stable exported entrypoint.
- [ ] `jobs.js` call surface unchanged.
- [ ] Tests cover config loading and rendered prompt contracts.
- [ ] No worktree or commit steps included because project rules forbid automatic worktrees and commits.

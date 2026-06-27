# Result Environment Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让作品页完整显示作品图，保存每张作品自己的环境图片，并在环境图片存在时自动生成或重试效果图。

**Architecture:** 后端继续使用现有 `source_photo_path` / `artwork_path` / `fusion_path` 字段，但在创建或更新作品时把环境图片复制到当前作品目录。前端继续复用现有轮询触发自动效果图生成，结果页根据 `source_photo_path`、`fusion_path`、`fusion_status` 切换按钮和展示状态。

**Tech Stack:** Node.js CommonJS + Express + sharp + supertest；React 18 + TypeScript + Vitest/jsdom；CSS 使用现有 `client/src/styles.css`。

---

## 项目约束

- 当前仓库规则禁止自动提交 git。本计划不包含提交步骤；每个任务结束只检查 `git diff --check` 或测试结果。
- 不创建 worktree，直接在当前 `D:\Inkspire` 工作区执行。
- 用户可见中文文案使用“环境图片/环境照片”，不再显示“场景图”。
- API 字段名保持 `source_photo_path`，避免破坏现有前后端契约。

## 文件结构

- Modify: `server/src/jobs.js`
  - 负责 record 创建、环境图片复制、fusion 复用已有环境图片、fusion 失败状态恢复。
- Modify: `server/src/app.js`
  - 负责 fusion 路由无 `source_photo_path` 时允许复用已有 record 环境图片，并把 origin/operation 参数继续传给 job manager。
- Modify: `server/tests/app.test.js`
  - 覆盖 HTTP 层环境图片复制、fusion 复用、无环境图片拒绝。
- Modify: `server/tests/jobs.test.js`
  - 覆盖 job manager 直接调用时的环境图片复制、调整继承、fusion 失败保留重试条件。
- Modify: `client/src/i18n.ts`
  - 更新中文/繁中文文案，新增已有环境图片重试按钮文案。
- Modify: `client/src/components/ResultView.tsx`
  - 区分上传环境照片和复用当前作品环境图片触发效果图。
- Modify: `client/src/App.tsx`
  - 传入新的重试回调，调用 `createFusion(record.id)` 复用已有环境图片。
- Modify: `client/src/styles.css`
  - 结果页作品图使用 `object-fit: contain`，不影响效果图和藏卷缩略图。
- Modify: `client/tests/app.test.tsx`
  - 覆盖新文案、自动 fusion 请求体、失败后 `生成效果图` 重试、调整继承环境图片。
- Modify: `client/tests/mobile-css.test.ts`
  - 覆盖结果页作品图完整显示样式。

---

### Task 1: 服务端环境图片归属测试

**Files:**
- Modify: `server/tests/app.test.js`
- Modify: `server/tests/jobs.test.js`

- [ ] **Step 1: 修改 `POST /api/generations creates a job and eventually a record with artwork` 期望**

在 `server/tests/app.test.js` 里把现有断言：

```js
assert.equal(response.body.record.source_photo_path, upload.body.source_photo_path);
```

改成：

```js
assert.equal(response.body.record.source_photo_path, `records/${response.body.record.id}/source-photo.webp`);
assert.notEqual(response.body.record.source_photo_path, upload.body.source_photo_path);
assert.equal(
  (await fs.readFile(path.join(temp, response.body.record.source_photo_path))).subarray(8, 12).toString("ascii"),
  "WEBP"
);
```

这会先失败，因为当前实现仍然把 record 指向 `records/upload-.../source-photo.webp`。

- [ ] **Step 2: 新增 fusion 无请求路径时复用已有环境图片的 HTTP 测试**

在 `server/tests/app.test.js` 的 `POST /api/records/:id/fusion can attach a source photo after artwork generation` 后添加：

```js
test("POST /api/records/:id/fusion reuses the record environment image when no path is sent", async () => {
  await withTempApp(async ({ app }) => {
    const agent = request.agent(app);
    const upload = await agent
      .post("/api/uploads/photo")
      .attach("photo", pngBuffer(130), { filename: "source.png", contentType: "image/png" })
      .expect(201);
    const created = await agent
      .post("/api/generations")
      .send({
        type: "painting",
        answers: { painting_subject: "山水" },
        source_photo_path: upload.body.source_photo_path
      })
      .expect(201);
    await waitForJob(agent, created.body.job.id);
    const record = await agent.get(`/api/records/${created.body.record.id}`).expect(200);

    const response = await agent
      .post(`/api/records/${created.body.record.id}/fusion`)
      .send({})
      .expect(201);

    assert.equal(response.body.record.source_photo_path, record.body.source_photo_path);
    assert.equal(response.body.record.status, "queued");
    await waitForJob(agent, response.body.job.id);
    const fused = await agent.get(`/api/records/${created.body.record.id}`).expect(200);
    assert.equal(fused.body.fusion_path, `records/${created.body.record.id}/fusion.webp`);
    assert.equal(fused.body.has_fusion, true);
  });
});
```

当前实现会走空路径生成，测试的关键断言可能失败或未体现 400 语义。

- [ ] **Step 3: 新增无环境图片时拒绝 fusion 的 HTTP 测试**

继续在 `server/tests/app.test.js` 添加：

```js
test("POST /api/records/:id/fusion rejects records without an environment image", async () => {
  await withTempApp(async ({ app }) => {
    const agent = request.agent(app);
    const created = await agent
      .post("/api/generations")
      .send({ type: "painting", answers: { painting_subject: "山水" } })
      .expect(201);
    await waitForJob(agent, created.body.job.id);

    const response = await agent
      .post(`/api/records/${created.body.record.id}/fusion`)
      .send({})
      .expect(400);

    assert.equal(response.body.error, "Environment image is required");
  });
});
```

当前实现不会返回这个明确错误。

- [ ] **Step 4: 新增 job manager 复制旧作品环境图片到调整新作品的测试**

在 `server/tests/jobs.test.js` 靠近第一个 create artwork 测试后添加：

```js
test("artwork creation copies the source photo into the new record directory", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const uploadRecordId = "upload-source";
    const uploadPath = path.join(temp, "records", uploadRecordId, "source-photo.webp");
    await fs.mkdir(path.dirname(uploadPath), { recursive: true });
    await fs.writeFile(uploadPath, Buffer.from("WEBP_SOURCE"));
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: fakeRunner()
    });

    const { record } = await manager.createArtwork({
      type: "painting",
      answers: { painting_subject: "山水" },
      sourcePhotoPath: `records/${uploadRecordId}/source-photo.webp`
    });

    const stored = await storage.getRecord(record.id);
    assert.equal(stored.source_photo_path, `records/${record.id}/source-photo.webp`);
    assert.equal(await fs.readFile(path.join(temp, stored.source_photo_path), "utf8"), "WEBP_SOURCE");
  });
});
```

当前实现会直接保存上传路径。

- [ ] **Step 5: 新增 fusion 失败保留环境图片和重试条件的 job 测试**

在 `server/tests/jobs.test.js` 的 `fusion failure preserves succeeded artwork record for retry` 测试中加入 `sourcePhotoPath`，或新增独立测试：

```js
test("fusion failure preserves artwork and environment image for retry", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const uploadRecordId = "upload-source";
    const uploadPath = path.join(temp, "records", uploadRecordId, "source-photo.webp");
    await fs.mkdir(path.dirname(uploadPath), { recursive: true });
    await fs.writeFile(uploadPath, Buffer.from("WEBP_SOURCE"));
    let fusionAttempts = 0;
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: async ({ outputPngPath, stage }) => {
        if (stage === "fusion_render") {
          fusionAttempts += 1;
          throw new Error("fusion failed");
        }
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer());
        return { pngPath: outputPngPath, diagnostics: { reason: "artwork_success" } };
      }
    });

    const { record } = await manager.createArtwork({
      type: "painting",
      answers: {},
      sourcePhotoPath: `records/${uploadRecordId}/source-photo.webp`
    });
    const artworkPath = record.artwork_path;
    await manager.createFusion({ recordId: record.id });
    const stored = await storage.getRecord(record.id);

    assert.equal(fusionAttempts, 2);
    assert.equal(stored.status, "succeeded");
    assert.equal(stored.fusion_status, "failed");
    assert.equal(stored.artwork_path, artworkPath);
    assert.equal(stored.source_photo_path, `records/${record.id}/source-photo.webp`);
  });
});
```

- [ ] **Step 6: 运行服务端目标测试，确认失败**

Run:

```powershell
npm test --workspace server -- app.test.js jobs.test.js
```

Expected: FAIL。失败点应集中在 `source_photo_path` 仍指向 upload 目录、fusion 空路径未拒绝或未复用已有环境图片。

---

### Task 2: 服务端环境图片复制与 fusion 复用实现

**Files:**
- Modify: `server/src/jobs.js`
- Modify: `server/src/app.js`

- [ ] **Step 1: 在 `server/src/jobs.js` 引入 fs 和路径校验 helper**

把文件顶部改成：

```js
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { convertPngToWebp } = require("./imagePipeline");
const { buildArtworkPrompt, buildFusionPrompt } = require("./prompts");
const { resolveRecordAssetPath, validateRecordAssetPath } = require("./storage");
```

并在 `VALID_OPERATIONS` 附近添加：

```js
const SOURCE_PHOTO_FILES = new Set(["source-photo.webp"]);
```

- [ ] **Step 2: 在 `server/src/jobs.js` 新增错误和复制 helper**

添加在 `diagnosticsFromError` 后：

```js
function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

async function copySourcePhotoForRecord(storage, recordId, sourcePhotoPath = "") {
  if (!sourcePhotoPath) {
    return "";
  }
  const normalizedSourcePath = validateRecordAssetPath(sourcePhotoPath, SOURCE_PHOTO_FILES);
  const ownedSourcePath = relativeRecordPath(recordId, "source-photo.webp");
  if (normalizedSourcePath === ownedSourcePath) {
    return ownedSourcePath;
  }
  const sourcePath = resolveRecordAssetPath(storage.dataDir, normalizedSourcePath, SOURCE_PHOTO_FILES);
  const destinationPath = resolveRecordAssetPath(storage.dataDir, ownedSourcePath, SOURCE_PHOTO_FILES);
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
  return ownedSourcePath;
}

function requireEnvironmentImage(record, sourcePhotoPath = "") {
  const nextSourcePhotoPath = sourcePhotoPath || record.source_photo_path || "";
  if (!nextSourcePhotoPath) {
    throw badRequest("Environment image is required");
  }
  return nextSourcePhotoPath;
}
```

- [ ] **Step 3: 在立即生成作品流程中复制环境图片**

在 `runImmediateArtwork` 里创建 `record` 前加入：

```js
const ownedSourcePhotoPath = await copySourcePhotoForRecord(storage, recordId, sourcePhotoPath);
```

然后把 record 字段：

```js
source_photo_path: sourcePhotoPath,
```

改成：

```js
source_photo_path: ownedSourcePhotoPath,
```

- [ ] **Step 4: 在排队作品流程中复制环境图片**

在 `createArtwork` 里 `const artworkPath = ...` 后加入：

```js
const ownedSourcePhotoPath = await copySourcePhotoForRecord(storage, recordId, sourcePhotoPath);
```

把 record 字段改成：

```js
source_photo_path: ownedSourcePhotoPath,
```

把 `queuedJobs.push` 里的 `sourcePhotoPath` 改成：

```js
sourcePhotoPath: ownedSourcePhotoPath,
```

如果复制失败，现有 `catch` 会删除 job 并释放 active slot；保留这个行为。

- [ ] **Step 5: 在立即 fusion 流程中复用或更新环境图片**

在 `runImmediateFusion` 读取 record 后、创建 job 前加入：

```js
const requestedSourcePhotoPath = requireEnvironmentImage(record, sourcePhotoPath);
const ownedSourcePhotoPath = await copySourcePhotoForRecord(storage, recordId, requestedSourcePhotoPath);
```

把：

```js
if (sourcePhotoPath) {
  record.source_photo_path = sourcePhotoPath;
}
```

改成：

```js
record.source_photo_path = ownedSourcePhotoPath;
```

- [ ] **Step 6: 在排队 fusion 流程中复用或更新环境图片**

在 `createFusion` 读取 record 后、计算 `createdAt` 前加入：

```js
const requestedSourcePhotoPath = requireEnvironmentImage(record, sourcePhotoPath);
const ownedSourcePhotoPath = await copySourcePhotoForRecord(storage, recordId, requestedSourcePhotoPath);
```

把：

```js
if (sourcePhotoPath) {
  record.source_photo_path = sourcePhotoPath;
}
```

改成：

```js
record.source_photo_path = ownedSourcePhotoPath;
```

把 `queuedJobs.push` 里的 `sourcePhotoPath` 改成：

```js
sourcePhotoPath: ownedSourcePhotoPath,
```

- [ ] **Step 7: 修正 `startTask` 中 fusion 的状态更新**

在 `startTask` 里保留现有：

```js
if (task.stage === "fusion_render" && task.sourcePhotoPath) {
  task.record.source_photo_path = task.sourcePhotoPath;
}
```

并在 fusion 成功分支加上：

```js
task.record.fusion_status = "succeeded";
```

成功分支最终保持：

```js
if (task.stage === "fusion_render") {
  task.record.fusion_path = task.outputWebpPath;
  task.record.has_fusion = true;
  task.record.fusion_status = "succeeded";
}
```

- [ ] **Step 8: 保持 app fusion 路由允许空路径**

确认 `server/src/app.js` 里 `/api/records/:id/fusion` 仍然调用：

```js
sourcePhotoPath: req.body.source_photo_path || req.body.sourcePhotoPath || ""
```

不在 route 层把空路径拒绝掉；空路径由 `jobs.createFusion` 根据 record 自身 `source_photo_path` 决定是否可复用或返回 400。

- [ ] **Step 9: 运行服务端目标测试**

Run:

```powershell
npm test --workspace server -- app.test.js jobs.test.js
```

Expected: PASS。

- [ ] **Step 10: 运行完整服务端测试**

Run:

```powershell
npm test --workspace server
```

Expected: PASS。

---

### Task 3: 客户端结果页行为测试

**Files:**
- Modify: `client/tests/app.test.tsx`
- Modify: `client/tests/mobile-css.test.ts`

- [ ] **Step 1: 更新测试 mock 的环境图片路径**

在 `client/tests/app.test.tsx` fetch mock 里，把生成成功 record 的默认 `source_photo_path` 从：

```ts
source_photo_path: "records/upload-1/source-photo.webp",
```

改成：

```ts
source_photo_path: "records/record-1/source-photo.webp",
```

把 fusion mock 中返回的默认 source 也改成：

```ts
source_photo_path: body.source_photo_path || "records/record-1/source-photo.webp",
```

这样客户端测试和新的服务端契约一致。

- [ ] **Step 2: 更新已有上传入口文案断言**

把所有用户可见断言中的：

```ts
"添加照片生成效果图"
```

改成：

```ts
"添加环境照片生成效果图"
```

把：

```ts
"已提供环境图，将用于生成效果图。"
```

改成：

```ts
"已提供环境图片，将用于生成效果图。"
```

把拍照步骤标题：

```ts
"可选：添加摆放环境照片"
```

改成：

```ts
"可选：添加环境照片"
```

把提示：

```ts
"用于生成摆放效果图；不添加也能直接生成作品图。"
```

改成：

```ts
"用于生成效果图；不添加也能直接生成作品图。"
```

- [ ] **Step 3: 调整自动 fusion 请求体断言**

在 `creates a fusion render after generating from an uploaded photo` 中，把断言从只检查 `POST` 扩展为：

```ts
expect(fetch).toHaveBeenCalledWith(
  "/api/records/record-1/fusion",
  expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ source_photo_path: "" })
  })
);
```

这个断言表达：作品记录已有自己的环境图片时，自动 fusion 不需要再传上传目录路径。当前实现会传 `records/upload-1/source-photo.webp`，测试应先失败。

- [ ] **Step 4: 新增已有环境图片但无效果图时显示 `生成效果图` 的测试**

在 late fusion 相关测试附近添加：

```ts
it("retries preview generation from the saved environment image", async () => {
  libraryRecords = [{
    id: "record-1",
    type: "painting",
    title: "藏卷山水",
    thumbnail_path: "records/record-1/artwork.webp",
    artwork_path: "records/record-1/artwork.webp",
    source_photo_path: "records/record-1/source-photo.webp",
    fusion_path: "",
    fusion_status: "failed",
    status: "succeeded",
    favorite: true
  }];
  const user = userEvent.setup();
  renderApp({ initialRoute: "/library" });

  await user.click(await screen.findByRole("button", { name: /查看作品 藏卷山水/ }));
  expect(await screen.findByRole("img", { name: "作品图" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "生成效果图" })).toBeInTheDocument();
  expect(screen.queryByLabelText("添加环境照片生成效果图")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "生成效果图" }));

  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith(
      "/api/records/record-1/fusion",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ source_photo_path: "" })
      })
    );
  });
});
```

当前 `ResultView` 只有上传 label，没有普通重试按钮。

- [ ] **Step 5: 更新 fusion 失败后回退按钮断言**

在 `keeps artwork visible when fusion returns a failed job` 中，把最后的入口断言从：

```ts
expect(screen.getByLabelText("添加照片生成效果图")).toBeInTheDocument();
```

改成：

```ts
expect(screen.getByRole("button", { name: "生成效果图" })).toBeInTheDocument();
expect(screen.queryByLabelText("添加环境照片生成效果图")).not.toBeInTheDocument();
```

- [ ] **Step 6: 新增调整作品继承环境图片并自动 fusion 的测试**

在 `"creates a brand-new artwork from the adjust page and returns to the base on back"` 后添加：

```ts
it("carries the saved environment image through adjustment and starts preview generation", async () => {
  libraryRecords = [{
    id: "record-1",
    type: "painting",
    title: "藏卷山水",
    thumbnail_path: "records/record-1/artwork.webp",
    artwork_path: "records/record-1/artwork.webp",
    source_photo_path: "records/record-1/source-photo.webp",
    status: "succeeded",
    favorite: true
  }];
  const user = userEvent.setup();
  renderApp({ initialRoute: "/library" });

  await user.click(await screen.findByRole("button", { name: /查看作品 藏卷山水/ }));
  await user.click(screen.getByRole("button", { name: "调整作品" }));
  await user.type(screen.getByLabelText("调整这张作品"), "更清雅");
  await user.click(screen.getByRole("button", { name: "生成调整后的作品" }));

  await waitFor(() => {
    expect(generationRequestBodies().some((body) => (
      body.conversationNotes === "更清雅"
      && body.source_photo_path === "records/record-1/source-photo.webp"
    ))).toBe(true);
  });
  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith(
      "/api/records/record-1/fusion",
      expect.objectContaining({ method: "POST" })
    );
  });
});
```

如果 mock 的调整返回 record id 是 `record-1`，保留上述断言；如果实现时 mock 被改为 `record-2` 且带 `source_photo_path`，把 fusion URL 改成 `/api/records/record-2/fusion`。

- [ ] **Step 7: 新增 CSS 完整显示测试**

在 `client/tests/mobile-css.test.ts` 添加：

```ts
it("shows result artwork with contain so the full artwork is visible", () => {
  expect(blockFor(".result-artwork-image")).toContain("object-fit: contain");
  expect(blockFor(".result-grid img,\n.image-placeholder")).not.toContain("object-fit: cover");
});
```

当前没有 `.result-artwork-image` 类，测试应先失败。

- [ ] **Step 8: 运行客户端目标测试，确认失败**

Run:

```powershell
npm test --workspace client -- app.test.tsx mobile-css.test.ts
```

Expected: FAIL。失败点应集中在旧文案、自动 fusion 请求体、缺少 `生成效果图` 回调、缺少 `.result-artwork-image` 样式。

---

### Task 4: 客户端结果页实现

**Files:**
- Modify: `client/src/i18n.ts`
- Modify: `client/src/api.ts`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/ResultView.tsx`
- Modify: `client/src/styles.css`

- [ ] **Step 1: 更新 `client/src/i18n.ts` 文案**

在 `CLIENT_OVERRIDES["zh-Hans"]` 中改为：

```ts
studio: {
  photo: "可选：添加环境照片",
  photoHint: "用于生成效果图；不添加也能直接生成作品图。",
  photoReady: "已提供环境图片，将用于生成效果图。",
  generationSummaryWithPreview: "将生成作品图和效果图。"
},
result: {
  attachPhotoFusion: "添加环境照片生成效果图",
  generateFusion: "生成效果图",
  fusionUnavailableHint: "作品图仍可继续查看，也可以稍后重新生成效果图。"
}
```

保留其他现有 key，不删除 `attachPhotoFusion`。

在 `zh-Hant` 中使用：

```ts
studio: {
  photo: "可選：加入環境照片",
  photoHint: "用於生成效果圖；不加入也能直接生成作品圖。",
  photoReady: "已提供環境圖片，將用於生成效果圖。",
  generationSummaryWithPreview: "將生成作品圖和效果圖。"
},
result: {
  attachPhotoFusion: "加入環境照片生成效果圖",
  generateFusion: "生成效果圖",
  fusionUnavailableHint: "作品圖仍可繼續查看，也可以稍後重新生成效果圖。"
}
```

在 `en` 中添加：

```ts
result: {
  generateFusion: "Generate preview"
}
```

并保留现有英文 `attachPhotoFusion`。

- [ ] **Step 2: 调整 `createFusion` 默认请求体**

在 `client/src/api.ts` 中保留函数签名：

```ts
export async function createFusion(recordId: string, sourcePhotoPath = ""): Promise<GenerationStartResult>
```

确认 body 保持：

```ts
body: JSON.stringify({ source_photo_path: sourcePhotoPath })
```

这样调用 `createFusion(recordId)` 时会发送空字符串，让后端复用 record 自己的环境图片。

- [ ] **Step 3: 扩展 `ResultViewProps`**

在 `client/src/components/ResultView.tsx` 的 props 中添加：

```ts
generateFusionLabel: string;
isGeneratingFusion?: boolean;
onGenerateFusion: () => void;
```

组件参数解构中加入：

```ts
generateFusionLabel,
isGeneratingFusion = false,
onGenerateFusion,
```

- [ ] **Step 4: 给作品图和效果图使用不同 class**

在 `ResultView.tsx` 中把作品图 img class 改为：

```tsx
className={`result-media result-artwork-image ${mediaClassName ?? ""}`.trim()}
```

把效果图 img class 改为：

```tsx
className={`result-media result-fusion-image ${mediaClassName ?? ""}`.trim()}
```

占位组件继续使用 `image-placeholder`。

- [ ] **Step 5: 计算已有环境图片和回退生成状态**

在 `ResultView` 里 `const failed = ...` 附近加入：

```ts
const hasEnvironmentImage = Boolean(record.source_photo_path);
const canRetryFusion = !failed && hasEnvironmentImage && (!fusion || record.fusion_status === "failed");
const canAttachEnvironmentPhoto = !failed && !fusion && !hasEnvironmentImage;
```

- [ ] **Step 6: 调整 action 区按钮**

把现有：

```tsx
{!failed && !fusion ? (
  <label className="secondary-action result-upload-action" ...>
    ...
  </label>
) : null}
```

改成：

```tsx
{canRetryFusion ? (
  <button
    className="secondary-action result-action-button"
    type="button"
    disabled={isGeneratingFusion}
    onClick={onGenerateFusion}
  >
    <ImagePlus aria-hidden="true" size={16} />
    {isGeneratingFusion ? busyLabel : generateFusionLabel}
  </button>
) : null}
{canAttachEnvironmentPhoto ? (
  <label className="secondary-action result-upload-action" tabIndex={0} onKeyDown={openNestedFileInput}>
    <ImagePlus aria-hidden="true" size={16} />
    {isAttachingPhoto ? busyLabel : attachPhotoLabel}
    <input
      type="file"
      accept="image/*"
      disabled={isAttachingPhoto}
      aria-label={attachPhotoLabel}
      tabIndex={-1}
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) {
          onAttachPhoto(file);
        }
        event.target.value = "";
      }}
    />
  </label>
) : null}
```

- [ ] **Step 7: 在 `App.tsx` 添加 fusion retry 状态**

在 state 区域添加：

```ts
const [isGeneratingFusion, setIsGeneratingFusion] = useState(false);
```

在 `startNewArtwork`、打开记录或切换结果错误时不需要重置；按钮状态在请求 finally 会恢复。

- [ ] **Step 8: 在 `App.tsx` 添加手动生成效果图 handler**

在 `resultSlot` 前添加：

```ts
const generateFusionFromSavedEnvironment = async () => {
  if (!currentRecord?.id) {
    return;
  }
  setIsGeneratingFusion(true);
  setResultActionError("");
  try {
    await startFusionJob(currentRecord.id);
  } catch (error) {
    setResultActionError(isGenerationLimitError(error) ? t("studio.generationLimit") : t("errors.generic"));
  } finally {
    setIsGeneratingFusion(false);
  }
};
```

- [ ] **Step 9: 传递新的 ResultView props**

在 `ResultView` 调用处加入：

```tsx
generateFusionLabel={t("result.generateFusion")}
isGeneratingFusion={isGeneratingFusion}
onGenerateFusion={generateFusionFromSavedEnvironment}
```

- [ ] **Step 10: 自动 fusion 改为复用 record 环境图片**

在 `startGenerationJob` 和 `finishRecordForJob` 中，把：

```ts
await startFusionJob(result.record.id, result.record.source_photo_path);
await startFusionJob(record.id, record.source_photo_path);
```

分别改成：

```ts
await startFusionJob(result.record.id);
await startFusionJob(record.id);
```

原因：后端已经把环境图片复制到当前 record 目录，fusion route 应复用 record 自己的 `source_photo_path`。

- [ ] **Step 11: 更新结果页 CSS**

在 `client/src/styles.css` 中把通用结果图片块从：

```css
.result-grid img,
.image-placeholder {
  width: 100%;
  aspect-ratio: 4 / 5;
  border-radius: 8px;
  object-fit: cover;
  background: linear-gradient(145deg, #f5eddf, #c7dccd);
}
```

改成：

```css
.result-media,
.image-placeholder {
  width: 100%;
  aspect-ratio: 4 / 5;
  border-radius: 8px;
  background: linear-gradient(145deg, #f5eddf, #c7dccd);
}

.result-artwork-image {
  object-fit: contain;
}

.result-fusion-image {
  object-fit: cover;
}
```

把 compact 规则从：

```css
.result-grid img.compact-result-media,
.image-placeholder.compact-result-media {
  aspect-ratio: 1 / 1;
}
```

改成：

```css
.result-media.compact-result-media,
.image-placeholder.compact-result-media {
  aspect-ratio: 1 / 1;
}
```

- [ ] **Step 12: 运行客户端目标测试**

Run:

```powershell
npm test --workspace client -- app.test.tsx mobile-css.test.ts
```

Expected: PASS。

- [ ] **Step 13: 运行完整客户端测试**

Run:

```powershell
npm test --workspace client
```

Expected: PASS。

---

### Task 5: 端到端验证和回归扫描

**Files:**
- No code changes.

- [ ] **Step 1: 运行全仓测试**

Run:

```powershell
npm test
```

Expected: PASS。

- [ ] **Step 2: 运行 E2E**

Run:

```powershell
npm run e2e
```

Expected: PASS。若端口 `5173` 或 `3101` 已被占用，先按测试输出定位占用进程，再重跑；不要把端口占用误判为应用回归。

- [ ] **Step 3: 运行 diff 空白检查**

Run:

```powershell
git diff --check
```

Expected: no output。

- [ ] **Step 4: 文案残留扫描**

Run:

```powershell
rg -n "场景图|环境图|添加照片生成效果图|用已有场景图" client config server docs/superpowers/specs docs/superpowers/plans
```

Expected: 只允许设计文档和计划文档中出现“旧文案改为新文案”的说明；运行 UI 代码和测试中不应出现旧用户文案。

- [ ] **Step 5: 手动接口抽查**

如果本地服务已运行，执行：

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/health
```

Expected: `ok` 为 `true`，`runtime.webp` 为 `ready`。如果服务未运行，本步骤可跳过，并在完成报告说明没有做 live server 抽查。

---

## 自审记录

- Spec 覆盖：
  - 完整作品图：Task 3 Step 7、Task 4 Step 4、Task 4 Step 11。
  - 每张作品保存环境图片：Task 1 Step 1、Task 1 Step 4、Task 2 Step 2-4。
  - 自动生成效果图：Task 3 Step 3、Task 4 Step 10。
  - 失败后回退 `生成效果图`：Task 3 Step 4-5、Task 4 Step 3、Task 4 Step 6、Task 4 Step 8-9。
  - 调整作品继承环境图片：Task 3 Step 6、Task 2 Step 4。
  - 文案统一：Task 3 Step 2、Task 4 Step 1、Task 5 Step 4。
- 占位符扫描：没有未决占位、延后实现标记或未具体化的“写测试”步骤。
- 类型一致性：计划中新增前端 prop 名为 `generateFusionLabel`、`isGeneratingFusion`、`onGenerateFusion`；后端 helper 名为 `copySourcePhotoForRecord`、`requireEnvironmentImage`；API 字段仍为 `source_photo_path`。
- 项目规则一致性：未包含提交步骤，未要求创建 worktree。

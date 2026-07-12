const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { PNG } = require("pngjs");
const sharp = require("sharp");
const { createStorage } = require("../src/storage");
const { createJobManager: createRawJobManager } = require("../src/jobs");
const sizeEstimationPrompt = require("../../config/prompts/sizeEstimationPrompt.json");
const calligraphyVerification = {
  minimumConfidence: 0.8,
  system: "独立检查书法候选图文字，只返回 JSON。",
  brief: "核对期望正文={{expected_text}}。"
};

function createJobManager(options) {
  return createRawJobManager({
    ...options,
    config: {
      ...options.config,
      prompts: {
        sizeEstimationPrompt,
        calligraphyVerification,
        ...(options.config?.prompts || {})
      }
    }
  });
}

async function withTempStore(fn) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "inkspire-jobs-"));
  try {
    await fn(temp);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 25));
    await fs.rm(temp, { recursive: true, force: true });
  }
}

async function waitUntil(predicate, timeoutMs = 2000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for condition");
}

function pngBuffer(red = 40) {
  return sizedPngBuffer(2, 3, red);
}

function pngBufferForCanvas(canvas, red = 40) {
  if (!canvas) return pngBuffer(red);
  const divisor = greatestCommonDivisor(canvas.width, canvas.height);
  return sizedPngBuffer(canvas.width / divisor, canvas.height / divisor, red);
}

function greatestCommonDivisor(left, right) {
  let a = Math.round(left);
  let b = Math.round(right);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function sizedPngBuffer(width, height, red = 40) {
  const png = new PNG({ width, height });
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data[offset] = red;
    png.data[offset + 1] = 80;
    png.data[offset + 2] = 120;
    png.data[offset + 3] = 255;
  }
  return PNG.sync.write(png);
}

function fakeRunner(red = 40) {
  return async ({ outputPngPath, stage }) => {
    if (stage === "size_estimation") {
      return {
        json: {
          generation_complexity: "medium",
          recommended_artwork_size: {
            width_cm: 45,
            height_cm: 70,
            reason: "测试默认环境估算"
          }
        }
      };
    }
    await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
    await fs.writeFile(outputPngPath, pngBuffer(red));
    return { pngPath: outputPngPath, diagnostics: { reason: "fake_runner" } };
  };
}

async function writeSourcePhoto(temp, recordId = "upload-source", content = "WEBP_SOURCE") {
  const sourcePath = path.join(temp, "records", recordId, "source-photo.webp");
  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await fs.writeFile(sourcePath, Buffer.from(content));
  return `records/${recordId}/source-photo.webp`;
}

async function writeSourcePhotoImage(temp, recordId = "upload-source", { width = 120, height = 80, color = { r: 32, g: 96, b: 128 } } = {}) {
  const sourcePath = path.join(temp, "records", recordId, "source-photo.webp");
  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { ...color, alpha: 1 }
    }
  })
    .webp()
    .toFile(sourcePath);
  return `records/${recordId}/source-photo.webp`;
}

async function writeClassicArtwork(projectRoot, fileName = "trusted.webp") {
  const assetPath = path.join(projectRoot, "client", "public", "classic-artworks", fileName);
  await fs.mkdir(path.dirname(assetPath), { recursive: true });
  await fs.writeFile(assetPath, Buffer.from("TRUSTED_CLASSIC_ARTWORK"));
  return assetPath;
}

function classicArtworkConfig(projectRoot, classicArtworks) {
  return {
    _projectRoot: projectRoot,
    app: { image: { webpQuality: 82 } },
    classicArtworks,
    prompts: {},
    questions: {}
  };
}

async function readRawImage(filePath) {
  const input = await fs.readFile(filePath);
  const image = sharp(input);
  const metadata = await image.metadata();
  const data = await image.ensureAlpha().raw().toBuffer();
  return { width: metadata.width, height: metadata.height, data };
}

function pixelAt(image, x, y) {
  const offset = (image.width * y + x) << 2;
  return Array.from(image.data.subarray(offset, offset + 4));
}

function assertColorClose(actual, expected, tolerance = 5) {
  assert.equal(actual.length, expected.length);
  for (let index = 0; index < actual.length; index += 1) {
    assert.ok(
      Math.abs(actual[index] - expected[index]) <= tolerance,
      `channel ${index}: expected ${actual[index]} to be within ${tolerance} of ${expected[index]}`
    );
  }
}

test("create artwork job writes artwork.webp and record.json using fake runner PNG", async () => {
  await withTempStore(async (temp) => {
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner: fakeRunner()
    });

    const { job, record } = await manager.createArtwork({
      type: "painting",
      answers: { painting_subject: "山水" },
      conversationNotes: "云气"
    });

    const stored = await createStorage(temp).getRecord(record.id);

    assert.equal(job.status, "succeeded");
    assert.equal(record.status, "succeeded");
    assert.equal(stored.status, "succeeded");
    assert.equal(record.artwork_path, `records/${record.id}/artwork.webp`);
    assert.equal((await fs.readFile(path.join(temp, record.artwork_path))).subarray(0, 4).toString("ascii"), "RIFF");
  });
});

test("immediate artwork render uses only the configured classic artwork file", async () => {
  await withTempStore(async (temp) => {
    const projectRoot = path.join(temp, "project");
    const trustedPath = await writeClassicArtwork(projectRoot);
    await fs.mkdir(path.join(projectRoot, "client", "public", "classic-artworks", "directory.webp"));
    const runnerCalls = [];
    const manager = createJobManager({
      config: classicArtworkConfig(projectRoot, [
        { id: "trusted", image: "/classic-artworks/trusted.webp" },
        { id: "traversal", image: "/classic-artworks/../secret.webp" },
        { id: "encoded-traversal", image: "/classic-artworks/%2e%2e/secret.webp" },
        { id: "absolute", image: "C:/private/secret.webp" },
        { id: "wrong-public-folder", image: "/uploads/secret.webp" },
        { id: "missing", image: "/classic-artworks/missing.webp" },
        { id: "directory", image: "/classic-artworks/directory.webp" }
      ]),
      storage: createStorage(path.join(temp, "data")),
      runner: async (options) => {
        runnerCalls.push(options);
        await fs.mkdir(path.dirname(options.outputPngPath), { recursive: true });
        await fs.writeFile(options.outputPngPath, pngBufferForCanvas(options.canvas));
        return { pngPath: options.outputPngPath, diagnostics: { reason: "classic_reference" } };
      }
    });

    const requests = [
      {
        creation_mode: "classic_reference",
        classic_artwork_id: "trusted",
        classic_artwork_image: "C:/client-controlled/override.webp"
      },
      {
        creation_mode: "free",
        classic_artwork_id: "trusted",
        classic_artwork_image: "/classic-artworks/trusted.webp"
      },
      {
        creation_mode: "classic_reference",
        classic_artwork_id: "unknown",
        classic_artwork_image: "/classic-artworks/trusted.webp"
      },
      { creation_mode: "classic_reference" },
      { creation_mode: "classic_reference", classic_artwork_id: "" },
      { creation_mode: "classic_reference", classic_artwork_id: 42 },
      ...["traversal", "encoded-traversal", "absolute", "wrong-public-folder", "missing", "directory"].map((classicArtworkId) => ({
        creation_mode: "classic_reference",
        classic_artwork_id: classicArtworkId
      }))
    ];

    const results = [];
    for (const answers of requests) results.push(await manager.createArtwork({ type: "painting", answers }));

    assert.deepEqual(runnerCalls[0].referenceImages, { classicArtwork: trustedPath });
    assert.equal(runnerCalls[1].referenceImages, undefined);
    assert.equal(runnerCalls.length, 2);
    for (const result of results.slice(2)) {
      assert.equal(result.job.status, "failed");
      assert.equal(result.record.status, "failed");
      assert.equal(result.job.error, "classic artwork reference unavailable");
      assert.equal(result.record.error, "classic artwork reference unavailable");
      assert.deepEqual(result.record.diagnostics, { reason: "classic_reference_unavailable" });
    }
  });
});

test("classic artwork canonical path cannot escape through a nested directory link", async (t) => {
  await withTempStore(async (temp) => {
    const projectRoot = path.join(temp, "project");
    const classicRoot = path.join(projectRoot, "client", "public", "classic-artworks");
    const outsideRoot = path.join(temp, "outside-classic-assets");
    await fs.mkdir(classicRoot, { recursive: true });
    await fs.mkdir(outsideRoot, { recursive: true });
    await fs.writeFile(path.join(outsideRoot, "secret.webp"), Buffer.from("OUTSIDE_FILE"));
    try {
      await fs.symlink(
        outsideRoot,
        path.join(classicRoot, "linked"),
        process.platform === "win32" ? "junction" : "dir"
      );
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP", "UNKNOWN"].includes(error.code)) {
        t.skip(`directory links are unavailable on this platform: ${error.code}`);
        return;
      }
      throw error;
    }

    let runnerCalled = false;
    const manager = createJobManager({
      config: classicArtworkConfig(projectRoot, [
        { id: "linked", image: "/classic-artworks/linked/secret.webp" }
      ]),
      storage: createStorage(path.join(temp, "data")),
      runner: async () => {
        runnerCalled = true;
        throw new Error("runner must not receive an escaping classic reference");
      }
    });

    const result = await manager.createArtwork({
      type: "painting",
      answers: { creation_mode: "classic_reference", classic_artwork_id: "linked" }
    });

    assert.equal(runnerCalled, false);
    assert.equal(result.job.status, "failed");
    assert.equal(result.record.status, "failed");
    assert.equal(result.record.error, "classic artwork reference unavailable");
    assert.deepEqual(result.record.diagnostics, { reason: "classic_reference_unavailable" });
  });
});

test("queued artwork render passes the trusted classic reference without affecting other runner stages", async () => {
  await withTempStore(async (temp) => {
    const projectRoot = path.join(temp, "project");
    const trustedPath = await writeClassicArtwork(projectRoot);
    const runnerCalls = [];
    const manager = createJobManager({
      config: classicArtworkConfig(projectRoot, [
        { id: "trusted", image: "/classic-artworks/trusted.webp" }
      ]),
      storage: createStorage(path.join(temp, "data")),
      runner: async (options) => {
        runnerCalls.push(options);
        await fs.mkdir(path.dirname(options.outputPngPath), { recursive: true });
        await fs.writeFile(options.outputPngPath, pngBufferForCanvas(options.canvas));
        return { pngPath: options.outputPngPath, diagnostics: { reason: "queued_classic_reference" } };
      }
    });

    const trustedResult = await manager.createArtwork({
      userId: "classic-user",
      type: "painting",
      answers: {
        creation_mode: "classic_reference",
        classic_artwork_id: "trusted",
        classic_artwork_image: "../../client-controlled.webp"
      }
    });
    const freeResult = await manager.createArtwork({
      userId: "free-user",
      type: "painting",
      answers: {
        creation_mode: "free",
        classic_artwork_id: "trusted"
      }
    });
    const unknownResult = await manager.createArtwork({
      userId: "unknown-user",
      type: "painting",
      answers: {
        creation_mode: "classic_reference",
        classic_artwork_id: "missing",
        classic_artwork_image: "/classic-artworks/trusted.webp"
      }
    });
    const missingIdResult = await manager.createArtwork({
      userId: "missing-id-user",
      type: "painting",
      answers: { creation_mode: "classic_reference" }
    });
    const emptyIdResult = await manager.createArtwork({
      userId: "empty-id-user",
      type: "painting",
      answers: { creation_mode: "classic_reference", classic_artwork_id: "" }
    });
    const nonStringIdResult = await manager.createArtwork({
      userId: "non-string-id-user",
      type: "painting",
      answers: { creation_mode: "classic_reference", classic_artwork_id: { client: "controlled" } }
    });
    await manager.waitForIdle();

    const artworkCalls = runnerCalls.filter(({ stage }) => stage === "artwork");
    const trustedCall = artworkCalls.find(({ record }) => record.user_id === "classic-user");
    const freeCall = artworkCalls.find(({ record }) => record.user_id === "free-user");
    const unknownCall = artworkCalls.find(({ record }) => record.user_id === "unknown-user");
    assert.deepEqual(trustedCall.referenceImages, { classicArtwork: trustedPath });
    assert.equal(freeCall.referenceImages, undefined);
    assert.equal(unknownCall, undefined);
    assert.equal(manager.getJob(trustedResult.job.id, "classic-user").status, "succeeded");
    assert.equal(manager.getJob(freeResult.job.id, "free-user").status, "succeeded");
    const unknownJob = manager.getJob(unknownResult.job.id, "unknown-user");
    const unknownRecord = await createStorage(path.join(temp, "data")).getRecord(unknownResult.record.id);
    assert.equal(unknownJob.status, "failed");
    assert.equal(unknownJob.error, "classic artwork reference unavailable");
    assert.equal(unknownRecord.status, "failed");
    assert.equal(unknownRecord.error, "classic artwork reference unavailable");
    assert.deepEqual(unknownRecord.diagnostics, { reason: "classic_reference_unavailable" });
    for (const [userId, result] of [
      ["missing-id-user", missingIdResult],
      ["empty-id-user", emptyIdResult],
      ["non-string-id-user", nonStringIdResult]
    ]) {
      assert.equal(artworkCalls.find(({ record }) => record.user_id === userId), undefined);
      const job = manager.getJob(result.job.id, userId);
      const record = await createStorage(path.join(temp, "data")).getRecord(result.record.id);
      assert.equal(job.status, "failed");
      assert.equal(job.error, "classic artwork reference unavailable");
      assert.equal(record.status, "failed");
      assert.equal(record.error, "classic artwork reference unavailable");
      assert.deepEqual(record.diagnostics, { reason: "classic_reference_unavailable" });
    }
  });
});

test("classic artwork titles use five trusted curated names before Chinese ordinals", async () => {
  await withTempStore(async (temp) => {
    const projectRoot = path.join(temp, "project");
    await writeClassicArtwork(projectRoot);
    const titles = ["溪山清韵", "云壑松声", "烟岚归舟", "松风入画", "远水含光"];
    const manager = createJobManager({
      config: classicArtworkConfig(projectRoot, [
        { id: "trusted", image: "/classic-artworks/trusted.webp", new_artwork_titles: titles },
        { id: "malformed", image: "/classic-artworks/trusted.webp", new_artwork_titles: Array(5).fill("重复题") },
        { id: "non-chinese", image: "/classic-artworks/trusted.webp", new_artwork_titles: ["First", "Second", "Third", "Fourth", "Fifth"] }
      ]),
      storage: createStorage(path.join(temp, "data")),
      runner: fakeRunner()
    });
    const generatedTitles = [];

    for (let index = 0; index < 6; index += 1) {
      const result = await manager.createArtwork({
        userId: "classic-title-user",
        type: "painting",
        answers: { creation_mode: "classic_reference", classic_artwork_id: "trusted" }
      });
      generatedTitles.push(result.record.title);
      await manager.waitForIdle();
    }

    assert.deepEqual(generatedTitles, [...titles, `${titles[0]} 其一`]);

    const malformed = await manager.createArtwork({
      userId: "malformed-classic-title-user",
      type: "painting",
      answers: {
        creation_mode: "classic_reference",
        classic_artwork_id: "malformed",
        new_artwork_titles: ["客户端伪造题名"]
      }
    });
    assert.notEqual(malformed.record.title, "重复题");
    assert.notEqual(malformed.record.title, "客户端伪造题名");
    await manager.waitForIdle();

    const nonChinese = await manager.createArtwork({
      userId: "non-chinese-classic-title-user",
      type: "painting",
      answers: { creation_mode: "classic_reference", classic_artwork_id: "non-chinese" }
    });
    assert.notEqual(nonChinese.record.title, "First");
    await manager.waitForIdle();
  });
});

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

test("calligraphy duplicate titles use Chinese ordinals without truncating the text", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: fakeRunner()
    });
    const text = "明月松间照清泉石上流竹喧归浣女莲动下渔舟";

    const first = await manager.createArtwork({ userId: "calligraphy-user", type: "calligraphy", answers: { text } });
    await manager.waitForIdle();
    const second = await manager.createArtwork({ userId: "calligraphy-user", type: "calligraphy", answers: { text } });
    await manager.waitForIdle();
    const third = await manager.createArtwork({ userId: "calligraphy-user", type: "calligraphy", answers: { text } });
    await manager.waitForIdle();

    assert.deepEqual(
      [first.record.title, second.record.title, third.record.title],
      [text, `${text} 其一`, `${text} 其二`]
    );
  });
});

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
    assert.match(record.title, /^[\u3400-\u9fff]{4,}$/);
  });
});

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

test("concurrent tabs reserve different titles for the same user", async () => {
  await withTempStore(async (temp) => {
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner: fakeRunner()
    });
    const request = {
      userId: "concurrent-title-user",
      type: "painting",
      answers: { painting_subject: "山水" }
    };

    const [studio, library] = await Promise.all([
      manager.createArtwork({ ...request, originTab: "studio" }),
      manager.createArtwork({ ...request, originTab: "library" })
    ]);
    const titles = [studio.record.title, library.record.title];
    const baseTitle = titles.find((title) => !/ 其[一二三四五六七八九十百千]+$/.test(title));
    await manager.waitForIdle();

    assert.ok(baseTitle);
    assert.deepEqual(new Set(titles), new Set([baseTitle, `${baseTitle} 其一`]));
  });
});

test("artwork creation copies the source photo into the new record directory", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const sourcePhotoPath = await writeSourcePhoto(temp);
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: fakeRunner()
    });

    const { record } = await manager.createArtwork({
      type: "painting",
      answers: { painting_subject: "山水" },
      sourcePhotoPath
    });

    const stored = await storage.getRecord(record.id);
    assert.equal(stored.source_photo_path, `records/${record.id}/source-photo.webp`);
    assert.equal(await fs.readFile(path.join(temp, stored.source_photo_path), "utf8"), "WEBP_SOURCE");
  });
});

test("an explicit density choice remains canonical through environment estimation", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const sourcePhotoPath = await writeSourcePhotoImage(temp);
    const runnerCalls = [];
    const manager = createJobManager({
      config: {
        app: { image: { webpQuality: 82 } },
        prompts: {
          painting: {
            system: "国画系统",
            template: "国画模板 {{answers}} {{notes}}"
          }
        },
        questions: {}
      },
      storage,
      runner: async ({ outputPngPath, prompt, referenceImages, stage, record }) => {
        runnerCalls.push({
          stage,
          prompt,
          referenceImages,
          generationComplexity: record.generation_complexity,
          recommendedArtworkSize: record.recommended_artwork_size
        });
        if (stage === "size_estimation") {
          return {
            json: {
              generation_complexity: "large",
              recommended_artwork_size: {
                preset_id: "environment-wall",
                label: "环境主墙",
                width_cm: 72,
                height_cm: 38,
                reason: "按玄关墙面估算"
              }
            }
          };
        }
        assert.equal(stage, "artwork");
        assert.equal(record.generation_complexity, "small");
        assert.deepEqual(record.recommended_artwork_size, {
          preset_id: "environment_estimate_small",
          label: "疏朗参考尺寸",
          width_cm: 45,
          height_cm: 65,
          reason: "根据所提供环境图片的可用墙面或陈设比例估算尺寸，并结合疏朗布局与作品幅式。"
        });
        assert.match(prompt, /疏朗/);
        assert.match(prompt, /45 × 65 cm/);
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer(120));
        return { pngPath: outputPngPath, diagnostics: { reason: "artwork_success" } };
      }
    });

    const { record } = await manager.createArtwork({
      type: "painting",
      answers: {
        work_type: "painting",
        painting_composition_orientation: "portrait"
      },
      sourcePhotoPath,
      generationComplexity: "small"
    });
    const stored = await storage.getRecord(record.id);

    assert.deepEqual(runnerCalls.map((call) => call.stage), ["size_estimation", "artwork"]);
    assert.deepEqual(runnerCalls[0].referenceImages, {
      environment: path.join(temp, "records", record.id, "source-photo.webp")
    });
    assert.equal(stored.generation_complexity, "small");
    assert.equal(stored.generation_complexity_explicit, true);
    assert.equal(stored.recommended_artwork_size.preset_id, "environment_estimate_small");
    assert.equal(stored.recommended_artwork_size.width_cm, 45);
    assert.equal(stored.recommended_artwork_size.height_cm, 65);
  });
});

test("environment estimation becomes the canonical density when the user did not choose one", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const sourcePhotoPath = await writeSourcePhotoImage(temp);
    let artworkPrompt = "";
    const manager = createJobManager({
      config: {
        app: { image: { webpQuality: 82 } },
        prompts: { painting: { system: "国画系统", template: "国画模板 {{answers}} {{notes}}" } },
        questions: {}
      },
      storage,
      runner: async ({ outputPngPath, prompt, stage, record }) => {
        if (stage === "size_estimation") {
          return {
            json: {
              generation_complexity: "small",
              recommended_artwork_size: {
                preset_id: "arbitrary-ai-id",
                label: "AI 自拟小幅",
                width_cm: 30,
                height_cm: 45,
                reason: "AI 自拟理由"
              }
            }
          };
        }
        artworkPrompt = prompt;
        assert.equal(record.generation_complexity, "small");
        assert.equal(record.recommended_artwork_size.preset_id, "environment_estimate_small");
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, sizedPngBuffer(60, 90, 75));
        return { pngPath: outputPngPath, diagnostics: { reason: "artwork_success" } };
      }
    });

    const { record } = await manager.createArtwork({
      type: "painting",
      answers: { work_type: "painting" },
      sourcePhotoPath
    });
    const stored = await storage.getRecord(record.id);

    assert.equal(stored.generation_complexity, "small");
    assert.equal(stored.generation_complexity_explicit, false);
    assert.equal(stored.recommended_artwork_size.preset_id, "environment_estimate_small");
    assert.equal(stored.recommended_artwork_size.label, "疏朗参考尺寸");
    assert.match(stored.recommended_artwork_size.reason, /疏朗布局/);
    assert.match(artworkPrompt, /疏朗：/);
    assert.doesNotMatch(artworkPrompt, /均衡：/);
  });
});

test("estimated density provenance can adopt a new estimate during regeneration", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const sourcePhotoPath = await writeSourcePhotoImage(temp);
    let estimateNumber = 0;
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: async ({ outputPngPath, stage }) => {
        if (stage === "size_estimation") {
          estimateNumber += 1;
          const density = estimateNumber === 1 ? "small" : "large";
          return {
            json: {
              generation_complexity: density,
              recommended_artwork_size: { width_cm: density === "small" ? 30 : 60, height_cm: density === "small" ? 45 : 90 }
            }
          };
        }
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, sizedPngBuffer(60, 90, 75));
        return { pngPath: outputPngPath, diagnostics: { reason: "artwork_success" } };
      }
    });

    const first = await manager.createArtwork({ type: "painting", answers: {}, sourcePhotoPath });
    const firstStored = await storage.getRecord(first.record.id);
    const regenerated = await manager.createArtwork({
      type: "painting",
      answers: {},
      sourcePhotoPath,
      generationComplexity: firstStored.generation_complexity,
      generationComplexityExplicit: firstStored.generation_complexity_explicit
    });
    const regeneratedStored = await storage.getRecord(regenerated.record.id);

    assert.equal(firstStored.generation_complexity, "small");
    assert.equal(firstStored.generation_complexity_explicit, false);
    assert.equal(regeneratedStored.generation_complexity, "large");
    assert.equal(regeneratedStored.generation_complexity_explicit, false);
    assert.equal(regeneratedStored.recommended_artwork_size.preset_id, "environment_estimate_large");
  });
});

test("artwork render receives the selected horizontal canvas without leaking it to other runner stages", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const sourcePhotoPath = await writeSourcePhotoImage(temp);
    const runnerCalls = [];
    const manager = createJobManager({
      config: {
        app: {
          image: { webpQuality: 82 },
          runtime: {
            generationCanvas: { width: 1024, height: 1536, aspectRatio: "2:3" }
          }
        },
        prompts: {},
        questions: {}
      },
      storage,
      runner: async (options) => {
        runnerCalls.push(options);
        if (options.stage === "size_estimation") {
          return {
            json: {
              generation_complexity: "medium",
              recommended_artwork_size: { width_cm: 70, height_cm: 45 }
            }
          };
        }
        await fs.mkdir(path.dirname(options.outputPngPath), { recursive: true });
        await fs.writeFile(options.outputPngPath, pngBufferForCanvas(options.canvas));
        return { pngPath: options.outputPngPath, diagnostics: { reason: options.stage } };
      }
    });

    const { record } = await manager.createArtwork({
      type: "painting",
      answers: { work_type: "painting", painting_format: "横幅" },
      sourcePhotoPath
    });
    await manager.createFusion({ recordId: record.id });

    const artworkCall = runnerCalls.find(({ stage }) => stage === "artwork");
    const nonArtworkCalls = runnerCalls.filter(({ stage }) => stage !== "artwork");
    assert.deepEqual(artworkCall.canvas, {
      width: 1536,
      height: 1024,
      aspectRatio: "3:2",
      orientation: "landscape"
    });
    assert.ok(nonArtworkCalls.some(({ stage }) => stage === "size_estimation"));
    assert.ok(nonArtworkCalls.some(({ stage }) => stage === "fusion_render"));
    for (const call of nonArtworkCalls) {
      assert.equal(call.canvas, undefined, call.stage);
    }
  });
});

test("immediate artwork canvas uses runtime fallback and lets known format win over legacy direction", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const runnerCalls = [];
    const manager = createJobManager({
      config: {
        app: {
          image: { webpQuality: 82 },
          runtime: { generationCanvas: { width: 1024, height: 1024, aspectRatio: "1:1" } }
        },
        prompts: {
          painting: { system: "国画系统", template: "国画模板 {{answers}} {{notes}}" }
        },
        questions: {}
      },
      storage,
      runner: async (options) => {
        runnerCalls.push(options);
        await fs.mkdir(path.dirname(options.outputPngPath), { recursive: true });
        await fs.writeFile(options.outputPngPath, pngBufferForCanvas(options.canvas));
        return { pngPath: options.outputPngPath, diagnostics: { reason: "canvas_precedence" } };
      }
    });

    const fallback = await manager.createArtwork({
      type: "painting",
      answers: { work_type: "painting" }
    });
    const handscroll = await manager.createArtwork({
      type: "painting",
      answers: {
        work_type: "painting",
        painting_format: "Handscroll",
        painting_composition_orientation: "portrait"
      }
    });
    const fallbackStored = await storage.getRecord(fallback.record.id);
    const handscrollStored = await storage.getRecord(handscroll.record.id);
    const fallbackCall = runnerCalls.find(({ record }) => record.id === fallback.record.id);
    const handscrollCall = runnerCalls.find(({ record }) => record.id === handscroll.record.id);

    assert.deepEqual(
      fallbackCall.canvas,
      { width: 1024, height: 1024, aspectRatio: "1:1", orientation: "square" }
    );
    assert.deepEqual(
      handscrollCall.canvas,
      { width: 1536, height: 768, aspectRatio: "2:1", orientation: "landscape" }
    );
    assert.equal(fallbackStored.resolved_orientation, "square");
    assert.equal(fallbackStored.orientation_source, "runtime_fallback");
    assert.match(fallbackCall.prompt, /方向: square/);
    assert.match(fallbackCall.prompt, /来源: runtime_fallback/);
    assert.equal(handscrollStored.resolved_orientation, "landscape");
    assert.equal(handscrollStored.orientation_source, "question");
    assert.match(handscrollCall.prompt, /方向: landscape/);
    assert.match(handscrollCall.prompt, /来源: question/);
  });
});

test("queued artwork canvas uses runtime fallback while notes override a known format", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const runnerCalls = [];
    const manager = createJobManager({
      config: {
        app: {
          image: { webpQuality: 82 },
          runtime: { generationCanvas: { width: 1024, height: 1024, aspectRatio: "1:1" } }
        },
        prompts: {
          painting: { system: "国画系统", template: "国画模板 {{answers}} {{notes}}" }
        },
        questions: {}
      },
      storage,
      runner: async (options) => {
        runnerCalls.push(options);
        await fs.mkdir(path.dirname(options.outputPngPath), { recursive: true });
        await fs.writeFile(options.outputPngPath, pngBufferForCanvas(options.canvas));
        return { pngPath: options.outputPngPath, diagnostics: { reason: "queued_canvas_precedence" } };
      }
    });

    const fallback = await manager.createArtwork({
      userId: "user-canvas",
      type: "painting",
      answers: { work_type: "painting" }
    });
    await manager.waitForIdle();
    const noteOverride = await manager.createArtwork({
      userId: "user-canvas",
      type: "painting",
      answers: { work_type: "painting", painting_format: "Handscroll" },
      conversationNotes: "最后改成竖幅"
    });
    await manager.waitForIdle();
    const fallbackStored = await storage.getRecord(fallback.record.id);
    const noteStored = await storage.getRecord(noteOverride.record.id);
    const fallbackCall = runnerCalls.find(({ record }) => record.id === fallback.record.id);
    const noteCall = runnerCalls.find(({ record }) => record.id === noteOverride.record.id);

    assert.deepEqual(
      fallbackCall.canvas,
      { width: 1024, height: 1024, aspectRatio: "1:1", orientation: "square" }
    );
    assert.deepEqual(
      noteCall.canvas,
      { width: 1024, height: 1536, aspectRatio: "2:3", orientation: "portrait" }
    );
    assert.equal(fallbackStored.resolved_orientation, "square");
    assert.equal(fallbackStored.orientation_source, "runtime_fallback");
    assert.match(fallbackCall.prompt, /方向: square/);
    assert.match(fallbackCall.prompt, /来源: runtime_fallback/);
    assert.equal(noteStored.resolved_orientation, "portrait");
    assert.equal(noteStored.orientation_source, "notes");
    assert.match(noteCall.prompt, /方向: portrait/);
    assert.match(noteCall.prompt, /来源: notes/);
  });
});

test("handscroll environment estimation persists a recommendation near the 2:1 artwork ratio", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const sourcePhotoPath = await writeSourcePhotoImage(temp);
    let sizeEstimationPrompt = "";
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: async ({ outputPngPath, prompt, stage, canvas }) => {
        if (stage === "size_estimation") {
          sizeEstimationPrompt = prompt;
          return {
            json: {
              generation_complexity: "medium",
              recommended_artwork_size: { width_cm: 70, height_cm: 45 }
            }
          };
        }
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBufferForCanvas(canvas));
        return { pngPath: outputPngPath, diagnostics: { reason: "handscroll_artwork" } };
      }
    });

    const { record } = await manager.createArtwork({
      type: "painting",
      answers: {
        work_type: "painting",
        painting_format: "Handscroll",
        painting_composition_orientation: "portrait"
      },
      sourcePhotoPath
    });
    const stored = await storage.getRecord(record.id);
    const ratio = stored.recommended_artwork_size.width_cm / stored.recommended_artwork_size.height_cm;

    assert.ok(Math.abs(ratio - 2) <= 0.1, `expected approximately 2:1, got ${ratio}:1`);
    assert.equal(stored.resolved_orientation, "landscape");
    assert.equal(stored.orientation_source, "question");
    assert.match(sizeEstimationPrompt, /orientation: landscape/);
    assert.match(sizeEstimationPrompt, /source: question/);
  });
});

test("handscroll environment estimation failure normalizes the persisted default size to 2:1", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const sourcePhotoPath = await writeSourcePhotoImage(temp);
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: async ({ outputPngPath, stage }) => {
        if (stage === "size_estimation") throw new Error("estimation unavailable");
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer());
        return { pngPath: outputPngPath, diagnostics: { reason: "handscroll_fallback_artwork" } };
      }
    });

    const { record } = await manager.createArtwork({
      type: "painting",
      answers: { work_type: "painting", painting_format: "Handscroll" },
      sourcePhotoPath
    });
    const stored = await storage.getRecord(record.id);
    const ratio = stored.recommended_artwork_size.width_cm / stored.recommended_artwork_size.height_cm;

    assert.ok(Math.abs(ratio - 2) <= 0.1, `expected approximately 2:1, got ${ratio}:1`);
    assert.notDeepEqual(
      [stored.recommended_artwork_size.width_cm, stored.recommended_artwork_size.height_cm],
      [45, 70]
    );
  });
});

test("artwork without environment image stores complexity, resolved orientation, prompt metadata, and recommended size", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const runnerCalls = [];
    const manager = createJobManager({
      config: {
        app: { image: { webpQuality: 82 } },
        prompts: {
          painting: {
            system: "国画系统",
            template: "国画模板 {{answers}} {{notes}}"
          }
        },
        questions: {}
      },
      storage,
      runner: async ({ outputPngPath, prompt }) => {
        runnerCalls.push({ prompt });
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, sizedPngBuffer(60, 90, 75));
        return { pngPath: outputPngPath, diagnostics: { reason: "portrait_runner" } };
      }
    });

    const created = await manager.createArtwork({
      userId: "user-a",
      type: "painting",
      answers: { work_type: "painting" },
      generationComplexity: "large"
    });

    await manager.waitForIdle();
    const stored = await storage.getRecord(created.record.id);
    const artworkMetadata = await sharp(await fs.readFile(path.join(temp, stored.artwork_path))).metadata();

    assert.equal(stored.generation_complexity, "large");
    assert.equal(stored.resolved_orientation, "portrait");
    assert.equal(stored.orientation_source, "default");
    assert.equal(stored.recommended_artwork_size.preset_id, "complexity_large");
    assert.ok(stored.recommended_artwork_size.width_cm < stored.recommended_artwork_size.height_cm);
    assert.equal(artworkMetadata.width, 60);
    assert.equal(artworkMetadata.height, 90);
    assert.match(runnerCalls[0].prompt, /画面疏密与虚实倾向:/);
    assert.doesNotMatch(runnerCalls[0].prompt, /画面复杂度:/);
    assert.match(runnerCalls[0].prompt, /繁密：密处交织有序，虚处仍留气口与呼吸。/);
    assert.doesNotMatch(runnerCalls[0].prompt, /信息量较低|层次丰富但仍有虚处/);
    assert.match(runnerCalls[0].prompt, /最终方向:/);
    assert.match(runnerCalls[0].prompt, /portrait/);
  });
});

test("artwork source photo copy failure releases the origin tab slot", async () => {
  await withTempStore(async (temp) => {
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner: fakeRunner()
    });

    await assert.rejects(
      manager.createArtwork({
        userId: "user-a",
        type: "painting",
        answers: {},
        originTab: "studio",
        sourcePhotoPath: "records/missing-source/source-photo.webp"
      }),
      /ENOENT/
    );

    const second = await manager.createArtwork({
      userId: "user-a",
      type: "painting",
      answers: {},
      originTab: "studio"
    });

    assert.notEqual(second.limitReached, true);
    assert.ok(["queued", "running"].includes(second.job.status));
    assert.equal(second.job.origin_tab, "studio");
    await manager.waitForIdle();
  });
});

test("fusion job preserves existing artwork and writes fusion.webp", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: fakeRunner(180)
    });
    const sourcePhotoPath = await writeSourcePhotoImage(temp);
    const { record } = await manager.createArtwork({ type: "painting", answers: {}, sourcePhotoPath });
    const artworkPath = record.artwork_path;

    const result = await manager.createFusion({ recordId: record.id });
    const fused = await storage.getRecord(record.id);

    assert.equal(result.job.status, "succeeded");
    assert.equal(fused.artwork_path, artworkPath);
    assert.equal(fused.fusion_path, `records/${record.id}/fusion.webp`);
    assert.equal(fused.has_fusion, true);
    assert.equal((await fs.readFile(path.join(temp, fused.fusion_path))).subarray(8, 12).toString("ascii"), "WEBP");
  });
});

test("fusion job sends a realistic placement prompt to the image runner", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const runnerCalls = [];
    const manager = createJobManager({
      config: {
        app: { image: { webpQuality: 100 } },
        prompts: {
          fusion: {
            system: "效果图系统提示",
            template: "效果图模板 {{painting}} {{calligraphy}} {{relationship}}",
            sections: [
              {
                title: "融合图要求",
                lines: [
                  "生成真实摆放效果图。",
                  "这不是简单叠加。"
                ]
              }
            ]
          }
        },
        questions: {}
      },
      storage,
      runner: async ({ outputPngPath, prompt, referenceImages, stage, record }) => {
        runnerCalls.push({ prompt, referenceImages, stage, recordId: record.id });
        if (stage === "size_estimation") {
          return {
            json: {
              generation_complexity: "medium",
              recommended_artwork_size: { width_cm: 45, height_cm: 70, reason: "测试环境估算" }
            }
          };
        }
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer(stage === "fusion_render" ? 210 : 80));
        return { pngPath: outputPngPath, diagnostics: { reason: `${stage}_runner` } };
      }
    });
    const sourcePhotoPath = await writeSourcePhotoImage(temp, "upload-source", {
      width: 120,
      height: 80,
      color: { r: 32, g: 96, b: 128 }
    });
    const { record } = await manager.createArtwork({ type: "painting", answers: {}, sourcePhotoPath });

    await manager.createFusion({ recordId: record.id });
    const fused = await storage.getRecord(record.id);
    const renderCalls = runnerCalls.filter((call) => call.stage !== "size_estimation");
    const fusionRenderCall = runnerCalls.find((call) => call.stage === "fusion_render");

    assert.equal(renderCalls.length, 2);
    assert.equal(fusionRenderCall.stage, "fusion_render");
    assert.equal(fusionRenderCall.recordId, record.id);
    assert.match(fusionRenderCall.prompt, /真实摆放效果/);
    assert.match(fusionRenderCall.prompt, /不是简单叠加/);
    assert.match(fusionRenderCall.prompt, new RegExp(`records/${record.id}/source-photo\\.webp`));
    assert.match(fusionRenderCall.prompt, new RegExp(`records/${record.id}/artwork\\.webp`));
    assert.deepEqual(fusionRenderCall.referenceImages, {
      environment: path.join(temp, "records", record.id, "source-photo.webp"),
      artwork: path.join(temp, "records", record.id, "artwork.webp")
    });
    assert.equal(fused.diagnostics.reason, "fusion_render_runner");
  });
});

test("fusion job estimates and stores recommended size before AI render", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const runnerCalls = [];
    const manager = createJobManager({
      config: {
        app: { image: { webpQuality: 100 } },
        prompts: {
          fusion: {
            system: "效果图系统提示",
            template: "效果图模板 {{painting}} {{calligraphy}} {{relationship}}",
            sections: [
              {
                title: "融合图要求",
                lines: [
                  "生成真实摆放效果图。",
                  "这不是简单叠加。"
                ]
              }
            ]
          }
        },
        questions: {}
      },
      storage,
      runner: async ({ outputPngPath, prompt, referenceImages, stage, record }) => {
        runnerCalls.push({
          stage,
          prompt,
          referenceImages,
          generationComplexity: record.generation_complexity,
          recommendedArtworkSize: record.recommended_artwork_size
        });
        if (stage === "size_estimation") {
          return {
            text: JSON.stringify({
              generation_complexity: "large",
              recommended_artwork_size: {
                preset_id: "fusion-wall",
                label: "融合墙面",
                width_cm: 112,
                height_cm: 58,
                reason: "按沙发背景墙估算"
              }
            })
          };
        }
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer(stage === "fusion_render" ? 210 : 80));
        return { pngPath: outputPngPath, diagnostics: { reason: `${stage}_success` } };
      }
    });
    const sourcePhotoPath = await writeSourcePhotoImage(temp);
    const created = await manager.createArtwork({
      userId: "user-a",
      type: "painting",
      answers: {
        work_type: "painting",
        painting_composition_orientation: "landscape"
      },
      generationComplexity: "small"
    });
    await manager.waitForIdle();

    await manager.createFusion({ userId: "user-a", recordId: created.record.id, sourcePhotoPath });
    await manager.waitForIdle();
    const fused = await storage.getRecord(created.record.id);
    const stages = runnerCalls.map((call) => call.stage);
    const sizeIndex = stages.indexOf("size_estimation");
    const fusionIndex = stages.indexOf("fusion_render");
    const fusionRenderCall = runnerCalls[fusionIndex];

    assert.ok(sizeIndex > -1);
    assert.ok(fusionIndex > -1);
    assert.ok(sizeIndex < fusionIndex);
    assert.deepEqual(runnerCalls[sizeIndex].referenceImages, {
      environment: path.join(temp, "records", created.record.id, "source-photo.webp")
    });
    assert.deepEqual(fusionRenderCall.recommendedArtworkSize, {
      preset_id: "environment_estimate_small",
      label: "疏朗参考尺寸",
      width_cm: 110,
      height_cm: 60,
      reason: "根据所提供环境图片的可用墙面或陈设比例估算尺寸，并结合疏朗布局与作品幅式。"
    });
    assert.equal(fusionRenderCall.generationComplexity, "small");
    assert.match(fusionRenderCall.prompt, /110 × 60 cm/);
    assert.equal(fused.recommended_artwork_size.width_cm, 110);
    assert.equal(fused.recommended_artwork_size.height_cm, 60);
    assert.equal(fused.generation_complexity, "small");
  });
});

test("fusion preserves the finalized artwork orientation instead of resolving conflicting raw answers", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const sourcePhotoPath = await writeSourcePhotoImage(temp);
    let fusionSizePrompt = "";
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: async ({ outputPngPath, prompt, stage, canvas }) => {
        if (stage === "size_estimation") {
          fusionSizePrompt = prompt;
          return {
            json: {
              generation_complexity: "medium",
              recommended_artwork_size: { width_cm: 70, height_cm: 45 }
            }
          };
        }
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBufferForCanvas(canvas));
        return { pngPath: outputPngPath, diagnostics: { reason: stage } };
      }
    });

    const created = await manager.createArtwork({
      userId: "user-final-orientation",
      type: "painting",
      answers: {
        work_type: "painting",
        painting_format: "Handscroll",
        painting_composition_orientation: "portrait"
      }
    });
    await manager.waitForIdle();
    const artwork = await storage.getRecord(created.record.id);

    assert.equal(artwork.resolved_orientation, "landscape");
    assert.equal(artwork.orientation_source, "question");

    await manager.createFusion({
      userId: "user-final-orientation",
      recordId: created.record.id,
      sourcePhotoPath
    });
    await manager.waitForIdle();
    const fused = await storage.getRecord(created.record.id);

    assert.equal(fused.resolved_orientation, "landscape");
    assert.equal(fused.orientation_source, "question");
    assert.equal(fused.recommended_artwork_size.width_cm, 70);
    assert.equal(fused.recommended_artwork_size.height_cm, 45);
    assert.match(fusionSizePrompt, /orientation: landscape/);
    assert.match(fusionSizePrompt, /source: question/);
  });
});

test("successful artwork generation persists a long-term generation profile", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const sourcePhotoPath = await writeSourcePhotoImage(temp);
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: fakeRunner(120)
    });

    const { job, record } = await manager.createArtwork({ type: "painting", answers: {}, sourcePhotoPath });
    await manager.waitForIdle();
    const stored = await storage.getRecord(record.id);
    const finalJob = manager.getJob(job.id);

    assert.equal(stored.generation_profile.created_at, record.generation_profile.created_at);
    assert.equal(typeof stored.generation_profile.total_ms, "number");
    assert.ok(stored.generation_profile.total_ms >= 0);
    assert.equal(stored.generation_profile.stages.copy_source_photo.count, 1);
    assert.equal(stored.generation_profile.stages.size_estimation.count, 1);
    assert.equal(stored.generation_profile.stages.codex_artwork.count, 1);
    assert.equal(stored.generation_profile.stages.webp_conversion.count, 1);
    assert.equal(stored.generation_profile.stages.record_save.count >= 1, true);
    assert.deepEqual(stored.generation_profile.attempts.map((attempt) => attempt.stage), ["size_estimation", "artwork"]);
    assert.deepEqual(stored.generation_profile.attempts.map((attempt) => attempt.status), ["succeeded", "succeeded"]);
    assert.deepEqual(finalJob.generation_profile, stored.generation_profile);
  });
});

test("successful fusion generation persists a long-term generation profile", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const sourcePhotoPath = await writeSourcePhotoImage(temp);
    const manager = createJobManager({
      config: {
        app: { image: { webpQuality: 82 } },
        prompts: {
          fusion: {
            system: "效果图系统提示",
            template: "效果图模板 {{painting}} {{calligraphy}} {{relationship}}",
            sections: [
              {
                title: "融合图要求",
                lines: [
                  "生成真实摆放效果图。",
                  "这不是简单叠加。"
                ]
              }
            ]
          }
        },
        questions: {}
      },
      storage,
      runner: fakeRunner(140)
    });

    const { record } = await manager.createArtwork({ type: "painting", answers: {}, sourcePhotoPath });
    await manager.waitForIdle();
    const { job } = await manager.createFusion({ recordId: record.id });
    await manager.waitForIdle();
    const stored = await storage.getRecord(record.id);
    const finalJob = manager.getJob(job.id);

    assert.equal(stored.generation_profile.stages.copy_source_photo.count, 1);
    assert.equal(stored.generation_profile.stages.size_estimation.count, 1);
    assert.equal(stored.generation_profile.stages.codex_fusion_render.count, 1);
    assert.equal(stored.generation_profile.stages.webp_conversion.count, 1);
    assert.deepEqual(stored.generation_profile.attempts.map((attempt) => attempt.stage), ["size_estimation", "fusion_render"]);
    assert.deepEqual(finalJob.generation_profile, stored.generation_profile);
  });
});

test("concurrent default user generation returns a locked busy result", async () => {
  await withTempStore(async (temp) => {
    let release;
    let runnerStarted;
    const started = new Promise((resolve) => {
      runnerStarted = resolve;
    });
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner: async ({ outputPngPath }) => {
        runnerStarted();
        await new Promise((resolve) => {
          release = resolve;
        });
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer());
        return { pngPath: outputPngPath, diagnostics: { reason: "slow" } };
      }
    });

    const first = manager.createArtwork({ type: "painting", answers: {} });
    await started;
    const second = await manager.createArtwork({ type: "painting", answers: {} });
    release();
    await first;

    assert.equal(second.busy, true);
    assert.equal(second.job.status, "failed");
    assert.match(second.job.error, /busy|locked/i);
  });
});

test("artwork creation returns immediately while runner continues in background", async () => {
  await withTempStore(async (temp) => {
    let release;
    let started = false;
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner: async ({ outputPngPath }) => {
        started = true;
        await new Promise((resolve) => {
          release = resolve;
        });
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer());
        return { pngPath: outputPngPath, diagnostics: { reason: "slow" } };
      }
    });

    const result = await manager.createArtwork({ userId: "user-a", type: "painting", answers: {} });

    assert.equal(result.job.status, "queued");
    assert.equal(result.record.status, "queued");
    assert.equal(started, false);

    await manager.waitForJobStart(result.job.id);
    await waitUntil(() => started);
    assert.equal(started, true);
    release();
    await manager.waitForIdle();

    const stored = await createStorage(temp).getRecord(result.record.id);
    assert.equal(manager.getJob(result.job.id, "user-a").status, "succeeded");
    assert.equal(result.job.status, "queued");
    assert.equal(result.record.status, "queued");
    assert.equal(stored.status, "succeeded");
  });
});

test("artwork creation with source photo returns before size estimation finishes", async () => {
  await withTempStore(async (temp) => {
    const sourcePhotoPath = await writeSourcePhotoImage(temp);
    let releaseSizeEstimation;
    let sizeEstimationStarted = false;
    let settled = false;
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner: async ({ outputPngPath, stage }) => {
        if (stage === "size_estimation") {
          sizeEstimationStarted = true;
          await new Promise((resolve) => {
            releaseSizeEstimation = resolve;
          });
          return {
            json: {
              generation_complexity: "medium",
              recommended_artwork_size: { width_cm: 45, height_cm: 70, reason: "测试环境估算" }
            }
          };
        }
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer());
        return { pngPath: outputPngPath, diagnostics: { reason: "artwork_success" } };
      }
    });

    const resultPromise = manager.createArtwork({
      userId: "user-a",
      type: "painting",
      answers: {},
      sourcePhotoPath
    });
    resultPromise.then(() => {
      settled = true;
    });

    await waitUntil(() => sizeEstimationStarted);
    await new Promise((resolve) => setTimeout(resolve, 25));
    try {
      assert.equal(settled, true);
    } finally {
      releaseSizeEstimation();
      const result = await resultPromise;
      await manager.waitForIdle();
      assert.equal(manager.getJob(result.job.id, "user-a").status, "succeeded");
    }
  });
});

test("getJob keeps legacy lookup compatibility while enforcing explicit owner mismatch", async () => {
  await withTempStore(async (temp) => {
    let release;
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner: async ({ outputPngPath }) => {
        await new Promise((resolve) => {
          release = resolve;
        });
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer());
        return { pngPath: outputPngPath, diagnostics: { reason: "slow" } };
      }
    });

    const result = await manager.createArtwork({ userId: "user-a", type: "painting", answers: {} });

    assert.equal(manager.getJob(result.job.id).id, result.job.id);
    assert.equal(manager.getJob(result.job.id, "user-a").id, result.job.id);
    assert.equal(manager.getJob(result.job.id, "user-b"), null);

    await manager.waitForJobStart(result.job.id);
    await waitUntil(() => typeof release === "function");
    release();
    await manager.waitForIdle();
  });
});

test("default studio tab rejects the second active generation", async () => {
  await withTempStore(async (temp) => {
    const releases = new Map();
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner: async ({ outputPngPath }) => {
        await new Promise((resolve) => {
          releases.set(outputPngPath, resolve);
        });
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer());
        return { pngPath: outputPngPath, diagnostics: { reason: "slow" } };
      }
    });

    const first = await manager.createArtwork({ userId: "user-a", type: "painting", answers: {}, originTab: "studio" });
    const second = await manager.createArtwork({ userId: "user-a", type: "painting", answers: {}, originTab: "studio" });

    assert.ok(["queued", "running"].includes(first.job.status));
    assert.equal(first.job.origin_tab, "studio");
    assert.equal(first.job.operation, "create");
    assert.equal(second.limitReached, true);
    assert.equal(second.code, "tab_generation_limit_reached");
    assert.equal(second.origin_tab, "studio");
    assert.equal(second.activeJobs.length, 1);

    await waitUntil(() => releases.size === 1);
    for (const release of releases.values()) {
      release();
    }
    await manager.waitForIdle();
  });
});

test("limits active jobs independently per origin tab", async () => {
  await withTempStore(async (temp) => {
    const releases = new Map();
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner: async ({ outputPngPath, record }) => {
        await new Promise((resolve) => releases.set(record.id, resolve));
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer());
        return { pngPath: outputPngPath, diagnostics: { reason: "slow" } };
      }
    });

    const studio = await manager.createArtwork({
      userId: "user-a",
      type: "painting",
      answers: {},
      originTab: "studio",
      operation: "create"
    });
    const studioRejected = await manager.createArtwork({
      userId: "user-a",
      type: "painting",
      answers: {},
      originTab: "studio",
      operation: "create"
    });
    const library = await manager.createArtwork({
      userId: "user-a",
      type: "painting",
      answers: {},
      originTab: "library",
      operation: "adjust"
    });
    const libraryRejected = await manager.createArtwork({
      userId: "user-a",
      type: "painting",
      answers: {},
      originTab: "library",
      operation: "adjust"
    });

    assert.ok(["queued", "running"].includes(studio.job.status));
    assert.equal(studio.job.origin_tab, "studio");
    assert.equal(studio.job.operation, "create");
    assert.equal(studioRejected.limitReached, true);
    assert.equal(studioRejected.code, "tab_generation_limit_reached");
    assert.equal(studioRejected.origin_tab, "studio");
    assert.equal(studioRejected.activeJobs.length, 1);
    assert.equal(studioRejected.activeJobs[0].origin_tab, "studio");

    assert.ok(["queued", "running"].includes(library.job.status));
    assert.equal(library.job.origin_tab, "library");
    assert.equal(library.job.operation, "adjust");
    assert.equal(libraryRejected.limitReached, true);
    assert.equal(libraryRejected.code, "tab_generation_limit_reached");
    assert.equal(libraryRejected.origin_tab, "library");
    assert.equal(libraryRejected.activeJobs.length, 1);
    assert.equal(libraryRejected.activeJobs[0].origin_tab, "library");
    assert.equal(manager.listActiveJobs("user-a").length, 2);

    await waitUntil(() => releases.size === 2);
    for (const release of releases.values()) release();
    await manager.waitForIdle();
  });
});

test("failed authenticated jobs release the origin tab slot", async () => {
  await withTempStore(async (temp) => {
    let failedRecordId = "";
    let secondRelease;
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner: async ({ outputPngPath, record }) => {
        if (!failedRecordId) {
          failedRecordId = record.id;
        }
        if (record.id === failedRecordId) {
          const error = new Error("first job failed");
          error.diagnostics = { reason: "first_job_failed" };
          throw error;
        }

        await new Promise((resolve) => {
          secondRelease = resolve;
        });
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer());
        return { pngPath: outputPngPath, diagnostics: { reason: "second_job_success" } };
      }
    });

    const first = await manager.createArtwork({
      userId: "user-a",
      type: "painting",
      answers: {},
      originTab: "studio"
    });
    await manager.waitForIdle();

    assert.equal(manager.getJob(first.job.id, "user-a").status, "failed");

    const second = await manager.createArtwork({
      userId: "user-a",
      type: "painting",
      answers: {},
      originTab: "studio"
    });

    assert.notEqual(second.limitReached, true);
    assert.ok(["queued", "running"].includes(second.job.status));
    assert.equal(second.job.origin_tab, "studio");

    await manager.waitForJobStart(second.job.id);
    await waitUntil(() => typeof secondRelease === "function");
    secondRelease();
    await manager.waitForIdle();
  });
});

test("user fusion creation returns immediately", async () => {
  await withTempStore(async (temp) => {
    const sourcePhotoPath = await writeSourcePhotoImage(temp);
    let runnerCalls = 0;
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner: async ({ outputPngPath, stage }) => {
        if (stage === "size_estimation") {
          return {
            json: {
              generation_complexity: "medium",
              recommended_artwork_size: { width_cm: 45, height_cm: 70, reason: "测试环境估算" }
            }
          };
        }
        runnerCalls += 1;
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer());
        return { pngPath: outputPngPath, diagnostics: { reason: "slow" } };
      }
    });

    const created = await manager.createArtwork({ userId: "user-a", type: "painting", answers: {}, sourcePhotoPath });
    await manager.waitForIdle();

    const result = await manager.createFusion({ userId: "user-a", recordId: created.record.id });

    assert.ok(["queued", "running"].includes(result.job.status));
    assert.equal(result.job.origin_tab, "studio");
    assert.equal(result.job.operation, "create");
    assert.equal(result.record.status, "queued");
    assert.equal(runnerCalls, 1);
    await manager.waitForJobStart(result.job.id);
    await manager.waitForIdle();
    assert.equal(manager.getJob(result.job.id, "user-a").status, "succeeded");
  });
});

test("user fusion creation returns before size estimation finishes", async () => {
  await withTempStore(async (temp) => {
    const sourcePhotoPath = await writeSourcePhotoImage(temp);
    let blockFusionSizeEstimation = false;
    let releaseSizeEstimation;
    let sizeEstimationStarted = false;
    let settled = false;
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner: async ({ outputPngPath, stage }) => {
        if (stage === "size_estimation") {
          if (blockFusionSizeEstimation) {
            sizeEstimationStarted = true;
            await new Promise((resolve) => {
              releaseSizeEstimation = resolve;
            });
          }
          return {
            json: {
              generation_complexity: "medium",
              recommended_artwork_size: { width_cm: 45, height_cm: 70, reason: "测试环境估算" }
            }
          };
        }
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer());
        return { pngPath: outputPngPath, diagnostics: { reason: stage } };
      }
    });

    const created = await manager.createArtwork({ userId: "user-a", type: "painting", answers: {}, sourcePhotoPath });
    await manager.waitForIdle();
    blockFusionSizeEstimation = true;

    const resultPromise = manager.createFusion({ userId: "user-a", recordId: created.record.id });
    resultPromise.then(() => {
      settled = true;
    });

    await waitUntil(() => sizeEstimationStarted);
    await new Promise((resolve) => setTimeout(resolve, 25));
    try {
      assert.equal(settled, true);
    } finally {
      releaseSizeEstimation();
      const result = await resultPromise;
      await manager.waitForIdle();
      assert.equal(manager.getJob(result.job.id, "user-a").status, "succeeded");
    }
  });
});

test("global concurrency runs six jobs and queues the seventh", async () => {
  await withTempStore(async (temp) => {
    const releases = new Map();
    const startedIds = [];
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner: async ({ outputPngPath, record }) => {
        startedIds.push(record.id);
        await new Promise((resolve) => {
          releases.set(record.id, resolve);
        });
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer());
        return { pngPath: outputPngPath, diagnostics: { reason: "slow" } };
      }
    });

    const jobs = [];
    for (let index = 0; index < 7; index += 1) {
      jobs.push(await manager.createArtwork({
        userId: `user-${index}`,
        type: "painting",
        answers: {}
      }));
    }

    await waitUntil(() => releases.size === 6);
    assert.equal(startedIds.length, 6);
    assert.equal(jobs[6].job.status, "queued");
    assert.equal(jobs[6].record.status, "queued");

    for (const id of startedIds) {
      releases.get(id)();
    }
    await manager.waitForJobStart(jobs[6].job.id);
    await waitUntil(() => releases.has(jobs[6].record.id));
    releases.get(jobs[6].record.id)();
    await manager.waitForIdle();

    assert.equal(manager.getJob(jobs[6].job.id).status, "succeeded");
    assert.equal((await createStorage(temp).getRecord(jobs[6].record.id)).status, "succeeded");
  });
});

test("legacy default generation counts toward global concurrency", async () => {
  await withTempStore(async (temp) => {
    const releases = new Map();
    const startedIds = [];
    let releaseLegacy;
    let legacyStarted = false;
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner: async ({ outputPngPath, record }) => {
        if (!record.user_id) {
          legacyStarted = true;
          await new Promise((resolve) => {
            releaseLegacy = resolve;
          });
        } else {
          startedIds.push(record.id);
          await new Promise((resolve) => {
            releases.set(record.id, resolve);
          });
        }
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer());
        return { pngPath: outputPngPath, diagnostics: { reason: "slow" } };
      }
    });

    const legacy = manager.createArtwork({ type: "painting", answers: {} });
    await waitUntil(() => legacyStarted);

    const jobs = [];
    for (let index = 0; index < 6; index += 1) {
      jobs.push(await manager.createArtwork({
        userId: `user-${index}`,
        type: "painting",
        answers: {}
      }));
    }

    await waitUntil(() => releases.size === 5);
    assert.equal(startedIds.length, 5);
    assert.equal(jobs[5].job.status, "queued");

    releaseLegacy();
    await legacy;
    await manager.waitForJobStart(jobs[5].job.id);
    await waitUntil(() => releases.has(jobs[5].record.id));

    for (const release of releases.values()) {
      release();
    }
    await manager.waitForIdle();
  });
});

test("completed jobs free per-user capacity", async () => {
  await withTempStore(async (temp) => {
    const releases = new Map();
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner: async ({ outputPngPath, record }) => {
        await new Promise((resolve) => {
          releases.set(record.id, resolve);
        });
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer());
        return { pngPath: outputPngPath, diagnostics: { reason: "slow" } };
      }
    });

    const first = await manager.createArtwork({ userId: "user-a", type: "painting", answers: {}, originTab: "studio" });
    const second = await manager.createArtwork({ userId: "user-a", type: "painting", answers: {}, originTab: "library" });

    await Promise.all([
      manager.waitForJobStart(first.job.id),
      manager.waitForJobStart(second.job.id)
    ]);

    await manager.waitForRunningCount("user-a", 2);

    const thirdRejected = await manager.createArtwork({ userId: "user-a", type: "painting", answers: {}, originTab: "studio" });
    assert.equal(thirdRejected.limitReached, true);
    assert.equal(thirdRejected.origin_tab, "studio");

    await waitUntil(() => releases.size === 2);
    releases.get(first.record.id)();
    await waitUntil(() => manager.listActiveJobs("user-a").length === 1);

    const third = await manager.createArtwork({ userId: "user-a", type: "painting", answers: {}, originTab: "studio" });

    assert.ok(["queued", "running"].includes(third.job.status));
    assert.ok(["queued", "running"].includes(third.record.status));

    await waitUntil(() => releases.has(third.record.id));
    releases.get(second.record.id)();
    releases.get(third.record.id)?.();
    await manager.waitForIdle();
  });
});

test("artwork failure records failed status and diagnostics", async () => {
  await withTempStore(async (temp) => {
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner: async () => {
        const error = new Error("fake policy refusal");
        error.diagnostics = { possible_safety_block: true };
        throw error;
      }
    });

    const { job, record } = await manager.createArtwork({ type: "painting", answers: {} });
    await manager.waitForIdle();
    const stored = await createStorage(temp).getRecord(record.id);

    assert.equal(manager.getJob(job.id).status, "failed");
    assert.equal(record.status, "failed");
    assert.equal(stored.status, "failed");
    assert.equal(stored.diagnostics.possible_safety_block, true);
    assert.equal(stored.generation_profile.attempts[0].status, "failed");
    assert.equal(stored.generation_profile.attempts[0].error, "fake policy refusal");
    assert.equal(manager.getJob(job.id).generation_profile.attempts[0].status, "failed");
    assert.match(manager.getJob(job.id).error, /fake policy refusal/);
  });
});

test("fusion runner failure preserves succeeded artwork record for retry", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const sourcePhotoPath = await writeSourcePhotoImage(temp);
    const manager = createJobManager({
      config: {
        app: { image: { webpQuality: 82 } },
        prompts: {
          fusion: {
            system: "效果图系统提示",
            template: "效果图模板 {{painting}} {{calligraphy}} {{relationship}}"
          }
        },
        questions: {}
      },
      storage,
      runner: async ({ outputPngPath, stage }) => {
        if (stage === "fusion_render") {
          const error = new Error("fusion render failed");
          error.diagnostics = { reason: "fusion_runner_failed" };
          throw error;
        }
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer(90));
        return { pngPath: outputPngPath, diagnostics: { reason: "artwork_success" } };
      }
    });
    const { record } = await manager.createArtwork({ type: "painting", answers: {}, sourcePhotoPath });
    await manager.waitForIdle();
    const artworkPath = record.artwork_path;

    const { job } = await manager.createFusion({ recordId: record.id });
    await manager.waitForIdle();
    const stored = await storage.getRecord(record.id);

    assert.equal(manager.getJob(job.id).status, "failed");
    assert.equal(stored.status, "succeeded");
    assert.equal(stored.fusion_status, "failed");
    assert.equal(stored.artwork_path, artworkPath);
    assert.equal(stored.fusion_path, undefined);
    assert.equal(stored.has_fusion, undefined);
    assert.equal(stored.diagnostics.reason, "fusion_runner_failed");
  });
});

test("fusion failure preserves artwork and environment image for retry", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const sourcePhotoPath = await writeSourcePhotoImage(temp);
    const manager = createJobManager({
      config: {
        app: { image: { webpQuality: 82 } },
        prompts: {
          fusion: {
            system: "效果图系统提示",
            template: "效果图模板 {{painting}} {{calligraphy}} {{relationship}}"
          }
        },
        questions: {}
      },
      storage,
      runner: async ({ outputPngPath, stage }) => {
        if (stage === "fusion_render") {
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
      sourcePhotoPath
    });
    const artworkPath = record.artwork_path;
    await manager.createFusion({ recordId: record.id });
    const stored = await storage.getRecord(record.id);

    assert.equal(stored.status, "succeeded");
    assert.equal(stored.fusion_status, "failed");
    assert.equal(stored.artwork_path, artworkPath);
    assert.equal(stored.source_photo_path, `records/${record.id}/source-photo.webp`);
    assert.equal((await fs.readFile(path.join(temp, stored.source_photo_path))).subarray(8, 12).toString("ascii"), "WEBP");
  });
});

test("artwork generation retries once before recording failure", async () => {
  await withTempStore(async (temp) => {
    let attempts = 0;
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner: async ({ outputPngPath }) => {
        attempts += 1;
        if (attempts === 1) {
          const error = new Error("temporary codex issue");
          error.diagnostics = { reason: "temporary" };
          throw error;
        }
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer(210));
        return { pngPath: outputPngPath, diagnostics: { reason: "retry_success" } };
      }
    });

    const { job, record } = await manager.createArtwork({ type: "painting", answers: {} });
    await manager.waitForIdle();

    assert.equal(attempts, 2);
    const stored = await createStorage(temp).getRecord(record.id);
    assert.equal(manager.getJob(job.id).status, "succeeded");
    assert.equal(record.status, "succeeded");
    assert.equal(stored.status, "succeeded");
    assert.equal(stored.diagnostics.reason, "retry_success");
    assert.deepEqual(stored.generation_profile.attempts.map((attempt) => attempt.status), ["failed", "succeeded"]);
    assert.equal(stored.generation_profile.attempts[0].error, "temporary codex issue");
    assert.equal(stored.generation_profile.attempts[1].stage, "artwork");
    assert.equal((await fs.readFile(path.join(temp, record.artwork_path))).subarray(0, 4).toString("ascii"), "RIFF");
  });
});

test("immediate artwork retries an aspect mismatch and sizes from the accepted PNG", async () => {
  await withTempStore(async (temp) => {
    let attempts = 0;
    const storage = createStorage(temp);
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: async ({ outputPngPath }) => {
        attempts += 1;
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(
          outputPngPath,
          attempts === 1 ? sizedPngBuffer(800, 800) : sizedPngBuffer(800, 400)
        );
        return { pngPath: outputPngPath, diagnostics: { reason: `attempt_${attempts}` } };
      }
    });

    const { job, record } = await manager.createArtwork({
      type: "painting",
      answers: { work_type: "painting", painting_format: "手卷" }
    });
    const stored = await storage.getRecord(record.id);

    assert.equal(attempts, 2);
    assert.equal(job.status, "succeeded");
    assert.equal(stored.status, "succeeded");
    assert.equal(stored.resolved_orientation, "landscape");
    assert.equal(stored.diagnostics.reason, "attempt_2");
    assert.equal(
      stored.recommended_artwork_size.width_cm / stored.recommended_artwork_size.height_cm,
      2
    );
    assert.deepEqual(
      stored.generation_profile.attempts.map(({ status }) => status),
      ["failed", "succeeded"]
    );
  });
});

test("queued artwork fails after two aspect mismatches without persisting WEBP", async () => {
  await withTempStore(async (temp) => {
    let attempts = 0;
    const storage = createStorage(temp);
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: async ({ outputPngPath }) => {
        attempts += 1;
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, sizedPngBuffer(800, 400));
        return { pngPath: outputPngPath, diagnostics: { reason: "ignored_square_canvas" } };
      }
    });

    const created = await manager.createArtwork({
      userId: "user-aspect",
      type: "painting",
      answers: { work_type: "painting", painting_format: "斗方" }
    });
    await manager.waitForIdle();
    const stored = await storage.getRecord(created.record.id);
    const finalJob = manager.getJob(created.job.id);

    assert.equal(attempts, 2);
    assert.equal(finalJob.status, "failed");
    assert.equal(finalJob.diagnostics.reason, "artwork_aspect_mismatch");
    assert.equal(stored.status, "failed");
    assert.equal(stored.diagnostics.reason, "artwork_aspect_mismatch");
    await assert.rejects(fs.access(path.join(temp, stored.artwork_path)));
    await assert.rejects(fs.access(path.join(temp, "records", stored.id, "artwork.png")));
  });
});

test("artwork retry cannot reuse a PNG left by a runner failure", async () => {
  await withTempStore(async (temp) => {
    let attempts = 0;
    const storage = createStorage(temp);
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: async ({ outputPngPath }) => {
        attempts += 1;
        if (attempts === 1) {
          await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
          await fs.writeFile(outputPngPath, sizedPngBuffer(640, 640));
          throw new Error("runner failed after writing output");
        }
        return { pngPath: outputPngPath, diagnostics: { reason: "stale_output" } };
      }
    });

    const { job, record } = await manager.createArtwork({
      type: "painting",
      answers: { work_type: "painting", painting_format: "斗方" }
    });
    const stored = await storage.getRecord(record.id);

    assert.equal(attempts, 2);
    assert.equal(job.status, "failed");
    assert.equal(stored.status, "failed");
    await assert.rejects(fs.access(path.join(temp, stored.artwork_path)));
    await assert.rejects(fs.access(path.join(temp, "records", stored.id, "artwork.png")));
  });
});

test("artwork accepts proportionally scaled handscroll and square PNGs", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: async ({ outputPngPath, canvas }) => {
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        const buffer = canvas.aspectRatio === "2:1"
          ? sizedPngBuffer(800, 400)
          : sizedPngBuffer(640, 640);
        await fs.writeFile(outputPngPath, buffer);
        return { pngPath: outputPngPath, diagnostics: { reason: "scaled_canvas" } };
      }
    });

    const handscroll = await manager.createArtwork({
      type: "painting",
      answers: { work_type: "painting", painting_format: "手卷" }
    });
    const square = await manager.createArtwork({
      type: "painting",
      answers: { work_type: "painting", painting_format: "斗方" }
    });

    assert.equal(handscroll.job.status, "succeeded");
    assert.equal(square.job.status, "succeeded");
    assert.equal((await storage.getRecord(handscroll.record.id)).status, "succeeded");
    assert.equal((await storage.getRecord(square.record.id)).status, "succeeded");
  });
});

test("fusion rendering does not enforce the artwork canvas aspect", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const sourcePhotoPath = await writeSourcePhotoImage(temp);
    const manager = createJobManager({
      config: {
        app: { image: { webpQuality: 82 } },
        prompts: {
          fusion: {
            system: "效果图系统提示",
            template: "效果图模板 {{painting}} {{calligraphy}} {{relationship}}"
          }
        },
        questions: {}
      },
      storage,
      runner: async ({ outputPngPath, stage, canvas }) => {
        if (stage === "size_estimation") {
          return {
            json: {
              generation_complexity: "medium",
              recommended_artwork_size: { width_cm: 40, height_cm: 40 }
            }
          };
        }
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(
          outputPngPath,
          stage === "artwork" && canvas?.aspectRatio === "1:1"
            ? sizedPngBuffer(400, 400)
            : sizedPngBuffer(900, 300)
        );
        return { pngPath: outputPngPath, diagnostics: { reason: stage } };
      }
    });

    const created = await manager.createArtwork({
      type: "painting",
      answers: { work_type: "painting", painting_format: "斗方" },
      sourcePhotoPath
    });
    const fused = await manager.createFusion({ recordId: created.record.id });

    assert.equal(created.job.status, "succeeded");
    assert.equal(fused.job.status, "succeeded");
    assert.equal((await storage.getRecord(created.record.id)).fusion_status, "succeeded");
  });
});

test("fusion generation calls the image runner for a second-pass render and preserves artwork", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const sourcePhotoPath = await writeSourcePhotoImage(temp);
    let runnerCalls = 0;
    let fusionPrompt = "";
    const manager = createJobManager({
      config: {
        app: { image: { webpQuality: 82 } },
        prompts: {
          fusion: {
            system: "效果图系统提示",
            template: "效果图模板 {{painting}} {{calligraphy}} {{relationship}}",
            sections: [
              {
                title: "融合图要求",
                lines: [
                  "生成真实摆放效果图。",
                  "这不是简单叠加。"
                ]
              }
            ]
          }
        },
        questions: {}
      },
      storage,
      runner: async ({ outputPngPath, prompt, stage }) => {
        if (stage === "size_estimation") {
          return {
            json: {
              generation_complexity: "medium",
              recommended_artwork_size: { width_cm: 45, height_cm: 70, reason: "测试环境估算" }
            }
          };
        }
        runnerCalls += 1;
        if (stage === "fusion_render") {
          fusionPrompt = prompt;
        }
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer(80));
        return { pngPath: outputPngPath, diagnostics: { reason: `${stage}_success` } };
      }
    });
    const { record } = await manager.createArtwork({ type: "painting", answers: {}, sourcePhotoPath });
    await manager.waitForIdle();
    const artworkPath = record.artwork_path;

    const { job } = await manager.createFusion({ recordId: record.id });
    await manager.waitForIdle();
    const fused = await storage.getRecord(record.id);

    assert.equal(runnerCalls, 2);
    assert.equal(manager.getJob(job.id).status, "succeeded");
    assert.equal(fused.status, "succeeded");
    assert.equal(fused.artwork_path, artworkPath);
    assert.equal(fused.diagnostics.reason, "fusion_render_success");
    assert.match(fusionPrompt, /真实摆放效果/);
    assert.match(fusionPrompt, /不是简单叠加/);
    assert.equal((await fs.readFile(path.join(temp, fused.fusion_path))).subarray(8, 12).toString("ascii"), "WEBP");
  });
});

test("returned job and record are detached from internal background state", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: fakeRunner()
    });

    const result = await manager.createArtwork({ type: "painting", answers: {} });
    result.job.status = "corrupted";
    result.record.status = "corrupted";
    result.record.diagnostics = { reason: "corrupted" };

    await manager.waitForIdle();

    const finalJob = manager.getJob(result.job.id);
    const stored = await storage.getRecord(result.record.id);
    assert.equal(finalJob.status, "succeeded");
    assert.equal(finalJob.diagnostics.reason, "fake_runner");
    assert.equal(stored.status, "succeeded");
    assert.equal(stored.diagnostics.reason, "fake_runner");
  });
});

test("immediate calligraphy verifies exact text before succeeding", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const calls = [];
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: async (options) => {
        calls.push(options);
        if (options.stage === "calligraphy_verification") {
          return { json: { detected_text: "清风明月", no_extra_text: true, legible: true, confidence: 0.98, decision: "verified", issues: [] } };
        }
        await fs.mkdir(path.dirname(options.outputPngPath), { recursive: true });
        await fs.writeFile(options.outputPngPath, pngBufferForCanvas(options.canvas));
        return { pngPath: options.outputPngPath, diagnostics: { reason: "calligraphy_candidate" } };
      }
    });

    const { job, record } = await manager.createArtwork({ type: "calligraphy", answers: { text: "清风明月" } });
    const stored = await storage.getRecord(record.id);
    const artworkCalls = calls.filter(({ stage }) => stage === "artwork");
    const verificationCalls = calls.filter(({ stage }) => stage === "calligraphy_verification");

    assert.equal(job.status, "succeeded");
    assert.equal(stored.status, "succeeded");
    assert.equal(artworkCalls.length, 1);
    assert.equal(verificationCalls.length, 1);
    assert.equal(verificationCalls[0].referenceImages.calligraphyCandidate, artworkCalls[0].outputPngPath);
    assert.match(verificationCalls[0].prompt, /清风明月/);
    assert.deepEqual(stored.calligraphy_verification, { status: "verified", detected_text: "清风明月", issues: [], confidence: 0.98 });
    assert.equal(stored.generation_profile.stages.calligraphy_verification.count, 1);
    assert.deepEqual(stored.generation_profile.attempts.map(({ stage }) => stage), ["artwork"]);
  });
});

test("calligraphy retries a mismatched candidate and verifies the replacement", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    let artworkCount = 0;
    let verificationCount = 0;
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: async (options) => {
        if (options.stage === "calligraphy_verification") {
          verificationCount += 1;
          return { json: { detected_text: verificationCount === 1 ? "清风明日" : "清\n风 明月", no_extra_text: true, legible: true, confidence: 0.95, decision: "verified", issues: verificationCount === 1 ? ["一字不符"] : [] } };
        }
        artworkCount += 1;
        await fs.mkdir(path.dirname(options.outputPngPath), { recursive: true });
        await fs.writeFile(options.outputPngPath, pngBufferForCanvas(options.canvas, artworkCount));
        return { pngPath: options.outputPngPath, diagnostics: { reason: `candidate_${artworkCount}` } };
      }
    });

    const { job, record } = await manager.createArtwork({ type: "calligraphy", answers: { text: "清风明月" } });
    const stored = await storage.getRecord(record.id);

    assert.equal(job.status, "succeeded");
    assert.equal(artworkCount, 2);
    assert.equal(verificationCount, 2);
    assert.equal(stored.calligraphy_verification.status, "verified");
    assert.equal(stored.calligraphy_verification.detected_text, "清\n风 明月");
    assert.deepEqual(stored.generation_profile.attempts.map(({ status }) => status), ["failed", "succeeded"]);
  });
});

test("queued calligraphy fails safely after two unverified candidates", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    let artworkCount = 0;
    let verificationCount = 0;
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: async (options) => {
        if (options.stage === "calligraphy_verification") {
          verificationCount += 1;
          if (verificationCount === 1) return { json: { detected_text: "清风明月外" } };
          throw new Error("inspection unavailable");
        }
        artworkCount += 1;
        await fs.mkdir(path.dirname(options.outputPngPath), { recursive: true });
        await fs.writeFile(options.outputPngPath, pngBufferForCanvas(options.canvas, artworkCount));
        return { pngPath: options.outputPngPath, diagnostics: { reason: "candidate" } };
      }
    });

    const created = await manager.createArtwork({ userId: "calligraphy-owner", type: "calligraphy", answers: { text: "清风明月" } });
    await manager.waitForIdle();
    const stored = await storage.getRecord(created.record.id);
    const finalJob = manager.getJob(created.job.id);

    assert.equal(artworkCount, 2);
    assert.equal(verificationCount, 2);
    assert.equal(finalJob.status, "failed");
    assert.equal(finalJob.diagnostics.reason, "calligraphy_text_unverified");
    assert.equal(stored.status, "failed");
    assert.equal(stored.diagnostics.reason, "calligraphy_text_unverified");
    assert.equal(stored.calligraphy_verification.status, "needs_review");
    await assert.rejects(fs.access(path.join(temp, stored.artwork_path)));
    await assert.rejects(fs.access(path.join(temp, "records", stored.id, "artwork.png")));
  });
});

test("calligraphy rejects extra text and punctuation mismatches despite matching main text", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    let verificationCount = 0;
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: async (options) => {
        if (options.stage === "calligraphy_verification") {
          verificationCount += 1;
          return { json: verificationCount === 1
            ? { detected_text: "清风明月雅集", no_extra_text: false, legible: true, confidence: 0.99, decision: "verified", issues: [] }
            : { detected_text: "清风，明月", no_extra_text: true, legible: true, confidence: 0.99, decision: "verified", issues: [] } };
        }
        await fs.mkdir(path.dirname(options.outputPngPath), { recursive: true });
        await fs.writeFile(options.outputPngPath, pngBufferForCanvas(options.canvas));
        return { pngPath: options.outputPngPath, diagnostics: { reason: "candidate" } };
      }
    });

    const { record } = await manager.createArtwork({ type: "calligraphy", answers: { text: "清风明月" } });
    const stored = await storage.getRecord(record.id);

    assert.equal(stored.status, "failed");
    assert.equal(stored.calligraphy_verification.status, "needs_review");
    assert.deepEqual(stored.calligraphy_verification.issues, ["text_mismatch"]);
    assert.equal(stored.diagnostics.reason, "calligraphy_text_unverified");
  });
});

test("painting artwork and fusion never invoke calligraphy verification", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const sourcePhotoPath = await writeSourcePhotoImage(temp);
    const stages = [];
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: { fusion: { system: "融合", brief: "{{painting}} {{calligraphy}} {{relationship}}" } }, questions: {} },
      storage,
      runner: async (options) => {
        stages.push(options.stage);
        if (options.stage === "size_estimation") return { json: { generation_complexity: "medium", recommended_artwork_size: { width_cm: 45, height_cm: 70 } } };
        await fs.mkdir(path.dirname(options.outputPngPath), { recursive: true });
        await fs.writeFile(options.outputPngPath, options.stage === "artwork" ? pngBufferForCanvas(options.canvas) : sizedPngBuffer(3, 2));
        return { pngPath: options.outputPngPath, diagnostics: { reason: options.stage } };
      }
    });

    const created = await manager.createArtwork({ type: "painting", answers: {}, sourcePhotoPath });
    await manager.createFusion({ recordId: created.record.id });

    assert.equal(stages.includes("calligraphy_verification"), false);
  });
});

test("calligraphy verification preserves only safe runner failure diagnostics", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    let verificationCount = 0;
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: async (options) => {
        if (options.stage === "calligraphy_verification") {
          verificationCount += 1;
          const error = new Error("private runner output");
          error.diagnostics = verificationCount === 1
            ? { reason: "codex_process_failed", status: "exited", exit_code: 2, codex_process_ms: 123 }
            : {
              reason: "json_parse_failed",
              possible_safety_block: true,
              status: "invalid_json",
              exit_code: 0,
              codex_process_ms: 456,
              stderr_tail: "D:\\private\\record\\codex-stderr.log raw secret"
            };
          throw error;
        }
        await fs.mkdir(path.dirname(options.outputPngPath), { recursive: true });
        await fs.writeFile(options.outputPngPath, pngBufferForCanvas(options.canvas));
        return { pngPath: options.outputPngPath, diagnostics: { reason: "candidate" } };
      }
    });

    const { record } = await manager.createArtwork({ type: "calligraphy", answers: { text: "清风明月" } });
    const stored = await storage.getRecord(record.id);

    assert.equal(stored.diagnostics.reason, "calligraphy_text_unverified");
    assert.deepEqual(stored.diagnostics.verification_failure, {
      reason: "json_parse_failed",
      possible_safety_block: true,
      status: "invalid_json",
      exit_code: 0,
      codex_process_ms: 456
    });
    assert.doesNotMatch(JSON.stringify(stored.diagnostics), /private|stderr|secret/);
  });
});

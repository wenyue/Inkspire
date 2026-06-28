const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const request = require("supertest");
const { PNG } = require("pngjs");
const { loadConfig } = require("../src/config");
const { createApp } = require("../src/app");

const root = path.resolve(__dirname, "../..");

async function withTempApp(fn, overrides = {}) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "inkspire-app-"));
  const config = loadConfig(root);
  config.app.runtime.codexCommand = process.execPath;
  overrides.configure?.(config);
  try {
    const app = createApp({
      projectRoot: root,
      dataDir: temp,
      config,
      orderIdGenerator: overrides.orderIdGenerator,
      runner: overrides.runner || (async ({ outputPngPath }) => {
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer());
        return { pngPath: outputPngPath, diagnostics: { reason: "fake_runner" } };
      })
    });
    await fn({ app, temp, config });
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 25));
    await fs.rm(temp, { recursive: true, force: true });
  }
}

function pngBuffer() {
  const png = new PNG({ width: 2, height: 2 });
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data[offset] = 25;
    png.data[offset + 1] = 80;
    png.data[offset + 2] = 120;
    png.data[offset + 3] = 255;
  }
  return PNG.sync.write(png);
}

async function waitUntil(predicate, timeoutMs = 2000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for condition");
}

async function waitForJob(agent, jobId, expectedStatus = "succeeded") {
  let lastJob = null;
  await waitUntil(async () => {
    const response = await agent.get(`/api/jobs/${jobId}`).expect(200);
    lastJob = response.body;
    return response.body.status === expectedStatus || response.body.status === "failed";
  });
  assert.equal(lastJob.status, expectedStatus);
  return lastJob;
}

async function waitForRecordStatus(agent, recordId, expectedStatus = "succeeded") {
  let lastRecord = null;
  await waitUntil(async () => {
    const response = await agent.get(`/api/records/${recordId}`).expect(200);
    lastRecord = response.body;
    return response.body.status === expectedStatus;
  });
  return lastRecord;
}

test("GET /api/health returns ok and public readiness fields", async () => {
  await withTempApp(async ({ app }) => {
    const response = await request(app).get("/api/health").expect(200);

    assert.equal(response.body.ok, true);
    assert.equal(response.body.storage, "ready");
    assert.equal(response.body.config, "ready");
    assert.equal(response.body.runtime.codex, "ready");
    assert.equal(response.body.runtime.dataDirWritable, "ready");
    assert.equal(response.body.runtime.webp, "ready");
  });
});

test("GET /api/health reports missing codex command without failing the health endpoint", async () => {
  await withTempApp(async ({ app }) => {
    const response = await request(app).get("/api/health").expect(200);

    assert.equal(response.body.ok, false);
    assert.equal(response.body.runtime.codex, "missing");
    assert.equal(response.body.runtime.dataDirWritable, "ready");
    assert.equal(response.body.runtime.webp, "ready");
  }, {
    configure: (config) => {
      config.app.runtime.codexCommand = "__inkspire_missing_codex_command__";
    }
  });
});

test("GET /api/config/public returns tabs/questions/experts without codex internals", async () => {
  await withTempApp(async ({ app }) => {
    const response = await request(app).get("/api/config/public").expect(200);

    assert.equal(response.body.i18n["zh-Hans"].tabs.studio, "画案");
    assert.ok(response.body.questions.painting.length > 0);
    assert.equal(response.body.experts[0].id, "wu_jiayin");
    assert.equal(typeof response.body.productionAvailable, "boolean");
    assert.equal(Object.hasOwn(response.body, "runtime"), false);
    assert.equal(Object.hasOwn(response.body, "codexCommand"), false);
  });
});

test("API assigns an inkspire_user cookie when missing", async () => {
  await withTempApp(async ({ app }) => {
    const response = await request(app).get("/api/library").expect(200);

    assert.match(
      response.headers["set-cookie"].join("; "),
      /inkspire_user=user-[a-z0-9-]+; Path=\/; HttpOnly; SameSite=Lax/i
    );
  });
});

test("API replaces malformed inkspire_user cookie values", async () => {
  await withTempApp(async ({ app }) => {
    const response = await request(app)
      .get("/api/library")
      .set("Cookie", "inkspire_user=%E0%A4%A")
      .expect(200);

    assert.match(
      response.headers["set-cookie"].join("; "),
      /inkspire_user=user-[a-z0-9-]+; Path=\/; HttpOnly; SameSite=Lax/i
    );
  });
});

test("POST /api/generations creates a job and eventually a record with artwork", async () => {
  await withTempApp(async ({ app, temp }) => {
    const agent = request.agent(app);
    const upload = await agent
      .post("/api/uploads/photo")
      .attach("photo", pngBuffer(120), { filename: "source.png", contentType: "image/png" })
      .expect(201);
    const response = await agent
      .post("/api/generations")
      .send({
        type: "painting",
        answers: { painting_subject: "山水" },
        conversationNotes: "请保留云气",
        generation_complexity: "large",
        source_photo_path: upload.body.source_photo_path
      })
      .expect(201);

    assert.equal(response.body.job.status, "queued");
    await waitForJob(agent, response.body.job.id);
    const record = await waitForRecordStatus(agent, response.body.record.id);

    assert.equal(record.status, "succeeded");
    assert.equal(response.body.record.type, "painting");
    assert.equal(response.body.record.favorite, true);
    assert.equal(record.generation_complexity, "large");
    assert.equal(record.source_photo_path, `records/${record.id}/source-photo.webp`);
    assert.notEqual(record.source_photo_path, upload.body.source_photo_path);
    assert.equal(
      (await fs.readFile(path.join(temp, record.source_photo_path))).subarray(8, 12).toString("ascii"),
      "WEBP"
    );
    assert.match(record.artwork_path, /artwork\.webp$/);
    assert.equal((await fs.readFile(path.join(temp, record.artwork_path))).subarray(0, 4).toString("ascii"), "RIFF");
  });
});

test("generation route preserves origin tab and operation metadata", async () => {
  const app = createApp({
    projectRoot: root,
    jobs: {
      createArtwork: async (payload) => ({
        job: {
          id: "job-1",
          recordId: "record-1",
          stage: "artwork",
          title: "山水",
          status: "queued",
          origin_tab: payload.originTab,
          operation: payload.operation
        }
      }),
      listActiveJobs: () => [],
      getJob: () => null
    }
  });

  const response = await request(app)
    .post("/api/generations")
    .send({
      type: "painting",
      answers: {},
      origin_tab: "library",
      operation: "adjust"
    })
    .expect(201);

  assert.equal(response.body.job.origin_tab, "library");
  assert.equal(response.body.job.operation, "adjust");
});

test("regenerate and fusion routes pass origin tab and operation metadata", async () => {
  const calls = [];
  const app = createApp({
    projectRoot: root,
    storage: {
      getRecordForUser: async () => ({
        id: "record-1",
        type: "painting",
        answers: { painting_subject: "山水" },
        conversation_notes: "keep mist",
        source_photo_path: "records/record-1/source-photo.webp",
        generation_complexity: "large",
        recommended_artwork_size: {
          preset_id: "ai_scene",
          label: "环境估算",
          width_cm: 60,
          height_cm: 90,
          reason: "按环境估算"
        }
      })
    },
    jobs: {
      createArtwork: async (payload) => {
        calls.push({ route: "regenerate", payload });
        return {
          job: {
            id: "job-regenerate",
            recordId: "record-1",
            stage: "artwork",
            status: "queued",
            origin_tab: payload.originTab,
            operation: payload.operation
          }
        };
      },
      createFusion: async (payload) => {
        calls.push({ route: "fusion", payload });
        return {
          job: {
            id: "job-fusion",
            recordId: "record-1",
            stage: "fusion",
            status: "queued",
            origin_tab: payload.originTab,
            operation: payload.operation
          }
        };
      },
      listActiveJobs: () => [],
      getJob: () => null
    }
  });

  const regenerated = await request(app)
    .post("/api/records/record-1/regenerate")
    .send({ originTab: "library" })
    .expect(201);
  assert.equal(regenerated.body.job.origin_tab, "library");
  assert.equal(regenerated.body.job.operation, "adjust");

  const fused = await request(app)
    .post("/api/records/record-1/fusion")
    .send({ origin_tab: "library" })
    .expect(201);
  assert.equal(fused.body.job.origin_tab, "library");
  assert.equal(fused.body.job.operation, "create");

  assert.equal(calls[0].payload.originTab, "library");
  assert.equal(calls[0].payload.operation, "adjust");
  assert.equal(calls[0].payload.sourcePhotoPath, "records/record-1/source-photo.webp");
  assert.equal(calls[0].payload.generationComplexity, "large");
  assert.deepEqual(calls[0].payload.recommendedArtworkSize, {
    preset_id: "ai_scene",
    label: "环境估算",
    width_cm: 60,
    height_cm: 90,
    reason: "按环境估算"
  });
  assert.equal(calls[1].payload.originTab, "library");
  assert.equal(calls[1].payload.operation, "create");
});

test("POST /api/uploads/photo returns source_photo_path and inferred artwork size", async () => {
  await withTempApp(async ({ app, temp }) => {
    const response = await request(app)
      .post("/api/uploads/photo")
      .attach("photo", pngBuffer(), { filename: "source.png", contentType: "image/png" })
      .expect(201);

    assert.match(response.body.record_id, /^upload-/);
    assert.equal(response.body.source_photo_path, `records/${response.body.record_id}/source-photo.webp`);
    assert.equal(Object.hasOwn(response.body, "original_photo_path"), false);
    assert.equal(response.body.scene.width, 2);
    assert.equal(response.body.scene.height, 2);
    assert.deepEqual(response.body.recommended_artwork_size, {
      preset_id: "square_scene",
      label: "方形点景",
      width_cm: 50,
      height_cm: 50,
      reason: "根据环境图片比例推算，适合作为方形点景作品。"
    });
    assert.equal((await fs.readFile(path.join(temp, response.body.source_photo_path))).subarray(8, 12).toString("ascii"), "WEBP");
  });
});

test("POST /api/uploads/photo accepts phone camera HEIC MIME types", async () => {
  await withTempApp(async ({ app, temp }) => {
    const response = await request(app)
      .post("/api/uploads/photo")
      .attach("photo", pngBuffer(), { filename: "camera.heic", contentType: "image/heic" })
      .expect(201);

    assert.equal(response.body.source_photo_path, `records/${response.body.record_id}/source-photo.webp`);
    assert.equal((await fs.readFile(path.join(temp, response.body.source_photo_path))).subarray(8, 12).toString("ascii"), "WEBP");
  });
});

test("POST /api/uploads/photo rejects unsafe record ids before writing files", async () => {
  await withTempApp(async ({ app, temp }) => {
    await request(app)
      .post("/api/uploads/photo")
      .field("recordId", "../../escaped")
      .attach("photo", pngBuffer(), { filename: "source.png", contentType: "image/png" })
      .expect(400);

    await assert.rejects(fs.access(path.join(temp, "..", "..", "escaped", "source-photo.webp")));
  });
});

test("POST /api/uploads/photo removes temporary upload files after success and image failures", async () => {
  await withTempApp(async ({ app, temp }) => {
    await request(app)
      .post("/api/uploads/photo")
      .attach("photo", pngBuffer(), { filename: "source.png", contentType: "image/png" })
      .expect(201);

    assert.deepEqual(await fs.readdir(path.join(temp, "uploads")), []);

    await request(app)
      .post("/api/uploads/photo")
      .attach("photo", Buffer.from("not an image"), { filename: "source.png", contentType: "image/png" })
      .expect(400);

    assert.deepEqual(await fs.readdir(path.join(temp, "uploads")), []);
  });
});

test("POST /api/uploads/photo returns photo_too_large instead of a generic server error", async () => {
  await withTempApp(async ({ app }) => {
    const response = await request(app)
      .post("/api/uploads/photo")
      .attach("photo", Buffer.alloc(1024 * 1024 + 1), { filename: "large.png", contentType: "image/png" })
      .expect(413);

    assert.equal(response.body.code, "photo_too_large");
  }, {
    configure: (config) => {
      config.app.image.maxInputSizeMb = 1;
    }
  });
});

test("GET /api/records/:id/images/source reads source_photo_path", async () => {
  await withTempApp(async ({ app }) => {
    const agent = request.agent(app);
    const upload = await agent
      .post("/api/uploads/photo")
      .attach("photo", pngBuffer(120), { filename: "source.png", contentType: "image/png" })
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

    const response = await agent
      .get(`/api/records/${created.body.record.id}/images/source`)
      .expect(200);

    assert.equal(response.body.subarray(8, 12).toString("ascii"), "WEBP");
  });
});

test("GET /api/records/:id/images/source refuses source paths outside the data directory", async () => {
  await withTempApp(async ({ app, temp }) => {
    await fs.writeFile(path.join(temp, "..", "secret.txt"), "secret");

    const created = await request(app)
      .post("/api/generations")
      .send({
        type: "painting",
        answers: { painting_subject: "山水" },
        source_photo_path: "../secret.txt"
      })
      .expect(400);

    assert.equal(created.body.error, "Invalid source photo path");
  });
});

test("POST /api/generations rejects source photos uploaded by another user", async () => {
  await withTempApp(async ({ app }) => {
    const firstUser = request.agent(app);
    const secondUser = request.agent(app);
    const upload = await firstUser
      .post("/api/uploads/photo")
      .attach("photo", pngBuffer(120), { filename: "source.png", contentType: "image/png" })
      .expect(201);

    const response = await secondUser
      .post("/api/generations")
      .send({
        type: "painting",
        answers: { painting_subject: "山水" },
        source_photo_path: upload.body.source_photo_path
      })
      .expect(400);

    assert.equal(response.body.error, "Invalid source photo path");
  });
});

test("POST /api/records/:id/fusion can attach a source photo after artwork generation", async () => {
  await withTempApp(async ({ app }) => {
    const agent = request.agent(app);
    const upload = await agent
      .post("/api/uploads/photo")
      .attach("photo", pngBuffer(130), { filename: "source.png", contentType: "image/png" })
      .expect(201);
    const created = await agent
      .post("/api/generations")
      .send({ type: "painting", answers: { painting_subject: "山水" } })
      .expect(201);
    await waitForJob(agent, created.body.job.id);

    const response = await agent
      .post(`/api/records/${created.body.record.id}/fusion`)
      .send({ source_photo_path: upload.body.source_photo_path })
      .expect(201);

    assert.equal(response.body.record.source_photo_path, `records/${created.body.record.id}/source-photo.webp`);
    assert.equal(response.body.record.status, "queued");
    await waitForJob(agent, response.body.job.id);
    const fused = await agent.get(`/api/records/${created.body.record.id}`).expect(200);
    assert.equal(fused.body.has_fusion, true);
    await agent
      .get(`/api/records/${created.body.record.id}/images/source`)
      .expect(200);
  });
});

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
    const expectedSourcePhotoPath = `records/${created.body.record.id}/source-photo.webp`;
    assert.equal(record.body.source_photo_path, expectedSourcePhotoPath);

    const response = await agent
      .post(`/api/records/${created.body.record.id}/fusion`)
      .send({})
      .expect(201);

    assert.equal(response.body.record.source_photo_path, record.body.source_photo_path);
    assert.equal(response.body.record.status, "queued");
    await waitForJob(agent, response.body.job.id);
    const fused = await agent.get(`/api/records/${created.body.record.id}`).expect(200);
    assert.equal(fused.body.source_photo_path, expectedSourcePhotoPath);
    assert.equal(fused.body.fusion_path, `records/${created.body.record.id}/fusion.webp`);
    assert.equal(fused.body.has_fusion, true);
  }, {
    runner: async ({ outputPngPath }) => {
      await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
      await fs.writeFile(outputPngPath, pngBuffer());
      return { pngPath: outputPngPath, diagnostics: { reason: "fake_runner" } };
    }
  });
});

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

test("GET /api/library returns the generated record", async () => {
  await withTempApp(async ({ app }) => {
    const agent = request.agent(app);
    const created = await agent
      .post("/api/generations")
      .send({ type: "calligraphy", answers: { text: "明月松间照" } })
      .expect(201);

    await waitForJob(agent, created.body.job.id);
    const response = await agent.get("/api/library").expect(200);

    assert.equal(response.body.records.length, 1);
    assert.equal(response.body.records[0].id, created.body.record.id);
    assert.equal(response.body.records[0].favorite, true);
    assert.equal(response.body.records[0].thumbnail_path, created.body.record.artwork_path);
  });
});

test("library, records, and jobs are scoped to the browser cookie user", async () => {
  await withTempApp(async ({ app }) => {
    const firstUser = request.agent(app);
    const secondUser = request.agent(app);
    const created = await firstUser
      .post("/api/generations")
      .send({ type: "painting", answers: { painting_subject: "山水" } })
      .expect(201);

    await waitForJob(firstUser, created.body.job.id);

    const firstLibrary = await firstUser.get("/api/library").expect(200);
    const secondLibrary = await secondUser.get("/api/library").expect(200);
    assert.equal(firstLibrary.body.records.length, 1);
    assert.equal(secondLibrary.body.records.length, 0);

    await secondUser.get(`/api/records/${created.body.record.id}`).expect(404);
    await secondUser.get(`/api/jobs/${created.body.job.id}`).expect(404);
  });
});

test("POST /api/generations scopes active jobs by origin tab", async () => {
  const releases = [];
  await withTempApp(async ({ app }) => {
    const agent = request.agent(app);
    const studio = await agent
      .post("/api/generations")
      .send({ type: "painting", answers: {}, origin_tab: "studio" })
      .expect(201);

    const sameTab = await agent
      .post("/api/generations")
      .send({ type: "painting", answers: {}, origin_tab: "studio" })
      .expect(429);
    assert.equal(sameTab.body.limitReached, true);
    assert.equal(sameTab.body.code, "tab_generation_limit_reached");
    assert.equal(sameTab.body.origin_tab, "studio");
    assert.equal(sameTab.body.activeJobs.length, 1);
    assert.equal(sameTab.body.activeJobs[0].id, studio.body.job.id);

    const library = await agent
      .post("/api/generations")
      .send({ type: "painting", answers: {}, origin_tab: "library" })
      .expect(201);
    assert.equal(library.body.job.origin_tab, "library");

    const active = await agent.get("/api/jobs/active").expect(200);
    assert.equal(active.body.jobs.length, 2);

    await waitUntil(() => releases.length === 2);
    for (const release of releases) release();
    await waitForJob(agent, studio.body.job.id);
    await waitForJob(agent, library.body.job.id);
  }, {
    runner: async ({ outputPngPath }) => {
      await new Promise((resolve) => {
        releases.push(resolve);
      });
      await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
      await fs.writeFile(outputPngPath, pngBuffer());
      return { pngPath: outputPngPath, diagnostics: { reason: "slow_runner" } };
    }
  });
});

test("POST /api/records/:id/production-estimate returns expert_custom > expert_guided", async () => {
  await withTempApp(async ({ app }) => {
    const agent = request.agent(app);
    const created = await agent
      .post("/api/generations")
      .send({ type: "painting", answers: {} })
      .expect(201);
    await waitForJob(agent, created.body.job.id);

    const response = await agent
      .post(`/api/records/${created.body.record.id}/production-estimate`)
      .send({ expertId: "wu_jiayin" })
      .expect(200);

    assert.ok(response.body.estimates.expert_custom.amount > response.body.estimates.expert_guided.amount);
    assert.equal(response.body.estimates.expert_custom.currency, "CNY");
  });
});

test("POST /api/records/:id/production-estimate scales estimates by selected size", async () => {
  await withTempApp(async ({ app }) => {
    const agent = request.agent(app);
    const created = await agent
      .post("/api/generations")
      .send({ type: "painting", answers: {} })
      .expect(201);
    await waitForJob(agent, created.body.job.id);

    const response = await agent
      .post(`/api/records/${created.body.record.id}/production-estimate`)
      .send({ expertId: "wu_jiayin", size: "large" })
      .expect(200);

    assert.equal(response.body.size, "large");
    assert.equal(response.body.estimates.expert_custom.amount, 2700);
    assert.equal(response.body.estimates.expert_guided.amount, 900);
  });
});

test("POST /api/records/:id/production-orders rejects orders while production contact is unavailable", async () => {
  await withTempApp(async ({ app, temp }) => {
    const agent = request.agent(app);
    const created = await agent
      .post("/api/generations")
      .send({ type: "painting", answers: {} })
      .expect(201);
    await waitForJob(agent, created.body.job.id);

    const response = await agent
      .post(`/api/records/${created.body.record.id}/production-orders`)
      .send({ expertId: "wu_jiayin", serviceId: "expert_custom", referenceLevel: 3 })
      .expect(409);

    assert.equal(response.body.code, "production_unavailable");
    const orderFiles = await fs.readdir(path.join(temp, "orders")).catch((error) => {
      if (error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    });
    assert.deepEqual(orderFiles, []);
  }, {
    configure: (config) => {
      config.app.productionContact = { phone: "", wechat: "" };
      config.experts = config.experts.map((expert) => ({ ...expert, phone: "", wechat: "" }));
    }
  });
});

test("POST /api/records/:id/production-orders creates retrievable order with size and reference level", async () => {
  await withTempApp(async ({ app }) => {
    const agent = request.agent(app);
    const upload = await agent
      .post("/api/uploads/photo")
      .attach("photo", pngBuffer(), { filename: "source.png", contentType: "image/png" })
      .expect(201);
    const created = await agent
      .post("/api/generations")
      .send({
        type: "painting",
        answers: { painting_subject: "山水" },
        source_photo_path: upload.body.source_photo_path,
        recommended_artwork_size: upload.body.recommended_artwork_size
      })
      .expect(201);
    await waitForJob(agent, created.body.job.id);

    const response = await agent
      .post(`/api/records/${created.body.record.id}/production-orders`)
      .send({
        expertId: "wu_jiayin",
        serviceId: "expert_custom",
        size: { preset_id: "custom", label: "自定义尺寸", width_cm: 42, height_cm: 66 },
        referenceLevel: 3
      })
      .expect(201);

    assert.match(response.body.order.id, /^ord-[a-z0-9]{8}$/);
    assert.equal(response.body.order.record_id, created.body.record.id);
    assert.equal(response.body.order.service_id, "expert_custom");
    assert.equal(response.body.order.reference_level, 3);
    assert.deepEqual(response.body.order.size, {
      preset_id: "custom",
      label: "自定义尺寸",
      width_cm: 42,
      height_cm: 66
    });
    assert.equal(response.body.order.record_snapshot.artwork_path, created.body.record.artwork_path);

    const lookup = await agent
      .get(`/api/production-orders/${response.body.order.id}`)
      .expect(200);

    assert.deepEqual(lookup.body.order, response.body.order);
  }, {
    configure: (config) => {
      config.app.productionContact = { phone: "020-12345678", wechat: "" };
    }
  });
});

test("POST /api/records/:id/production-orders retries when a short order id already exists", async () => {
  const candidates = ["ord-aaaaaaaa", "ord-bbbbbbbb"];
  await withTempApp(async ({ app, temp }) => {
    await fs.mkdir(path.join(temp, "orders"), { recursive: true });
    await fs.writeFile(path.join(temp, "orders", "ord-aaaaaaaa.json"), "{}\n");

    const agent = request.agent(app);
    const created = await agent
      .post("/api/generations")
      .send({ type: "painting", answers: {} })
      .expect(201);
    await waitForJob(agent, created.body.job.id);

    const response = await agent
      .post(`/api/records/${created.body.record.id}/production-orders`)
      .send({ expertId: "wu_jiayin", serviceId: "expert_custom", referenceLevel: 3 })
      .expect(201);

    assert.equal(response.body.order.id, "ord-bbbbbbbb");
    const Database = require("better-sqlite3");
    const db = new Database(path.join(temp, "inkspire.db"), { readonly: true });
    try {
      assert.deepEqual(
        db.prepare("SELECT id FROM production_orders ORDER BY id").all().map((row) => row.id),
        ["ord-aaaaaaaa", "ord-bbbbbbbb"]
      );
    } finally {
      db.close();
    }
  }, {
    configure: (config) => {
      config.app.productionContact = { phone: "020-12345678", wechat: "" };
    },
    orderIdGenerator: () => candidates.shift()
  });
});

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
  try {
    const app = createApp({
      projectRoot: root,
      dataDir: temp,
      config,
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

test("GET /api/config/public returns tabs/questions/experts without codex internals", async () => {
  await withTempApp(async ({ app }) => {
    const response = await request(app).get("/api/config/public").expect(200);

    assert.equal(response.body.i18n["zh-Hans"].tabs.studio, "画案");
    assert.ok(response.body.questions.painting.length > 0);
    assert.equal(response.body.experts[0].id, "wu_jiayin");
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
    const response = await agent
      .post("/api/generations")
      .send({
        type: "painting",
        answers: { painting_subject: "山水" },
        conversationNotes: "请保留云气",
        source_photo_path: "records/upload-before-generate/source-photo.webp"
      })
      .expect(201);

    assert.equal(response.body.job.status, "queued");
    await waitForJob(agent, response.body.job.id);
    const record = await waitForRecordStatus(agent, response.body.record.id);

    assert.equal(record.status, "succeeded");
    assert.equal(response.body.record.type, "painting");
    assert.equal(response.body.record.favorite, true);
    assert.equal(response.body.record.source_photo_path, "records/upload-before-generate/source-photo.webp");
    assert.match(response.body.record.artwork_path, /artwork\.webp$/);
    assert.equal((await fs.readFile(path.join(temp, response.body.record.artwork_path))).subarray(0, 4).toString("ascii"), "RIFF");
  });
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
      reason: "根据场景图比例推算，适合作为方形点景作品。"
    });
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

    assert.equal(response.body.record.source_photo_path, upload.body.source_photo_path);
    assert.equal(response.body.record.status, "queued");
    await waitForJob(agent, response.body.job.id);
    const fused = await agent.get(`/api/records/${created.body.record.id}`).expect(200);
    assert.equal(fused.body.has_fusion, true);
    await agent
      .get(`/api/records/${created.body.record.id}/images/source`)
      .expect(200);
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

test("POST /api/generations returns active jobs when the user already has two generations", async () => {
  const releases = [];
  await withTempApp(async ({ app }) => {
    const agent = request.agent(app);
    const first = await agent.post("/api/generations").send({ type: "painting", answers: {} }).expect(201);
    const second = await agent.post("/api/generations").send({ type: "painting", answers: {} }).expect(201);

    const third = await agent.post("/api/generations").send({ type: "painting", answers: {} }).expect(429);
    assert.equal(third.body.limitReached, true);
    assert.equal(third.body.code, "user_generation_limit_reached");
    assert.equal(third.body.activeJobs.length, 2);

    const active = await agent.get("/api/jobs/active").expect(200);
    assert.equal(active.body.jobs.length, 2);

    await waitUntil(() => releases.length === 2);
    for (const release of releases) release();
    await waitForJob(agent, first.body.job.id);
    await waitForJob(agent, second.body.job.id);
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

    assert.match(response.body.order.id, /^order-/);
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
  });
});

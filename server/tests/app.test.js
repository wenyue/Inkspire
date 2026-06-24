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

async function withTempApp(fn) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "inkspire-app-"));
  try {
    const app = createApp({
      projectRoot: root,
      dataDir: temp,
      runner: async ({ outputPngPath }) => {
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer());
        return { pngPath: outputPngPath, diagnostics: { reason: "fake_runner" } };
      }
    });
    await fn({ app, temp, config: loadConfig(root) });
  } finally {
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

test("GET /api/health returns ok and public readiness fields", async () => {
  await withTempApp(async ({ app }) => {
    const response = await request(app).get("/api/health").expect(200);

    assert.equal(response.body.ok, true);
    assert.equal(response.body.storage, "ready");
    assert.equal(response.body.config, "ready");
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

test("POST /api/generations creates a job and eventually a record with artwork", async () => {
  await withTempApp(async ({ app, temp }) => {
    const response = await request(app)
      .post("/api/generations")
      .send({
        type: "painting",
        answers: { painting_subject: "山水" },
        conversationNotes: "请保留云气",
        source_photo_path: "records/upload-before-generate/source-photo.webp"
      })
      .expect(201);

    assert.equal(response.body.job.status, "succeeded");
    assert.equal(response.body.record.type, "painting");
    assert.equal(response.body.record.source_photo_path, "records/upload-before-generate/source-photo.webp");
    assert.match(response.body.record.artwork_path, /artwork\.webp$/);
    assert.equal((await fs.readFile(path.join(temp, response.body.record.artwork_path))).subarray(0, 4).toString("ascii"), "RIFF");
  });
});

test("POST /api/uploads/photo returns source_photo_path under upload record", async () => {
  await withTempApp(async ({ app, temp }) => {
    const response = await request(app)
      .post("/api/uploads/photo")
      .attach("photo", pngBuffer(), { filename: "source.png", contentType: "image/png" })
      .expect(201);

    assert.match(response.body.record_id, /^upload-/);
    assert.equal(response.body.source_photo_path, `records/${response.body.record_id}/source-photo.webp`);
    assert.equal(Object.hasOwn(response.body, "original_photo_path"), false);
    assert.equal((await fs.readFile(path.join(temp, response.body.source_photo_path))).subarray(8, 12).toString("ascii"), "WEBP");
  });
});

test("GET /api/records/:id/images/source reads source_photo_path", async () => {
  await withTempApp(async ({ app }) => {
    const upload = await request(app)
      .post("/api/uploads/photo")
      .attach("photo", pngBuffer(120), { filename: "source.png", contentType: "image/png" })
      .expect(201);

    const created = await request(app)
      .post("/api/generations")
      .send({
        type: "painting",
        answers: { painting_subject: "山水" },
        source_photo_path: upload.body.source_photo_path
      })
      .expect(201);

    const response = await request(app)
      .get(`/api/records/${created.body.record.id}/images/source`)
      .expect(200);

    assert.equal(response.body.subarray(8, 12).toString("ascii"), "WEBP");
  });
});

test("GET /api/library returns the generated record", async () => {
  await withTempApp(async ({ app }) => {
    const created = await request(app)
      .post("/api/generations")
      .send({ type: "calligraphy", answers: { text: "明月松间照" } })
      .expect(201);

    const response = await request(app).get("/api/library").expect(200);

    assert.equal(response.body.records.length, 1);
    assert.equal(response.body.records[0].id, created.body.record.id);
    assert.equal(response.body.records[0].thumbnail_path, created.body.record.artwork_path);
  });
});

test("POST /api/records/:id/production-estimate returns expert_custom > expert_guided", async () => {
  await withTempApp(async ({ app }) => {
    const created = await request(app)
      .post("/api/generations")
      .send({ type: "painting", answers: {} })
      .expect(201);

    const response = await request(app)
      .post(`/api/records/${created.body.record.id}/production-estimate`)
      .send({ expertId: "wu_jiayin" })
      .expect(200);

    assert.ok(response.body.estimates.expert_custom.amount > response.body.estimates.expert_guided.amount);
    assert.equal(response.body.estimates.expert_custom.currency, "CNY");
  });
});

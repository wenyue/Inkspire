#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { PNG } = require("pngjs");
const request = require("supertest");
const { createApp } = require("../server/src/app");

const projectRoot = path.resolve(__dirname, "..");

function webpHeader(buffer) {
  return {
    riff: buffer.subarray(0, 4).toString("ascii"),
    webp: buffer.subarray(8, 12).toString("ascii")
  };
}

function samplePhotoPng() {
  const png = new PNG({ width: 96, height: 96 });
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const offset = (png.width * y + x) << 2;
      png.data[offset] = 190 - Math.floor(x * 0.8);
      png.data[offset + 1] = 206 - Math.floor(y * 0.5);
      png.data[offset + 2] = 184 + Math.floor((x + y) * 0.2);
      png.data[offset + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

async function assertWebpFile(dataDir, relativePath, label, { minBytes = 1024 } = {}) {
  assert.ok(relativePath, `${label} path is missing`);
  const absolutePath = path.join(dataDir, relativePath);
  const buffer = await fs.readFile(absolutePath);
  const header = webpHeader(buffer);
  assert.equal(header.riff, "RIFF", `${label} must be RIFF`);
  assert.equal(header.webp, "WEBP", `${label} must be WEBP`);
  assert.ok(buffer.length > minBytes, `${label} should be larger than ${minBytes} bytes`);
  return absolutePath;
}

async function createArtwork(app, payload, label) {
  const response = await request(app)
    .post("/api/generations")
    .send(payload)
    .expect(201);

  assert.equal(response.body.job.status, "succeeded", `${label} job failed: ${response.body.job.error || ""}`);
  assert.equal(response.body.record.status, "succeeded", `${label} record failed`);
  return response.body.record;
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dataDir = path.join(projectRoot, `.real-data-${stamp}`);
  process.env.INKSPIRE_REAL_CODEX = "1";

  const app = createApp({ projectRoot, dataDir });
  const evidence = { dataDir, records: [] };

  const health = await request(app).get("/api/health").expect(200);
  assert.equal(health.body.ok, true, `health check failed: ${JSON.stringify(health.body)}`);
  assert.equal(health.body.runtime.codex, "ready", "Codex CLI must be ready");
  assert.equal(health.body.runtime.webp, "ready", "WebP conversion must be ready");

  const painting = await createArtwork(app, {
    type: "painting",
    answers: {
      work_type: "painting",
      painting_subject: "山水",
      painting_palette: "水墨",
      painting_mood: "清雅",
      painting_composition: "竖幅",
      painting_detail: "简淡"
    },
    conversationNotes: "真实验收：清雅水墨山水，留白充足，适合手机端预览。"
  }, "painting");
  const paintingPath = await assertWebpFile(dataDir, painting.artwork_path, "painting artwork");
  evidence.records.push({ id: painting.id, type: "painting", artwork: paintingPath });

  const calligraphy = await createArtwork(app, {
    type: "calligraphy",
    answers: {
      work_type: "calligraphy",
      calligraphy_script: "行书",
      calligraphy_energy: "灵动",
      calligraphy_layout: "竖排",
      calligraphy_paper: "素宣",
      calligraphy_ink: "浓墨"
    },
    conversationNotes: "真实验收：明月松间照，行书，素宣纸，清雅留白。"
  }, "calligraphy");
  const calligraphyPath = await assertWebpFile(dataDir, calligraphy.artwork_path, "calligraphy artwork");
  evidence.records.push({ id: calligraphy.id, type: "calligraphy", artwork: calligraphyPath });

  const upload = await request(app)
    .post("/api/uploads/photo")
    .attach("photo", samplePhotoPng(), { filename: "room.png", contentType: "image/png" })
    .expect(201);
  await assertWebpFile(dataDir, upload.body.source_photo_path, "source photo", { minBytes: 1 });

  const fusion = await request(app)
    .post(`/api/records/${painting.id}/fusion`)
    .send({ source_photo_path: upload.body.source_photo_path })
    .expect(201);
  assert.equal(fusion.body.job.status, "succeeded", `fusion job failed: ${fusion.body.job.error || ""}`);
  assert.equal(fusion.body.record.has_fusion, true, "fusion record should mark has_fusion");
  const fusionPath = await assertWebpFile(dataDir, fusion.body.record.fusion_path, "fusion render");
  evidence.records[0].fusion = fusionPath;

  const library = await request(app).get("/api/library").expect(200);
  const ids = library.body.records.map((record) => record.id);
  assert.ok(ids.includes(painting.id), "library should include painting");
  assert.ok(ids.includes(calligraphy.id), "library should include calligraphy");
  assert.equal(library.body.records.find((record) => record.id === painting.id).has_fusion, true);

  console.log(JSON.stringify(evidence, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

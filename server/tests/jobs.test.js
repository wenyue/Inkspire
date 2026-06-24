const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { PNG } = require("pngjs");
const { createStorage } = require("../src/storage");
const { createJobManager } = require("../src/jobs");

async function withTempStore(fn) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "inkspire-jobs-"));
  try {
    await fn(temp);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

function pngBuffer(red = 40) {
  const png = new PNG({ width: 2, height: 2 });
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data[offset] = red;
    png.data[offset + 1] = 80;
    png.data[offset + 2] = 120;
    png.data[offset + 3] = 255;
  }
  return PNG.sync.write(png);
}

function fakeRunner(red = 40) {
  return async ({ outputPngPath }) => {
    await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
    await fs.writeFile(outputPngPath, pngBuffer(red));
    return { pngPath: outputPngPath, diagnostics: { reason: "fake_runner" } };
  };
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

    assert.equal(job.status, "succeeded");
    assert.equal(record.status, "succeeded");
    assert.equal(record.artwork_path, `records/${record.id}/artwork.webp`);
    assert.equal((await fs.readFile(path.join(temp, record.artwork_path))).subarray(0, 4).toString("ascii"), "RIFF");
    assert.deepEqual(await createStorage(temp).getRecord(record.id), record);
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
    const { record } = await manager.createArtwork({ type: "painting", answers: {} });
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

test("concurrent job creation returns a locked busy result", async () => {
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
    const stored = await createStorage(temp).getRecord(record.id);

    assert.equal(job.status, "failed");
    assert.equal(record.status, "failed");
    assert.equal(stored.status, "failed");
    assert.equal(stored.diagnostics.possible_safety_block, true);
    assert.match(job.error, /fake policy refusal/);
  });
});

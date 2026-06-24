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

    await manager.waitForIdle();
    const finalJob = manager.getJob(job.id);
    const stored = await createStorage(temp).getRecord(record.id);

    assert.equal(job.status, "queued");
    assert.equal(record.status, "queued");
    assert.equal(finalJob.status, "succeeded");
    assert.equal(stored.status, "succeeded");
    assert.equal(record.artwork_path, `records/${record.id}/artwork.webp`);
    assert.equal((await fs.readFile(path.join(temp, record.artwork_path))).subarray(0, 4).toString("ascii"), "RIFF");
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
    await manager.waitForIdle();
    const artworkPath = record.artwork_path;

    const result = await manager.createFusion({ recordId: record.id });
    await manager.waitForIdle();
    const fused = await storage.getRecord(record.id);
    const finalJob = manager.getJob(result.job.id);

    assert.equal(result.job.status, "queued");
    assert.equal(result.record.status, "queued");
    assert.equal(finalJob.status, "succeeded");
    assert.equal(fused.artwork_path, artworkPath);
    assert.equal(fused.fusion_path, `records/${record.id}/fusion.webp`);
    assert.equal(fused.has_fusion, true);
    assert.equal((await fs.readFile(path.join(temp, fused.fusion_path))).subarray(8, 12).toString("ascii"), "WEBP");
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

test("per-user limit rejects the third active generation", async () => {
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

    const first = await manager.createArtwork({ userId: "user-a", type: "painting", answers: {} });
    const second = await manager.createArtwork({ userId: "user-a", type: "painting", answers: {} });
    const third = await manager.createArtwork({ userId: "user-a", type: "painting", answers: {} });

    assert.ok(["queued", "running"].includes(first.job.status));
    assert.ok(["queued", "running"].includes(second.job.status));
    assert.equal(third.limitReached, true);
    assert.equal(third.code, "user_generation_limit_reached");
    assert.equal(third.activeJobs.length, 2);

    await waitUntil(() => releases.size === 2);
    for (const release of releases.values()) {
      release();
    }
    await manager.waitForIdle();
  });
});

test("default user is also limited to two active generations", async () => {
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

    const first = await manager.createArtwork({ type: "painting", answers: {} });
    const second = await manager.createArtwork({ type: "painting", answers: {} });
    const third = await manager.createArtwork({ type: "painting", answers: {} });

    assert.ok(["queued", "running"].includes(first.job.status));
    assert.ok(["queued", "running"].includes(second.job.status));
    assert.equal(third.limitReached, true);
    assert.equal(third.code, "user_generation_limit_reached");
    assert.equal(third.activeJobs.length, 2);

    await waitUntil(() => releases.size === 2);
    for (const release of releases.values()) {
      release();
    }
    await manager.waitForIdle();
  });
});

test("user fusion creation returns immediately", async () => {
  await withTempStore(async (temp) => {
    let release;
    let fusionStarted = false;
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner: async ({ outputPngPath, stage }) => {
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer());
        if (stage === "fusion_render") {
          fusionStarted = true;
          await new Promise((resolve) => {
            release = resolve;
          });
        }
        return { pngPath: outputPngPath, diagnostics: { reason: "slow" } };
      }
    });

    const created = await manager.createArtwork({ userId: "user-a", type: "painting", answers: {} });
    await manager.waitForIdle();

    const result = await manager.createFusion({ userId: "user-a", recordId: created.record.id });

    assert.ok(["queued", "running"].includes(result.job.status));
    assert.equal(result.record.status, "queued");
    assert.equal(fusionStarted, false);
    await manager.waitForJobStart(result.job.id);
    await waitUntil(() => fusionStarted);
    await waitUntil(() => typeof release === "function");
    release();
    await manager.waitForIdle();
  });
});

test("default user fusion creation returns immediately", async () => {
  await withTempStore(async (temp) => {
    let release;
    let fusionStarted = false;
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage: createStorage(temp),
      runner: async ({ outputPngPath, stage }) => {
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer());
        if (stage === "fusion_render") {
          fusionStarted = true;
          await new Promise((resolve) => {
            release = resolve;
          });
        }
        return { pngPath: outputPngPath, diagnostics: { reason: "slow" } };
      }
    });

    const created = await manager.createArtwork({ type: "painting", answers: {} });
    await manager.waitForIdle();

    const result = await manager.createFusion({ recordId: created.record.id });

    assert.ok(["queued", "running"].includes(result.job.status));
    assert.equal(result.record.status, "queued");
    assert.equal(fusionStarted, false);
    await manager.waitForJobStart(result.job.id);
    await waitUntil(() => fusionStarted);
    await waitUntil(() => typeof release === "function");
    release();
    await manager.waitForIdle();
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

    const first = await manager.createArtwork({ userId: "user-a", type: "painting", answers: {} });
    const second = await manager.createArtwork({ userId: "user-a", type: "painting", answers: {} });

    await Promise.all([
      manager.waitForJobStart(first.job.id),
      manager.waitForJobStart(second.job.id)
    ]);

    await manager.waitForRunningCount("user-a", 2);

    const thirdRejected = await manager.createArtwork({ userId: "user-a", type: "painting", answers: {} });
    assert.equal(thirdRejected.limitReached, true);

    await waitUntil(() => releases.size === 2);
    releases.get(first.record.id)();
    await waitUntil(() => manager.listActiveJobs("user-a").length === 1);

    const third = await manager.createArtwork({ userId: "user-a", type: "painting", answers: {} });

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
    assert.equal(record.status, "queued");
    assert.equal(stored.status, "failed");
    assert.equal(stored.diagnostics.possible_safety_block, true);
    assert.match(manager.getJob(job.id).error, /fake policy refusal/);
  });
});

test("fusion failure preserves succeeded artwork record for retry", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: async ({ outputPngPath, stage }) => {
        if (stage === "fusion_render") {
          const error = new Error("fusion model unavailable");
          error.diagnostics = { reason: "fusion_unavailable" };
          throw error;
        }
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer(90));
        return { pngPath: outputPngPath, diagnostics: { reason: "artwork_success" } };
      }
    });
    const { record } = await manager.createArtwork({ type: "painting", answers: {} });
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
    assert.equal(stored.diagnostics.reason, "fusion_unavailable");
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
    assert.equal(record.status, "queued");
    assert.equal(stored.status, "succeeded");
    assert.equal(stored.diagnostics.reason, "retry_success");
    assert.equal((await fs.readFile(path.join(temp, record.artwork_path))).subarray(0, 4).toString("ascii"), "RIFF");
  });
});

test("fusion generation retries once and preserves artwork", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    let fusionAttempts = 0;
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: async ({ outputPngPath, stage }) => {
        if (stage === "fusion_render") {
          fusionAttempts += 1;
          if (fusionAttempts === 1) {
            const error = new Error("temporary fusion issue");
            error.diagnostics = { reason: "temporary" };
            throw error;
          }
        }
        await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
        await fs.writeFile(outputPngPath, pngBuffer(stage === "fusion_render" ? 220 : 80));
        return { pngPath: outputPngPath, diagnostics: { reason: `${stage}_success` } };
      }
    });
    const { record } = await manager.createArtwork({ type: "painting", answers: {} });
    await manager.waitForIdle();
    const artworkPath = record.artwork_path;

    const { job } = await manager.createFusion({ recordId: record.id });
    await manager.waitForIdle();
    const fused = await storage.getRecord(record.id);

    assert.equal(fusionAttempts, 2);
    assert.equal(manager.getJob(job.id).status, "succeeded");
    assert.equal(fused.status, "succeeded");
    assert.equal(fused.artwork_path, artworkPath);
    assert.equal(fused.diagnostics.reason, "fusion_render_success");
    assert.equal((await fs.readFile(path.join(temp, fused.fusion_path))).subarray(8, 12).toString("ascii"), "WEBP");
  });
});

test("source photo path is validated and normalized before queueing", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const manager = createJobManager({
      config: { app: { image: { webpQuality: 82 } }, prompts: {}, questions: {} },
      storage,
      runner: fakeRunner()
    });

    await assert.rejects(
      () => manager.createArtwork({
        type: "painting",
        answers: {},
        sourcePhotoPath: "../bad/source-photo.webp"
      }),
      /Invalid source photo path/
    );

    const created = await manager.createArtwork({
      type: "painting",
      answers: {},
      sourcePhotoPath: "records\\abc-123\\source-photo.webp"
    });

    assert.equal(created.record.source_photo_path, "records/abc-123/source-photo.webp");
    await manager.waitForIdle();

    const fused = await manager.createFusion({
      recordId: created.record.id,
      sourcePhotoPath: `records\\${created.record.id}\\source-photo.webp`
    });
    assert.equal(fused.record.source_photo_path, `records/${created.record.id}/source-photo.webp`);
    await manager.waitForIdle();

    const stored = await storage.getRecord(created.record.id);
    assert.equal(stored.source_photo_path, `records/${created.record.id}/source-photo.webp`);
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

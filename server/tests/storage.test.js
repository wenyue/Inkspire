const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createStorage } = require("../src/storage");

async function withTempStore(fn) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "inkspire-storage-"));
  try {
    await fn(temp);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

test("ensureStore creates library.json and records directory", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);

    await storage.ensureStore();

    assert.deepEqual(JSON.parse(await fs.readFile(path.join(temp, "library.json"), "utf8")), []);
    assert.equal((await fs.stat(path.join(temp, "records"))).isDirectory(), true);
  });
});

test("saveRecord writes record JSON, updates library, and getRecord returns it", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const record = {
      id: "artwork-1",
      type: "painting",
      title: "松风入画",
      created_at: "2026-06-24T12:00:00.000Z",
      source_photo_path: "records/artwork-1/source-photo.webp",
      artwork_path: "records/artwork-1/artwork.webp",
      favorite: true,
      status: "succeeded",
      answers: { painting_subject: "山水" }
    };

    await storage.ensureStore();
    await storage.saveRecord(record);

    assert.deepEqual(
      JSON.parse(await fs.readFile(path.join(temp, "records", "artwork-1", "record.json"), "utf8")),
      record
    );
    assert.deepEqual(await storage.getRecord("artwork-1"), record);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(temp, "library.json"), "utf8")), [
      {
        id: "artwork-1",
        created_at: "2026-06-24T12:00:00.000Z",
        type: "painting",
        title: "松风入画",
        thumbnail_path: "records/artwork-1/artwork.webp",
        has_fusion: false,
        favorite: true,
        status: "succeeded"
      }
    ]);
  });
});

test("listLibrary returns spec summaries sorted newest first", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    await storage.ensureStore();
    await storage.saveRecord({
      id: "older",
      type: "painting",
      title: "旧作",
      created_at: "2026-06-24T10:00:00.000Z",
      artwork_path: "records/older/artwork.webp",
      favorite: false,
      status: "succeeded",
      answers: { painting_subject: "花鸟" }
    });
    await storage.saveRecord({
      id: "newer",
      type: "calligraphy",
      title: "新作",
      created_at: "2026-06-24T11:00:00.000Z",
      artwork_path: "records/newer/artwork.webp",
      fusion_path: "records/newer/fusion.webp",
      favorite: true,
      status: "running",
      answers: { calligraphy_script: "行书" }
    });

    assert.deepEqual(await storage.listLibrary(), [
      {
        id: "newer",
        created_at: "2026-06-24T11:00:00.000Z",
        type: "calligraphy",
        title: "新作",
        thumbnail_path: "records/newer/fusion.webp",
        has_fusion: true,
        favorite: true,
        status: "running"
      },
      {
        id: "older",
        created_at: "2026-06-24T10:00:00.000Z",
        type: "painting",
        title: "旧作",
        thumbnail_path: "records/older/artwork.webp",
        has_fusion: false,
        favorite: false,
        status: "succeeded"
      }
    ]);
  });
});

test("record ids must be safe path segments", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    await storage.ensureStore();

    await assert.rejects(
      () => storage.saveRecord({ id: "../escape", createdAt: "2026-06-24T12:00:00.000Z" }),
      /Invalid record id/
    );
  });
});

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
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}

test("ensureStore creates SQLite database, schema, and records directory", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);

    await storage.ensureStore();

    assert.equal((await fs.stat(path.join(temp, "records"))).isDirectory(), true);
    assert.equal((await fs.stat(path.join(temp, "inkspire.db"))).isFile(), true);

    const Database = require("better-sqlite3");
    const db = new Database(path.join(temp, "inkspire.db"), { readonly: true });
    try {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((row) => row.name);
      assert.deepEqual(tables, ["meta", "production_orders", "records"]);
      const schemaVersion = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
      assert.equal(schemaVersion.value, "1");
    } finally {
      db.close();
    }
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
      generation_complexity: "large",
      recommended_artwork_size: {
        preset_id: "complexity_large",
        label: "丰富参考尺寸",
        width_cm: 60,
        height_cm: 90,
        reason: "按作品复杂度和画面比例估算。"
      },
      generation_profile: {
        created_at: "2026-06-24T12:00:00.000Z",
        total_ms: 1234,
        stages: {
          codex_artwork: { total_ms: 1000, count: 1 },
          webp_conversion: { total_ms: 20, count: 1 }
        },
        attempts: [
          { stage: "artwork", attempt: 1, status: "succeeded", duration_ms: 1000 }
        ]
      },
      favorite: true,
      status: "succeeded",
      answers: {
        painting_subject: "山水",
        painting_brushwork: "工笔",
        painting_palette: "水墨",
        conversation_notes: "不要出现在藏卷摘要"
      }
    };

    await storage.ensureStore();
    await storage.saveRecord(record);

    assert.deepEqual(await storage.getRecord("artwork-1"), record);
    const [summary] = await storage.listLibrary();
    assert.equal(Object.hasOwn(summary, "generation_profile"), false);
    assert.deepEqual(summary.answers, {
      painting_subject: "山水",
      painting_brushwork: "工笔",
      painting_palette: "水墨"
    });
    const Database = require("better-sqlite3");
    const db = new Database(path.join(temp, "inkspire.db"), { readonly: true });
    try {
      const row = db
        .prepare("SELECT id, user_id, title, status, favorite, generation_complexity, record_json FROM records WHERE id = ?")
        .get("artwork-1");
      assert.equal(row.id, "artwork-1");
      assert.equal(row.user_id, "");
      assert.equal(row.title, "松风入画");
      assert.equal(row.status, "succeeded");
      assert.equal(row.favorite, 1);
      assert.equal(row.generation_complexity, "large");
      assert.deepEqual(JSON.parse(row.record_json), record);
    } finally {
      db.close();
    }
  });
});

test("saveRecord preserves library entries from concurrent writes", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const records = Array.from({ length: 12 }, (_, index) => ({
      id: `concurrent-${index}`,
      user_id: `user-${index}`,
      type: "painting",
      title: `并发作品 ${index}`,
      created_at: `2026-06-25T10:${String(index).padStart(2, "0")}:00.000Z`,
      artwork_path: `records/concurrent-${index}/artwork.webp`,
      favorite: true,
      status: "succeeded"
    }));

    await Promise.all(records.map((record) => storage.saveRecord(record, record.user_id)));

    const libraries = await Promise.all(
      records.map((record) => storage.listLibrary(record.user_id))
    );

    assert.deepEqual(
      libraries.map((library) => library.map((record) => record.id)),
      records.map((record) => [record.id])
    );
  });
});

test("user-owned records are indexed in SQLite without JSON library files", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);

    await storage.saveRecord({
      id: "mine",
      user_id: "user-a",
      created_at: "2026-06-25T10:00:00.000Z",
      type: "painting",
      artwork_path: "records/mine/artwork.webp",
      favorite: true,
      status: "succeeded"
    }, "user-a");
    await storage.saveRecord({
      id: "legacy",
      created_at: "2026-06-25T10:01:00.000Z",
      type: "calligraphy",
      artwork_path: "records/legacy/artwork.webp",
      favorite: true,
      status: "succeeded"
    });

    await assert.rejects(fs.access(path.join(temp, "library.json")));
    await assert.rejects(fs.access(path.join(temp, "libraries", "user-a.json")));

    const Database = require("better-sqlite3");
    const db = new Database(path.join(temp, "inkspire.db"), { readonly: true });
    try {
      assert.deepEqual(
        db.prepare("SELECT id, user_id FROM records ORDER BY id").all(),
        [
          { id: "legacy", user_id: "" },
          { id: "mine", user_id: "user-a" }
        ]
      );
    } finally {
      db.close();
    }
    assert.deepEqual((await storage.listLibrary("user-a")).map((record) => record.id), ["legacy", "mine"]);
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
      id: "running-work",
      type: "calligraphy",
      title: "生成中",
      created_at: "2026-06-24T11:00:00.000Z",
      artwork_path: "records/running-work/artwork.webp",
      fusion_path: "records/running-work/fusion.webp",
      favorite: true,
      status: "running",
      answers: { calligraphy_script: "行书" }
    });
    await storage.saveRecord({
      id: "fused-work",
      type: "calligraphy",
      title: "已有效果图",
      created_at: "2026-06-24T11:30:00.000Z",
      artwork_path: "records/fused-work/artwork.webp",
      fusion_path: "records/fused-work/fusion.webp",
      favorite: true,
      status: "succeeded",
      answers: { calligraphy_script: "行书", calligraphy_layout: "立轴" }
    });
    await storage.saveRecord({
      id: "queued-work",
      type: "painting",
      title: "排队中",
      created_at: "2026-06-24T12:00:00.000Z",
      artwork_path: "records/queued-work/artwork.webp",
      favorite: true,
      status: "queued"
    });
    await storage.saveRecord({
      id: "failed-work",
      type: "painting",
      title: "失败作",
      created_at: "2026-06-24T13:00:00.000Z",
      artwork_path: "records/failed-work/artwork.webp",
      favorite: true,
      status: "failed"
    });

    assert.deepEqual(await storage.listLibrary(), [
      {
        id: "failed-work",
        user_id: "",
        created_at: "2026-06-24T13:00:00.000Z",
        type: "painting",
        title: "失败作",
        thumbnail_path: "records/failed-work/artwork.webp",
        has_fusion: false,
        favorite: true,
        status: "failed"
      },
      {
        id: "fused-work",
        user_id: "",
        created_at: "2026-06-24T11:30:00.000Z",
        type: "calligraphy",
        title: "已有效果图",
        thumbnail_path: "records/fused-work/artwork.webp",
        has_fusion: true,
        favorite: true,
        status: "succeeded",
        answers: { calligraphy_script: "行书", calligraphy_layout: "立轴" }
      },
      {
        id: "older",
        user_id: "",
        created_at: "2026-06-24T10:00:00.000Z",
        type: "painting",
        title: "旧作",
        thumbnail_path: "records/older/artwork.webp",
        has_fusion: false,
        favorite: false,
        status: "succeeded",
        answers: { painting_subject: "花鸟" }
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

test("ensureStore marks stale active records interrupted on startup", async () => {
  await withTempStore(async (temp) => {
    await fs.mkdir(path.join(temp, "records", "stale-artwork"), { recursive: true });
    await fs.writeFile(path.join(temp, "records", "stale-artwork", "record.json"), `${JSON.stringify({
      id: "stale-artwork",
      user_id: "user-a",
      created_at: "2026-06-25T10:00:00.000Z",
      type: "painting",
      artwork_path: "records/stale-artwork/artwork.webp",
      favorite: true,
      status: "running"
    })}\n`);
    await fs.mkdir(path.join(temp, "records", "stale-fusion"), { recursive: true });
    await fs.writeFile(path.join(temp, "records", "stale-fusion", "artwork.webp"), "webp");
    await fs.writeFile(path.join(temp, "records", "stale-fusion", "record.json"), `${JSON.stringify({
      id: "stale-fusion",
      user_id: "user-a",
      created_at: "2026-06-25T10:01:00.000Z",
      type: "painting",
      artwork_path: "records/stale-fusion/artwork.webp",
      favorite: true,
      status: "queued",
      fusion_status: "running"
    })}\n`);
    const storage = createStorage(temp);
    await storage.ensureStore();

    const staleArtwork = await storage.getRecord("stale-artwork");
    assert.equal(staleArtwork.status, "failed");
    assert.equal(staleArtwork.error, "generation interrupted");
    assert.equal(staleArtwork.diagnostics.reason, "generation_interrupted");

    const staleFusion = await storage.getRecord("stale-fusion");
    assert.equal(staleFusion.status, "succeeded");
    assert.equal(staleFusion.fusion_status, "failed");
    assert.deepEqual((await storage.listLibrary("user-a")).map((record) => [record.id, record.status]), [
      ["stale-fusion", "succeeded"],
      ["stale-artwork", "failed"]
    ]);
  });
});

test("ensureStore cleans active database records instead of scanning every record directory", async () => {
  await withTempStore(async (temp) => {
    await fs.mkdir(path.join(temp, "records", "inactive-broken"), { recursive: true });
    await fs.writeFile(path.join(temp, "records", "inactive-broken", "record.json"), "{not-json");
    await fs.mkdir(path.join(temp, "records", "stale-active"), { recursive: true });
    await fs.writeFile(path.join(temp, "records", "stale-active", "record.json"), `${JSON.stringify({
      id: "stale-active",
      user_id: "user-a",
      created_at: "2026-06-25T10:00:00.000Z",
      type: "painting",
      artwork_path: "records/stale-active/artwork.webp",
      favorite: true,
      status: "running"
    })}\n`);

    const storage = createStorage(temp);
    await storage.ensureStore();

    const staleActive = await storage.getRecord("stale-active");
    assert.equal(staleActive.status, "failed");
  });
});

test("ensureStore imports legacy record JSON files into SQLite once", async () => {
  await withTempStore(async (temp) => {
    await fs.mkdir(path.join(temp, "records", "legacy-record"), { recursive: true });
    const legacyRecord = {
      id: "legacy-record",
      user_id: "user-a",
      created_at: "2026-06-25T10:00:00.000Z",
      type: "painting",
      title: "旧文件作品",
      artwork_path: "records/legacy-record/artwork.webp",
      favorite: true,
      status: "succeeded"
    };
    await fs.writeFile(path.join(temp, "records", "legacy-record", "record.json"), `${JSON.stringify(legacyRecord)}\n`);

    const storage = createStorage(temp);
    await storage.ensureStore();

    assert.deepEqual(await storage.getRecord("legacy-record"), legacyRecord);
    assert.deepEqual((await storage.listLibrary("user-a")).map((record) => record.id), ["legacy-record"]);

    await fs.writeFile(path.join(temp, "records", "legacy-record", "record.json"), `${JSON.stringify({ ...legacyRecord, title: "不应再次导入" })}\n`);
    const secondStorage = createStorage(temp);
    await secondStorage.ensureStore();

    assert.equal((await secondStorage.getRecord("legacy-record")).title, "旧文件作品");
  });
});

test("ensureStore skips damaged legacy JSON files during import", async () => {
  await withTempStore(async (temp) => {
    await fs.mkdir(path.join(temp, "records", "bad-record"), { recursive: true });
    await fs.writeFile(path.join(temp, "records", "bad-record", "record.json"), "{not-json");

    const storage = createStorage(temp);
    await storage.ensureStore();

    assert.deepEqual(await storage.listLibrary("user-a"), []);
  });
});

test("ensureStore imports legacy production order JSON files into SQLite once", async () => {
  await withTempStore(async (temp) => {
    await fs.mkdir(path.join(temp, "orders"), { recursive: true });
    const legacyOrder = {
      id: "ord-aaaaaaaa",
      user_id: "user-a",
      created_at: "2026-06-25T10:00:00.000Z",
      record_id: "legacy-record",
      expert_id: "platform_artisan_match"
    };
    await fs.writeFile(path.join(temp, "orders", "ord-aaaaaaaa.json"), `${JSON.stringify(legacyOrder)}\n`);

    const storage = createStorage(temp);
    await storage.ensureStore();

    assert.equal(await storage.productionOrderExists("ord-aaaaaaaa"), true);
    assert.deepEqual(await storage.getProductionOrder("ord-aaaaaaaa"), legacyOrder);
  });
});

test("saveProductionOrder stores orders in SQLite", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    const order = {
      id: "ord-bbbbbbbb",
      user_id: "user-a",
      created_at: "2026-06-25T10:00:00.000Z",
      record_id: "record-a",
      expert_id: "platform_artisan_match"
    };

    await storage.saveProductionOrder(order, "user-a");

    assert.equal(await storage.productionOrderExists("ord-bbbbbbbb"), true);
    assert.deepEqual(await storage.getProductionOrder("ord-bbbbbbbb"), order);
    await assert.rejects(fs.access(path.join(temp, "orders", "ord-bbbbbbbb.json")));
  });
});

test("listLibrary filters records by user while keeping legacy records visible", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    await storage.saveRecord({
      id: "mine",
      user_id: "user-a",
      created_at: "2026-06-25T10:00:00.000Z",
      type: "painting",
      artwork_path: "records/mine/artwork.webp",
      favorite: true,
      status: "succeeded"
    });
    await storage.saveRecord({
      id: "theirs",
      user_id: "user-b",
      created_at: "2026-06-25T10:01:00.000Z",
      type: "painting",
      artwork_path: "records/theirs/artwork.webp",
      favorite: true,
      status: "succeeded"
    });
    await storage.saveRecord({
      id: "legacy",
      created_at: "2026-06-25T10:02:00.000Z",
      type: "calligraphy",
      artwork_path: "records/legacy/artwork.webp",
      favorite: true,
      status: "succeeded"
    });

    const records = await storage.listLibrary("user-a");

    assert.deepEqual(records.map((record) => record.id), ["legacy", "mine"]);
  });
});

test("getRecordForUser rejects records owned by another user", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    await storage.saveRecord({
      id: "private-work",
      user_id: "user-a",
      created_at: "2026-06-25T10:00:00.000Z",
      type: "painting",
      artwork_path: "records/private-work/artwork.webp",
      favorite: true,
      status: "succeeded"
    });

    await assert.rejects(
      () => storage.getRecordForUser("private-work", "user-b"),
      /not found/i
    );
    assert.equal((await storage.getRecordForUser("private-work", "user-a")).id, "private-work");
  });
});

test("getRecordForUser rejects missing records with not found", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);

    await assert.rejects(
      () => storage.getRecordForUser("missing", "user-a"),
      (error) => {
        assert.match(error.message, /not found/i);
        assert.equal(error.status, 404);
        return true;
      }
    );
  });
});

test("saveRecord backfills legacy user_id when owner is provided", async () => {
  await withTempStore(async (temp) => {
    const storage = createStorage(temp);
    await storage.saveRecord({
      id: "legacy-backfill",
      created_at: "2026-06-25T10:00:00.000Z",
      type: "painting",
      artwork_path: "records/legacy-backfill/artwork.webp",
      favorite: true,
      status: "succeeded"
    });

    const legacy = await storage.getRecordForUser("legacy-backfill", "user-a");
    legacy.favorite = false;
    await storage.saveRecord(legacy, "user-a");

    assert.equal((await storage.getRecord("legacy-backfill")).user_id, "user-a");
  });
});

const fs = require("node:fs/promises");
const path = require("node:path");
const Database = require("better-sqlite3");

const SAFE_ID = /^[a-z0-9-]+$/i;
const RECORD_ASSET_FILES = new Set(["artwork.webp", "fusion.webp", "source-photo.webp"]);

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function validateRecordId(id) {
  if (typeof id !== "string" || !SAFE_ID.test(id)) {
    throw badRequest("Invalid record id");
  }
}

function validateRecordAssetPath(relativePath, allowedFileNames = RECORD_ASSET_FILES) {
  if (
    typeof relativePath !== "string" ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\")
  ) {
    throw badRequest("Invalid record asset path");
  }

  const parts = relativePath.split("/");
  if (parts.length !== 3 || parts[0] !== "records") {
    throw badRequest("Invalid record asset path");
  }

  validateRecordId(parts[1]);
  if (!allowedFileNames.has(parts[2])) {
    throw badRequest("Invalid record asset path");
  }

  return `records/${parts[1]}/${parts[2]}`;
}

function resolveRecordAssetPath(dataDir, relativePath, allowedFileNames = RECORD_ASSET_FILES) {
  const normalizedPath = validateRecordAssetPath(relativePath, allowedFileNames);
  const root = path.resolve(dataDir);
  const resolved = path.resolve(root, normalizedPath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw badRequest("Invalid record asset path");
  }
  return resolved;
}

function canAccessRecord(record, userId) {
  return !record.user_id || record.user_id === userId;
}

function notFound(id) {
  const error = new Error(`Record not found: ${id}`);
  error.status = 404;
  return error;
}

function summarizeRecord(record) {
  const fusionPath = record.fusion_path || record.fusionPath;
  const artworkPath = record.artwork_path || record.artworkPath;

  const summary = {
    id: record.id,
    user_id: record.user_id || "",
    created_at: record.created_at || record.createdAt || null,
    type: record.type,
    title: record.title || "",
    thumbnail_path: record.thumbnail_path || record.thumbnailPath || fusionPath || artworkPath || null,
    has_fusion:
      typeof record.has_fusion === "boolean" ? record.has_fusion : Boolean(fusionPath),
    favorite: Boolean(record.favorite),
    status: record.status || "idle"
  };
  if (record.user_id) {
    summary.user_id = record.user_id;
  }
  if (record.generation_complexity) {
    summary.generation_complexity = record.generation_complexity;
  }
  if (record.recommended_artwork_size) {
    summary.recommended_artwork_size = record.recommended_artwork_size;
  }
  return summary;
}

function isActiveStatus(status) {
  return status === "queued" || status === "running";
}

function recordNeedsStartupCleanup(record) {
  return isActiveStatus(record.status) || isActiveStatus(record.fusion_status);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function stringifyJson(value) {
  return `${JSON.stringify(value)}\n`;
}

function parseJson(value) {
  return JSON.parse(value);
}

function recordRow(record) {
  const summary = summarizeRecord(record);
  return {
    id: record.id,
    user_id: record.user_id || "",
    created_at: summary.created_at,
    type: summary.type || "",
    title: summary.title || "",
    thumbnail_path: summary.thumbnail_path || null,
    has_fusion: summary.has_fusion ? 1 : 0,
    favorite: summary.favorite ? 1 : 0,
    status: summary.status || "idle",
    fusion_status: record.fusion_status || null,
    generation_complexity: summary.generation_complexity || null,
    record_json: stringifyJson(record)
  };
}

function orderRow(order) {
  return {
    id: order.id,
    user_id: order.user_id || "",
    record_id: order.record_id || "",
    created_at: order.created_at || null,
    order_json: stringifyJson(order)
  };
}

async function readJsonFileIfValid(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function enoentFor(filePath) {
  const error = new Error(`ENOENT: no such file or directory, open '${filePath}'`);
  error.code = "ENOENT";
  return error;
}

function createStorage(dataDir) {
  const dbPath = path.join(dataDir, "inkspire.db");
  const recordsDir = path.join(dataDir, "records");
  const uploadsDir = path.join(dataDir, "uploads");
  const ordersDir = path.join(dataDir, "orders");
  let storeReadyPromise = null;
  let staleRecordsCleaned = false;

  function withDb(fn) {
    const db = new Database(dbPath);
    try {
      db.pragma("journal_mode = WAL");
      db.pragma("foreign_keys = ON");
      return fn(db);
    } finally {
      db.close();
    }
  }

  function insertRecord(db, record) {
    db.prepare(`
      INSERT INTO records (
        id, user_id, created_at, type, title, thumbnail_path, has_fusion,
        favorite, status, fusion_status, generation_complexity, record_json
      ) VALUES (
        @id, @user_id, @created_at, @type, @title, @thumbnail_path, @has_fusion,
        @favorite, @status, @fusion_status, @generation_complexity, @record_json
      )
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        created_at = excluded.created_at,
        type = excluded.type,
        title = excluded.title,
        thumbnail_path = excluded.thumbnail_path,
        has_fusion = excluded.has_fusion,
        favorite = excluded.favorite,
        status = excluded.status,
        fusion_status = excluded.fusion_status,
        generation_complexity = excluded.generation_complexity,
        record_json = excluded.record_json
    `).run(recordRow(record));
  }

  function insertOrder(db, order) {
    db.prepare(`
      INSERT INTO production_orders (
        id, user_id, record_id, created_at, order_json
      ) VALUES (
        @id, @user_id, @record_id, @created_at, @order_json
      )
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        record_id = excluded.record_id,
        created_at = excluded.created_at,
        order_json = excluded.order_json
    `).run(orderRow(order));
  }

  function migrateSchema(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT '',
        created_at TEXT,
        type TEXT,
        title TEXT NOT NULL DEFAULT '',
        thumbnail_path TEXT,
        has_fusion INTEGER NOT NULL DEFAULT 0,
        favorite INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'idle',
        fusion_status TEXT,
        generation_complexity TEXT,
        record_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_records_user_created
        ON records(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_records_status
        ON records(status);
      CREATE INDEX IF NOT EXISTS idx_records_fusion_status
        ON records(fusion_status);
      CREATE TABLE IF NOT EXISTS production_orders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT '',
        record_id TEXT NOT NULL DEFAULT '',
        created_at TEXT,
        order_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_orders_user_created
        ON production_orders(user_id, created_at DESC);
    `);
    db.prepare(`
      INSERT INTO meta(key, value)
      VALUES ('schema_version', '1')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run();
  }

  function metaValue(db, key) {
    return db.prepare("SELECT value FROM meta WHERE key = ?").get(key)?.value || "";
  }

  function setMetaValue(db, key, value) {
    db.prepare(`
      INSERT INTO meta(key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }

  async function importLegacyRecords(db) {
    let entries;
    try {
      entries = await fs.readdir(recordsDir, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === "ENOENT") return;
      throw error;
    }

    const transaction = db.transaction((records) => {
      for (const record of records) {
        insertRecord(db, record);
      }
    });
    const records = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        validateRecordId(entry.name);
      } catch {
        continue;
      }
      const record = await readJsonFileIfValid(path.join(recordsDir, entry.name, "record.json"));
      if (!record) continue;
      try {
        validateRecordId(record.id);
      } catch {
        continue;
      }
      records.push(record);
    }
    transaction(records);
  }

  async function importLegacyOrders(db) {
    let entries;
    try {
      entries = await fs.readdir(ordersDir, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === "ENOENT") return;
      throw error;
    }

    const transaction = db.transaction((orders) => {
      for (const order of orders) {
        insertOrder(db, order);
      }
    });
    const orders = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const order = await readJsonFileIfValid(path.join(ordersDir, entry.name));
      if (!order) continue;
      if (!order.id) {
        order.id = path.basename(entry.name, ".json");
      }
      try {
        validateRecordId(order.id);
      } catch {
        continue;
      }
      orders.push(order);
    }
    transaction(orders);
  }

  async function importLegacyJsonIfNeeded(db) {
    if (metaValue(db, "json_imported")) return;
    const recordCount = db.prepare("SELECT COUNT(*) AS count FROM records").get().count;
    const orderCount = db.prepare("SELECT COUNT(*) AS count FROM production_orders").get().count;
    if (recordCount === 0) {
      await importLegacyRecords(db);
    }
    if (orderCount === 0) {
      await importLegacyOrders(db);
    }
    setMetaValue(db, "json_imported", new Date().toISOString());
  }

  async function initializeStore() {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(recordsDir, { recursive: true });
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.mkdir(ordersDir, { recursive: true });

    const db = new Database(dbPath);
    try {
      db.pragma("journal_mode = WAL");
      db.pragma("foreign_keys = ON");
      migrateSchema(db);
      await importLegacyJsonIfNeeded(db);
    } finally {
      db.close();
    }
  }

  async function ensureStore() {
    if (!storeReadyPromise) {
      storeReadyPromise = initializeStore().catch((error) => {
        storeReadyPromise = null;
        throw error;
      });
    }
    await storeReadyPromise;
    await cleanupStaleActiveRecords();
  }

  async function cleanupStaleActiveRecords() {
    if (staleRecordsCleaned) return;
    staleRecordsCleaned = true;

    const rows = withDb((db) => db.prepare(`
      SELECT record_json
      FROM records
      WHERE status IN ('queued', 'running')
         OR fusion_status IN ('queued', 'running')
    `).all());

    for (const row of rows) {
      const record = parseJson(row.record_json);
      if (!recordNeedsStartupCleanup(record)) {
        continue;
      }

      const artworkExists = record.artwork_path
        ? await fileExists(path.join(dataDir, validateRecordAssetPath(record.artwork_path)))
        : false;
      const nextRecord = {
        ...record,
        diagnostics: record.diagnostics || { reason: "generation_interrupted" },
        error: record.error || "generation interrupted"
      };

      if (isActiveStatus(nextRecord.status)) {
        nextRecord.status = artworkExists ? "succeeded" : "failed";
      }
      if (isActiveStatus(nextRecord.fusion_status)) {
        nextRecord.fusion_status = "failed";
      }

      await saveRecord(nextRecord, nextRecord.user_id || "");
    }
  }

  async function saveRecord(record, userId = "") {
    validateRecordId(record && record.id);
    await ensureStore();

    const nextRecord = { ...record };
    if (userId && !nextRecord.user_id) {
      nextRecord.user_id = userId;
    }

    withDb((db) => {
      const transaction = db.transaction((value) => insertRecord(db, value));
      transaction(nextRecord);
    });
  }

  async function getRecord(id) {
    validateRecordId(id);
    await ensureStore();
    const row = withDb((db) => db.prepare("SELECT record_json FROM records WHERE id = ?").get(id));
    if (!row) {
      throw enoentFor(path.join(recordsDir, id, "record.json"));
    }
    return parseJson(row.record_json);
  }

  async function getRecordForUser(id, userId) {
    let record;
    try {
      record = await getRecord(id);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        throw notFound(id);
      }
      throw error;
    }
    if (!canAccessRecord(record, userId)) {
      throw notFound(id);
    }
    return record;
  }

  async function listLibrary(userId = "") {
    await ensureStore();
    const rows = withDb((db) => userId
      ? db.prepare("SELECT record_json FROM records WHERE user_id = ? OR user_id = '' ORDER BY created_at DESC").all(userId)
      : db.prepare("SELECT record_json FROM records WHERE user_id = '' ORDER BY created_at DESC").all());
    return rows.map((row) => summarizeRecord(parseJson(row.record_json)));
  }

  async function saveProductionOrder(order, userId = "") {
    validateRecordId(order && order.id);
    await ensureStore();
    const nextOrder = userId && !order.user_id ? { ...order, user_id: userId } : order;
    withDb((db) => {
      const transaction = db.transaction((value) => insertOrder(db, value));
      transaction(nextOrder);
    });
  }

  async function productionOrderExists(id) {
    validateRecordId(id);
    await ensureStore();
    return withDb((db) => Boolean(db.prepare("SELECT 1 FROM production_orders WHERE id = ?").get(id)));
  }

  async function getProductionOrder(id) {
    validateRecordId(id);
    await ensureStore();
    const row = withDb((db) => db.prepare("SELECT order_json FROM production_orders WHERE id = ?").get(id));
    if (!row) {
      throw enoentFor(path.join(ordersDir, `${id}.json`));
    }
    return parseJson(row.order_json);
  }

  return {
    dataDir,
    ensureStore,
    saveRecord,
    getRecord,
    getRecordForUser,
    listLibrary,
    saveProductionOrder,
    productionOrderExists,
    getProductionOrder
  };
}

module.exports = {
  createStorage,
  validateRecordId,
  validateRecordAssetPath,
  resolveRecordAssetPath
};

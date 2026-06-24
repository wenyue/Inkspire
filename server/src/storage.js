const fs = require("node:fs/promises");
const path = require("node:path");

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

async function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(tempPath, filePath);
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
  return summary;
}

function compareNewestFirst(a, b) {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function createStorage(dataDir) {
  const libraryPath = path.join(dataDir, "library.json");
  const recordsDir = path.join(dataDir, "records");
  const ordersDir = path.join(dataDir, "orders");

  async function ensureStore() {
    await fs.mkdir(recordsDir, { recursive: true });
    await fs.mkdir(ordersDir, { recursive: true });
    try {
      await fs.access(libraryPath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      await writeJsonAtomic(libraryPath, []);
    }
  }

  async function readLibrary() {
    await ensureStore();
    return JSON.parse(await fs.readFile(libraryPath, "utf8"));
  }

  async function saveRecord(record, userId = "") {
    validateRecordId(record && record.id);
    await ensureStore();

    const nextRecord = { ...record };
    if (userId && !nextRecord.user_id) {
      nextRecord.user_id = userId;
    }

    const recordPath = path.join(recordsDir, nextRecord.id, "record.json");
    await writeJsonAtomic(recordPath, nextRecord);

    const summary = summarizeRecord(nextRecord);
    const library = (await readLibrary()).filter((entry) => entry.id !== nextRecord.id);
    library.push(summary);
    library.sort(compareNewestFirst);
    await writeJsonAtomic(libraryPath, library);
  }

  async function getRecord(id) {
    validateRecordId(id);
    return JSON.parse(await fs.readFile(path.join(recordsDir, id, "record.json"), "utf8"));
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
    const library = await readLibrary();
    return library
      .map(summarizeRecord)
      .filter((record) => canAccessRecord(record, userId))
      .sort(compareNewestFirst);
  }

  async function saveProductionOrder(order, userId = "") {
    validateRecordId(order && order.id);
    await ensureStore();
    const nextOrder = userId && !order.user_id ? { ...order, user_id: userId } : order;
    await writeJsonAtomic(path.join(ordersDir, `${nextOrder.id}.json`), nextOrder);
  }

  async function getProductionOrder(id) {
    validateRecordId(id);
    return JSON.parse(await fs.readFile(path.join(ordersDir, `${id}.json`), "utf8"));
  }

  return {
    dataDir,
    ensureStore,
    saveRecord,
    getRecord,
    getRecordForUser,
    listLibrary,
    saveProductionOrder,
    getProductionOrder
  };
}

module.exports = {
  createStorage,
  validateRecordId,
  validateRecordAssetPath,
  resolveRecordAssetPath
};

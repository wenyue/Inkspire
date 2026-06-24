const fs = require("node:fs/promises");
const path = require("node:path");

const SAFE_ID = /^[a-z0-9-]+$/i;

function validateRecordId(id) {
  if (typeof id !== "string" || !SAFE_ID.test(id)) {
    throw new Error("Invalid record id");
  }
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

  return {
    id: record.id,
    created_at: record.created_at || record.createdAt || null,
    type: record.type,
    title: record.title || "",
    thumbnail_path: record.thumbnail_path || record.thumbnailPath || fusionPath || artworkPath || null,
    has_fusion:
      typeof record.has_fusion === "boolean" ? record.has_fusion : Boolean(fusionPath),
    favorite: Boolean(record.favorite),
    status: record.status || "idle"
  };
}

function compareNewestFirst(a, b) {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function createStorage(dataDir) {
  const libraryPath = path.join(dataDir, "library.json");
  const recordsDir = path.join(dataDir, "records");

  async function ensureStore() {
    await fs.mkdir(recordsDir, { recursive: true });
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

  async function saveRecord(record) {
    validateRecordId(record && record.id);
    await ensureStore();

    const recordPath = path.join(recordsDir, record.id, "record.json");
    await writeJsonAtomic(recordPath, record);

    const summary = summarizeRecord(record);
    const library = (await readLibrary()).filter((entry) => entry.id !== record.id);
    library.push(summary);
    library.sort(compareNewestFirst);
    await writeJsonAtomic(libraryPath, library);
  }

  async function getRecord(id) {
    validateRecordId(id);
    return JSON.parse(await fs.readFile(path.join(recordsDir, id, "record.json"), "utf8"));
  }

  async function listLibrary() {
    const library = await readLibrary();
    return library
      .map(summarizeRecord)
      .sort(compareNewestFirst);
  }

  return { dataDir, ensureStore, saveRecord, getRecord, listLibrary };
}

module.exports = { createStorage };

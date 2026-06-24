const crypto = require("node:crypto");
const path = require("node:path");
const { convertPngToWebp } = require("./imagePipeline");
const { buildArtworkPrompt, buildFusionPrompt } = require("./prompts");
const { validateRecordAssetPath } = require("./storage");

const SOURCE_PHOTO_FILES = new Set(["source-photo.webp"]);

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

function qualityFromConfig(config) {
  return config.app?.image?.webpQuality || config.image?.webpQuality || 82;
}

function titleFromRequest(type, answers = {}) {
  if (type === "calligraphy" && answers.text) return answers.text;
  if (type === "painting" && answers.painting_subject) return answers.painting_subject;
  return type === "calligraphy" ? "书法作品" : "中国画作品";
}

function relativeRecordPath(recordId, fileName) {
  return path.join("records", recordId, fileName).replace(/\\/g, "/");
}

function diagnosticsFromError(error) {
  return error?.diagnostics || { reason: "runner_error" };
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function normalizeSourcePhotoPath(sourcePhotoPath) {
  if (!sourcePhotoPath) {
    return "";
  }
  try {
    return validateRecordAssetPath(sourcePhotoPath, SOURCE_PHOTO_FILES);
  } catch {
    throw badRequest("Invalid source photo path");
  }
}

function createJobManager({ config, storage, runner }) {
  const jobs = new Map();
  let locked = false;

  function createJob(stage, recordId = "") {
    const job = {
      id: newId("job"),
      recordId,
      stage,
      status: "queued",
      error: "",
      diagnostics: null
    };
    jobs.set(job.id, job);
    return job;
  }

  function busyJob(stage) {
    const job = createJob(stage);
    job.status = "failed";
    job.error = "generation busy";
    return { busy: true, job };
  }

  async function runLocked(stage, fn) {
    if (locked) return busyJob(stage);
    locked = true;
    try {
      return await fn();
    } finally {
      locked = false;
    }
  }

  async function runRunnerWithRetry(options) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await runner(options);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  async function createArtwork({ type, answers = {}, conversationNotes = "", sourcePhotoPath = "", recommendedArtworkSize = null }) {
    return runLocked("artwork", async () => {
      const safeSourcePhotoPath = normalizeSourcePhotoPath(sourcePhotoPath);
      const recordId = newId("record");
      const job = createJob("artwork", recordId);
      const artworkPath = relativeRecordPath(recordId, "artwork.webp");
      const pngPath = path.join(storage.dataDir, "records", recordId, "artwork.png");
      const record = {
        id: recordId,
        created_at: new Date().toISOString(),
        type,
        title: titleFromRequest(type, answers),
        answers,
        conversation_notes: conversationNotes,
        source_photo_path: safeSourcePhotoPath,
        recommended_artwork_size: recommendedArtworkSize,
        artwork_path: artworkPath,
        favorite: true,
        status: "running",
        diagnostics: null
      };

      job.status = "running";
      await storage.saveRecord(record);
      try {
        const prompt = config.prompts?.[type]
          ? buildArtworkPrompt({ type, answers, conversationNotes, config })
          : "";
        const result = await runRunnerWithRetry({
          stage: "artwork",
          prompt,
          record,
          outputPngPath: pngPath
        });
        await convertPngToWebp(result.pngPath, path.join(storage.dataDir, artworkPath), qualityFromConfig(config));
        record.status = "succeeded";
        record.diagnostics = result.diagnostics || null;
        job.status = "succeeded";
        job.diagnostics = record.diagnostics;
      } catch (error) {
        record.status = "failed";
        record.error = error.message;
        record.diagnostics = diagnosticsFromError(error);
        job.status = "failed";
        job.error = error.message;
        job.diagnostics = record.diagnostics;
      }

      await storage.saveRecord(record);
      return { job, record };
    });
  }

  async function createFusion({ recordId, sourcePhotoPath = "" }) {
    return runLocked("fusion_render", async () => {
      const record = await storage.getRecord(recordId);
      const safeSourcePhotoPath = normalizeSourcePhotoPath(sourcePhotoPath);
      const job = createJob("fusion_render", recordId);
      const fusionPath = relativeRecordPath(recordId, "fusion.webp");
      const pngPath = path.join(storage.dataDir, "records", recordId, "fusion.png");
      job.status = "running";
      record.status = "running";
      if (safeSourcePhotoPath) {
        record.source_photo_path = safeSourcePhotoPath;
      }
      await storage.saveRecord(record);

      try {
        const prompt = config.prompts?.fusion ? buildFusionPrompt({ record, config }) : "";
        const result = await runRunnerWithRetry({
          stage: "fusion_render",
          prompt,
          record,
          outputPngPath: pngPath
        });
        await convertPngToWebp(result.pngPath, path.join(storage.dataDir, fusionPath), qualityFromConfig(config));
        record.fusion_path = fusionPath;
        record.has_fusion = true;
        record.fusion_status = "succeeded";
        record.status = "succeeded";
        record.diagnostics = result.diagnostics || null;
        delete record.error;
        job.status = "succeeded";
        job.diagnostics = record.diagnostics;
      } catch (error) {
        record.status = record.artwork_path ? "succeeded" : "failed";
        record.fusion_status = "failed";
        record.error = error.message;
        record.diagnostics = diagnosticsFromError(error);
        job.status = "failed";
        job.error = error.message;
        job.diagnostics = record.diagnostics;
      }

      await storage.saveRecord(record);
      return { job, record };
    });
  }

  function getJob(id) {
    return jobs.get(id) || null;
  }

  return { createArtwork, createFusion, getJob };
}

module.exports = { createJobManager };

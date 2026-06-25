const express = require("express");
const multer = require("multer");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");
const sharp = require("sharp");
const { loadConfig, publicConfig, productionAvailable } = require("./config");
const { runCodexImageGeneration } = require("./codexRunner");
const { archiveSourcePhoto } = require("./imagePipeline");
const { createJobManager } = require("./jobs");
const { createStorage, resolveRecordAssetPath, validateRecordAssetPath, validateRecordId } = require("./storage");
const { userIdentityMiddleware } = require("./userIdentity");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function shouldUseDeterministicRunner() {
  return process.env.INKSPIRE_E2E === "1" && process.env.INKSPIRE_REAL_CODEX !== "1";
}

function configuredGeneratedImagesRoot(projectRoot, config) {
  const configuredRoot = config.app.runtime.generatedImagesRoot;
  if (!configuredRoot) {
    return undefined;
  }
  return path.isAbsolute(configuredRoot)
    ? configuredRoot
    : path.resolve(projectRoot, configuredRoot);
}

const PRODUCTION_SIZE_MULTIPLIERS = {
  small: 0.75,
  medium: 1,
  large: 1.5
};
const SOURCE_PHOTO_FILES = new Set(["source-photo.webp"]);
const ARTWORK_FILES = new Set(["artwork.webp"]);
const FUSION_FILES = new Set(["fusion.webp"]);

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

function productionSize(value) {
  return Object.hasOwn(PRODUCTION_SIZE_MULTIPLIERS, value) ? value : "medium";
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function uploadTooLarge(maxBytes) {
  const error = new Error(`Photo is too large. Max upload size is ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  error.status = 413;
  error.code = "photo_too_large";
  return error;
}

function sourcePhotoOwnerPath(dataDir, recordId) {
  return path.join(dataDir, "records", recordId, "source-photo-owner.json");
}

async function readSourcePhotoOwner(dataDir, recordId) {
  try {
    return JSON.parse(await fs.promises.readFile(sourcePhotoOwnerPath(dataDir, recordId), "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function assertSourcePhotoWritable({ storage, dataDir, recordId, userId }) {
  try {
    const record = await storage.getRecord(recordId);
    if (record.user_id && record.user_id !== userId) {
      throw badRequest("Invalid source photo path");
    }
  } catch (error) {
    if (!(error && error.code === "ENOENT")) {
      throw error;
    }
  }

  const owner = await readSourcePhotoOwner(dataDir, recordId);
  if (owner && owner.user_id !== userId) {
    throw badRequest("Invalid source photo path");
  }
}

async function saveSourcePhotoOwner(dataDir, recordId, userId) {
  await fs.promises.writeFile(
    sourcePhotoOwnerPath(dataDir, recordId),
    `${JSON.stringify({ user_id: userId, created_at: new Date().toISOString() }, null, 2)}\n`
  );
}

async function validateSourcePhotoPathForUser({ storage, dataDir, userId, sourcePhotoPath }) {
  if (!sourcePhotoPath) return "";
  let normalized;
  try {
    normalized = validateRecordAssetPath(sourcePhotoPath, SOURCE_PHOTO_FILES);
  } catch {
    throw badRequest("Invalid source photo path");
  }

  const recordId = normalized.split("/")[1];
  try {
    await storage.getRecordForUser(recordId, userId);
    return normalized;
  } catch (error) {
    if (!(error && error.status === 404)) {
      throw error;
    }
  }

  const owner = await readSourcePhotoOwner(dataDir, recordId);
  if (!owner || owner.user_id !== userId) {
    throw badRequest("Invalid source photo path");
  }
  return normalized;
}

function maxUploadBytes(config) {
  const maxInputSizeMb = Number(config.app?.image?.maxInputSizeMb || 10);
  return Math.max(1, maxInputSizeMb) * 1024 * 1024;
}

function createUploadMiddleware(dataDir, config) {
  return multer({
    dest: path.join(dataDir, "uploads"),
    limits: { fileSize: maxUploadBytes(config) },
    fileFilter: (req, file, callback) => {
      if (/^image\/(png|jpe?g|webp)$/i.test(file.mimetype || "")) {
        callback(null, true);
        return;
      }
      callback(badRequest("Unsupported image type"));
    }
  });
}

function inferArtworkSizeFromScene(metadata = {}) {
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (!width || !height) {
    return {
      preset_id: "medium",
      label: "中幅雅作",
      width_cm: 45,
      height_cm: 68,
      reason: "未检测到场景比例，先按常用中幅预填。"
    };
  }
  const ratio = width / height;
  if (ratio > 1.18) {
    return {
      preset_id: "landscape_scene",
      label: "横向点景",
      width_cm: 68,
      height_cm: 45,
      reason: "根据场景图比例推算，适合横向陈设。"
    };
  }
  if (ratio < 0.85) {
    return {
      preset_id: "portrait_scene",
      label: "竖向挂画",
      width_cm: 45,
      height_cm: 68,
      reason: "根据场景图比例推算，适合竖向挂画。"
    };
  }
  return {
    preset_id: "square_scene",
    label: "方形点景",
    width_cm: 50,
    height_cm: 50,
    reason: "根据场景图比例推算，适合作为方形点景作品。"
  };
}

function checkCommandAvailable(command) {
  return new Promise((resolve) => {
    if (!command) {
      resolve("missing");
      return;
    }
    let child;
    try {
      child = spawn(command, ["--version"], {
        shell: false,
        stdio: ["ignore", "ignore", "ignore"],
        windowsHide: true
      });
    } catch {
      resolve("missing");
      return;
    }
    const timeout = setTimeout(() => {
      child.kill();
      resolve("missing");
    }, 2000);
    child.on("error", () => {
      clearTimeout(timeout);
      resolve("missing");
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve(code === 0 ? "ready" : "missing");
    });
  });
}

async function checkDataDirWritable(dataDir) {
  const probePath = path.join(dataDir, `.health-${process.pid}-${Date.now()}`);
  try {
    await fs.promises.mkdir(dataDir, { recursive: true });
    await fs.promises.writeFile(probePath, "ok");
    await fs.promises.rm(probePath, { force: true });
    return "ready";
  } catch {
    return "blocked";
  }
}

async function checkWebpAvailable() {
  try {
    await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    }).webp({ quality: 82 }).toBuffer();
    return "ready";
  } catch {
    return "blocked";
  }
}

async function runDeterministicImageGeneration({ outputPngPath, stage }) {
  const png = new PNG({ width: 64, height: 96 });
  const seed = stage === "fusion_render" ? [124, 46, 40] : [38, 92, 73];
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const offset = (png.width * y + x) << 2;
      png.data[offset] = (seed[0] + x * 2) % 255;
      png.data[offset + 1] = (seed[1] + y) % 255;
      png.data[offset + 2] = (seed[2] + x + y) % 255;
      png.data[offset + 3] = 255;
    }
  }

  await fs.promises.mkdir(path.dirname(outputPngPath), { recursive: true });
  await fs.promises.writeFile(outputPngPath, PNG.sync.write(png));
  return { pngPath: outputPngPath, diagnostics: { reason: "deterministic_e2e_runner" } };
}

function createApp(options = {}) {
  const projectRoot = options.projectRoot || path.resolve(__dirname, "../..");
  const dataDir = options.dataDir || path.join(projectRoot, "data");
  const config = options.config || loadConfig(projectRoot);
  const storage = options.storage || createStorage(dataDir);
  const runner = options.runner || (shouldUseDeterministicRunner()
    ? runDeterministicImageGeneration
    : ((runnerOptions) => runCodexImageGeneration({
    ...runnerOptions,
    config,
    generatedImagesRoot: configuredGeneratedImagesRoot(projectRoot, config)
  })));
  const jobs = options.jobs || createJobManager({ config, storage, runner });
  const upload = createUploadMiddleware(dataDir, config);
  const app = express();
  const clientDist = path.join(projectRoot, "client", "dist");

  app.use(express.json({ limit: "1mb" }));
  app.use(userIdentityMiddleware);

  app.get("/api/health", asyncHandler(async (req, res) => {
    await storage.ensureStore();
    const runtime = options.healthChecks
      ? await options.healthChecks()
      : {
        codex: shouldUseDeterministicRunner() ? "ready" : await checkCommandAvailable(config.app.runtime.codexCommand),
        dataDirWritable: await checkDataDirWritable(dataDir),
        webp: await checkWebpAvailable()
      };
    res.json({
      ok: runtime.codex === "ready" && runtime.dataDirWritable === "ready" && runtime.webp === "ready",
      storage: "ready",
      config: "ready",
      runtime
    });
  }));

  app.get("/api/config/public", (req, res) => {
    res.json(publicConfig(config));
  });

  app.get("/api/library", asyncHandler(async (req, res) => {
    res.json({ records: await storage.listLibrary(req.userId) });
  }));

  app.get("/api/records/:id", asyncHandler(async (req, res) => {
    res.json(await storage.getRecordForUser(req.params.id, req.userId));
  }));

  app.get("/api/records/:id/images/:kind", asyncHandler(async (req, res) => {
    const record = await storage.getRecordForUser(req.params.id, req.userId);
    const field = req.params.kind === "fusion" ? "fusion_path"
      : req.params.kind === "source" || req.params.kind === "source-photo" ? "source_photo_path"
        : "artwork_path";
    if (!record[field]) {
      res.status(404).json({ error: "image not found" });
      return;
    }
    const allowedFiles = req.params.kind === "fusion" ? FUSION_FILES
      : req.params.kind === "source" || req.params.kind === "source-photo" ? SOURCE_PHOTO_FILES
        : ARTWORK_FILES;
    res.sendFile(resolveRecordAssetPath(dataDir, record[field], allowedFiles));
  }));

  app.post("/api/uploads/photo", upload.single("photo"), asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "photo is required" });
      return;
    }
    let responseBody;
    try {
      const recordId = req.body.recordId || `upload-${Date.now().toString(36)}`;
      validateRecordId(recordId);
      await assertSourcePhotoWritable({ storage, dataDir, recordId, userId: req.userId });
      const sourcePhotoPath = `records/${recordId}/source-photo.webp`;
      const outputPath = resolveRecordAssetPath(dataDir, sourcePhotoPath, SOURCE_PHOTO_FILES);
      let metadata;
      try {
        metadata = await sharp(req.file.path).metadata();
      } catch {
        throw badRequest("Invalid image");
      }
      const scene = {
        width: metadata.width || 0,
        height: metadata.height || 0,
        orientation: metadata.width && metadata.height
          ? metadata.width > metadata.height ? "landscape" : metadata.width < metadata.height ? "portrait" : "square"
          : "unknown"
      };
      try {
        await archiveSourcePhoto(req.file.path, outputPath, config.app.image.webpQuality);
      } catch {
        throw badRequest("Invalid image");
      }
      await saveSourcePhotoOwner(dataDir, recordId, req.userId);
      responseBody = {
        record_id: recordId,
        source_photo_path: sourcePhotoPath,
        scene,
        recommended_artwork_size: inferArtworkSizeFromScene(metadata)
      };
    } finally {
      await fs.promises.rm(req.file.path, { force: true });
    }
    res.status(201).json(responseBody);
  }));

  app.post("/api/generations", asyncHandler(async (req, res) => {
    const sourcePhotoPath = await validateSourcePhotoPathForUser({
      storage,
      dataDir,
      userId: req.userId,
      sourcePhotoPath: req.body.source_photo_path || ""
    });
    const result = await jobs.createArtwork({
      userId: req.userId,
      type: req.body.type,
      answers: req.body.answers || {},
      conversationNotes: req.body.conversationNotes || req.body.conversation_notes || "",
      sourcePhotoPath,
      recommendedArtworkSize: req.body.recommended_artwork_size || null
    });
    res.status(result.limitReached ? 429 : 201).json(result);
  }));

  app.post("/api/records/:id/fusion", asyncHandler(async (req, res) => {
    const sourcePhotoPath = await validateSourcePhotoPathForUser({
      storage,
      dataDir,
      userId: req.userId,
      sourcePhotoPath: req.body.source_photo_path || req.body.sourcePhotoPath || ""
    });
    const result = await jobs.createFusion({
      userId: req.userId,
      recordId: req.params.id,
      sourcePhotoPath
    });
    res.status(result.limitReached ? 429 : 201).json(result);
  }));

  app.post("/api/records/:id/regenerate", asyncHandler(async (req, res) => {
    const current = await storage.getRecordForUser(req.params.id, req.userId);
    const result = await jobs.createArtwork({
      userId: req.userId,
      type: current.type,
      answers: req.body.answers || current.answers || {},
      conversationNotes: req.body.conversationNotes || current.conversation_notes || ""
    });
    res.status(result.limitReached ? 429 : 201).json(result);
  }));

  app.get("/api/jobs/active", (req, res) => {
    res.json({ jobs: jobs.listActiveJobs(req.userId) });
  });

  app.get("/api/jobs/:id", (req, res) => {
    const job = jobs.getJob(req.params.id, req.userId);
    if (!job) {
      res.status(404).json({ error: "job not found" });
      return;
    }
    res.json(job);
  });

  app.post("/api/records/:id/favorite", asyncHandler(async (req, res) => {
    const record = await storage.getRecordForUser(req.params.id, req.userId);
    record.favorite = Boolean(req.body.favorite);
    await storage.saveRecord(record, req.userId);
    res.json(record);
  }));

  app.post("/api/records/:id/production-estimate", asyncHandler(async (req, res) => {
    await storage.getRecordForUser(req.params.id, req.userId);
    const expert = config.experts.find((entry) => entry.id === req.body.expertId) || config.experts[0];
    const size = productionSize(req.body.size);
    const multiplier = PRODUCTION_SIZE_MULTIPLIERS[size];
    const estimates = {};
    for (const service of expert.services || []) {
      estimates[service.id] = {
        amount: Math.round(service.priceEstimate.base * multiplier),
        currency: service.priceEstimate.currency,
        rule: service.priceEstimate.rule
      };
    }
    res.json({ expert_id: expert.id, size, estimates });
  }));

  app.post("/api/records/:id/production-orders", asyncHandler(async (req, res) => {
    if (!productionAvailable(config)) {
      res.status(409).json({
        error: "Production consultation is not available yet.",
        code: "production_unavailable"
      });
      return;
    }
    const record = await storage.getRecordForUser(req.params.id, req.userId);
    const expert = config.experts.find((entry) => entry.id === req.body.expertId) || config.experts[0];
    const service = (expert.services || []).find((entry) => entry.id === req.body.serviceId) || expert.services?.[0];
    const size = req.body.size || record.recommended_artwork_size || inferArtworkSizeFromScene();
    const referenceLevel = Math.max(1, Math.min(5, Number(req.body.referenceLevel || 3)));
    const order = {
      id: newId("order"),
      user_id: req.userId,
      created_at: new Date().toISOString(),
      record_id: record.id,
      expert_id: expert.id,
      service_id: service?.id || "",
      size,
      reference_level: referenceLevel,
      record_snapshot: {
        id: record.id,
        type: record.type,
        title: record.title || "",
        artwork_path: record.artwork_path || "",
        fusion_path: record.fusion_path || "",
        source_photo_path: record.source_photo_path || "",
        recommended_artwork_size: record.recommended_artwork_size || null
      }
    };
    await storage.saveProductionOrder(order, req.userId);
    res.status(201).json({ order });
  }));

  app.get("/api/production-orders/:id", asyncHandler(async (req, res) => {
    const order = await storage.getProductionOrder(req.params.id);
    if (order.user_id && order.user_id !== req.userId) {
      res.status(404).json({ error: "order not found" });
      return;
    }
    res.json({ order });
  }));

  if (fs.existsSync(path.join(clientDist, "index.html"))) {
    app.use(express.static(clientDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        next();
        return;
      }
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      const normalized = uploadTooLarge(maxUploadBytes(config));
      res.status(normalized.status).json({ error: normalized.message, code: normalized.code });
      return;
    }
    const status = error.status || (/not found|ENOENT/i.test(error.message) ? 404 : 500);
    res.status(status).json(error.code ? { error: error.message, code: error.code } : { error: error.message });
  });

  return app;
}

module.exports = { createApp };

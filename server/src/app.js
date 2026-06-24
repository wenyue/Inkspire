const express = require("express");
const multer = require("multer");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");
const sharp = require("sharp");
const { loadConfig, publicConfig } = require("./config");
const { runCodexImageGeneration } = require("./codexRunner");
const { archiveSourcePhoto } = require("./imagePipeline");
const { createJobManager } = require("./jobs");
const { createStorage } = require("./storage");

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

function productionSize(value) {
  return Object.hasOwn(PRODUCTION_SIZE_MULTIPLIERS, value) ? value : "medium";
}

function checkCommandAvailable(command) {
  return new Promise((resolve) => {
    if (!command) {
      resolve("missing");
      return;
    }
    const child = spawn(command, ["--version"], {
      shell: false,
      stdio: ["ignore", "ignore", "ignore"],
      windowsHide: true
    });
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
  const upload = multer({ dest: path.join(dataDir, "uploads") });
  const app = express();
  const clientDist = path.join(projectRoot, "client", "dist");

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", asyncHandler(async (req, res) => {
    await storage.ensureStore();
    const runtime = options.healthChecks
      ? await options.healthChecks()
      : {
        codex: await checkCommandAvailable(config.app.runtime.codexCommand),
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
    res.json({ records: await storage.listLibrary() });
  }));

  app.get("/api/records/:id", asyncHandler(async (req, res) => {
    res.json(await storage.getRecord(req.params.id));
  }));

  app.get("/api/records/:id/images/:kind", asyncHandler(async (req, res) => {
    const record = await storage.getRecord(req.params.id);
    const field = req.params.kind === "fusion" ? "fusion_path"
      : req.params.kind === "source" || req.params.kind === "source-photo" ? "source_photo_path"
        : "artwork_path";
    if (!record[field]) {
      res.status(404).json({ error: "image not found" });
      return;
    }
    res.sendFile(path.join(dataDir, record[field]));
  }));

  app.post("/api/uploads/photo", upload.single("photo"), asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "photo is required" });
      return;
    }
    const recordId = req.body.recordId || `upload-${Date.now().toString(36)}`;
    const outputPath = path.join(dataDir, "records", recordId, "source-photo.webp");
    await archiveSourcePhoto(req.file.path, outputPath, config.app.image.webpQuality);
    res.status(201).json({
      record_id: recordId,
      source_photo_path: path.relative(dataDir, outputPath).replace(/\\/g, "/")
    });
  }));

  app.post("/api/generations", asyncHandler(async (req, res) => {
    const result = await jobs.createArtwork({
      type: req.body.type,
      answers: req.body.answers || {},
      conversationNotes: req.body.conversationNotes || req.body.conversation_notes || "",
      sourcePhotoPath: req.body.source_photo_path || ""
    });
    res.status(result.busy ? 423 : 201).json(result);
  }));

  app.post("/api/records/:id/fusion", asyncHandler(async (req, res) => {
    const result = await jobs.createFusion({
      recordId: req.params.id,
      sourcePhotoPath: req.body.source_photo_path || req.body.sourcePhotoPath || ""
    });
    res.status(result.busy ? 423 : 201).json(result);
  }));

  app.post("/api/records/:id/regenerate", asyncHandler(async (req, res) => {
    const current = await storage.getRecord(req.params.id);
    const result = await jobs.createArtwork({
      type: current.type,
      answers: req.body.answers || current.answers || {},
      conversationNotes: req.body.conversationNotes || current.conversation_notes || ""
    });
    res.status(result.busy ? 423 : 201).json(result);
  }));

  app.get("/api/jobs/:id", (req, res) => {
    const job = jobs.getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: "job not found" });
      return;
    }
    res.json(job);
  });

  app.post("/api/records/:id/favorite", asyncHandler(async (req, res) => {
    const record = await storage.getRecord(req.params.id);
    record.favorite = Boolean(req.body.favorite);
    await storage.saveRecord(record);
    res.json(record);
  }));

  app.post("/api/records/:id/production-estimate", asyncHandler(async (req, res) => {
    await storage.getRecord(req.params.id);
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
    const status = /not found|ENOENT/i.test(error.message) ? 404 : 500;
    res.status(status).json({ error: error.message });
  });

  return app;
}

module.exports = { createApp };

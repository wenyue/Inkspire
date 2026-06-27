const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { convertPngToWebp } = require("./imagePipeline");
const { buildArtworkPrompt, buildFusionPrompt } = require("./prompts");
const { resolveRecordAssetPath, validateRecordAssetPath } = require("./storage");

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

const VALID_ORIGIN_TABS = new Set(["studio", "library", "experts"]);
const VALID_OPERATIONS = new Set(["create", "adjust"]);
const SOURCE_PHOTO_FILES = new Set(["source-photo.webp"]);

function diagnosticsFromError(error) {
  return error?.diagnostics || { reason: "runner_error" };
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

async function copySourcePhotoForRecord(storage, recordId, sourcePhotoPath = "") {
  if (!sourcePhotoPath) {
    return "";
  }
  const normalizedSourcePath = validateRecordAssetPath(sourcePhotoPath, SOURCE_PHOTO_FILES);
  const ownedSourcePath = relativeRecordPath(recordId, "source-photo.webp");
  if (normalizedSourcePath === ownedSourcePath) {
    return ownedSourcePath;
  }
  const sourcePath = resolveRecordAssetPath(storage.dataDir, normalizedSourcePath, SOURCE_PHOTO_FILES);
  const destinationPath = resolveRecordAssetPath(storage.dataDir, ownedSourcePath, SOURCE_PHOTO_FILES);
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
  return ownedSourcePath;
}

function requireEnvironmentImage(record, sourcePhotoPath = "") {
  const nextSourcePhotoPath = sourcePhotoPath || record.source_photo_path || "";
  if (!nextSourcePhotoPath) {
    throw badRequest("Environment image is required");
  }
  return nextSourcePhotoPath;
}

function createJobManager({ config, storage, runner }) {
  const jobs = new Map();
  const queuedJobs = [];
  const waiters = [];
  const activeCounts = new Map();
  const runningCounts = new Map();
  let runningCount = 0;
  let legacyLocked = false;
  let schedulePending = false;
  let saveChain = Promise.resolve();
  let pendingSaves = 0;

  function normalizeUserId(userId = "") {
    return typeof userId === "string" ? userId : "";
  }

  function normalizeOriginTab(originTab = "studio") {
    return VALID_ORIGIN_TABS.has(originTab) ? originTab : "studio";
  }

  function normalizeOperation(operation = "create") {
    return VALID_OPERATIONS.has(operation) ? operation : "create";
  }

  function tabKey(userId, originTab) {
    return `${normalizeUserId(userId)}:${normalizeOriginTab(originTab)}`;
  }

  function cloneJob(job) {
    if (!job) return null;
    return {
      ...job,
      diagnostics: job.diagnostics && typeof job.diagnostics === "object" ? { ...job.diagnostics } : job.diagnostics
    };
  }

  function cloneRecord(record) {
    if (!record) return null;
    return {
      ...record,
      answers: record.answers && typeof record.answers === "object" ? { ...record.answers } : record.answers,
      recommended_artwork_size: record.recommended_artwork_size && typeof record.recommended_artwork_size === "object"
        ? { ...record.recommended_artwork_size }
        : record.recommended_artwork_size,
      diagnostics: record.diagnostics && typeof record.diagnostics === "object" ? { ...record.diagnostics } : record.diagnostics
    };
  }

  function countJobs(userId, predicate) {
    const ownerId = normalizeUserId(userId);
    let total = 0;
    for (const job of jobs.values()) {
      if ((ownerId ? job.user_id === ownerId : !job.user_id) && predicate(job)) {
        total += 1;
      }
    }
    return total;
  }

  function countActiveJobsForTab(userId, originTab) {
    const ownerId = normalizeUserId(userId);
    const tab = normalizeOriginTab(originTab);
    return Math.max(
      countJobs(ownerId, (job) => job.origin_tab === tab && (job.status === "queued" || job.status === "running")),
      activeCounts.get(tabKey(ownerId, tab)) || 0
    );
  }

  function countRunningJobs(userId) {
    return countJobs(userId, (job) => job.status === "running");
  }

  function listActiveJobs(userId) {
    const ownerId = normalizeUserId(userId);
    return Array.from(jobs.values())
      .filter((job) => (ownerId ? job.user_id === ownerId : !job.user_id) && (job.status === "queued" || job.status === "running"))
      .map(cloneJob);
  }

  function listActiveJobsForTab(userId, originTab) {
    const ownerId = normalizeUserId(userId);
    const tab = normalizeOriginTab(originTab);
    return Array.from(jobs.values())
      .filter((job) => (
        (ownerId ? job.user_id === ownerId : !job.user_id)
        && job.origin_tab === tab
        && (job.status === "queued" || job.status === "running")
      ))
      .map(cloneJob);
  }

  function getJob(id, userId = "") {
    const job = jobs.get(id);
    if (!job) return null;
    const ownerId = normalizeUserId(userId);
    if (ownerId && job.user_id !== ownerId) {
      return null;
    }
    return cloneJob(job);
  }

  function addWaiter(predicate) {
    try {
      if (predicate()) {
        return Promise.resolve();
      }
    } catch (error) {
      return Promise.reject(error);
    }
    return new Promise((resolve) => {
      waiters.push({ predicate, resolve });
    });
  }

  function flushWaiters() {
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      let ready = false;
      try {
        ready = waiters[index].predicate();
      } catch (error) {
        ready = false;
      }
      if (ready) {
        const [waiter] = waiters.splice(index, 1);
        waiter.resolve();
      }
    }
  }

  function scheduleQueue() {
    if (schedulePending) return;
    schedulePending = true;
    setTimeout(() => {
      schedulePending = false;
      void processQueue();
    }, 0);
  }

  function reserveActiveSlot(userId, originTab) {
    const ownerId = normalizeUserId(userId);
    const tab = normalizeOriginTab(originTab);
    const activeJobs = countActiveJobsForTab(ownerId, tab);
    if (activeJobs >= 1) {
      return {
        limitReached: true,
        activeJobs: listActiveJobsForTab(ownerId, tab),
        originTab: tab
      };
    }
    activeCounts.set(tabKey(ownerId, tab), activeJobs + 1);
    return { limitReached: false, ownerId, originTab: tab };
  }

  function releaseActiveSlot(userId, originTab) {
    const ownerId = normalizeUserId(userId);
    const key = tabKey(ownerId, originTab);
    const next = (activeCounts.get(key) || 0) - 1;
    if (next > 0) {
      activeCounts.set(key, next);
    } else {
      activeCounts.delete(key);
    }
  }

  function incrementRunningSlot(userId) {
    const ownerId = normalizeUserId(userId);
    const next = (runningCounts.get(ownerId) || 0) + 1;
    runningCounts.set(ownerId, next);
    runningCount += 1;
  }

  function releaseRunningSlot(userId) {
    const ownerId = normalizeUserId(userId);
    const next = (runningCounts.get(ownerId) || 0) - 1;
    if (next > 0) {
      runningCounts.set(ownerId, next);
    } else {
      runningCounts.delete(ownerId);
    }
    runningCount -= 1;
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

  function createLegacyJob(stage, recordId = "", fields = {}) {
    const createdAt = new Date().toISOString();
    const originTab = normalizeOriginTab(fields.originTab);
    const operation = normalizeOperation(fields.operation);
    const job = {
      id: newId("job"),
      user_id: "",
      recordId,
      stage,
      type: fields.type || "",
      title: fields.title || "",
      origin_tab: originTab,
      operation,
      status: "queued",
      created_at: createdAt,
      started_at: null,
      completed_at: null,
      error: "",
      diagnostics: null
    };
    jobs.set(job.id, job);
    return job;
  }

  function legacyBusyJob(stage) {
    const job = createLegacyJob(stage);
    job.status = "failed";
    job.error = "generation busy";
    job.completed_at = new Date().toISOString();
    return { busy: true, job: cloneJob(job) };
  }

  async function runLegacyLocked(stage, fn) {
    if (legacyLocked || runningCount >= 6) return legacyBusyJob(stage);
    legacyLocked = true;
    incrementRunningSlot("");
    try {
      return await fn();
    } finally {
      releaseRunningSlot("");
      legacyLocked = false;
      flushWaiters();
      scheduleQueue();
    }
  }

  function saveRecordSerial(record, userId = "") {
    pendingSaves += 1;
    const next = saveChain.then(() => storage.saveRecord(record, userId));
    saveChain = next.catch(() => {});
    return next.finally(() => {
      pendingSaves -= 1;
    });
  }

  async function runImmediateArtwork({
    userId = "",
    type,
    answers = {},
    conversationNotes = "",
    sourcePhotoPath = "",
    recommendedArtworkSize = null
  }) {
    const ownerId = normalizeUserId(userId);
    return runLegacyLocked("artwork", async () => {
      const recordId = newId("record");
      const artworkPath = relativeRecordPath(recordId, "artwork.webp");
      const pngPath = path.join(storage.dataDir, "records", recordId, "artwork.png");
      const createdAt = new Date().toISOString();
      const title = titleFromRequest(type, answers);
      const ownedSourcePhotoPath = await copySourcePhotoForRecord(storage, recordId, sourcePhotoPath);
      const job = createLegacyJob("artwork", recordId, { type, title });
      const record = {
        id: recordId,
        user_id: ownerId,
        created_at: createdAt,
        type,
        title,
        answers,
        conversation_notes: conversationNotes,
        source_photo_path: ownedSourcePhotoPath,
        recommended_artwork_size: recommendedArtworkSize,
        artwork_path: artworkPath,
        favorite: true,
        status: "running",
        diagnostics: null
      };

      job.status = "running";
      job.started_at = new Date().toISOString();
      await saveRecordSerial(record, ownerId);
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
        delete record.error;
        job.status = "succeeded";
        job.diagnostics = record.diagnostics;
      } catch (error) {
        record.status = "failed";
        record.error = error.message;
        record.diagnostics = diagnosticsFromError(error);
        job.status = "failed";
        job.error = error.message;
        job.diagnostics = record.diagnostics;
      } finally {
        job.completed_at = new Date().toISOString();
      }

      await saveRecordSerial(record, ownerId);
      return { job: cloneJob(job), record: cloneRecord(record) };
    });
  }

  async function runImmediateFusion({ userId = "", recordId, sourcePhotoPath = "" }) {
    const ownerId = normalizeUserId(userId);
    return runLegacyLocked("fusion_render", async () => {
      const getRecord = typeof storage.getRecordForUser === "function"
        ? storage.getRecordForUser.bind(storage)
        : storage.getRecord.bind(storage);
      const record = await getRecord(recordId, ownerId);
      const requestedSourcePhotoPath = requireEnvironmentImage(record, sourcePhotoPath);
      const ownedSourcePhotoPath = await copySourcePhotoForRecord(storage, recordId, requestedSourcePhotoPath);
      const fusionPath = relativeRecordPath(recordId, "fusion.webp");
      const pngPath = path.join(storage.dataDir, "records", recordId, "fusion.png");
      const job = createLegacyJob("fusion_render", recordId, {
        type: record.type,
        title: record.title || titleFromRequest(record.type, record.answers || {})
      });

      job.status = "running";
      job.started_at = new Date().toISOString();
      record.status = "running";
      record.source_photo_path = ownedSourcePhotoPath;
      await saveRecordSerial(record, ownerId);

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
      } finally {
        job.completed_at = new Date().toISOString();
      }

      await saveRecordSerial(record, ownerId);
      return { job: cloneJob(job), record: cloneRecord(record) };
    });
  }

  async function processQueue() {
    while (runningCount < 6 && queuedJobs.length > 0) {
      const task = queuedJobs.shift();
      if (!task) break;
      void startTask(task);
    }
    flushWaiters();
  }

  async function startTask(task) {
    incrementRunningSlot(task.userId);
    task.job.status = "running";
    task.job.started_at = new Date().toISOString();
    task.record.status = "running";
    let finalJobStatus = "succeeded";
    let finalJobError = "";
    if (task.stage === "fusion_render" && task.sourcePhotoPath) {
      task.record.source_photo_path = task.sourcePhotoPath;
    }

    try {
      await saveRecordSerial(task.record, task.userId);
      flushWaiters();

      const prompt = task.stage === "artwork"
        ? (config.prompts?.[task.type]
          ? buildArtworkPrompt({
            type: task.type,
            answers: task.answers,
            conversationNotes: task.conversationNotes,
            config
          })
          : "")
        : (config.prompts?.fusion ? buildFusionPrompt({ record: task.record, config }) : "");

      const result = await runRunnerWithRetry({
        stage: task.stage,
        prompt,
        record: task.record,
        outputPngPath: task.outputPngPath
      });

      await convertPngToWebp(
        result.pngPath,
        path.join(storage.dataDir, task.outputWebpPath),
        qualityFromConfig(config)
      );

      task.record.status = "succeeded";
      task.record.diagnostics = result.diagnostics || null;
      delete task.record.error;

      if (task.stage === "fusion_render") {
        task.record.fusion_path = task.outputWebpPath;
        task.record.has_fusion = true;
        task.record.fusion_status = "succeeded";
      }
    } catch (error) {
      task.record.diagnostics = diagnosticsFromError(error);
      finalJobStatus = "failed";
      finalJobError = error.message;

      if (task.stage === "artwork") {
        task.record.status = "failed";
        task.record.error = error.message;
      } else {
        task.record.status = task.record.artwork_path ? "succeeded" : "failed";
        task.record.fusion_status = "failed";
        task.record.error = error.message;
      }
    } finally {
      try {
        await saveRecordSerial(task.record, task.userId);
      } catch (error) {
        // Persisting the final state is best effort; the in-memory state remains updated.
      }
      task.job.status = finalJobStatus;
      task.job.error = finalJobError;
      task.job.diagnostics = task.record.diagnostics;
      task.job.completed_at = new Date().toISOString();
      releaseRunningSlot(task.userId);
      releaseActiveSlot(task.userId, task.originTab);
      flushWaiters();
      scheduleQueue();
    }
  }

  async function createArtwork({
    userId = "",
    type,
    answers = {},
    conversationNotes = "",
    sourcePhotoPath = "",
    recommendedArtworkSize = null,
    originTab = "studio",
    operation = "create"
  }) {
    const ownerId = normalizeUserId(userId);
    const normalizedOriginTab = normalizeOriginTab(originTab);
    const normalizedOperation = normalizeOperation(operation);
    if (!ownerId) {
      return runImmediateArtwork({
        userId: ownerId,
        type,
        answers,
        conversationNotes,
        sourcePhotoPath,
        recommendedArtworkSize
      });
    }
    const reservation = reserveActiveSlot(ownerId, normalizedOriginTab);
    if (reservation.limitReached) {
      return {
        limitReached: true,
        code: "tab_generation_limit_reached",
        origin_tab: reservation.originTab,
        activeJobs: reservation.activeJobs
      };
    }

    const recordId = newId("record");
    const createdAt = new Date().toISOString();
    const artworkPath = relativeRecordPath(recordId, "artwork.webp");
    let ownedSourcePhotoPath;
    try {
      ownedSourcePhotoPath = await copySourcePhotoForRecord(storage, recordId, sourcePhotoPath);
    } catch (error) {
      releaseActiveSlot(ownerId, normalizedOriginTab);
      throw error;
    }
    const pngPath = path.join(storage.dataDir, "records", recordId, "artwork.png");
    const record = {
      id: recordId,
      user_id: ownerId,
      created_at: createdAt,
      type,
      title: titleFromRequest(type, answers),
      answers,
      conversation_notes: conversationNotes,
      source_photo_path: ownedSourcePhotoPath,
      recommended_artwork_size: recommendedArtworkSize,
      artwork_path: artworkPath,
      favorite: true,
      status: "queued",
      diagnostics: null
    };
    const job = {
      id: newId("job"),
      user_id: ownerId,
      recordId,
      stage: "artwork",
      type,
      title: record.title,
      origin_tab: normalizedOriginTab,
      operation: normalizedOperation,
      status: "queued",
      created_at: createdAt,
      started_at: null,
      completed_at: null,
      error: "",
      diagnostics: null
    };
    jobs.set(job.id, job);

    try {
      await saveRecordSerial(record, ownerId);
      queuedJobs.push({
        userId: ownerId,
        stage: "artwork",
        type,
        title: record.title,
        answers,
        conversationNotes,
        sourcePhotoPath: ownedSourcePhotoPath,
        originTab: normalizedOriginTab,
        operation: normalizedOperation,
        record,
        job,
        outputPngPath: pngPath,
        outputWebpPath: artworkPath
      });
      scheduleQueue();
      flushWaiters();
      return { job: cloneJob(job), record: cloneRecord(record) };
    } catch (error) {
      jobs.delete(job.id);
      releaseActiveSlot(ownerId, normalizedOriginTab);
      throw error;
    }
  }

  async function createFusion({ userId = "", recordId, sourcePhotoPath = "", originTab = "studio", operation = "create" }) {
    const ownerId = normalizeUserId(userId);
    const normalizedOriginTab = normalizeOriginTab(originTab);
    const normalizedOperation = normalizeOperation(operation);
    if (!ownerId) {
      return runImmediateFusion({ userId: ownerId, recordId, sourcePhotoPath });
    }
    const reservation = reserveActiveSlot(ownerId, normalizedOriginTab);
    if (reservation.limitReached) {
      return {
        limitReached: true,
        code: "tab_generation_limit_reached",
        origin_tab: reservation.originTab,
        activeJobs: reservation.activeJobs
      };
    }

    let job;
    try {
      const getRecord = typeof storage.getRecordForUser === "function"
        ? storage.getRecordForUser.bind(storage)
        : storage.getRecord.bind(storage);
      const record = await getRecord(recordId, ownerId);
      const requestedSourcePhotoPath = requireEnvironmentImage(record, sourcePhotoPath);
      const ownedSourcePhotoPath = await copySourcePhotoForRecord(storage, recordId, requestedSourcePhotoPath);
      const createdAt = new Date().toISOString();
      const fusionPath = relativeRecordPath(recordId, "fusion.webp");
      const pngPath = path.join(storage.dataDir, "records", recordId, "fusion.png");
      job = {
        id: newId("job"),
        user_id: ownerId,
        recordId,
        stage: "fusion_render",
        type: record.type,
        title: record.title || titleFromRequest(record.type, record.answers || {}),
        origin_tab: normalizedOriginTab,
        operation: normalizedOperation,
        status: "queued",
        created_at: createdAt,
        started_at: null,
        completed_at: null,
        error: "",
        diagnostics: null
      };
      jobs.set(job.id, job);

      record.status = "queued";
      record.source_photo_path = ownedSourcePhotoPath;
      await saveRecordSerial(record, ownerId);

      queuedJobs.push({
        userId: ownerId,
        stage: "fusion_render",
        type: record.type,
        title: job.title,
        record,
        job,
        sourcePhotoPath: ownedSourcePhotoPath,
        originTab: normalizedOriginTab,
        operation: normalizedOperation,
        outputPngPath: pngPath,
        outputWebpPath: fusionPath
      });
      scheduleQueue();
      flushWaiters();
      return { job: cloneJob(job), record: cloneRecord(record) };
    } catch (error) {
      if (job) {
        jobs.delete(job.id);
      }
      releaseActiveSlot(ownerId, normalizedOriginTab);
      throw error;
    }
  }

  function waitForIdle() {
    return addWaiter(() => runningCount === 0 && queuedJobs.length === 0 && pendingSaves === 0);
  }

  function waitForJobStart(id) {
    return addWaiter(() => Boolean(jobs.get(id)?.started_at));
  }

  function waitForRunningCount(userId, count) {
    return addWaiter(() => countRunningJobs(userId) === count);
  }

  return {
    createArtwork,
    createFusion,
    getJob,
    listActiveJobs,
    waitForIdle,
    waitForJobStart,
    waitForRunningCount
  };
}

module.exports = { createJobManager };

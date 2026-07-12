const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const sharp = require("sharp");
const { resolveArtworkCanvasTuple } = require("./artworkFormat");
const {
  assessCalligraphyVerification,
  buildCalligraphyVerificationPrompt,
  calligraphyTextUnverified
} = require("./calligraphyVerification");
const { convertPngToWebp } = require("./imagePipeline");
const { buildArtworkPrompt, buildFusionPrompt, buildSizeEstimationPrompt } = require("./prompts");
const {
  estimateFromEnvironment,
  normalizeGenerationComplexity,
  normalizeArtworkSizeCandidate,
  resolveOrientation,
  sizeFromComplexityAndAspectRatio,
  stampGeneratedArtworkSize
} = require("./sizeEstimation");
const { resolveRecordAssetPath, validateRecordAssetPath } = require("./storage");

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

function qualityFromConfig(config) {
  return config.app?.image?.webpQuality || config.image?.webpQuality || 82;
}

function classicArtworkUnavailable() {
  const error = new Error("classic artwork reference unavailable");
  error.diagnostics = { reason: "classic_reference_unavailable" };
  return error;
}

async function classicArtworkReferenceImages(config, answers = {}) {
  if (answers.creation_mode !== "classic_reference") {
    return undefined;
  }
  if (typeof answers.classic_artwork_id !== "string" || !answers.classic_artwork_id.trim()) {
    throw classicArtworkUnavailable();
  }
  const artwork = (config.classicArtworks || []).find((entry) => entry?.id === answers.classic_artwork_id);
  const publicUrl = artwork?.image;
  if (typeof publicUrl !== "string"
    || !publicUrl.startsWith("/classic-artworks/")
    || publicUrl.includes("%")
    || publicUrl.includes("\\")
    || publicUrl.includes("?")
    || publicUrl.includes("#")) {
    throw classicArtworkUnavailable();
  }

  const relativePath = publicUrl.slice("/classic-artworks/".length);
  const segments = relativePath.split("/");
  if (!relativePath || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw classicArtworkUnavailable();
  }

  if (typeof config._projectRoot !== "string" || !path.isAbsolute(config._projectRoot)) {
    throw classicArtworkUnavailable();
  }
  const classicArtworkRoot = path.resolve(config._projectRoot, "client", "public", "classic-artworks");
  const artworkPath = path.resolve(classicArtworkRoot, ...segments);
  const lexicalRelativePath = path.relative(classicArtworkRoot, artworkPath);
  if (!lexicalRelativePath
    || lexicalRelativePath.startsWith(`..${path.sep}`)
    || path.isAbsolute(lexicalRelativePath)) {
    throw classicArtworkUnavailable();
  }

  try {
    const [canonicalRoot, canonicalArtworkPath, candidateStats] = await Promise.all([
      fs.realpath(classicArtworkRoot),
      fs.realpath(artworkPath),
      fs.lstat(artworkPath)
    ]);
    const canonicalRelativePath = path.relative(canonicalRoot, canonicalArtworkPath);
    if (!canonicalRelativePath
      || canonicalRelativePath.startsWith(`..${path.sep}`)
      || path.isAbsolute(canonicalRelativePath)
      || candidateStats.isSymbolicLink()) {
      throw classicArtworkUnavailable();
    }
    const stats = await fs.stat(canonicalArtworkPath);
    if (!stats.isFile()) throw classicArtworkUnavailable();
    return { classicArtwork: canonicalArtworkPath };
  } catch {
    throw classicArtworkUnavailable();
  }
}

const DEFAULT_DECIDE_VALUES = new Set(["由墨起决定", "由墨起決定", "Let Inkspire decide"]);

const PAINTING_TITLE_POOLS = {
  "山水": [
    "云岫清音", "溪山入梦", "烟雨归岚", "松风远壑",
    "寒江初霁", "碧峰听泉", "层峦抱月", "秋壑含烟",
    "远岫生云", "石径松声", "澄江晚照", "空山新雨",
    "苍崖观瀑", "云水归心", "雪岭晴岚", "山居听雨",
    "溪桥晓色", "林泉清响", "烟岚叠翠", "孤峰入画",
    "晴川远黛", "暮山含紫", "松壑流泉", "云峰问道",
    "青嶂浮岚", "江天一色", "月照寒潭", "翠谷鸣泉",
    "千峰积翠", "平湖落照", "风过层林", "云开见岳",
    "幽涧听松", "石壁藏云", "长溪映月", "雁过寒山",
    "山雨欲来", "江岸归舟", "晨岚初起", "水墨千岩",
    "碧水遥岑", "古寺钟声", "高岭浮云", "野渡横舟",
    "霜林晚晴", "春山可望", "夏木成荫", "秋水无尘",
    "冬岭凝辉", "远山如黛", "云深不知", "松月清辉",
    "岩泉夜语", "翠岫流光", "江村烟树", "湖山清远",
    "万壑松风", "一溪云影", "峰回水转", "林壑幽居",
    "暮霭归山", "晓云出岫", "青山入怀", "清溪照影"
  ],
  "花鸟": [
    "花影和鸣", "春枝含韵", "疏香栖羽", "晴芳入画",
    "梅边听雪", "兰风拂袖", "竹影栖禽", "菊露凝香",
    "荷香映月", "桃溪春晓", "杏雨轻飞", "梨云带露",
    "海棠眠雨", "芙蓉照水", "桂影流金", "芍药含烟",
    "牡丹初醒", "紫藤垂韵", "鸢尾迎风", "山茶映雪",
    "玉兰清晓", "芭蕉听雨", "石榴含丹", "木槿朝华",
    "凌霄向日", "蔷薇小院", "茉莉晚香", "水仙临镜",
    "瑞草呈祥", "翠羽停枝", "双燕裁春", "白鹭窥荷",
    "黄鹂报晓", "喜鹊登梅", "鸳鸯戏水", "鹭影横塘",
    "雀语花间", "雁影秋枝", "鹤影松阴", "鹰扬秋空",
    "锦鸡披彩", "孔雀开屏", "蝶过春丛", "蜂来小径",
    "红叶栖禽", "绿萼含香", "新篁啼鸟", "老梅横枝",
    "池荷映禽", "石上兰芽", "晴窗花信", "雨后芳菲",
    "月下疏香", "风前翠羽", "繁花照影", "一枝春信",
    "幽兰吐秀", "芳林晓霁", "露重花醒", "香径听莺",
    "碧叶藏声", "春水照禽", "秋英含露", "寒梅报春"
  ],
  "走兽游鱼": [
    "林泉生趣", "游鳞动影", "松风瑞兽", "溪石闲禽",
    "晴波鱼跃", "山径兽踪", "水草清游", "岩畔灵姿",
    "浅渚听风", "古木栖踪", "云林瑞影", "清溪逐浪",
    "寒塘游影", "石上凝神", "野趣入画", "一跃清波"
  ],
  "文房雅物": [
    "清供入画", "瓶花静赏", "案上清风", "古器生香",
    "砚边春色", "素几含香", "雅物清陈", "闲斋静供",
    "炉烟入卷", "花石相宜", "书卷生辉", "一案清赏",
    "瓶中春信", "古意盈案", "茶烟墨色", "清玩成章"
  ],
  "人物": [
    "高士临风", "古意风骨", "清谈入画", "松下逸思",
    "琴心远韵", "对月吟怀", "竹下清坐", "溪边问道",
    "倚杖观云", "临水照影", "执卷听风", "煮茶候月",
    "山窗读易", "石几挥毫", "松阴听琴", "云亭闲话",
    "策杖寻幽", "踏雪访梅", "泛舟听雨", "抱琴归山",
    "拈花微笑", "观瀑忘机", "采芝入谷", "闲庭步月",
    "秋窗展卷", "春台对弈", "夏榻纳凉", "冬炉论画",
    "素衣清赏", "青衫远眺", "红袖添香", "白发谈玄",
    "童子问松", "渔父归舟", "樵客听泉", "书生策马",
    "隐者眠云", "诗客寻芳", "雅士观荷", "行者过桥",
    "禅心坐石", "酒意看山", "笛声入暮", "箫韵随风",
    "衣袂含烟", "眉目如水", "清姿照影", "逸气横生",
    "临风怀远", "凭栏望月", "折梅寄意", "披云访友",
    "墨客归来", "画者凝神", "茶客忘言", "棋客落子",
    "幽人独坐", "闲僧听雨", "少年踏歌", "佳人采莲",
    "客从云外", "人在画中", "风骨清奇", "心远地偏"
  ],
  default: [
    "墨韵清居", "晴窗入画", "素卷含章", "清境生香",
    "心画初成", "雅意成章", "一室生辉", "纸上清风",
    "墨色流光", "云章初展", "静境含光", "清供入怀",
    "素心映象", "雅韵初开", "方寸见境", "逸笔成趣",
    "空灵有象", "意象生辉", "澄怀观道", "静水流深",
    "清辉满壁", "墨境微澜", "幽光入室", "新意含真",
    "一卷清气", "笔底春秋", "画里乾坤", "心象成景",
    "淡墨生烟", "轻岚入卷", "光影和鸣", "雅室添韵",
    "清赏无尘", "素壁生华", "诗意栖居", "墨香盈室",
    "闲窗有梦", "静案生春", "清音入画", "余韵悠然",
    "玄远清和", "温润成境", "明净含章", "逸境初成",
    "一念成画", "万象归心", "澄明之境", "清雅有光",
    "素雅成章", "轻烟入墨", "风物含情", "画意初晴",
    "墨里见山", "心中有境", "静里生光", "雅集成图",
    "浮光入卷", "远意成诗", "灵境初开", "清梦入纸",
    "澹然成趣", "和气致祥", "嘉景新成", "墨起新篇"
  ]
};

function meaningfulAnswer(value) {
  return typeof value === "string" && value.trim() && !DEFAULT_DECIDE_VALUES.has(value.trim())
    ? value.trim()
    : "";
}

function stableIndex(parts, count) {
  if (count <= 0) return 0;
  const source = parts.filter(Boolean).join("|") || "inkspire";
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(31, hash) + source.charCodeAt(index);
  }
  return Math.abs(hash) % count;
}

function paintingTitleFromAnswers(answers = {}) {
  return paintingTitleCandidatesFromAnswers(answers)[0];
}

function paintingTitleCandidatesFromAnswers(answers = {}) {
  const subject = meaningfulAnswer(answers.painting_subject);
  const mood = meaningfulAnswer(answers.painting_mood);
  const palette = meaningfulAnswer(answers.painting_palette);
  const brushwork = meaningfulAnswer(answers.painting_brushwork);
  const format = meaningfulAnswer(answers.painting_format || answers.painting_composition);
  const pool = PAINTING_TITLE_POOLS[subject] || PAINTING_TITLE_POOLS.default;
  const start = stableIndex([subject, mood, palette, brushwork, format], pool.length);
  return pool.slice(start).concat(pool.slice(0, start));
}

function chineseInteger(value) {
  if (!Number.isInteger(value) || value <= 0 || value > 9999) {
    throw new RangeError("Chinese title ordinal must be an integer from 1 to 9999");
  }
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const units = ["", "十", "百", "千"];
  let result = "";
  let pendingZero = false;
  for (let position = 3; position >= 0; position -= 1) {
    const unitValue = 10 ** position;
    const digit = Math.floor(value / unitValue) % 10;
    if (digit === 0) {
      if (result && value % unitValue !== 0) pendingZero = true;
      continue;
    }
    if (pendingZero) {
      result += digits[0];
      pendingZero = false;
    }
    if (!(digit === 1 && position === 1 && !result)) result += digits[digit];
    result += units[position];
  }
  return result;
}

function titleAvailableInCollection(baseTitle, usedTitles) {
  if (!usedTitles.has(baseTitle)) return baseTitle;
  for (let ordinal = 1; ordinal <= 9999; ordinal += 1) {
    const candidate = `${baseTitle} 其${chineseInteger(ordinal)}`;
    if (!usedTitles.has(candidate)) return candidate;
  }
  throw new Error("Artwork title ordinal limit reached");
}

function titleFromRequest(type, answers = {}) {
  if (type === "calligraphy" && answers.text) return answers.text;
  if (type === "painting") return paintingTitleFromAnswers(answers);
  return type === "calligraphy" ? "书法作品" : "中国画作品";
}

function relativeRecordPath(recordId, fileName) {
  return path.join("records", recordId, fileName).replace(/\\/g, "/");
}

const VALID_ORIGIN_TABS = new Set(["studio", "library", "experts"]);
const VALID_OPERATIONS = new Set(["create", "adjust"]);
const SOURCE_PHOTO_FILES = new Set(["source-photo.webp"]);
const ARTWORK_FILES = new Set(["artwork.webp"]);
const MAX_ARTWORK_ASPECT_RELATIVE_ERROR = 0.02;

function diagnosticsFromError(error) {
  return error?.diagnostics || { reason: "runner_error" };
}

function artworkAspectMismatch(expectedRatio, actualRatio) {
  const error = new Error("artwork aspect mismatch");
  error.diagnostics = {
    reason: "artwork_aspect_mismatch",
    expected_ratio: Number(expectedRatio.toFixed(4)),
    actual_ratio: Number(actualRatio.toFixed(4))
  };
  return error;
}

async function validateArtworkPngAspect(result, targetCanvas) {
  const expectedRatio = Number(targetCanvas?.width) / Number(targetCanvas?.height);
  const metadata = await sharp(result.pngPath).metadata();
  const width = Number(metadata.width);
  const height = Number(metadata.height);
  const actualRatio = width / height;
  const relativeError = Math.abs(actualRatio - expectedRatio) / expectedRatio;
  if (!Number.isFinite(actualRatio)
    || !Number.isFinite(expectedRatio)
    || expectedRatio <= 0
    || relativeError > MAX_ARTWORK_ASPECT_RELATIVE_ERROR) {
    throw artworkAspectMismatch(expectedRatio, actualRatio);
  }
  return { width, height, aspectRatio: actualRatio };
}

function elapsedMs(startedAt) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function createGenerationProfile() {
  return {
    created_at: new Date().toISOString(),
    total_ms: 0,
    stages: {},
    attempts: []
  };
}

function cloneProfile(profile) {
  return profile && typeof profile === "object" ? JSON.parse(JSON.stringify(profile)) : profile;
}

function addProfileStage(profile, stage, durationMs) {
  if (!profile || !stage) return;
  const current = profile.stages[stage] || { total_ms: 0, count: 0 };
  profile.stages[stage] = {
    total_ms: current.total_ms + Math.max(0, Math.round(durationMs)),
    count: current.count + 1
  };
}

async function measureProfileStage(profile, stage, fn) {
  const startedAt = performance.now();
  try {
    return await fn();
  } finally {
    addProfileStage(profile, stage, elapsedMs(startedAt));
  }
}

async function recordRunnerAttempt(profile, stage, attempt, fn) {
  const startedAt = performance.now();
  try {
    const result = await fn();
    profile?.attempts.push({
      stage,
      attempt,
      status: "succeeded",
      duration_ms: elapsedMs(startedAt)
    });
    return result;
  } catch (error) {
    profile?.attempts.push({
      stage,
      attempt,
      status: "failed",
      duration_ms: elapsedMs(startedAt),
      error: error.message
    });
    throw error;
  }
}

function finishProfile(profile, startedAt) {
  if (profile) {
    profile.total_ms = elapsedMs(startedAt);
  }
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

function requireArtworkImage(record) {
  if (!record.artwork_path) {
    throw badRequest("Artwork image is required");
  }
  return record.artwork_path;
}

function createJobManager({ config, storage, runner }) {
  const jobs = new Map();
  const queuedJobs = [];
  const waiters = [];
  const activeCounts = new Map();
  const runningCounts = new Map();
  const reservedTitlesByUser = new Map();
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

  function classicArtworkTitles(answers = {}) {
    if (answers.creation_mode !== "classic_reference"
      || typeof answers.classic_artwork_id !== "string"
      || !answers.classic_artwork_id.trim()) {
      return [];
    }
    const artwork = (config.classicArtworks || []).find((entry) => entry?.id === answers.classic_artwork_id);
    const titles = artwork?.new_artwork_titles;
    if (!Array.isArray(titles)
      || titles.length !== 5
      || titles.some((title) => typeof title !== "string" || !/^\p{Script=Han}+$/u.test(title))
      || new Set(titles).size !== titles.length) {
      return [];
    }
    return [...titles];
  }

  async function titleForNewArtwork(type, answers = {}, userId = "") {
    if (!userId || typeof storage.listKeptRecordTitles !== "function") {
      return titleFromRequest(type, answers);
    }
    const usedTitles = new Set(
      (await storage.listKeptRecordTitles(userId))
        .map((title) => (typeof title === "string" ? title.trim() : ""))
        .filter(Boolean)
    );
    const reservedTitles = reservedTitlesByUser.get(userId) || new Set();
    for (const title of reservedTitles) usedTitles.add(title);
    const classicTitles = type === "painting" ? classicArtworkTitles(answers) : [];
    let title;
    if (classicTitles.length > 0) {
      title = classicTitles.find((candidate) => !usedTitles.has(candidate))
        || titleAvailableInCollection(classicTitles[0], usedTitles);
    } else {
      title = titleAvailableInCollection(titleFromRequest(type, answers), usedTitles);
    }
    reservedTitles.add(title);
    reservedTitlesByUser.set(userId, reservedTitles);
    return title;
  }

  function releaseTitleReservation(userId, title) {
    const reservedTitles = reservedTitlesByUser.get(userId);
    if (!reservedTitles) return;
    reservedTitles.delete(title);
    if (reservedTitles.size === 0) reservedTitlesByUser.delete(userId);
  }

  function tabKey(userId, originTab) {
    return `${normalizeUserId(userId)}:${normalizeOriginTab(originTab)}`;
  }

  function cloneJob(job) {
    if (!job) return null;
    return {
      ...job,
      diagnostics: job.diagnostics && typeof job.diagnostics === "object" ? { ...job.diagnostics } : job.diagnostics,
      generation_profile: cloneProfile(job.generation_profile)
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
      calligraphy_verification: record.calligraphy_verification && typeof record.calligraphy_verification === "object"
        ? {
          ...record.calligraphy_verification,
          issues: Array.isArray(record.calligraphy_verification.issues)
            ? [...record.calligraphy_verification.issues]
            : record.calligraphy_verification.issues
        }
        : record.calligraphy_verification,
      diagnostics: record.diagnostics && typeof record.diagnostics === "object" ? { ...record.diagnostics } : record.diagnostics,
      generation_profile: cloneProfile(record.generation_profile)
    };
  }

  function promptResolvedOrientation(record) {
    return {
      orientation: record.resolved_orientation || "unknown",
      source: record.orientation_source || "unknown"
    };
  }

  function resolveFinalArtworkTuple(record) {
    const resolved = resolveArtworkCanvasTuple({
      answers: record.answers || {},
      resolvedOrientation: record.resolved_orientation,
      orientationSource: record.orientation_source || "record",
      fallbackCanvas: config.app?.runtime?.generationCanvas
    });
    record.resolved_orientation = resolved.orientation;
    record.orientation_source = resolved.source;
    return resolved;
  }

  function resolveRecordOrientation(record) {
    const finalized = resolveArtworkCanvasTuple({
      answers: record.answers || {},
      resolvedOrientation: record.resolved_orientation,
      orientationSource: record.orientation_source || "unknown",
      fallbackCanvas: config.app?.runtime?.generationCanvas
    });
    if (finalized.orientation === record.resolved_orientation
      && finalized.source === record.orientation_source) {
      return {
        orientation: record.resolved_orientation,
        source: record.orientation_source
      };
    }

    const resolved = resolveOrientation({
      answers: record.answers || {},
      conversationNotes: record.conversation_notes || ""
    });
    if (resolved.source !== "default") return resolved;
    if (["portrait", "landscape", "square"].includes(record.resolved_orientation)) {
      return {
        orientation: record.resolved_orientation,
        source: record.orientation_source || "record"
      };
    }
    return resolved;
  }

  function alignGeneratedSizeDensity(size, generationComplexity, orientation) {
    const source = /^environment_(estimate|fallback)_/.exec(size?.preset_id || "")?.[1];
    if (!source) return size;
    return stampGeneratedArtworkSize(
      size,
      generationComplexity,
      `environment_${source}`,
      orientation
    );
  }

  async function estimateArtworkRecordFromEnvironment(record, targetCanvas, profile = null) {
    if (!record.source_photo_path) return;
    const existingComplexity = normalizeGenerationComplexity(record.generation_complexity);
    const resolvedOrientation = promptResolvedOrientation(record);
    const prompt = buildSizeEstimationPrompt({
      record,
      answers: record.answers || {},
      conversationNotes: record.conversation_notes || "",
      resolvedOrientation,
      config
    });
    const estimate = await measureProfileStage(profile, "size_estimation", () => estimateFromEnvironment({
      runner: (runnerOptions) => recordRunnerAttempt(profile, "size_estimation", 1, () => runner(runnerOptions)),
      record,
      prompt,
      resolvedOrientation,
      targetCanvas,
      fallbackSize: record.recommended_artwork_size || null,
      referenceImages: environmentReferenceImages(record),
      fallbackComplexity: existingComplexity
    }));
    const estimatedComplexity = normalizeGenerationComplexity(estimate.generation_complexity);
    record.generation_complexity = record.generation_complexity_explicit
      ? existingComplexity
      : estimatedComplexity;
    record.recommended_artwork_size = alignGeneratedSizeDensity(
      estimate.recommended_artwork_size,
      record.generation_complexity,
      resolvedOrientation.orientation
    );
  }

  async function estimateFusionRecordFromEnvironment(record, profile = null) {
    if (!record.source_photo_path) return;
    const existingComplexity = normalizeGenerationComplexity(record.generation_complexity);
    const resolvedOrientation = resolveRecordOrientation(record);
    record.resolved_orientation = resolvedOrientation.orientation;
    record.orientation_source = resolvedOrientation.source;
    const prompt = buildSizeEstimationPrompt({
      record,
      answers: record.answers || {},
      conversationNotes: record.conversation_notes || "",
      resolvedOrientation,
      config
    });
    const estimate = await measureProfileStage(profile, "size_estimation", () => estimateFromEnvironment({
      runner: (runnerOptions) => recordRunnerAttempt(profile, "size_estimation", 1, () => runner(runnerOptions)),
      record,
      prompt,
      resolvedOrientation,
      fallbackSize: record.recommended_artwork_size || null,
      referenceImages: environmentReferenceImages(record),
      fallbackComplexity: existingComplexity
    }));
    record.generation_complexity = existingComplexity;
    record.recommended_artwork_size = alignGeneratedSizeDensity(
      estimate.recommended_artwork_size,
      existingComplexity,
      resolvedOrientation.orientation
    );
  }

  function updateArtworkRecommendationFromPng(record, artworkMetadata) {
    const aspectRatio = artworkMetadata.aspectRatio;
    if (record.source_photo_path && record.recommended_artwork_size) {
      record.recommended_artwork_size = normalizeArtworkSizeCandidate(
        record.recommended_artwork_size,
        record.resolved_orientation,
        aspectRatio
      ) || record.recommended_artwork_size;
      return;
    }
    record.recommended_artwork_size = sizeFromComplexityAndAspectRatio({
      generationComplexity: record.generation_complexity,
      aspectRatio,
      orientation: record.resolved_orientation
    });
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

  async function runRunnerWithRetry(options, profile = null) {
    const { validateResult, ...runnerOptions } = options;
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (validateResult) {
        await fs.rm(runnerOptions.outputPngPath, { force: true });
      }
      try {
        return await recordRunnerAttempt(profile, runnerOptions.stage, attempt + 1, async () => {
          const result = await runner(runnerOptions);
          const validation = validateResult ? await validateResult(result) : null;
          return validation ? { ...result, artworkMetadata: validation } : result;
        });
      } catch (error) {
        lastError = error;
      }
    }
    if (validateResult) {
      await fs.rm(runnerOptions.outputPngPath, { force: true });
    }
    throw lastError;
  }

  async function validateArtworkResult({ result, targetCanvas, type, record, profile }) {
    const artworkMetadata = await validateArtworkPngAspect(result, targetCanvas);
    if (type !== "calligraphy") return artworkMetadata;

    const verificationConfig = config.prompts?.calligraphyVerification || {};
    const expectedText = typeof record.answers?.text === "string" ? record.answers.text : "";
    let verificationResult;
    try {
      verificationResult = await measureProfileStage(profile, "calligraphy_verification", () => runner({
        stage: "calligraphy_verification",
        prompt: buildCalligraphyVerificationPrompt({ expectedText, config: verificationConfig }),
        record,
        referenceImages: { calligraphyCandidate: result.pngPath }
      }));
    } catch (error) {
      const publicResult = { status: "needs_review", issues: ["inspection_failed"] };
      record.calligraphy_verification = publicResult;
      throw calligraphyTextUnverified(publicResult, error?.diagnostics);
    }

    const assessment = assessCalligraphyVerification({
      expectedText,
      result: verificationResult,
      minimumConfidence: Number(verificationConfig.minimumConfidence) || 0.8
    });
    record.calligraphy_verification = assessment.publicResult;
    if (!assessment.verified) throw calligraphyTextUnverified(assessment.publicResult);
    return artworkMetadata;
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

  async function saveRecordProfiled(record, userId = "", { persistProfile = false, profileStartedAt = null } = {}) {
    const profile = record.generation_profile;
    await measureProfileStage(profile, "record_save", () => saveRecordSerial(record, userId));
    if (persistProfile) {
      finishProfile(profile, profileStartedAt ?? performance.now());
      await saveRecordSerial(record, userId);
    }
  }

  function fusionReferenceImages(record) {
    return {
      environment: resolveRecordAssetPath(storage.dataDir, record.source_photo_path, SOURCE_PHOTO_FILES),
      artwork: resolveRecordAssetPath(storage.dataDir, requireArtworkImage(record), ARTWORK_FILES)
    };
  }

  function environmentReferenceImages(record) {
    return {
      environment: resolveRecordAssetPath(storage.dataDir, record.source_photo_path, SOURCE_PHOTO_FILES)
    };
  }

  async function runFusionRender(record, outputPngPath) {
    const referenceImages = fusionReferenceImages(record);
    const prompt = buildFusionPrompt({ record, config, referenceImages });
    return measureProfileStage(record.generation_profile, "codex_fusion_render", () => runRunnerWithRetry({
      stage: "fusion_render",
      prompt,
      record,
      outputPngPath,
      referenceImages
    }, record.generation_profile));
  }

  async function runImmediateArtwork({
    userId = "",
    type,
    answers = {},
    conversationNotes = "",
    sourcePhotoPath = "",
    recommendedArtworkSize = null,
    generationComplexity,
    generationComplexityExplicit = generationComplexity != null
  }) {
    const ownerId = normalizeUserId(userId);
    return runLegacyLocked("artwork", async () => {
      const profileStartedAt = performance.now();
      const generationProfile = createGenerationProfile();
      const recordId = newId("record");
      const artworkPath = relativeRecordPath(recordId, "artwork.webp");
      const pngPath = path.join(storage.dataDir, "records", recordId, "artwork.png");
      const createdAt = new Date().toISOString();
      const title = await titleForNewArtwork(type, answers, ownerId);
      const ownedSourcePhotoPath = await measureProfileStage(
        generationProfile,
        "copy_source_photo",
        () => copySourcePhotoForRecord(storage, recordId, sourcePhotoPath)
      );
      const normalizedGenerationComplexity = normalizeGenerationComplexity(generationComplexity);
      const resolvedOrientation = resolveOrientation({ answers, conversationNotes });
      const record = {
        id: recordId,
        user_id: ownerId,
        created_at: createdAt,
        type,
        title,
        answers,
        conversation_notes: conversationNotes,
        source_photo_path: ownedSourcePhotoPath,
        generation_complexity: normalizedGenerationComplexity,
        generation_complexity_explicit: generationComplexityExplicit,
        resolved_orientation: resolvedOrientation.orientation,
        orientation_source: resolvedOrientation.source,
        recommended_artwork_size: recommendedArtworkSize,
        artwork_path: artworkPath,
        favorite: true,
        status: "running",
        diagnostics: null,
        generation_profile: generationProfile
      };
      const artworkTuple = resolveFinalArtworkTuple(record);
      await estimateArtworkRecordFromEnvironment(record, artworkTuple.canvas, generationProfile);
      const job = createLegacyJob("artwork", recordId, { type, title });
      job.generation_profile = generationProfile;

      job.status = "running";
      job.started_at = new Date().toISOString();
      await saveRecordProfiled(record, ownerId);
      try {
        const prompt = config.prompts?.[type]
          ? buildArtworkPrompt({
            type,
            answers,
            conversationNotes,
            generationComplexity: record.generation_complexity,
            recommendedArtworkSize: record.recommended_artwork_size,
            resolvedOrientation: promptResolvedOrientation(record),
            config
          })
          : "";
        const referenceImages = await classicArtworkReferenceImages(config, record.answers);
        const result = await measureProfileStage(generationProfile, "codex_artwork", () => runRunnerWithRetry({
          stage: "artwork",
          prompt,
          record,
          canvas: artworkTuple.canvas,
          outputPngPath: pngPath,
          validateResult: (runnerResult) => validateArtworkResult({
            result: runnerResult,
            targetCanvas: artworkTuple.canvas,
            type,
            record,
            profile: generationProfile
          }),
          ...(referenceImages ? { referenceImages } : {})
        }, generationProfile));
        updateArtworkRecommendationFromPng(record, result.artworkMetadata);
        await measureProfileStage(generationProfile, "webp_conversion", () => convertPngToWebp(result.pngPath, path.join(storage.dataDir, artworkPath), qualityFromConfig(config)));
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
        finishProfile(generationProfile, profileStartedAt);
        job.generation_profile = generationProfile;
      }

      await saveRecordProfiled(record, ownerId, { persistProfile: true, profileStartedAt });
      return { job: cloneJob(job), record: cloneRecord(record) };
    });
  }

  async function runImmediateFusion({ userId = "", recordId, sourcePhotoPath = "" }) {
    const ownerId = normalizeUserId(userId);
    return runLegacyLocked("fusion_render", async () => {
      const profileStartedAt = performance.now();
      const generationProfile = createGenerationProfile();
      const getRecord = typeof storage.getRecordForUser === "function"
        ? storage.getRecordForUser.bind(storage)
        : storage.getRecord.bind(storage);
      const record = await getRecord(recordId, ownerId);
      const requestedSourcePhotoPath = requireEnvironmentImage(record, sourcePhotoPath);
      requireArtworkImage(record);
      const ownedSourcePhotoPath = await measureProfileStage(
        generationProfile,
        "copy_source_photo",
        () => copySourcePhotoForRecord(storage, recordId, requestedSourcePhotoPath)
      );
      const fusionPath = relativeRecordPath(recordId, "fusion.webp");
      const pngPath = path.join(storage.dataDir, "records", recordId, "fusion.png");
      const job = createLegacyJob("fusion_render", recordId, {
        type: record.type,
        title: record.title || titleFromRequest(record.type, record.answers || {})
      });
      record.generation_profile = generationProfile;
      job.generation_profile = generationProfile;

      job.status = "running";
      job.started_at = new Date().toISOString();
      record.status = "running";
      record.source_photo_path = ownedSourcePhotoPath;
      await estimateFusionRecordFromEnvironment(record, generationProfile);
      await saveRecordProfiled(record, ownerId);

      try {
        const result = await runFusionRender(record, pngPath);
        await measureProfileStage(generationProfile, "webp_conversion", () => convertPngToWebp(result.pngPath, path.join(storage.dataDir, fusionPath), qualityFromConfig(config)));
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
        finishProfile(generationProfile, profileStartedAt);
        job.generation_profile = generationProfile;
      }

      await saveRecordProfiled(record, ownerId, { persistProfile: true, profileStartedAt });
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
    const profile = task.record.generation_profile;
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
      if (task.stage === "artwork") {
        await estimateArtworkRecordFromEnvironment(task.record, task.artworkCanvas, profile);
      } else {
        await estimateFusionRecordFromEnvironment(task.record, profile);
      }
      await saveRecordProfiled(task.record, task.userId);
      flushWaiters();

      const artworkReferenceImages = task.stage === "artwork"
        ? await classicArtworkReferenceImages(config, task.record.answers)
        : undefined;

      const result = task.stage === "artwork"
        ? await measureProfileStage(profile, "codex_artwork", () => runRunnerWithRetry({
          stage: task.stage,
          prompt: config.prompts?.[task.type]
            ? buildArtworkPrompt({
              type: task.type,
              answers: task.answers,
              conversationNotes: task.conversationNotes,
              generationComplexity: task.record.generation_complexity,
              recommendedArtworkSize: task.record.recommended_artwork_size,
              resolvedOrientation: promptResolvedOrientation(task.record),
              config
            })
            : "",
          record: task.record,
          canvas: task.artworkCanvas,
          outputPngPath: task.outputPngPath,
          validateResult: (runnerResult) => validateArtworkResult({
            result: runnerResult,
            targetCanvas: task.artworkCanvas,
            type: task.type,
            record: task.record,
            profile
          }),
          ...(artworkReferenceImages ? { referenceImages: artworkReferenceImages } : {})
        }, profile))
        : await runFusionRender(task.record, task.outputPngPath);

      if (task.stage === "artwork") {
        updateArtworkRecommendationFromPng(task.record, result.artworkMetadata);
      }

      await measureProfileStage(profile, "webp_conversion", () => convertPngToWebp(
        result.pngPath,
        path.join(storage.dataDir, task.outputWebpPath),
        qualityFromConfig(config)
      ));

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
        finishProfile(profile, task.profileStartedAt);
        task.job.generation_profile = profile;
        await saveRecordProfiled(task.record, task.userId, {
          persistProfile: true,
          profileStartedAt: task.profileStartedAt
        });
      } catch (error) {
        // Persisting the final state is best effort; the in-memory state remains updated.
      }
      task.job.status = finalJobStatus;
      task.job.error = finalJobError;
      task.job.diagnostics = task.record.diagnostics;
      task.job.generation_profile = profile;
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
    generationComplexity,
    generationComplexityExplicit,
    originTab = "studio",
    operation = "create"
  }) {
    const ownerId = normalizeUserId(userId);
    const normalizedOriginTab = normalizeOriginTab(originTab);
    const normalizedOperation = normalizeOperation(operation);
    const resolvedGenerationComplexityExplicit = typeof generationComplexityExplicit === "boolean"
      ? generationComplexityExplicit
      : generationComplexity != null;
    const normalizedGenerationComplexity = normalizeGenerationComplexity(generationComplexity);
    const resolvedOrientation = resolveOrientation({ answers, conversationNotes });
    const profileStartedAt = performance.now();
    const generationProfile = createGenerationProfile();
    if (!ownerId) {
      return runImmediateArtwork({
        userId: ownerId,
        type,
        answers,
        conversationNotes,
        sourcePhotoPath,
        recommendedArtworkSize,
        generationComplexity: normalizedGenerationComplexity,
        generationComplexityExplicit: resolvedGenerationComplexityExplicit
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
    let title;
    try {
      title = await titleForNewArtwork(type, answers, ownerId);
    } catch (error) {
      releaseActiveSlot(ownerId, normalizedOriginTab);
      throw error;
    }
    let ownedSourcePhotoPath;
    try {
      ownedSourcePhotoPath = await measureProfileStage(
        generationProfile,
        "copy_source_photo",
        () => copySourcePhotoForRecord(storage, recordId, sourcePhotoPath)
      );
    } catch (error) {
      releaseTitleReservation(ownerId, title);
      releaseActiveSlot(ownerId, normalizedOriginTab);
      throw error;
    }
    const pngPath = path.join(storage.dataDir, "records", recordId, "artwork.png");
    const record = {
      id: recordId,
      user_id: ownerId,
      created_at: createdAt,
      type,
      title,
      answers,
      conversation_notes: conversationNotes,
      source_photo_path: ownedSourcePhotoPath,
      generation_complexity: normalizedGenerationComplexity,
      generation_complexity_explicit: resolvedGenerationComplexityExplicit,
      resolved_orientation: resolvedOrientation.orientation,
      orientation_source: resolvedOrientation.source,
      recommended_artwork_size: recommendedArtworkSize,
      artwork_path: artworkPath,
      favorite: true,
      status: "queued",
      diagnostics: null,
      generation_profile: generationProfile
    };
    const artworkTuple = resolveFinalArtworkTuple(record);
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
      diagnostics: null,
      generation_profile: generationProfile
    };
    jobs.set(job.id, job);

    try {
      await saveRecordProfiled(record, ownerId);
      releaseTitleReservation(ownerId, title);
      queuedJobs.push({
        userId: ownerId,
        stage: "artwork",
        type,
        title: record.title,
        answers,
        conversationNotes,
        generationComplexity: record.generation_complexity,
        sourcePhotoPath: ownedSourcePhotoPath,
        originTab: normalizedOriginTab,
        operation: normalizedOperation,
        record,
        job,
        artworkCanvas: artworkTuple.canvas,
        profileStartedAt,
        outputPngPath: pngPath,
        outputWebpPath: artworkPath
      });
      scheduleQueue();
      flushWaiters();
      return { job: cloneJob(job), record: cloneRecord(record) };
    } catch (error) {
      releaseTitleReservation(ownerId, title);
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
      const profileStartedAt = performance.now();
      const generationProfile = createGenerationProfile();
      const getRecord = typeof storage.getRecordForUser === "function"
        ? storage.getRecordForUser.bind(storage)
        : storage.getRecord.bind(storage);
      const record = await getRecord(recordId, ownerId);
      const requestedSourcePhotoPath = requireEnvironmentImage(record, sourcePhotoPath);
      requireArtworkImage(record);
      const ownedSourcePhotoPath = await measureProfileStage(
        generationProfile,
        "copy_source_photo",
        () => copySourcePhotoForRecord(storage, recordId, requestedSourcePhotoPath)
      );
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
        diagnostics: null,
        generation_profile: generationProfile
      };
      jobs.set(job.id, job);

      record.status = "queued";
      record.source_photo_path = ownedSourcePhotoPath;
      record.generation_profile = generationProfile;
      await saveRecordProfiled(record, ownerId);

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
        profileStartedAt,
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

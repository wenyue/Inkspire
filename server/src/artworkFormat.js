const CANVASES = Object.freeze({
  portrait: Object.freeze({ width: 1024, height: 1536, aspectRatio: "2:3", orientation: "portrait" }),
  landscape: Object.freeze({ width: 1536, height: 1024, aspectRatio: "3:2", orientation: "landscape" }),
  square: Object.freeze({ width: 1024, height: 1024, aspectRatio: "1:1", orientation: "square" }),
  handscroll: Object.freeze({ width: 1536, height: 768, aspectRatio: "2:1", orientation: "landscape" })
});

const FORMAT_ORIENTATIONS = new Map([
  ["立轴", "portrait"],
  ["立軸", "portrait"],
  ["hanging scroll", "portrait"],
  ["竖幅", "portrait"],
  ["豎幅", "portrait"],
  ["竖排", "portrait"],
  ["豎排", "portrait"],
  ["vertical", "portrait"],
  ["横幅", "landscape"],
  ["橫幅", "landscape"],
  ["horizontal", "landscape"],
  ["横排", "landscape"],
  ["橫排", "landscape"],
  ["匾额", "landscape"],
  ["匾額", "landscape"],
  ["plaque", "landscape"],
  ["斗方", "square"],
  ["square", "square"],
  ["手卷", "landscape"],
  ["handscroll", "landscape"],
  ["扇面", "landscape"],
  ["fan", "landscape"],
  ["册页", "square"],
  ["冊頁", "square"],
  ["album", "square"]
]);

const HANDSCROLL_FORMATS = new Set(["手卷", "handscroll"]);

function normalizeFormat(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^[\x00-\x7F]+$/.test(trimmed) ? trimmed.toLowerCase() : trimmed;
}

function orientationForArtworkFormat(value) {
  return FORMAT_ORIENTATIONS.get(normalizeFormat(value)) || "unknown";
}

function artworkFormatFromAnswers(answers = {}) {
  if (answers.work_type === "calligraphy") {
    return answers.calligraphy_layout;
  }
  if (answers.work_type === "painting") {
    return answers.painting_format || answers.painting_composition;
  }
  return answers.painting_format || answers.painting_composition || answers.calligraphy_layout;
}

function orientationForArtworkAnswers(answers = {}) {
  return orientationForArtworkFormat(artworkFormatFromAnswers(answers));
}

function normalizedResolvedOrientation(value) {
  const orientation = typeof value === "object" && value ? value.orientation : value;
  return Object.hasOwn(CANVASES, orientation) && orientation !== "handscroll" ? orientation : "";
}

function immutableFallbackCanvas(canvas) {
  if (!canvas || typeof canvas !== "object") return CANVASES.portrait;
  const width = Number(canvas.width);
  const height = Number(canvas.height);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    return CANVASES.portrait;
  }
  return Object.freeze({
    width,
    height,
    aspectRatio: canvas.aspectRatio || canvas.aspect_ratio || `${width}:${height}`,
    orientation: ["portrait", "landscape", "square"].includes(canvas.orientation)
      ? canvas.orientation
      : width === height ? "square" : width > height ? "landscape" : "portrait"
  });
}

function hasValidCanvas(canvas) {
  const width = Number(canvas?.width);
  const height = Number(canvas?.height);
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
}

function resolveArtworkCanvas({ answers = {}, resolvedOrientation, fallbackCanvas } = {}) {
  const format = artworkFormatFromAnswers(answers);
  const explicitOrientation = normalizedResolvedOrientation(resolvedOrientation);
  if (!format && !explicitOrientation) return immutableFallbackCanvas(fallbackCanvas);

  const orientation = explicitOrientation || orientationForArtworkFormat(format);
  if (orientation === "unknown") return immutableFallbackCanvas(fallbackCanvas);
  if (orientation === "landscape" && HANDSCROLL_FORMATS.has(normalizeFormat(format))) {
    return CANVASES.handscroll;
  }
  return CANVASES[orientation] || CANVASES.portrait;
}

function resolveArtworkCanvasTuple({
  answers = {},
  resolvedOrientation,
  orientationSource = "unknown",
  fallbackCanvas
} = {}) {
  const knownFormatOrientation = orientationForArtworkAnswers(answers);
  const hasResolvedOrientation = Boolean(normalizedResolvedOrientation(resolvedOrientation));
  let canvas;
  let source;

  if (orientationSource === "notes" && hasResolvedOrientation) {
    canvas = resolveArtworkCanvas({ answers, resolvedOrientation, fallbackCanvas });
    source = "notes";
  } else if (knownFormatOrientation !== "unknown") {
    canvas = resolveArtworkCanvas({ answers, fallbackCanvas });
    source = "question";
  } else if (hasResolvedOrientation && !["default", "unknown"].includes(orientationSource)) {
    canvas = resolveArtworkCanvas({ answers, resolvedOrientation, fallbackCanvas });
    source = orientationSource || "record";
  } else {
    canvas = resolveArtworkCanvas({ answers, fallbackCanvas });
    source = hasValidCanvas(fallbackCanvas) ? "runtime_fallback" : "default";
  }

  return { orientation: canvas.orientation, source, canvas };
}

module.exports = {
  orientationForArtworkAnswers,
  orientationForArtworkFormat,
  resolveArtworkCanvas,
  resolveArtworkCanvasTuple
};

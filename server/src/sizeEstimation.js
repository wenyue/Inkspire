const { orientationForArtworkFormat } = require("./artworkFormat");

const COMPLEXITIES = new Set(["small", "medium", "large"]);
const TARGET_AREAS = { small: 30 * 45, medium: 45 * 68, large: 60 * 90 };
const LABELS = { small: "疏朗参考尺寸", medium: "均衡参考尺寸", large: "繁密参考尺寸" };
const REASONS = {
  small: "按画面疏密与比例估算，适合作为疏朗布局制作参考。",
  medium: "按画面疏密、虚实与比例估算，适合作为均衡布局制作参考。",
  large: "按画面疏密与比例估算，层次繁密但仍保留清楚气口与虚处。"
};
const ENVIRONMENT_REASONS = {
  small: "根据所提供环境图片的可用墙面或陈设比例估算尺寸，并结合疏朗布局与作品幅式。",
  medium: "根据所提供环境图片的可用墙面或陈设比例估算尺寸，并结合均衡疏密与作品幅式。",
  large: "根据所提供环境图片的可用墙面或陈设比例估算尺寸，并结合繁密布局与作品幅式，同时保留清楚气口与虚处。"
};
const FALLBACK_REASONS = {
  small: "环境图片尺寸估算不可用，按疏朗布局与作品幅式提供备用参考。",
  medium: "环境图片尺寸估算不可用，按均衡疏密与作品幅式提供备用参考。",
  large: "环境图片尺寸估算不可用，按繁密布局与作品幅式提供备用参考，同时保留清楚气口与虚处。"
};
const ORIENTATIONS = new Set(["portrait", "landscape", "square"]);
const DEFAULT_SIZE = {
  preset_id: "environment_fallback_medium_portrait",
  label: "环境估算备用尺寸",
  width_cm: 45,
  height_cm: 70,
  reason: "环境图片 AI 尺寸估算不可用时，按均衡疏密与竖幅比例提供备用参考。"
};

function normalizeGenerationComplexity(value) {
  return COMPLEXITIES.has(value) ? value : "medium";
}

function stampGeneratedArtworkSize(size, generationComplexity, source = "environment_estimate", orientation = "") {
  const complexity = normalizeGenerationComplexity(generationComplexity);
  const orientationSuffix = source === "environment_fallback" && ORIENTATIONS.has(orientation)
    ? `_${orientation}`
    : "";
  const reasons = source === "environment_estimate"
    ? ENVIRONMENT_REASONS
    : source === "environment_fallback"
      ? FALLBACK_REASONS
      : REASONS;
  return {
    ...size,
    preset_id: `${source}_${complexity}${orientationSuffix}`,
    label: LABELS[complexity],
    reason: reasons[complexity]
  };
}

function hasNegationNear(text, index) {
  const start = Math.max(0, index - 8);
  const prefix = text.slice(start, index).toLowerCase();
  return /不要|别|不要做成|不想要|no\s+$|not\s+$/.test(prefix);
}

function noteOrientation(notes = "") {
  const checks = [
    { orientation: "portrait", patterns: [/竖幅/g, /竖向/g, /vertical format/gi, /portrait orientation/gi] },
    { orientation: "landscape", patterns: [/横幅/g, /横向/g, /horizontal format/gi, /landscape orientation/gi] },
    { orientation: "square", patterns: [/斗方/g, /方形/g, /square format/gi] }
  ];

  for (const check of checks) {
    for (const pattern of check.patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(notes);
      if (match && !hasNegationNear(notes, match.index)) return check.orientation;
    }
  }

  return "unknown";
}

function normalizeOrientationValue(value) {
  if (ORIENTATIONS.has(value)) return value;
  if (value === "vertical") return "portrait";
  if (value === "horizontal") return "landscape";
  if (value === "plaque") return "landscape";
  return "unknown";
}

function orientationFromAnswerValue(value) {
  if (!value) return "unknown";
  if (typeof value === "object") {
    return normalizeOrientationValue(value.orientation || value.id);
  }
  return normalizeOrientationValue(value);
}

function answerOrientation(answers = {}) {
  if (answers.work_type === "painting") {
    const stableOrientation = orientationFromAnswerValue(answers.painting_composition_orientation);
    if (stableOrientation !== "unknown") return stableOrientation;

    const objectOrientation = orientationFromAnswerValue(answers.painting_format || answers.painting_composition);
    if (objectOrientation !== "unknown") return objectOrientation;

    const artworkFormat = answers.painting_format || answers.painting_composition;
    if (typeof artworkFormat === "string" && artworkFormat.trim()) {
      return orientationForArtworkFormat(artworkFormat);
    }
    return "unknown";
  }

  if (answers.work_type === "calligraphy") {
    const stableOrientation = orientationFromAnswerValue(answers.calligraphy_layout_orientation);
    if (stableOrientation !== "unknown") return stableOrientation;

    const objectOrientation = orientationFromAnswerValue(answers.calligraphy_layout);
    if (objectOrientation !== "unknown") return objectOrientation;

    if (typeof answers.calligraphy_layout === "string" && answers.calligraphy_layout.trim()) {
      return orientationForArtworkFormat(answers.calligraphy_layout);
    }
  }

  return "unknown";
}

function resolveOrientation({ answers = {}, conversationNotes = "", aspectRatio = 0 } = {}) {
  const fromNotes = noteOrientation(conversationNotes);
  if (fromNotes !== "unknown") return { orientation: fromNotes, source: "notes" };

  const fromQuestion = answerOrientation(answers);
  if (fromQuestion !== "unknown") return { orientation: fromQuestion, source: "question" };

  if (Number.isFinite(aspectRatio) && aspectRatio > 0) {
    if (aspectRatio > 1.1) return { orientation: "landscape", source: "artwork_aspect" };
    if (aspectRatio < 0.9) return { orientation: "portrait", source: "artwork_aspect" };
    return { orientation: "square", source: "artwork_aspect" };
  }

  return { orientation: "portrait", source: "default" };
}

const resolveOrientationIntent = resolveOrientation;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundToFive(value) {
  return Math.max(5, Math.round(value / 5) * 5);
}

function ratioForOrientation(aspectRatio, orientation) {
  let ratio = Number(aspectRatio);
  if (!Number.isFinite(ratio) || ratio <= 0) ratio = 2 / 3;
  if (orientation === "square") return 1;
  if (orientation === "portrait") {
    if (ratio > 1) ratio = 1 / ratio;
    return clamp(ratio, 0.45, 0.9);
  }
  if (orientation === "landscape") {
    if (ratio < 1) ratio = 1 / ratio;
    return clamp(ratio, 1.1, 2.2);
  }
  return clamp(ratio, 0.45, 2.2);
}

function sizeFromComplexityAndAspectRatio({
  generationComplexity = "medium",
  aspectRatio = 2 / 3,
  orientation = "unknown"
} = {}) {
  const complexity = normalizeGenerationComplexity(generationComplexity);
  const ratio = ratioForOrientation(aspectRatio, orientation);
  const area = TARGET_AREAS[complexity];
  let height = Math.sqrt(area / ratio);
  let width = height * ratio;
  const shortSide = Math.min(width, height);

  if (shortSide < 25) {
    const scale = 25 / shortSide;
    width *= scale;
    height *= scale;
  }

  if (Math.max(width, height) > 120) {
    const scale = 120 / Math.max(width, height);
    width *= scale;
    height *= scale;
  }

  let widthCm = roundToFive(width);
  let heightCm = roundToFive(height);

  if (orientation === "portrait" && widthCm >= heightCm) heightCm = widthCm + 5;
  if (orientation === "landscape" && heightCm >= widthCm) widthCm = heightCm + 5;
  if (orientation === "square") {
    const side = roundToFive((widthCm + heightCm) / 2);
    widthCm = side;
    heightCm = side;
  }

  return {
    preset_id: `complexity_${complexity}`,
    label: LABELS[complexity],
    width_cm: widthCm,
    height_cm: heightCm,
    reason: REASONS[complexity]
  };
}

function normalizeArtworkSizeCandidate(value, orientation = "unknown", targetAspectRatio = 0) {
  if (!value || typeof value !== "object") return null;

  const width = Number(value.width_cm);
  const height = Number(value.height_cm);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 300 || height > 300) {
    return null;
  }

  const normalized = {
    preset_id: typeof value.preset_id === "string" && value.preset_id ? value.preset_id : "ai_scene",
    label: typeof value.label === "string" && value.label ? value.label : "环境估算尺寸",
    width_cm: roundToFive(width),
    height_cm: roundToFive(height),
    ...(typeof value.reason === "string" && value.reason ? { reason: value.reason } : {})
  };

  const oriented = enforceArtworkSizeOrientation(normalized, orientation);
  const aspectAdjusted = enforceArtworkSizeAspectRatio(oriented, targetAspectRatio);
  if (!aspectAdjusted || aspectAdjusted.width_cm <= 0 || aspectAdjusted.height_cm <= 0 || aspectAdjusted.width_cm > 300 || aspectAdjusted.height_cm > 300) {
    return null;
  }
  return aspectAdjusted;
}

function normalizeArtworkSize(value) {
  return normalizeArtworkSizeCandidate(value, "unknown");
}

function enforceArtworkSizeOrientation(size, orientation) {
  if (!size) return null;

  const next = { ...size };
  if (orientation === "portrait" && next.width_cm > next.height_cm) {
    [next.width_cm, next.height_cm] = [next.height_cm, next.width_cm];
  } else if (orientation === "portrait" && next.width_cm === next.height_cm) {
    if (next.height_cm < 300) next.height_cm += 5;
    else next.width_cm -= 5;
  } else if (orientation === "landscape" && next.height_cm > next.width_cm) {
    [next.width_cm, next.height_cm] = [next.height_cm, next.width_cm];
  } else if (orientation === "landscape" && next.height_cm === next.width_cm) {
    if (next.width_cm < 300) next.width_cm += 5;
    else next.height_cm -= 5;
  } else if (orientation === "square") {
    const side = roundToFive((next.width_cm + next.height_cm) / 2);
    next.width_cm = side;
    next.height_cm = side;
  }

  return next;
}

function enforceArtworkSizeAspectRatio(size, aspectRatio) {
  const ratio = Number(aspectRatio);
  if (!size || !Number.isFinite(ratio) || ratio <= 0) return size;

  const area = size.width_cm * size.height_cm;
  let widthCm = roundToFive(Math.sqrt(area * ratio));
  let heightCm = roundToFive(Math.sqrt(area / ratio));
  if (Math.max(widthCm, heightCm) > 300) {
    const scale = 300 / Math.max(widthCm, heightCm);
    widthCm = roundToFive(widthCm * scale);
    heightCm = roundToFive(heightCm * scale);
  }
  return { ...size, width_cm: widthCm, height_cm: heightCm };
}

function aspectRatioFromCanvas(canvas) {
  const width = Number(canvas?.width);
  const height = Number(canvas?.height);
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
    ? width / height
    : 0;
}

function parseEstimationPayload(result) {
  if (result?.json && typeof result.json === "object") return result.json;
  const rawText = typeof result?.json === "string" ? result.json : result?.text;
  if (typeof rawText !== "string" || !rawText.trim()) {
    throw new Error("Missing size estimation JSON");
  }

  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) throw error;
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

async function estimateFromEnvironment({
  runner,
  record,
  prompt = "",
  resolvedOrientation = { orientation: "portrait", source: "default" },
  targetCanvas = null,
  fallbackSize = null,
  referenceImages = {},
  fallbackComplexity = "medium"
}) {
  try {
    const result = await runner({ prompt, record, stage: "size_estimation", referenceImages });
    const payload = parseEstimationPayload(result);
    const generationComplexity = normalizeGenerationComplexity(payload.generation_complexity);
    const recommendedArtworkSize = normalizeArtworkSizeCandidate(
      payload.recommended_artwork_size,
      resolvedOrientation.orientation,
      aspectRatioFromCanvas(targetCanvas)
    );
    if (!recommendedArtworkSize) {
      throw new Error("Invalid recommended artwork size");
    }
    return {
      generation_complexity: generationComplexity,
      recommended_artwork_size: stampGeneratedArtworkSize(recommendedArtworkSize, generationComplexity)
    };
  } catch (error) {
    const fallbackArtworkSize = fallbackSize || { ...DEFAULT_SIZE };
    const targetAspectRatio = aspectRatioFromCanvas(targetCanvas);
    const normalizedFallbackSize = targetAspectRatio > 0
      ? normalizeArtworkSizeCandidate(
        fallbackArtworkSize,
        resolvedOrientation.orientation,
        targetAspectRatio
      ) || fallbackArtworkSize
      : fallbackArtworkSize;
    return {
      generation_complexity: normalizeGenerationComplexity(fallbackComplexity),
      recommended_artwork_size: fallbackSize
        ? normalizedFallbackSize
        : stampGeneratedArtworkSize(
          normalizedFallbackSize,
          fallbackComplexity,
          "environment_fallback",
          resolvedOrientation.orientation
        )
    };
  }
}

module.exports = {
  DEFAULT_SIZE,
  normalizeGenerationComplexity,
  stampGeneratedArtworkSize,
  resolveOrientation,
  resolveOrientationIntent,
  sizeFromComplexityAndAspectRatio,
  normalizeArtworkSizeCandidate,
  normalizeArtworkSize,
  enforceArtworkSizeOrientation,
  estimateFromEnvironment
};

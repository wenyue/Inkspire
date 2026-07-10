const COMPLEXITIES = new Set(["small", "medium", "large"]);
const TARGET_AREAS = { small: 30 * 45, medium: 45 * 68, large: 60 * 90 };
const LABELS = { small: "简洁参考尺寸", medium: "均衡参考尺寸", large: "丰富参考尺寸" };
const REASONS = {
  small: "按作品复杂度和画面比例估算，适合作为简洁作品制作参考。",
  medium: "按作品复杂度和画面比例估算，适合作为均衡作品制作参考。",
  large: "按作品复杂度和画面比例估算，适合作为丰富作品制作参考。"
};
const ORIENTATIONS = new Set(["portrait", "landscape", "square"]);
const DEFAULT_SIZE = {
  preset_id: "environment_fallback_medium_portrait",
  label: "环境估算备用尺寸",
  width_cm: 45,
  height_cm: 70,
  reason: "环境图片 AI 尺寸估算不可用时使用的均衡竖幅备用尺寸。"
};

function normalizeGenerationComplexity(value) {
  return COMPLEXITIES.has(value) ? value : "medium";
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

function legacyPaintingCompositionOrientation(value) {
  if (["横幅", "橫幅", "Horizontal", "手卷", "Handscroll", "扇面", "Fan"].includes(value)) return "landscape";
  if (["竖幅", "豎幅", "Vertical", "立轴", "立軸", "Hanging Scroll"].includes(value)) return "portrait";
  if (["斗方", "Square"].includes(value)) return "square";
  return "unknown";
}

function legacyCalligraphyLayoutOrientation(value) {
  if (["竖排", "豎排", "Vertical", "立轴", "立軸", "Hanging Scroll"].includes(value)) return "portrait";
  if (["横排", "橫排", "Horizontal", "匾额", "匾額", "Plaque", "手卷", "Handscroll", "册页", "冊頁", "Album"].includes(value)) return "landscape";
  if (["斗方", "Square"].includes(value)) return "square";
  return "unknown";
}

function answerOrientation(answers = {}) {
  if (answers.work_type === "painting") {
    const stableOrientation = orientationFromAnswerValue(answers.painting_composition_orientation);
    if (stableOrientation !== "unknown") return stableOrientation;

    const objectOrientation = orientationFromAnswerValue(answers.painting_format || answers.painting_composition);
    if (objectOrientation !== "unknown") return objectOrientation;

    const legacyOrientation = legacyPaintingCompositionOrientation(answers.painting_format || answers.painting_composition);
    if (legacyOrientation !== "unknown") return legacyOrientation;
    return "unknown";
  }

  if (answers.work_type === "calligraphy") {
    const stableOrientation = orientationFromAnswerValue(answers.calligraphy_layout_orientation);
    if (stableOrientation !== "unknown") return stableOrientation;

    const objectOrientation = orientationFromAnswerValue(answers.calligraphy_layout);
    if (objectOrientation !== "unknown") return objectOrientation;

    const legacyOrientation = legacyCalligraphyLayoutOrientation(answers.calligraphy_layout);
    if (legacyOrientation !== "unknown") return legacyOrientation;
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

function normalizeArtworkSizeCandidate(value, orientation = "unknown") {
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
  if (!oriented || oriented.width_cm <= 0 || oriented.height_cm <= 0 || oriented.width_cm > 300 || oriented.height_cm > 300) {
    return null;
  }
  return oriented;
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
      resolvedOrientation.orientation
    );
    if (!recommendedArtworkSize) {
      throw new Error("Invalid recommended artwork size");
    }
    return {
      generation_complexity: generationComplexity,
      recommended_artwork_size: recommendedArtworkSize
    };
  } catch (error) {
    return {
      generation_complexity: normalizeGenerationComplexity(fallbackComplexity),
      recommended_artwork_size: fallbackSize || { ...DEFAULT_SIZE }
    };
  }
}

module.exports = {
  DEFAULT_SIZE,
  normalizeGenerationComplexity,
  resolveOrientation,
  resolveOrientationIntent,
  sizeFromComplexityAndAspectRatio,
  normalizeArtworkSizeCandidate,
  normalizeArtworkSize,
  enforceArtworkSizeOrientation,
  estimateFromEnvironment
};

function questionMap(config, type) {
  const questions = config.questions[type] || [];
  return new Map(questions.map((question) => [question.id, question.title["zh-Hans"]]));
}

function answerLabel(id, labels) {
  if (id === "text") {
    return "文字";
  }
  return labels.get(id) || id;
}

function answerLines(answers, labels) {
  return Object.keys(answers || {})
    .sort()
    .map((id) => `${answerLabel(id, labels)}: ${answers[id]}`);
}

function fillTemplate(template = "", answers = {}) {
  return String(template).replace(/\{\{([a-z0-9_]+)\}\}/gi, (match, key) => answers[key] || "由墨起决定");
}

function compactLines(lines) {
  return lines.filter((line) => typeof line === "string" && line.length > 0);
}

function renderSections(sections = [], variables = {}) {
  return sections.flatMap((section) => {
    const lines = compactLines((section.lines || []).map((line) => fillTemplate(line, variables)));
    if (lines.length === 0) return [];
    return compactLines([section.title, ...lines]);
  });
}

function jsonBlock(value) {
  return JSON.stringify(value || {}, null, 2);
}

function promptBrief(promptConfig, variables) {
  return fillTemplate(promptConfig.brief || promptConfig.template || "", variables);
}

const GENERATION_COMPLEXITY_COPY = {
  small: "简洁：画面克制，留白明确，细节密度较低。",
  medium: "均衡：细节与留白平衡，适合常规作品生成。",
  large: "丰富：层次更充分，细节承载更多，适合主视觉作品。"
};

function generationComplexityCopy(value) {
  return GENERATION_COMPLEXITY_COPY[value] || GENERATION_COMPLEXITY_COPY.medium;
}

function buildArtworkPrompt({
  type,
  answers = {},
  conversationNotes = "",
  generationComplexity = "medium",
  recommendedArtworkSize = null,
  resolvedOrientation = null,
  config
}) {
  const promptConfig = config.prompts[type];
  if (!promptConfig) {
    throw new Error(`Unknown artwork prompt type: ${type}`);
  }

  const labels = questionMap(config, type);
  const lines = compactLines([
    promptConfig.system,
    promptBrief(promptConfig, answers),
    ...renderSections(promptConfig.sections, answers),
    "用户选择:",
    ...answerLines(answers, labels),
    "画面复杂度:",
    generationComplexityCopy(generationComplexity)
  ]);

  if (recommendedArtworkSize?.width_cm != null && recommendedArtworkSize?.height_cm != null) {
    lines.push(
      "建议制作尺寸:",
      `约 ${recommendedArtworkSize.width_cm} × ${recommendedArtworkSize.height_cm} cm。`,
      recommendedArtworkSize.reason ? `依据: ${recommendedArtworkSize.reason}` : "该尺寸来自环境图片估算或制作建议。"
    );
  }

  if (resolvedOrientation?.orientation && resolvedOrientation.orientation !== "unknown") {
    lines.push(
      "最终方向:",
      `方向: ${resolvedOrientation.orientation}`,
      `来源: ${resolvedOrientation.source || "unknown"}`,
      "该最终方向必须覆盖此前构图选择与环境图片判断。"
    );
  }

  if (conversationNotes) {
    lines.push("用户补充:", conversationNotes);
  }

  return lines.join("\n");
}

function buildSizeEstimationPrompt({
  record,
  answers = {},
  conversationNotes = "",
  resolvedOrientation = { orientation: "portrait", source: "default" },
  config
}) {
  const promptConfig = config.prompts?.sizeEstimationPrompt;
  if (!promptConfig) {
    throw new Error("Missing sizeEstimationPrompt config");
  }
  const type = record?.type || answers.work_type || "artwork";
  const labels = config?.questions?.[type] ? questionMap(config, type) : new Map();
  const readableAnswers = answerLines(answers, labels);
  return compactLines([
    promptConfig.system,
    promptConfig.task,
    ...(promptConfig.responseRules || []),
    "最终方向:",
    `orientation: ${resolvedOrientation.orientation || "portrait"}`,
    `source: ${resolvedOrientation.source || "default"}`,
    ...(promptConfig.orientationRules || []),
    "JSON schema:",
    jsonBlock(promptConfig.schema),
    "尺寸要求:",
    ...(promptConfig.sizeRules || []),
    ...(promptConfig.complexityRules || []),
    promptConfig.recordSectionTitle || "记录信息:",
    jsonBlock({
      id: record?.id || "",
      type,
      title: record?.title || ""
    }),
    promptConfig.answersSectionTitle || "用户答案:",
    readableAnswers.length ? readableAnswers.join("\n") : "无",
    promptConfig.rawAnswersSectionTitle || "用户答案原始字段:",
    jsonBlock(answers || {}),
    promptConfig.notesSectionTitle || "用户补充:",
    conversationNotes || "无"
  ]).join("\n");
}

function buildFusionPrompt({ record, config, referenceImages = {} }) {
  const promptConfig = config.prompts?.fusion || {
    system: "你是墨起的效果图生成提示词助手。",
    brief: "创作一幅效果图：把艺术作品={{painting}}真实摆放到环境图片中，书法或文字信息={{calligraphy}}，整体关系={{relationship}}。"
  };
  const variables = {
    painting: record.painting_description || record.artwork_path || "由墨起决定",
    calligraphy: record.calligraphy_description || record.artwork_path || "由墨起决定",
    relationship: record.relationship || "雅化原图气韵，融合中国画、书法与美光"
  };
  const recommendedArtworkSize = record.recommended_artwork_size;
  const recommendedArtworkSizeLine = recommendedArtworkSize?.width_cm != null && recommendedArtworkSize?.height_cm != null
    ? `作品建议制作尺寸约 ${recommendedArtworkSize.width_cm} × ${recommendedArtworkSize.height_cm} cm，请按这个真实尺寸感摆放到环境图片中。`
    : "";

  return compactLines([
    promptConfig.system,
    promptBrief(promptConfig, variables),
    ...renderSections(promptConfig.sections, variables),
    recommendedArtworkSizeLine,
    `原始照片: ${record.source_photo_path}`,
    `艺术作品: ${record.artwork_path}`,
    referenceImages.environment ? `环境照片参考图文件: ${referenceImages.environment}` : "",
    referenceImages.artwork ? `作品参考图文件: ${referenceImages.artwork}` : ""
  ]).join("\n");
}

module.exports = { buildArtworkPrompt, buildFusionPrompt, buildSizeEstimationPrompt };

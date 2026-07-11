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
  return String(template).replace(/\{\{([a-z0-9_]+)\}\}/gi, (match, key) => answers[key] || "未指定");
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
  small: "疏朗：主体集中，虚处充足，气口舒展。",
  medium: "均衡：疏密相间，虚实相生，主次清楚。",
  large: "繁密：密处交织有序，虚处仍留气口与呼吸。"
};

function generationComplexityCopy(value) {
  return GENERATION_COMPLEXITY_COPY[value] || GENERATION_COMPLEXITY_COPY.medium;
}

function paintingMoodLines(promptConfig, answers) {
  const mood = answers.painting_mood;
  const guidance = promptConfig.moodGuidance?.[mood];
  return guidance ? ["气质的可观察落实:", `${mood}: ${guidance}`] : [];
}

function paintingTechniqueLines(promptConfig, answers) {
  const brushwork = answers.painting_brushwork;
  const palette = answers.painting_palette;
  if (!brushwork || !palette) return [];

  const resolution = promptConfig.techniqueResolution || {};
  const brushworkGuidance = resolution.brushwork?.[brushwork];
  const paletteGuidance = resolution.palette?.[palette];
  if (!brushworkGuidance || !paletteGuidance) return [];

  const pairGuidance = resolution.pairOverrides?.[`${brushwork}|${palette}`] || {};
  return compactLines([
    "技法与设色兼容方案:",
    `主导技法: ${brushwork}。${brushworkGuidance.primary}`,
    `辅助设色: ${palette}。${pairGuidance.support || paletteGuidance}`,
    `禁用冲突效果: ${pairGuidance.avoid || brushworkGuidance.avoid}`,
    resolution.sharedAvoid
  ]);
}

function isClassicReference(answers = {}) {
  return answers.creation_mode === "classic_reference" && Boolean(answers.classic_artwork_id);
}

function isNonChineseClassicReference(answers = {}) {
  if (!isClassicReference(answers)) return false;
  const region = String(answers.classic_artwork_region || "");
  return /日本|Japan|韩国|韓國|朝鲜|朝鮮|Korea/i.test(region);
}

function classicReferenceLines(answers = {}) {
  if (!isClassicReference(answers)) {
    return [];
  }

  const region = String(answers.classic_artwork_region || "");
  let traditionBoundary = "东亚绘画传统边界: 保留原作所属地域与时代的绘画传统，不得在地域不明时擅自归入中国水墨画。";
  if (/中国|China/i.test(region)) {
    traditionBoundary = "中国绘画传统边界: 保留原作所属时代的构图、笔墨、设色与材质关系，不以泛化水墨滤镜替代具体传统。";
  } else if (/日本|Japan/i.test(region)) {
    traditionBoundary = "日本绘画传统边界: 保留原作所属日本绘画传统的构图、线描、设色与材质关系，不得自动改写为中国水墨画；不得强行套用中国画技法清单。";
  } else if (/韩国|韓國|朝鲜|朝鮮|Korea/i.test(region)) {
    traditionBoundary = "朝鲜半岛绘画传统边界: 保留原作所属朝鲜半岛绘画传统的构图、笔墨、设色与材质关系，不得自动改写为中国水墨画；不得强行套用中国画技法清单。";
  }

  return compactLines([
    "东亚历代绘画参考:",
    `参考作品: ${answers.classic_artwork_title || "未指定"}`,
    `作者: ${answers.classic_artwork_artist || "未指定"}`,
    `年代: ${answers.classic_artwork_period || "未指定"}`,
    `地域: ${answers.classic_artwork_region || "未指定"}`,
    `分类: ${answers.classic_artwork_category || "未指定"}`,
    answers.classic_artwork_reference ? `参考重点: ${answers.classic_artwork_reference}` : "",
    traditionBoundary,
    "提取原作的构图、用笔、设色、气韵与空间关系，生成一幅新的、遵守上述传统边界的作品。",
    "不直接复制原作，不照搬题跋印章，不把原作图片贴入画面。",
    "只生成作品本身，不要画框、展墙、相框、博物馆陈列背景。"
  ]);
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
  const usesEastAsianClassicOpening = type === "painting" && isNonChineseClassicReference(answers);
  const systemPrompt = usesEastAsianClassicOpening
    ? promptConfig.eastAsianClassicSystem || promptConfig.system
    : promptConfig.system;
  const briefConfig = usesEastAsianClassicOpening
    ? { brief: promptConfig.eastAsianClassicBrief || promptConfig.brief }
    : promptConfig;
  const paintingGuidance = type === "painting"
    ? [...paintingMoodLines(promptConfig, answers), ...paintingTechniqueLines(promptConfig, answers)]
    : [];
  const lines = compactLines([
    systemPrompt,
    promptBrief(briefConfig, answers),
    ...renderSections(promptConfig.sections, answers),
    ...paintingGuidance,
    "用户选择:",
    ...answerLines(answers, labels),
    ...classicReferenceLines(answers),
    "画面疏密与虚实倾向:",
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

  lines.push(...renderSections(promptConfig.finalSections, answers));

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
    painting: record.painting_description || record.artwork_path || "作品未指定",
    calligraphy: record.calligraphy_description || record.artwork_path || "作品未指定",
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

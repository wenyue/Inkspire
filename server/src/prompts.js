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

function fillTemplate(template, answers) {
  return template.replace(/\{\{([a-z0-9_]+)\}\}/gi, (match, key) => answers[key] || "由墨起决定");
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
  const lines = [
    promptConfig.system,
    fillTemplate(promptConfig.template, answers),
    "用户选择:",
    ...answerLines(answers, labels),
    "画面复杂度:",
    generationComplexityCopy(generationComplexity)
  ];

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
  const type = record?.type || answers.work_type || "artwork";
  const labels = config?.questions?.[type] ? questionMap(config, type) : new Map();
  const readableAnswers = answerLines(answers, labels);
  return [
    "你是墨起的环境图片尺寸与复杂度估算助手。",
    "根据环境图片参考，估算艺术作品在真实空间中合适的制作尺寸和生成复杂度。",
    "只返回 JSON，不要返回 Markdown、解释文字或代码块。",
    "最终方向:",
    `orientation: ${resolvedOrientation.orientation || "portrait"}`,
    `source: ${resolvedOrientation.source || "default"}`,
    "该最终方向是硬约束。环境图片不能改变用户补充说明或问题选择已经确定的方向，只能在该方向内估算尺寸。",
    "JSON schema:",
    JSON.stringify({
      generation_complexity: "small | medium | large",
      recommended_artwork_size: {
        preset_id: "string",
        label: "string",
        width_cm: "number",
        height_cm: "number",
        reason: "string"
      }
    }, null, 2),
    "尺寸要求:",
    "width_cm 和 height_cm 使用厘米，必须是合理正数；按最终方向输出，portrait 高于宽，landscape 宽于高，square 宽高相等。",
    "generation_complexity 只允许 small、medium、large；按环境可承载的作品细节和视觉主次估算。",
    "记录信息:",
    JSON.stringify({
      id: record?.id || "",
      type,
      title: record?.title || ""
    }, null, 2),
    "用户答案:",
    readableAnswers.length ? readableAnswers.join("\n") : "无",
    "用户答案原始字段:",
    JSON.stringify(answers || {}, null, 2),
    "用户补充:",
    conversationNotes || "无"
  ].join("\n");
}

function buildFusionPrompt({ record, config, referenceImages = {} }) {
  const promptConfig = config.prompts?.fusion || {
    system: "你是墨起的效果图生成提示词助手。",
    template: "创作一幅效果图：把艺术作品={{painting}}真实摆放到环境图片中，书法或文字信息={{calligraphy}}，整体关系={{relationship}}。"
  };
  const recommendedArtworkSize = record.recommended_artwork_size;
  const recommendedArtworkSizeLine = recommendedArtworkSize?.width_cm != null && recommendedArtworkSize?.height_cm != null
    ? `作品建议制作尺寸约 ${recommendedArtworkSize.width_cm} × ${recommendedArtworkSize.height_cm} cm，请按这个真实尺寸感摆放到环境图片中。`
    : "";

  return [
    promptConfig.system,
    fillTemplate(promptConfig.template, {
      painting: record.painting_description || record.artwork_path || "由墨起决定",
      calligraphy: record.calligraphy_description || record.artwork_path || "由墨起决定",
      relationship: record.relationship || "雅化原图气韵，融合中国画、书法与美光"
    }),
    "融合图要求:",
    "生成真实摆放效果图：以环境照片和作品图作为参考，重新渲染摆放作品挂在或摆放在环境中的真实效果。",
    "这不是简单叠加、贴图或把作品平面覆盖到底图上；需要匹配环境的透视、尺度、墙面或陈设位置、遮挡关系、阴影、反光与光照方向。",
    "优先保持环境照片的真实空间结构，适度雅化原始照片并保留人物或物件神韵。",
    "使用自然美光并加入灯光烘托，避免廉价滤镜感。",
    "保持作品内容完整清晰，不裁剪作品主体。",
    recommendedArtworkSizeLine,
    `原始照片: ${record.source_photo_path}`,
    `艺术作品: ${record.artwork_path}`,
    referenceImages.environment ? `环境照片参考图文件: ${referenceImages.environment}` : "",
    referenceImages.artwork ? `作品参考图文件: ${referenceImages.artwork}` : ""
  ].filter(Boolean).join("\n");
}

module.exports = { buildArtworkPrompt, buildFusionPrompt, buildSizeEstimationPrompt };

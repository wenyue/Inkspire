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

function buildArtworkPrompt({ type, answers = {}, conversationNotes = "", config }) {
  const promptConfig = config.prompts[type];
  if (!promptConfig) {
    throw new Error(`Unknown artwork prompt type: ${type}`);
  }

  const labels = questionMap(config, type);
  const lines = [
    promptConfig.system,
    fillTemplate(promptConfig.template, answers),
    "用户选择:",
    ...answerLines(answers, labels)
  ];

  if (conversationNotes) {
    lines.push("用户补充:", conversationNotes);
  }

  return lines.join("\n");
}

function buildFusionPrompt({ record, config }) {
  return [
    config.prompts.fusion.system,
    fillTemplate(config.prompts.fusion.template, {
      painting: record.painting_description || record.artwork_path || "由墨起决定",
      calligraphy: record.calligraphy_description || record.artwork_path || "由墨起决定",
      relationship: record.relationship || "雅化原图气韵，融合中国画、书法与美光"
    }),
    "融合图要求:",
    "雅化原始照片，保留人物或物件神韵。",
    "使用美光，避免廉价滤镜感。",
    `原始照片: ${record.source_photo_path}`,
    `艺术作品: ${record.artwork_path}`
  ].join("\n");
}

module.exports = { buildArtworkPrompt, buildFusionPrompt };

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { loadConfig } = require("../src/config");
const { buildArtworkPrompt, buildFusionPrompt, buildSizeEstimationPrompt } = require("../src/prompts");

const root = path.resolve(__dirname, "../..");

test("painting prompt contains 中国画, selected answers, and user notes", () => {
  const prompt = buildArtworkPrompt({
    type: "painting",
    answers: {
      painting_subject: "山水",
      painting_brushwork: "写意",
      painting_palette: "青绿"
    },
    conversationNotes: "请保留远山云气",
    config: loadConfig(root)
  });

  assert.match(prompt, /中国画/);
  assert.match(prompt, /想画什么内容？: 山水/);
  assert.match(prompt, /偏好哪种笔墨？: 写意/);
  assert.match(prompt, /偏好哪种设色？: 青绿/);
  assert.match(prompt, /请保留远山云气/);
});

test("calligraphy prompt contains 书法, selected answers, and user notes", () => {
  const prompt = buildArtworkPrompt({
    type: "calligraphy",
    answers: {
      text: "明月松间照",
      calligraphy_script: "行书",
      calligraphy_spirit: "雄强"
    },
    conversationNotes: "落款保持含蓄",
    config: loadConfig(root)
  });

  assert.match(prompt, /书法/);
  assert.match(prompt, /文字: 明月松间照/);
  assert.match(prompt, /偏好哪种书体？: 行书/);
  assert.match(prompt, /希望书法是什么气息？: 雄强/);
  assert.match(prompt, /落款保持含蓄/);
});

test("calligraphy prompt labels the selected scroll format as 形制", () => {
  const prompt = buildArtworkPrompt({
    type: "calligraphy",
    answers: {
      text: "明月松间照",
      calligraphy_layout: "立轴"
    },
    config: loadConfig(root)
  });

  assert.match(prompt, /形制=立轴/);
  assert.doesNotMatch(prompt, /章法=立轴/);
});

test("painting prompt requires disciplined composition and rejects unmotivated decorative effects", () => {
  const prompt = buildArtworkPrompt({
    type: "painting",
    answers: {
      painting_subject: "山水",
      painting_brushwork: "写意",
      painting_palette: "青绿",
      painting_mood: "清旷",
      painting_format: "横幅"
    },
    config: loadConfig(root)
  });

  assert.match(prompt, /构图经营/);
  assert.match(prompt, /题材/);
  assert.match(prompt, /空间秩序/);
  assert.match(prompt, /留白/);
  assert.match(prompt, /焦点层级/);
  assert.match(prompt, /统一暖色仿古滤镜/);
  assert.match(prompt, /电影式舞台灯光/);
  assert.match(prompt, /伪三维或浮雕质感/);
  assert.match(prompt, /无意义的装饰性墨汁飞溅/);
  assert.match(prompt, /素材化的雾气叠加/);
  assert.match(prompt, /机械重复的纹理/);
  assert.match(prompt, /装饰性红印或伪造落款/);
  assert.match(prompt, /泼墨、烟云、古色、金碧/);
  assert.match(prompt, /并非一律禁用/);
  assert.match(prompt, /伪题识、伪文字、水印、品牌标识/);
  assert.match(prompt, /不得仿作具体在世艺术家/);
  assert.doesNotMatch(prompt, /落款等按用户选择/);
});

test("calligraphy prompt preserves the exact main text and requires real brush-written structure", () => {
  const prompt = buildArtworkPrompt({
    type: "calligraphy",
    answers: {
      text: "明月松间照",
      calligraphy_script: "行书",
      calligraphy_spirit: "清劲",
      calligraphy_layout: "立轴",
      calligraphy_material: "素宣"
    },
    config: loadConfig(root)
  });

  assert.match(prompt, /正文必须逐字准确再现用户提供的“明月松间照”/);
  assert.match(prompt, /不增、不删、不替换、不调换顺序/);
  assert.match(prompt, /英文字母、阿拉伯数字、伪字或臆造内容/);
  assert.match(prompt, /起收、提按、转折、行气/);
  assert.match(prompt, /字间与行间关系/);
  assert.match(prompt, /墨色变化/);
  assert.match(prompt, /书体与形制/);
  assert.match(prompt, /电脑字体贴图/);
  assert.match(prompt, /仿毛笔滤镜/);
  assert.match(prompt, /装饰性难辨字形/);
  assert.match(prompt, /正文是视觉主体/);
  assert.match(prompt, /书法章法/);
  assert.match(prompt, /形制=立轴/);
  assert.doesNotMatch(prompt, /落款等按用户选择/);
});

test("artwork prompts keep inscriptions closed even when free-text notes request them", () => {
  const config = loadConfig(root);
  const prompts = [
    buildArtworkPrompt({
      type: "painting",
      answers: { painting_subject: "山水" },
      conversationNotes: "请题款署名并钤一枚印章",
      config
    }),
    buildArtworkPrompt({
      type: "calligraphy",
      answers: { text: "明月松间照" },
      conversationNotes: "请题款署名并钤一枚印章",
      config
    })
  ];

  for (const prompt of prompts) {
    assert.match(prompt, /当前版本.*无论补充说明如何.*不得添加题识、题款、落款、签名或印章/);
    assert.match(prompt, /专用结构化功能/);
    assert.doesNotMatch(prompt, /只有用户.*明确要求时才可加入/);
    assert.ok(prompt.lastIndexOf("用户补充:") < prompt.lastIndexOf("无论补充说明如何"));
  }
});

test("calligraphy prompt makes the submitted text the only text in the image", () => {
  const prompt = buildArtworkPrompt({
    type: "calligraphy",
    answers: { text: "明月松间照" },
    config: loadConfig(root)
  });

  assert.match(prompt, /“明月松间照”是画面中的唯一正文/);
  assert.match(prompt, /画面不得出现任何其他文字/);
  assert.match(prompt, /现成诗句/);
});

test("calligraphy prompt constrains expressive effects to real brush logic", () => {
  const prompt = buildArtworkPrompt({
    type: "calligraphy",
    answers: {
      text: "明月松间照",
      calligraphy_script: "行书"
    },
    config: loadConfig(root)
  });

  assert.doesNotMatch(prompt, /强调书法章法、笔势、墨色、飞白/);
  assert.match(prompt, /均匀描边/);
  assert.match(prompt, /过度飞白/);
  assert.match(prompt, /无控制涨墨/);
  assert.match(prompt, /夸张连笔/);
  assert.match(prompt, /服从提按、书写节奏、所选书体与可读性/);
});

test("painting prompt selects traditional techniques instead of requiring a technique soup", () => {
  const prompt = buildArtworkPrompt({
    type: "painting",
    answers: {
      painting_subject: "花鸟",
      painting_brushwork: "工笔"
    },
    config: loadConfig(root)
  });

  assert.match(prompt, /勾、皴、擦、点、染.*根据题材、画法与物象结构择其所需，不求齐备/);
  assert.match(prompt, /所用技法.*服务于物象结构/);
});

test("artwork prompt describes generation density before user notes and final direction", () => {
  const prompt = buildArtworkPrompt({
    type: "painting",
    answers: {
      painting_subject: "山水",
      painting_format: "横幅"
    },
    conversationNotes: "请保留远山云气",
    generationComplexity: "large",
    resolvedOrientation: {
      orientation: "portrait",
      source: "environment-image"
    },
    config: loadConfig(root)
  });

  const complexityIndex = prompt.indexOf("画面疏密与虚实倾向:");
  const directionIndex = prompt.indexOf("最终方向:");
  const notesIndex = prompt.indexOf("用户补充:");

  assert.notEqual(complexityIndex, -1);
  assert.doesNotMatch(prompt, /画面复杂度:/);
  assert.notEqual(directionIndex, -1);
  assert.notEqual(notesIndex, -1);
  assert.ok(complexityIndex < notesIndex);
  assert.ok(directionIndex < notesIndex);
  assert.match(prompt, /繁密：密处交织有序，虚处仍留气口与呼吸。/);
  assert.doesNotMatch(prompt, /信息量较低|层次丰富但仍有虚处/);
  assert.match(prompt, /portrait/);
  assert.match(prompt, /environment-image/);
  assert.match(prompt, /必须覆盖此前构图选择与环境图片判断/);
});

test("artwork prompt maps every generation density choice to artistic guidance", () => {
  const config = loadConfig(root);
  const cases = [
    ["small", "疏朗：主体集中，虚处充足，气口舒展。"],
    ["medium", "均衡：疏密相间，虚实相生，主次清楚。"],
    ["large", "繁密：密处交织有序，虚处仍留气口与呼吸。"]
  ];

  for (const [generationComplexity, expectedCopy] of cases) {
    const prompt = buildArtworkPrompt({
      type: "painting",
      generationComplexity,
      config
    });

    assert.match(prompt, new RegExp(expectedCopy));
    assert.doesNotMatch(prompt, /信息量较低|层次丰富但仍有虚处/);
  }
});

test("prompt config uses format and rubbing texture terminology for calligraphy", () => {
  const config = loadConfig(root);
  const textQuestion = config.questions.calligraphy.find(({ id }) => id === "text");
  const formatQuestion = config.questions.calligraphy.find(({ id }) => id === "calligraphy_layout");
  const materialQuestion = config.questions.calligraphy.find(({ id }) => id === "calligraphy_material");

  assert.deepEqual(textQuestion.helper_text, {
    "zh-Hans": "这会作为书法正文进入生成；后面再选择书体、气息、形制和纸墨。",
    "zh-Hant": "這會作為書法正文進入生成；後面再選擇書體、氣息、形制和紙墨。",
    en: "This becomes the calligraphy wording; script, spirit, format, and material come next."
  });
  assert.equal(formatQuestion.preview_prompt, "书法形制，立轴横幅斗方手卷册页");
  assert.deepEqual(formatQuestion.title, {
    "zh-Hans": "想要哪种形制？",
    "zh-Hant": "想要哪種形制？",
    en: "Which format should it take?"
  });
  assert.equal(materialQuestion.preview_prompt, "书法纸墨质感，素宣仿古洒金碑拓肌理");
  assert.equal(materialQuestion.options["zh-Hans"].at(-1), "碑拓肌理");
  assert.equal(materialQuestion.options["zh-Hant"].at(-1), "碑拓肌理");
  assert.equal(materialQuestion.options.en.at(-1), "Rubbing Texture");
});

test("artwork prompt includes recommended production size when available", () => {
  const prompt = buildArtworkPrompt({
    type: "painting",
    answers: {
      painting_subject: "山水"
    },
    generationComplexity: "medium",
    recommendedArtworkSize: {
      width_cm: 50,
      height_cm: 80,
      reason: "按玄关墙面估算"
    },
    config: loadConfig(root)
  });

  assert.match(prompt, /建议制作尺寸/);
  assert.match(prompt, /50 × 80 cm/);
  assert.match(prompt, /按玄关墙面估算/);
});

test("artwork prompt asks to generate only the artwork without external decorations", () => {
  const config = loadConfig(root);
  const paintingPrompt = buildArtworkPrompt({
    type: "painting",
    answers: {
      painting_subject: "山水"
    },
    config
  });
  const calligraphyPrompt = buildArtworkPrompt({
    type: "calligraphy",
    answers: {
      text: "明月松间照"
    },
    config
  });

  assert.match(paintingPrompt, /只生成作品本身/);
  assert.match(paintingPrompt, /不要添加作品外的装饰/);
  assert.match(paintingPrompt, /相框/);
  assert.match(paintingPrompt, /墙面/);
  assert.match(calligraphyPrompt, /只生成作品本身/);
  assert.match(calligraphyPrompt, /不要添加作品外的装饰/);
});

test("classic reference prompt asks for a new painting without frames or direct copying", () => {
  const prompt = buildArtworkPrompt({
    type: "painting",
    answers: {
      work_type: "painting",
      creation_mode: "classic_reference",
      classic_artwork_id: "classic-1",
      classic_artwork_title: "溪山行旅图",
      classic_artwork_artist: "范宽",
      classic_artwork_period: "北宋",
      classic_artwork_region: "中国",
      classic_artwork_category: "山水",
      classic_artwork_reference: "参考其高远构图、山体结构、皴法层次和沉雄气象。"
    },
    generationComplexity: "medium",
    config: loadConfig(root)
  });

  assert.match(prompt, /古代名作参考/);
  assert.match(prompt, /溪山行旅图/);
  assert.match(prompt, /范宽/);
  assert.match(prompt, /生成一幅新的/);
  assert.match(prompt, /不直接复制原作/);
  assert.match(prompt, /不要画框、展墙、相框、博物馆陈列背景/);
});

test("artwork prompt renders configured sections instead of hardcoded rule blocks", () => {
  const config = loadConfig(root);
  config.prompts.painting.sections = [
    {
      title: "测试规则",
      lines: ["配置规则 {{painting_subject}}"]
    }
  ];

  const prompt = buildArtworkPrompt({
    type: "painting",
    answers: {
      painting_subject: "山水"
    },
    config
  });

  assert.match(prompt, /测试规则/);
  assert.match(prompt, /配置规则 山水/);
});

test("size estimation prompt asks for JSON only with final orientation, answers, and notes", () => {
  const prompt = buildSizeEstimationPrompt({
    record: { id: "record-size", type: "painting" },
    answers: {
      work_type: "painting",
      painting_subject: "山水"
    },
    conversationNotes: "希望竖幅挂在玄关",
    resolvedOrientation: { orientation: "portrait", source: "notes" },
    config: loadConfig(root)
  });

  assert.match(prompt, /只返回 JSON/);
  assert.match(prompt, /generation_complexity/);
  assert.match(prompt, /recommended_artwork_size/);
  assert.match(prompt, /portrait/);
  assert.match(prompt, /notes/);
  assert.match(prompt, /环境图片不能改变/);
  assert.match(prompt, /painting_subject/);
  assert.match(prompt, /希望竖幅挂在玄关/);
  assert.match(prompt, /画面疏密、虚实关系与视觉主次/);
  assert.match(prompt, /不是作品质量或细节等级判断/);
  assert.doesNotMatch(prompt, /环境可承载的作品细节/);
});

test("size estimation prompt renders rules and schema from config", () => {
  const config = loadConfig(root);
  config.prompts.sizeEstimationPrompt.responseRules = ["配置响应规则"];
  config.prompts.sizeEstimationPrompt.schema = {
    custom_field: "string"
  };

  const prompt = buildSizeEstimationPrompt({
    record: { id: "record-size-config", type: "painting" },
    answers: {
      work_type: "painting"
    },
    resolvedOrientation: { orientation: "square", source: "test" },
    config
  });

  assert.match(prompt, /配置响应规则/);
  assert.match(prompt, /custom_field/);
  assert.match(prompt, /square/);
  assert.match(prompt, /test/);
});

test("fusion prompt contains 融合图, 雅化, 美光, original photo path, and artwork path", () => {
  const prompt = buildFusionPrompt({
    record: {
      id: "fusion-1",
      source_photo_path: "records/fusion-1/source-photo.webp",
      artwork_path: "records/fusion-1/artwork.webp"
    },
    config: loadConfig(root)
  });

  assert.match(prompt, /融合图/);
  assert.match(prompt, /雅化/);
  assert.match(prompt, /美光/);
  assert.match(prompt, /records\/fusion-1\/source-photo\.webp/);
  assert.match(prompt, /records\/fusion-1\/artwork\.webp/);
});

test("fusion prompt asks to place the artwork into the environment with lighting", () => {
  const prompt = buildFusionPrompt({
    record: {
      id: "fusion-2",
      source_photo_path: "records/fusion-2/source-photo.webp",
      artwork_path: "records/fusion-2/artwork.webp"
    },
    config: loadConfig(root)
  });

  assert.match(prompt, /环境图片/);
  assert.match(prompt, /合适位置/);
  assert.match(prompt, /摆放作品/);
  assert.match(prompt, /灯光/);
  assert.match(prompt, /烘托/);
});

test("fusion prompt asks for a rendered placement instead of a flat overlay", () => {
  const prompt = buildFusionPrompt({
    record: {
      id: "fusion-3",
      source_photo_path: "records/fusion-3/source-photo.webp",
      artwork_path: "records/fusion-3/artwork.webp"
    },
    config: loadConfig(root)
  });

  assert.match(prompt, /真实摆放效果/);
  assert.match(prompt, /不是简单叠加/);
  assert.match(prompt, /重新渲染/);
  assert.match(prompt, /透视/);
  assert.match(prompt, /阴影/);
});

test("fusion prompt renders static requirement sections from config", () => {
  const config = loadConfig(root);
  config.prompts.fusion.sections = [
    {
      title: "测试融合规则",
      lines: ["配置融合规则 {{relationship}}"]
    }
  ];

  const prompt = buildFusionPrompt({
    record: {
      id: "fusion-config",
      source_photo_path: "records/fusion-config/source-photo.webp",
      artwork_path: "records/fusion-config/artwork.webp",
      relationship: "挂入玄关"
    },
    config
  });

  assert.match(prompt, /测试融合规则/);
  assert.match(prompt, /配置融合规则 挂入玄关/);
});

test("fusion prompt includes recommended artwork size with real size feeling", () => {
  const prompt = buildFusionPrompt({
    record: {
      id: "fusion-size",
      source_photo_path: "records/fusion-size/source-photo.webp",
      artwork_path: "records/fusion-size/artwork.webp",
      recommended_artwork_size: {
        width_cm: 45,
        height_cm: 70
      }
    },
    config: loadConfig(root)
  });

  assert.match(prompt, /45 × 70 cm/);
  assert.match(prompt, /真实尺寸感/);
});

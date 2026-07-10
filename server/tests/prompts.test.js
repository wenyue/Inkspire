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

test("artwork prompt includes generation complexity before user notes and final direction", () => {
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

  const complexityIndex = prompt.indexOf("画面复杂度:");
  const directionIndex = prompt.indexOf("最终方向:");
  const notesIndex = prompt.indexOf("用户补充:");

  assert.notEqual(complexityIndex, -1);
  assert.notEqual(directionIndex, -1);
  assert.notEqual(notesIndex, -1);
  assert.ok(complexityIndex < notesIndex);
  assert.ok(directionIndex < notesIndex);
  assert.match(prompt, /丰富：层次更充分，细节承载更多，适合主视觉作品。/);
  assert.match(prompt, /portrait/);
  assert.match(prompt, /environment-image/);
  assert.match(prompt, /必须覆盖此前构图选择与环境图片判断/);
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

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadConfig, publicConfig } = require("../src/config");

const root = path.resolve(__dirname, "../..");

test("loads required Inkspire configuration", () => {
  const config = loadConfig(root);
  assert.equal(config._projectRoot, root);
  assert.equal(config.app.name, "墨起");
  assert.equal(config.app.defaultLocale, "zh-Hans");
  assert.equal(config.app.runtime.codexCommand, "codex");
  assert.equal(config.app.runtime.codexModel, "gpt-5.5");
  assert.equal(config.app.runtime.codexReasoningEffort, "medium");
  assert.equal(config.app.runtime.generatedImagesRoot, "");
  assert.deepEqual(config.app.runtime.generationCanvas, {
    width: 1024,
    height: 1536,
    aspectRatio: "2:3"
  });
  assert.equal(config.app.image.outputFormat, "webp");
  assert.equal(config.app.image.webpQuality, 82);
  assert.equal(config.experts[0].id, "platform_artisan_match");
  assert.equal(config.experts[0].name["zh-Hans"], "平台合作雅匠");
  assert.equal(config.experts[0].name.en, "Platform artisan matching");
  assert.equal(config.experts[0].region["zh-Hant"], "承接人待確認");
  assert.deepEqual(config.experts[0].services.map((service) => service.id), [
    "expert_custom",
    "expert_guided"
  ]);
  assert.ok(config.questions.painting.length >= 5);
  assert.ok(config.questions.calligraphy.length >= 5);
  assert.equal(config.questions.calligraphy[0].id, "text");
  assert.equal(config.questions.calligraphy[0].input_type, "textarea");
  assert.match(config.questions.calligraphy[0].placeholder["zh-Hans"], /祝福语|诗句|词句/);
  const retiredPseudoCalligraphyAssets = [
    "client/public/previews/calligraphy-script.svg",
    "client/public/previews/questions/calligraphy-script.webp",
    ...["0-regular", "1-running", "2-cursive", "3-clerical", "3-inkspire-decide", "4-seal"]
      .map((suffix) => `client/public/previews/options/calligraphy-script-${suffix}.webp`)
  ];
  for (const asset of retiredPseudoCalligraphyAssets) {
    assert.equal(fs.existsSync(path.join(root, asset)), false, `${asset} must not be published`);
  }
  for (const question of [...config.questions.painting, ...config.questions.calligraphy]) {
    if (question.id === "calligraphy_script") {
      assert.equal(question.preview_image, undefined);
      assert.equal(question.option_preview_images, undefined);
      assert.equal(question.option_source_notes.length, question.options["zh-Hans"].length);
      continue;
    } else {
      assert.match(question.preview_image, /^\/previews\/questions\/.+\.webp$/);
      assert.ok(fs.existsSync(path.join(root, "client/public", question.preview_image)));
    }
    if (question.input_type === "textarea") {
      assert.equal(question.options, undefined);
      assert.equal(question.option_preview_images, undefined);
      continue;
    }
    assert.equal(question.option_preview_images.length, question.options["zh-Hans"].length);
    for (const optionPreview of question.option_preview_images) {
      assert.match(optionPreview, /^\/previews\/options\/.+-\d+-.+\.webp$/);
      assert.ok(fs.existsSync(path.join(root, "client/public", optionPreview)));
    }
  }
  assert.equal(config.i18n["zh-Hans"].tabs.studio, "画案");
  assert.equal(config.i18n["zh-Hant"].tabs.library, "藏卷");
  assert.equal(config.i18n.en.tabs.experts, "Artisans");
  assert.match(config.prompts.painting.system, /中国画/);
  assert.match(config.prompts.calligraphy.system, /书法/);
  assert.match(config.prompts.fusion.system, /融合图/);
  assert.match(config.prompts.painting.brief, /中国画/);
  assert.ok(Array.isArray(config.prompts.painting.sections));
  assert.match(config.prompts.calligraphy.brief, /书法作品/);
  assert.ok(Array.isArray(config.prompts.calligraphy.sections));
  assert.match(config.prompts.fusion.brief, /真实摆放效果图/);
  assert.ok(Array.isArray(config.prompts.fusion.sections));
  assert.ok(config.prompts.calligraphyVerification);
  assert.match(config.prompts.calligraphyVerification.system, /书法/);
  assert.match(config.prompts.calligraphyVerification.brief, /issues/);
  assert.equal(config.prompts.calligraphyVerification.minimumConfidence, 0.8);
  assert.equal(config.prompts.sizeEstimationPrompt.system, "你是墨起的环境图片尺寸与画面疏密估算助手。");
  assert.match(config.prompts.sizeEstimationPrompt.task, /疏密与视觉主次/);
  assert.doesNotMatch(config.prompts.sizeEstimationPrompt.task, /复杂度/);
  assert.match(config.prompts.sizeEstimationPrompt.complexityRules[0], /画面疏密、虚实关系与视觉主次/);
  assert.match(config.prompts.sizeEstimationPrompt.complexityRules[0], /不是作品质量或细节等级判断/);
  assert.doesNotMatch(config.prompts.sizeEstimationPrompt.complexityRules[0], /作品细节/);
  assert.match(config.prompts.sizeEstimationPrompt.responseRules[0], /只返回 JSON/);
  assert.equal(config.prompts.sizeEstimationPrompt.schema.generation_complexity, "small | medium | large");
});

test("allows platform production contact to be configured from environment", () => {
  const originalPhone = process.env.INKSPIRE_CONTACT_PHONE;
  const originalWechat = process.env.INKSPIRE_CONTACT_WECHAT;
  process.env.INKSPIRE_CONTACT_PHONE = "020-12345678";
  process.env.INKSPIRE_CONTACT_WECHAT = "InkspireArt";
  try {
    const exposed = publicConfig(loadConfig(root));
    assert.deepEqual(exposed.productionContact, {
      phone: "020-12345678",
      wechat: "InkspireArt"
    });
  } finally {
    if (originalPhone === undefined) {
      delete process.env.INKSPIRE_CONTACT_PHONE;
    } else {
      process.env.INKSPIRE_CONTACT_PHONE = originalPhone;
    }
    if (originalWechat === undefined) {
      delete process.env.INKSPIRE_CONTACT_WECHAT;
    } else {
      process.env.INKSPIRE_CONTACT_WECHAT = originalWechat;
    }
  }
});

test("public config exposes only UI-safe fields", () => {
  const exposed = publicConfig(loadConfig(root));
  assert.equal(exposed.name, "墨起");
  assert.equal(exposed.defaultLocale, "zh-Hans");
  assert.equal(exposed.experts[0].name["zh-Hans"], "平台合作雅匠");
  assert.equal(exposed.experts[0].services[0].id, "expert_custom");
  assert.equal(Object.hasOwn(exposed, "codex"), false);
  assert.equal(Object.hasOwn(exposed, "runtime"), false);
  assert.equal(Object.hasOwn(exposed, "codexCommand"), false);
  assert.equal(Object.hasOwn(exposed, "codexModel"), false);
  assert.equal(Object.hasOwn(exposed, "codexReasoningEffort"), false);
  assert.equal(Object.hasOwn(exposed, "generatedImagesRoot"), false);
  assert.equal(Object.hasOwn(exposed, "generationCanvas"), false);
  assert.equal(Object.hasOwn(exposed, "_projectRoot"), false);
});

test("classic artworks config contains exactly 100 complete painting records", () => {
  const config = loadConfig(root);
  assert.equal(config.classicArtworks.length, 100);
  const ids = new Set();
  for (const artwork of config.classicArtworks) {
    assert.equal(typeof artwork.id, "string");
    assert.ok(artwork.id.length > 0);
    assert.ok(!ids.has(artwork.id));
    ids.add(artwork.id);
    assert.notEqual(artwork.category, "书法");
    for (const field of ["title", "artist", "period", "region", "description"]) {
      assert.ok(artwork[field]["zh-Hans"]);
      assert.ok(artwork[field]["zh-Hant"]);
      assert.ok(artwork[field].en);
    }
    assert.match(artwork.image, /^\/classic-artworks\/.+\.webp$/);
    assert.match(artwork.thumbnail, /^\/classic-artworks\/.+\.webp$/);
    assert.ok(fs.existsSync(path.join(root, "client/public", artwork.image)));
    assert.ok(fs.existsSync(path.join(root, "client/public", artwork.thumbnail)));
    assert.ok(artwork.reference_focus);
  }
});

test("public config exposes classic artworks", () => {
  const exposed = publicConfig(loadConfig(root));
  assert.equal(exposed.classicArtworks.length, 100);
});

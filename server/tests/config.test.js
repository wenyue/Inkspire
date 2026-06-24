const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadConfig, publicConfig } = require("../src/config");

const root = path.resolve(__dirname, "../..");

test("loads required Inkspire configuration", () => {
  const config = loadConfig(root);
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
  assert.equal(config.experts[0].name, "吴嘉茵");
  assert.equal(config.experts[0].region, "广东省");
  assert.deepEqual(config.experts[0].services.map((service) => service.id), [
    "expert_custom",
    "expert_guided"
  ]);
  assert.ok(config.questions.painting.length >= 5);
  assert.ok(config.questions.calligraphy.length >= 5);
  assert.equal(config.questions.calligraphy[0].id, "text");
  assert.equal(config.questions.calligraphy[0].input_type, "textarea");
  assert.match(config.questions.calligraphy[0].placeholder["zh-Hans"], /祝福语|诗句|词句/);
  for (const question of [...config.questions.painting, ...config.questions.calligraphy]) {
    assert.match(question.preview_image, /^\/previews\/questions\/.+\.webp$/);
    assert.ok(fs.existsSync(path.join(root, "client/public", question.preview_image)));
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
  assert.equal(exposed.experts[0].name, "吴嘉茵");
  assert.equal(exposed.experts[0].services[0].id, "expert_custom");
  assert.equal(Object.hasOwn(exposed, "codex"), false);
  assert.equal(Object.hasOwn(exposed, "runtime"), false);
  assert.equal(Object.hasOwn(exposed, "codexCommand"), false);
  assert.equal(Object.hasOwn(exposed, "codexModel"), false);
  assert.equal(Object.hasOwn(exposed, "codexReasoningEffort"), false);
  assert.equal(Object.hasOwn(exposed, "generatedImagesRoot"), false);
  assert.equal(Object.hasOwn(exposed, "generationCanvas"), false);
});

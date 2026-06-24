const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { loadConfig } = require("../src/config");
const { buildArtworkPrompt, buildFusionPrompt } = require("../src/prompts");

const root = path.resolve(__dirname, "../..");

test("painting prompt contains 中国画, selected answers, and user notes", () => {
  const prompt = buildArtworkPrompt({
    type: "painting",
    answers: {
      painting_subject: "山水",
      painting_palette: "青绿"
    },
    conversationNotes: "请保留远山云气",
    config: loadConfig(root)
  });

  assert.match(prompt, /中国画/);
  assert.match(prompt, /想画什么主题？: 山水/);
  assert.match(prompt, /偏好哪种设色？: 青绿/);
  assert.match(prompt, /请保留远山云气/);
});

test("calligraphy prompt contains 书法, selected answers, and user notes", () => {
  const prompt = buildArtworkPrompt({
    type: "calligraphy",
    answers: {
      text: "明月松间照",
      calligraphy_script: "行书",
      calligraphy_energy: "苍劲"
    },
    conversationNotes: "落款保持含蓄",
    config: loadConfig(root)
  });

  assert.match(prompt, /书法/);
  assert.match(prompt, /文字: 明月松间照/);
  assert.match(prompt, /偏好哪种书体？: 行书/);
  assert.match(prompt, /笔势希望如何？: 苍劲/);
  assert.match(prompt, /落款保持含蓄/);
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

const fs = require("node:fs");
const path = require("node:path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function requireArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
  return value;
}

function loadConfig(projectRoot = path.resolve(__dirname, "../..")) {
  const configDir = path.join(projectRoot, "config");
  const app = readJson(path.join(configDir, "app.json"));
  const experts = requireArray(readJson(path.join(configDir, "experts.json")), "experts");
  const questions = readJson(path.join(configDir, "questions.json"));
  const i18n = {
    "zh-Hans": readJson(path.join(configDir, "i18n", "zh-Hans.json")),
    "zh-Hant": readJson(path.join(configDir, "i18n", "zh-Hant.json")),
    en: readJson(path.join(configDir, "i18n", "en.json"))
  };
  const prompts = {
    painting: readJson(path.join(configDir, "prompts", "painting.json")),
    calligraphy: readJson(path.join(configDir, "prompts", "calligraphy.json")),
    fusion: readJson(path.join(configDir, "prompts", "fusion.json"))
  };

  requireArray(questions.painting, "painting questions");
  requireArray(questions.calligraphy, "calligraphy questions");

  return { app, experts, questions, i18n, prompts };
}

function publicConfig(config) {
  return {
    name: config.app.name,
    defaultLocale: config.app.defaultLocale,
    image: config.app.image,
    experts: config.experts,
    questions: config.questions,
    i18n: config.i18n
  };
}

module.exports = { loadConfig, publicConfig };

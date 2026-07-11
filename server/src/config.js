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

function productionContact(app) {
  return {
    phone: process.env.INKSPIRE_CONTACT_PHONE || app.productionContact?.phone || "",
    wechat: process.env.INKSPIRE_CONTACT_WECHAT || app.productionContact?.wechat || ""
  };
}

function hasContact(contact) {
  return Boolean(contact?.phone || contact?.wechat);
}

function productionAvailable(config) {
  return hasContact(config.app?.productionContact)
    || (config.experts || []).some((expert) => hasContact(expert));
}

function loadConfig(projectRoot = path.resolve(__dirname, "../..")) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const configDir = path.join(resolvedProjectRoot, "config");
  const app = readJson(path.join(configDir, "app.json"));
  const experts = requireArray(readJson(path.join(configDir, "experts.json")), "experts");
  const questions = readJson(path.join(configDir, "questions.json"));
  const classicArtworks = requireArray(readJson(path.join(configDir, "classic-artworks.json")), "classic artworks");
  const i18n = {
    "zh-Hans": readJson(path.join(configDir, "i18n", "zh-Hans.json")),
    "zh-Hant": readJson(path.join(configDir, "i18n", "zh-Hant.json")),
    en: readJson(path.join(configDir, "i18n", "en.json"))
  };
  const prompts = {
    painting: readJson(path.join(configDir, "prompts", "painting.json")),
    calligraphy: readJson(path.join(configDir, "prompts", "calligraphy.json")),
    calligraphyVerification: readJson(path.join(configDir, "prompts", "calligraphyVerification.json")),
    fusion: readJson(path.join(configDir, "prompts", "fusion.json")),
    sizeEstimationPrompt: readJson(path.join(configDir, "prompts", "sizeEstimationPrompt.json"))
  };

  requireArray(questions.painting, "painting questions");
  requireArray(questions.calligraphy, "calligraphy questions");

  app.productionContact = productionContact(app);

  return { _projectRoot: resolvedProjectRoot, app, experts, questions, classicArtworks, i18n, prompts };
}

function publicConfig(config) {
  return {
    name: config.app.name,
    defaultLocale: config.app.defaultLocale,
    image: config.app.image,
    productionContact: config.app.productionContact,
    productionAvailable: productionAvailable(config),
    experts: config.experts,
    questions: config.questions,
    classicArtworks: config.classicArtworks,
    i18n: config.i18n
  };
}

module.exports = { loadConfig, publicConfig, productionAvailable };

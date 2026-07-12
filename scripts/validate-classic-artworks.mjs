import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "config", "classic-artworks.json");
const publicDir = path.join(root, "client", "public");
const requiredLocales = ["zh-Hans", "zh-Hant", "en"];
const requiredLocalizedFields = ["title", "artist", "period", "region", "description"];
const requiredStringFields = ["id", "category", "image", "thumbnail", "reference_focus", "source_note"];
const disallowedCategories = new Set(["书法", "calligraphy", "Calligraphy"]);
const unverifiedDescriptionPattern = /尚未完成.*策展核验|适合作为.*方向的参考/;
const genericEnglishDescriptionPattern = /pending curatorial verification|It is used as a reference/i;

function hanCharacterCount(value) {
  return value.match(/\p{Script=Han}/gu)?.length ?? 0;
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function readArtworks() {
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function assertLocalized(record, field) {
  const value = record[field];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${record.id || "(missing id)"}: ${field} must be a localized object`);
    return;
  }
  for (const locale of requiredLocales) {
    if (typeof value[locale] !== "string" || value[locale].trim().length === 0) {
      fail(`${record.id}: ${field}.${locale} is required`);
    }
  }
}

function assertLocalizedName(record, field) {
  const value = record[field];
  for (const locale of ["zh-Hans", "zh-Hant"]) {
    if (!/\p{Script=Han}/u.test(value?.[locale] ?? "")) {
      fail(`${record.id}: ${field}.${locale} must contain a localized Chinese name`);
    }
  }
  if (/\p{Script=Han}/u.test(value?.en ?? "") || !/[A-Za-z]/.test(value?.en ?? "")) {
    fail(`${record.id}: ${field}.en must contain a localized English name without Han characters`);
  }
}

function assertAsset(record, field) {
  const value = record[field];
  if (typeof value !== "string" || !value.startsWith("/classic-artworks/") || !value.endsWith(".webp")) {
    fail(`${record.id}: ${field} must be a /classic-artworks/*.webp path`);
    return;
  }
  const fullPath = path.join(publicDir, value.replace(/^\//, ""));
  if (!fs.existsSync(fullPath)) {
    fail(`${record.id}: missing asset ${value}`);
  }
}

const records = readArtworks();
if (!Array.isArray(records)) {
  fail("classic-artworks.json must be an array");
} else if (records.length !== 100) {
  fail(`classic-artworks.json must contain exactly 100 records, found ${records.length}`);
}

const ids = new Set();
const newArtworkTitles = new Set();
for (const record of Array.isArray(records) ? records : []) {
  for (const field of requiredStringFields) {
    if (typeof record[field] !== "string" || record[field].trim().length === 0) {
      fail(`${record.id || "(missing id)"}: ${field} is required`);
    }
  }
  if (ids.has(record.id)) {
    fail(`duplicate artwork id: ${record.id}`);
  }
  ids.add(record.id);
  if (disallowedCategories.has(record.category)) {
    fail(`${record.id}: classic artworks must be paintings; calligraphy category is not allowed`);
  }
  for (const field of requiredLocalizedFields) {
    assertLocalized(record, field);
  }
  for (const field of ["title", "artist"]) {
    assertLocalizedName(record, field);
  }
  for (const locale of ["zh-Hans", "zh-Hant"]) {
    const description = record.description?.[locale] ?? "";
    const characterCount = hanCharacterCount(description);
    if (characterCount < 50 || characterCount > 80) {
      fail(`${record.id}: description.${locale} must contain 50-80 Han characters, found ${characterCount}`);
    }
    if (unverifiedDescriptionPattern.test(description)) {
      fail(`${record.id}: description.${locale} still contains unverified or generic catalogue copy`);
    }
  }
  if (record.description?.["zh-Hans"] === record.description?.["zh-Hant"]) {
    fail(`${record.id}: Traditional Chinese description must be localized independently from Simplified Chinese`);
  }
  const englishDescription = record.description?.en ?? "";
  const englishWordCount = englishDescription.trim().split(/\s+/).filter(Boolean).length;
  if (englishWordCount < 30 || englishWordCount > 80) {
    fail(`${record.id}: description.en must contain 30-80 words, found ${englishWordCount}`);
  }
  if (/\p{Script=Han}/u.test(englishDescription) || genericEnglishDescriptionPattern.test(englishDescription)) {
    fail(`${record.id}: description.en must contain localized curatorial copy`);
  }
  if (!Array.isArray(record.new_artwork_titles) || record.new_artwork_titles.length !== 5) {
    fail(`${record.id}: new_artwork_titles must contain exactly 5 titles`);
  } else {
    for (const title of record.new_artwork_titles) {
      if (typeof title !== "string" || !title.trim() || title !== title.trim()) {
        fail(`${record.id}: new_artwork_titles must contain trimmed non-empty strings`);
        continue;
      }
      if (!/^\p{Script=Han}+$/u.test(title)) {
        fail(`${record.id}: new_artwork_titles must contain Chinese titles only: ${title}`);
      }
      if (newArtworkTitles.has(title)) {
        fail(`${record.id}: duplicate new artwork title: ${title}`);
      }
      newArtworkTitles.add(title);
    }
  }
  assertAsset(record, "image");
  assertAsset(record, "thumbnail");
}

if (newArtworkTitles.size !== 500) {
  fail(`classic artworks must contain 500 unique new artwork titles, found ${newArtworkTitles.size}`);
}

if (!process.exitCode) {
  console.log(`Validated ${records.length} classic artworks.`);
}

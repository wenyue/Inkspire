import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "config", "classic-artworks.json");
const publicDir = path.join(root, "client", "public");
const requiredLocales = ["zh-Hans", "zh-Hant", "en"];
const requiredLocalizedFields = ["title", "artist", "period", "region", "description"];
const requiredStringFields = ["id", "category", "image", "thumbnail", "reference_focus", "source_note"];
const disallowedCategories = new Set(["书法", "calligraphy", "Calligraphy"]);

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
  assertAsset(record, "image");
  assertAsset(record, "thumbnail");
}

if (!process.exitCode) {
  console.log(`Validated ${records.length} classic artworks.`);
}

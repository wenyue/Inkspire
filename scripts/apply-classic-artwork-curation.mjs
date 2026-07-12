import fs from "node:fs/promises";
import path from "node:path";
import { curationByObjectId, referenceFocusForCategory } from "./classic-artwork-curation.mjs";

const root = process.cwd();
const manifestPath = path.join(root, "config", "classic-artworks.json");
const records = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const seenObjectIds = new Set();

for (const record of records) {
  const objectId = record.source_note.match(/object\s+(\d+)/i)?.[1];
  const curation = curationByObjectId.get(objectId);
  if (!objectId || !curation) {
    throw new Error(`${record.id}: missing curated metadata`);
  }
  seenObjectIds.add(objectId);
  record.title["zh-Hans"] = curation.title;
  record.title["zh-Hant"] = curation.titleHant;
  record.artist["zh-Hans"] = curation.artist;
  record.artist["zh-Hant"] = curation.artistHant;
  if (curation.artistEn) record.artist.en = curation.artistEn;
  record.period["zh-Hans"] = curation.period;
  record.period["zh-Hant"] = curation.periodHant;
  record.category = curation.category;
  record.description["zh-Hans"] = curation.description;
  record.description["zh-Hant"] = curation.descriptionHant;
  record.description.en = curation.descriptionEn;
  record.reference_focus = referenceFocusForCategory(curation.category);
  record.new_artwork_titles = [...curation.newArtworkTitles];
}

if (seenObjectIds.size !== curationByObjectId.size) {
  throw new Error(`Manifest uses ${seenObjectIds.size} of ${curationByObjectId.size} curated records`);
}

await fs.writeFile(manifestPath, `${JSON.stringify(records, null, 2)}\n`);
console.log(`Applied curated metadata to ${records.length} classic artworks.`);

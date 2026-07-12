import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  canonicalizeSelectorAssetPath,
  collectSelectorAssets,
  registerSelectorAssetOwner,
  validateSelectorOptionContract,
  validateSelectorAssetMetadata
} from "./selector-asset-contract.mjs";

const WORK_TYPE_OPTION_IMAGES = [
  "/previews/options/work-type-0-painting.webp",
  "/previews/options/work-type-1-calligraphy.webp",
  "/previews/options/work-type-2-classics.webp"
];

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const previewsRoot = path.join(repositoryRoot, "client", "public", "previews");
const questionsPath = path.join(repositoryRoot, "config", "questions.json");

const questions = JSON.parse(await readFile(questionsPath, "utf8"));
const assets = collectSelectorAssets(
  questions,
  WORK_TYPE_OPTION_IMAGES,
  ["calligraphy_script"]
);
const optionCounts = validateSelectorOptionContract(
  questions,
  assets,
  WORK_TYPE_OPTION_IMAGES.length
);
const ownersByIdentity = new Map();

for (const asset of assets) {
  const canonicalAsset = await canonicalizeSelectorAssetPath(previewsRoot, asset.path);
  registerSelectorAssetOwner(ownersByIdentity, canonicalAsset.identity, asset);

  const metadata = await sharp(canonicalAsset.filePath).metadata();
  validateSelectorAssetMetadata(asset, metadata);
}

console.log(
  `Validated ${optionCounts.totalOptionCount} selector options: ${optionCounts.visualOptionCount} visual options, ${optionCounts.textOnlyOptionCount} verified text-only script options.`
);

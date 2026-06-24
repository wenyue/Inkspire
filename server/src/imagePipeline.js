const fs = require("node:fs/promises");
const path = require("node:path");
const { PNG } = require("pngjs");
const sharp = require("sharp");

async function assertReadablePng(inputPath) {
  try {
    PNG.sync.read(await fs.readFile(inputPath));
  } catch (error) {
    throw new Error(`Invalid PNG input: ${error.message}`);
  }
}

async function convertPngToWebp(pngPath, webpPath, quality) {
  await assertReadablePng(pngPath);
  await fs.mkdir(path.dirname(webpPath), { recursive: true });
  await sharp(pngPath).webp({ quality }).toFile(webpPath);
}

async function archiveSourcePhoto(inputPath, outputPath, quality) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(inputPath).webp({ quality }).toFile(outputPath);
}

module.exports = { archiveSourcePhoto, convertPngToWebp };

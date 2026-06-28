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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function composeArtworkPreview(environmentPath, artworkPath, outputPngPath) {
  const environmentInput = await fs.readFile(environmentPath);
  const artworkInput = await fs.readFile(artworkPath);
  const environment = sharp(environmentInput);
  const environmentMetadata = await environment.metadata();
  const artworkMetadata = await sharp(artworkInput).metadata();
  const environmentWidth = Number(environmentMetadata.width || 0);
  const environmentHeight = Number(environmentMetadata.height || 0);
  const artworkWidth = Number(artworkMetadata.width || 0);
  const artworkHeight = Number(artworkMetadata.height || 0);
  if (!environmentWidth || !environmentHeight || !artworkWidth || !artworkHeight) {
    throw new Error("Invalid preview image dimensions");
  }

  const maxArtworkWidth = Math.max(1, Math.round(environmentWidth * 0.42));
  const maxArtworkHeight = Math.max(1, Math.round(environmentHeight * 0.58));
  const scale = Math.min(maxArtworkWidth / artworkWidth, maxArtworkHeight / artworkHeight);
  const resizedArtworkWidth = clamp(Math.round(artworkWidth * scale), 1, environmentWidth);
  const resizedArtworkHeight = clamp(Math.round(artworkHeight * scale), 1, environmentHeight);
  const framePadding = clamp(Math.round(Math.min(environmentWidth, environmentHeight) * 0.018), 1, 8);
  const shadowOffset = clamp(Math.round(Math.min(environmentWidth, environmentHeight) * 0.025), 1, 10);
  const frameWidth = Math.min(environmentWidth, resizedArtworkWidth + framePadding * 2);
  const frameHeight = Math.min(environmentHeight, resizedArtworkHeight + framePadding * 2);
  const left = Math.round((environmentWidth - frameWidth) / 2);
  const top = clamp(Math.round((environmentHeight - frameHeight) * 0.35), 0, environmentHeight - frameHeight);
  const artworkLeft = left + Math.floor((frameWidth - resizedArtworkWidth) / 2);
  const artworkTop = top + Math.floor((frameHeight - resizedArtworkHeight) / 2);

  const artwork = await sharp(artworkInput)
    .resize(resizedArtworkWidth, resizedArtworkHeight, { fit: "fill" })
    .png()
    .toBuffer();
  const frame = await sharp({
    create: {
      width: frameWidth,
      height: frameHeight,
      channels: 4,
      background: { r: 252, g: 250, b: 245, alpha: 1 }
    }
  })
    .png()
    .toBuffer();
  const shadow = await sharp({
    create: {
      width: frameWidth,
      height: frameHeight,
      channels: 4,
      background: { r: 20, g: 18, b: 16, alpha: 0.28 }
    }
  })
    .blur(Math.max(1, shadowOffset))
    .png()
    .toBuffer();

  await fs.mkdir(path.dirname(outputPngPath), { recursive: true });
  await sharp(environmentInput)
    .resize(environmentWidth, environmentHeight, { fit: "fill" })
    .composite([
      {
        input: shadow,
        left: clamp(left + shadowOffset, 0, environmentWidth - frameWidth),
        top: clamp(top + shadowOffset, 0, environmentHeight - frameHeight)
      },
      { input: frame, left, top },
      { input: artwork, left: artworkLeft, top: artworkTop }
    ])
    .png()
    .toFile(outputPngPath);

  return { pngPath: outputPngPath };
}

module.exports = { archiveSourcePhoto, composeArtworkPreview, convertPngToWebp };

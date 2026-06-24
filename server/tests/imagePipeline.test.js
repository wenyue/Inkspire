const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { PNG } = require("pngjs");
const sharp = require("sharp");
const { archiveSourcePhoto, convertPngToWebp } = require("../src/imagePipeline");

async function withTempDir(fn) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "inkspire-image-"));
  try {
    await fn(temp);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

async function writeTinyPng(filePath) {
  const png = new PNG({ width: 1, height: 1 });
  png.data[0] = 28;
  png.data[1] = 74;
  png.data[2] = 104;
  png.data[3] = 255;
  await fs.writeFile(filePath, PNG.sync.write(png));
}

test("convertPngToWebp writes a WEBP RIFF file", async () => {
  await withTempDir(async (temp) => {
    const pngPath = path.join(temp, "source.png");
    const webpPath = path.join(temp, "artwork.webp");
    await writeTinyPng(pngPath);

    await convertPngToWebp(pngPath, webpPath, 82);

    const output = await fs.readFile(webpPath);
    assert.equal(output.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(output.subarray(8, 12).toString("ascii"), "WEBP");
  });
});

test("archiveSourcePhoto accepts PNG input and writes source-photo.webp", async () => {
  await withTempDir(async (temp) => {
    const pngPath = path.join(temp, "upload.png");
    const outputPath = path.join(temp, "source-photo.webp");
    await writeTinyPng(pngPath);

    await archiveSourcePhoto(pngPath, outputPath, 82);

    const output = await fs.readFile(outputPath);
    assert.equal(path.basename(outputPath), "source-photo.webp");
    assert.equal(output.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(output.subarray(8, 12).toString("ascii"), "WEBP");
  });
});

test("archiveSourcePhoto accepts JPEG input and writes source-photo.webp", async () => {
  await withTempDir(async (temp) => {
    const jpegPath = path.join(temp, "upload.jpg");
    const outputPath = path.join(temp, "source-photo.webp");
    await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 3,
        background: { r: 28, g: 74, b: 104 }
      }
    })
      .jpeg()
      .toFile(jpegPath);

    await archiveSourcePhoto(jpegPath, outputPath, 82);

    const output = await fs.readFile(outputPath);
    assert.equal(path.basename(outputPath), "source-photo.webp");
    assert.equal(output.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(output.subarray(8, 12).toString("ascii"), "WEBP");
  });
});

test("invalid PNG input rejects with a helpful error", async () => {
  await withTempDir(async (temp) => {
    const badPath = path.join(temp, "bad.png");
    const outputPath = path.join(temp, "bad.webp");
    await fs.writeFile(badPath, "not a png");

    await assert.rejects(
      () => convertPngToWebp(badPath, outputPath, 82),
      /Invalid PNG input/
    );
  });
});

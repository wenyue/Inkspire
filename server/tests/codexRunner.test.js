const test = require("node:test");
const assert = require("node:assert/strict");
const EventEmitter = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { PNG } = require("pngjs");
const {
  buildImageGenerationPrompt,
  diagnoseCodexImageGeneration,
  runCodexImageGeneration,
  runCodexJsonEstimation
} = require("../src/codexRunner");

async function withTempDir(fn) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "inkspire-codex-"));
  try {
    await fn(temp);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

test("wraps art brief with explicit image-generation instructions", () => {
  const prompt = buildImageGenerationPrompt({
    prompt: "一幅清雅水墨山水",
    canvas: { width: 1024, height: 1536, aspectRatio: "2:3" }
  });

  assert.match(prompt, /Generate exactly one fresh PNG image using the built-in image generation tool/);
  assert.match(prompt, /Do not only describe the image/);
  assert.match(prompt, /1024x1536 pixels, 2:3 aspect ratio/);
  assert.match(prompt, /一幅清雅水墨山水/);
});

test("wraps reference image paths for second-pass render prompts", () => {
  const prompt = buildImageGenerationPrompt({
    prompt: "把作品真实挂入环境照片",
    canvas: { width: 1024, height: 1536, aspectRatio: "2:3" },
    referenceImages: {
      environment: "D:\\Inkspire\\data\\records\\record-1\\source-photo.webp",
      artwork: "D:\\Inkspire\\data\\records\\record-1\\artwork.webp"
    }
  });

  assert.match(prompt, /Reference images/);
  assert.match(prompt, /environment: D:\\Inkspire\\data\\records\\record-1\\source-photo\.webp/);
  assert.match(prompt, /artwork: D:\\Inkspire\\data\\records\\record-1\\artwork\.webp/);
  assert.match(prompt, /use them as visual references/i);
});

function pngBuffer(red) {
  const png = new PNG({ width: 2, height: 2 });
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data[offset] = red;
    png.data[offset + 1] = 80;
    png.data[offset + 2] = 120;
    png.data[offset + 3] = 255;
  }
  return PNG.sync.write(png);
}

function fakeSpawn({ stdout = "", stderr = "", onStart = async () => {} }) {
  return (command, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.spawned = { command, args };

    process.nextTick(async () => {
      await onStart();
      if (stdout) child.stdout.emit("data", Buffer.from(stdout));
      if (stderr) child.stderr.emit("data", Buffer.from(stderr));
      child.emit("close", 0);
    });

    return child;
  };
}

test("extracts latest image_generation_end PNG base64 from JSONL events", async () => {
  await withTempDir(async (temp) => {
    const first = pngBuffer(10);
    const latest = pngBuffer(220);
    const result = await runCodexImageGeneration({
      prompt: "生成一张水墨山水",
      outputPngPath: path.join(temp, "result.png"),
      jobDir: path.join(temp, "job"),
      generatedImagesRoot: path.join(temp, "generated_images"),
      config: {
        codexCommand: "codex",
        codexModel: "gpt-5",
        codexReasoningEffort: "medium"
      },
      spawnImpl: fakeSpawn({
        stdout: [
          JSON.stringify({ type: "image_generation_end", result: first.toString("base64") }),
          JSON.stringify({
            payload: {
              type: "image_generation_end",
              result: `data:image/png;base64,${latest.toString("base64")}`
            }
          })
        ].join("\n")
      })
    });

    assert.equal(result.pngPath, path.join(temp, "result.png"));
    assert.deepEqual(await fs.readFile(result.pngPath), latest);
    assert.equal(result.diagnostics.image_event_result_count, 2);
  });
});

test("finds newest generated PNG under generated_images root when events have no result", async () => {
  await withTempDir(async (temp) => {
    const root = path.join(temp, "generated_images");
    await fs.mkdir(root, { recursive: true });
    const fallbackPng = path.join(root, "nested", "fresh.png");

    const result = await runCodexImageGeneration({
      prompt: "生成一幅书法",
      outputPngPath: path.join(temp, "fallback.png"),
      jobDir: path.join(temp, "job"),
      generatedImagesRoot: root,
      config: {
        codexCommand: "codex",
        codexModel: "gpt-5",
        codexReasoningEffort: "medium"
      },
      spawnImpl: fakeSpawn({
        stdout: JSON.stringify({ type: "image_generation_end" }),
        onStart: async () => {
          await fs.mkdir(path.dirname(fallbackPng), { recursive: true });
          await fs.writeFile(fallbackPng, pngBuffer(90));
        }
      })
    });

    assert.deepEqual(await fs.readFile(result.pngPath), pngBuffer(90));
    assert.equal(result.diagnostics.image_event_count, 1);
    assert.equal(result.diagnostics.reason, "generated_images_fallback");
  });
});

test("runs Codex JSON estimation without requiring an output PNG path", async () => {
  await withTempDir(async (temp) => {
    const result = await runCodexJsonEstimation({
      prompt: "请估算环境图中的作品尺寸，只返回 JSON",
      referenceImages: {
        environment: "D:\\Inkspire\\data\\records\\record-1\\source-photo.webp"
      },
      jobDir: path.join(temp, "estimate"),
      config: {
        codexCommand: "codex",
        codexModel: "gpt-5",
        codexReasoningEffort: "medium"
      },
      spawnImpl: fakeSpawn({
        stdout: JSON.stringify({
          type: "message",
          text: "{\"generation_complexity\":\"large\",\"recommended_artwork_size\":{\"width_cm\":60,\"height_cm\":90}}"
        })
      })
    });

    assert.equal(result.json.generation_complexity, "large");
    assert.equal(result.json.recommended_artwork_size.width_cm, 60);
    assert.match(result.text, /generation_complexity/);
  });
});

test("returns diagnostic possible_safety_block when stderr contains policy/refusal text", async () => {
  await withTempDir(async (temp) => {
    const outputPath = path.join(temp, "codex-stderr.log");
    await fs.writeFile(outputPath, "request was refused by safety policy\n");

    const diagnostics = diagnoseCodexImageGeneration({ outputPath });

    assert.equal(diagnostics.possible_safety_block, true);
    assert.match(diagnostics.stderr_tail, /safety policy/);
  });
});

test("does not treat unrelated command output as a safety block", async () => {
  await withTempDir(async (temp) => {
    const eventsPath = path.join(temp, "codex-events.jsonl");
    await fs.writeFile(eventsPath, JSON.stringify({
      type: "item.completed",
      item: {
        type: "command_execution",
        aggregated_output: "local skill docs mention safety policy as general guidance"
      }
    }));

    const diagnostics = diagnoseCodexImageGeneration({ eventsPath });

    assert.equal(diagnostics.possible_safety_block, false);
  });
});

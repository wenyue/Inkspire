const test = require("node:test");
const assert = require("node:assert/strict");
const EventEmitter = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { PNG } = require("pngjs");
const {
  buildJsonInspectionPrompt,
  buildImageGenerationPrompt,
  diagnoseCodexImageGeneration,
  runCodexImageGeneration,
  runCodexJsonEstimation,
  runCodexJsonInspection
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

function fakeSpawn({ stdout = "", stderr = "", exitCode = 0, onStart = async () => {} }) {
  return (command, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.spawned = { command, args };

    process.nextTick(async () => {
      await onStart();
      if (stdout) child.stdout.emit("data", Buffer.from(stdout));
      if (stderr) child.stderr.emit("data", Buffer.from(stderr));
      child.emit("close", exitCode);
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
    assert.equal(typeof result.diagnostics.codex_process_ms, "number");
    assert.ok(result.diagnostics.codex_process_ms >= 0);
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

test("uses an explicit square canvas in the Codex image prompt", async () => {
  await withTempDir(async (temp) => {
    let codexPrompt = "";
    const image = pngBuffer(120);
    const spawnImpl = (command, args) => {
      codexPrompt = args.at(-1);
      return fakeSpawn({
        stdout: JSON.stringify({ type: "image_generation_end", result: image.toString("base64") })
      })(command, args);
    };

    await runCodexImageGeneration({
      prompt: "生成一幅斗方书法",
      canvas: { width: 1024, height: 1024, aspectRatio: "1:1", orientation: "square" },
      outputPngPath: path.join(temp, "square.png"),
      jobDir: path.join(temp, "job"),
      generatedImagesRoot: path.join(temp, "generated_images"),
      config: {
        runtime: {
          codexCommand: "codex",
          codexModel: "gpt-5",
          generationCanvas: { width: 1024, height: 1536, aspectRatio: "2:3" }
        }
      },
      spawnImpl
    });

    assert.match(codexPrompt, /Target canvas: 1024x1024 pixels, 1:1 aspect ratio/);
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
    assert.equal(typeof result.diagnostics.codex_process_ms, "number");
    assert.ok(result.diagnostics.codex_process_ms >= 0);
  });
});

test("runs dedicated calligraphy JSON inspection without image generation", async () => {
  assert.equal(typeof buildJsonInspectionPrompt, "function");
  assert.equal(typeof runCodexJsonInspection, "function");
  await withTempDir(async (temp) => {
    let codexArgs = [];
    const spawnImpl = (command, args) => {
      codexArgs = args;
      return fakeSpawn({
        stdout: JSON.stringify({
          type: "message",
          text: "{\"detected_text\":\"清风明月\",\"no_extra_text\":true,\"legible\":true,\"confidence\":0.98,\"decision\":\"verified\",\"issues\":[]}"
        })
      })(command, args);
    };

    const result = await runCodexJsonInspection({
      prompt: "期望正文是清风明月，只返回 JSON",
      referenceImages: { calligraphyCandidate: "D:\\Inkspire\\data\\records\\record-1\\artwork.png" },
      jobDir: path.join(temp, "inspect"),
      config: { runtime: { codexCommand: "codex", codexModel: "gpt-5" } },
      spawnImpl
    });

    assert.equal(result.json.detected_text, "清风明月");
    assert.equal(codexArgs.includes("image_generation"), false);
    assert.match(codexArgs.at(-1), /calligraphy text verification worker/i);
    assert.match(codexArgs.at(-1), /calligraphyCandidate: D:\\Inkspire\\data\\records\\record-1\\artwork\.png/);
    assert.doesNotMatch(codexArgs.at(-1), /environment-size estimation worker/i);
  });
});

test("calligraphy inspection classifies process and safety failures", async () => {
  await withTempDir(async (temp) => {
    await assert.rejects(
      runCodexJsonInspection({
        prompt: "核验",
        jobDir: path.join(temp, "inspect-process"),
        config: { runtime: { codexCommand: "codex", codexModel: "gpt-5" } },
        spawnImpl: fakeSpawn({ exitCode: 7, stderr: "request was refused by safety policy" })
      }),
      (error) => {
        assert.ok(error.diagnostics);
        assert.deepEqual(error.diagnostics, {
          reason: "codex_process_failed",
          status: "process_error",
          exit_code: 7,
          codex_process_ms: error.diagnostics.codex_process_ms,
          possible_safety_block: true
        });
        assert.equal(typeof error.diagnostics.codex_process_ms, "number");
        return true;
      }
    );
  });
});

test("calligraphy inspection classifies malformed JSON without exposing stderr", async () => {
  await withTempDir(async (temp) => {
    await assert.rejects(
      runCodexJsonInspection({
        prompt: "核验",
        jobDir: path.join(temp, "inspect-json"),
        config: { runtime: { codexCommand: "codex", codexModel: "gpt-5" } },
        spawnImpl: fakeSpawn({
          stdout: JSON.stringify({ type: "message", text: "not-json" }),
          stderr: "D:\\private\\codex-stderr.log"
        })
      }),
      (error) => {
        assert.ok(error.diagnostics);
        assert.equal(error.diagnostics.reason, "json_parse_failed");
        assert.equal(error.diagnostics.status, "invalid_json");
        assert.equal(error.diagnostics.possible_safety_block, false);
        assert.equal(typeof error.diagnostics.codex_process_ms, "number");
        assert.equal(Object.hasOwn(error.diagnostics, "stderr_tail"), false);
        return true;
      }
    );
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

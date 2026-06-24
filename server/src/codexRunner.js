const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const safetyPattern = /\b(content policy|policy violation|violates policy|blocked by policy|refused by policy|request was refused|refusal|disallowed|moderation|safety policy|unsafe content|sensitive content|not allowed|cannot comply|can't comply)\b/i;

function ensureDirectoryFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function runtimeConfig(config = {}) {
  return config.app?.runtime || config.runtime || config;
}

function resolveGeneratedImagesRoot(root) {
  if (root) return path.resolve(root);
  return path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "generated_images");
}

function buildCodexArgs({ model, reasoningEffort, prompt }) {
  const args = ["exec", "-m", model || "gpt-5"];
  if (reasoningEffort) {
    args.push("-c", `model_reasoning_effort="${reasoningEffort}"`);
  }
  args.push("--enable", "image_generation", "--json", prompt);
  return args;
}

function formatCanvas(canvas = {}) {
  const width = Number(canvas.width) || 1024;
  const height = Number(canvas.height) || 1536;
  const aspectRatio = canvas.aspectRatio || canvas.aspect_ratio || `${width}:${height}`;
  return `${width}x${height} pixels, ${aspectRatio} aspect ratio`;
}

function buildImageGenerationPrompt({ prompt, canvas }) {
  return [
    "You are the Inkspire image-generation worker.",
    "",
    "Generate exactly one fresh PNG image using the built-in image generation tool.",
    "Do not only describe the image. Do not write files manually. Do not use shell commands for image creation.",
    `Target canvas: ${formatCanvas(canvas)}.`,
    "Avoid watermarks, fake signatures, fake brands, and unreadable decorative text.",
    "If you cannot call the built-in image generation tool, return IMAGE_GENERATION_FAILED.",
    "",
    "Use this exact Chinese art brief:",
    prompt || ""
  ].join("\n");
}

function isPngBuffer(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length > pngSignature.length
    && buffer.subarray(0, pngSignature.length).equals(pngSignature);
}

function validatePngFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (!isPngBuffer(buffer)) {
    throw new Error(`Generated image must be a PNG file: ${filePath}`);
  }
}

function pngBufferFromImageGenerationEvent(event) {
  const payload = event?.payload || event;
  if (payload?.type !== "image_generation_end" || typeof payload.result !== "string") {
    return null;
  }
  const base64 = payload.result.startsWith("data:")
    ? payload.result.replace(/^data:image\/png;base64,/, "")
    : payload.result;
  const buffer = Buffer.from(base64, "base64");
  return isPngBuffer(buffer) ? buffer : null;
}

function readJsonLines(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function latestImageBufferFromEvents(eventsPath) {
  let latest = null;
  for (const event of readJsonLines(eventsPath)) {
    const buffer = pngBufferFromImageGenerationEvent(event);
    if (buffer) latest = buffer;
  }
  return latest;
}

function listGeneratedPngFiles(root) {
  if (!root || !fs.existsSync(root)) return [];
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".png") {
        files.push(entryPath);
      }
    }
  }
  return files;
}

function snapshotGeneratedPngFiles(root) {
  return new Set(listGeneratedPngFiles(root).map((filePath) => path.resolve(filePath)));
}

function findNewestNewGeneratedPng(root, beforeSnapshot) {
  const candidates = [];
  for (const filePath of listGeneratedPngFiles(root)) {
    const resolved = path.resolve(filePath);
    if (beforeSnapshot.has(resolved)) continue;
    try {
      validatePngFile(filePath);
      const stats = fs.statSync(filePath);
      candidates.push({ filePath, mtimeMs: stats.mtimeMs, size: stats.size });
    } catch {
      // Ignore invalid or disappearing candidates.
    }
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs || b.size - a.size || b.filePath.localeCompare(a.filePath));
  return candidates[0]?.filePath || null;
}

function eventText(event) {
  const payload = event?.payload || event;
  return [
    payload?.message,
    payload?.text,
    payload?.error,
    payload?.detail,
    payload?.status,
    payload?.revised_prompt,
    payload?.item?.aggregated_output,
    payload?.item?.text
  ].filter((value) => typeof value === "string" && value.length > 0).join("\n");
}

function diagnoseCodexImageGeneration({ eventsPath, outputPath } = {}) {
  const events = readJsonLines(eventsPath);
  const imageEvents = events
    .map((event) => event?.payload || event)
    .filter((payload) => payload?.type === "image_generation_end");
  const imageEventsWithResult = imageEvents.filter((payload) => typeof payload.result === "string" && payload.result.length > 0);
  const stderr = outputPath && fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  const text = [...events.map(eventText), stderr].filter(Boolean).join("\n");

  let reason = "no_image_generation_output";
  if (imageEventsWithResult.length > 0) {
    reason = "image_event_result_available";
  } else if (imageEvents.length > 0) {
    reason = "image_event_without_result";
  }

  return {
    reason,
    image_event_count: imageEvents.length,
    image_event_result_count: imageEventsWithResult.length,
    possible_safety_block: safetyPattern.test(text),
    stderr_tail: stderr.split(/\r?\n/).filter(Boolean).slice(-20).join("\n")
  };
}

function runCodexProcess({ command, args, cwd, eventsPath, outputPath, spawnImpl }) {
  return new Promise((resolve, reject) => {
    ensureDirectoryFor(eventsPath);
    ensureDirectoryFor(outputPath);
    fs.mkdirSync(cwd, { recursive: true });

    const stdoutChunks = [];
    const stderrChunks = [];
    const child = spawnImpl(command, args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    child.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
    child.on("error", (error) => reject(new Error(`Failed to start Codex: ${error.message}`)));
    child.on("close", (code) => {
      fs.writeFileSync(eventsPath, Buffer.concat(stdoutChunks));
      fs.writeFileSync(outputPath, Buffer.concat(stderrChunks));
      if (code !== 0) {
        reject(new Error(`Codex exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

async function runCodexImageGeneration(options) {
  const runtime = runtimeConfig(options.config);
  const jobDir = options.jobDir || path.dirname(options.outputPngPath);
  const outputPngPath = options.outputPngPath || path.join(jobDir, "generated.png");
  const eventsPath = options.eventsPath || path.join(jobDir, "codex-events.jsonl");
  const outputPath = options.outputPath || path.join(jobDir, "codex-stderr.log");
  const generatedImagesRoot = resolveGeneratedImagesRoot(options.generatedImagesRoot || runtime.generatedImagesRoot);
  const beforeGeneratedImages = snapshotGeneratedPngFiles(generatedImagesRoot);
  const command = runtime.codexCommand || "codex";
  const args = buildCodexArgs({
    model: runtime.codexModel,
    reasoningEffort: runtime.codexReasoningEffort,
    prompt: buildImageGenerationPrompt({
      prompt: options.prompt || "",
      canvas: runtime.generationCanvas
    })
  });

  await runCodexProcess({
    command,
    args,
    cwd: jobDir,
    eventsPath,
    outputPath,
    spawnImpl: options.spawnImpl || spawn
  });

  const eventBuffer = latestImageBufferFromEvents(eventsPath);
  ensureDirectoryFor(outputPngPath);
  if (eventBuffer) {
    fs.writeFileSync(outputPngPath, eventBuffer);
  } else {
    const generatedPng = findNewestNewGeneratedPng(generatedImagesRoot, beforeGeneratedImages);
    if (!generatedPng) {
      const diagnostics = diagnoseCodexImageGeneration({ eventsPath, outputPath });
      const error = new Error("No new Codex generated PNG found");
      error.diagnostics = diagnostics;
      throw error;
    }
    fs.copyFileSync(generatedPng, outputPngPath);
  }

  validatePngFile(outputPngPath);
  return {
    pngPath: outputPngPath,
    diagnostics: diagnoseCodexImageGeneration({ eventsPath, outputPath })
  };
}

module.exports = {
  buildCodexArgs,
  buildImageGenerationPrompt,
  diagnoseCodexImageGeneration,
  runCodexImageGeneration
};

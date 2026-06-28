const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");

test("root package exposes repeatable real Codex verification", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(packageJson.scripts["verify:real"], "node scripts/verify-real-generation.js");

  const script = fs.readFileSync(path.join(root, "scripts/verify-real-generation.js"), "utf8");
  assert.match(script, /painting/i);
  assert.match(script, /calligraphy/i);
  assert.match(script, /fusion/i);
  assert.match(script, /INKSPIRE_REAL_CODEX/);
  assert.match(script, /request\.agent\(app\)/);
  assert.match(script, /waitForJob/);
  assert.match(script, /\/api\/jobs\/\$\{jobId\}/);
  assert.match(script, /minBytes/);
  assert.match(script, /source photo["'][\s\S]*minBytes:\s*1/);
  assert.match(script, /generation_profile/);
  assert.match(script, /profileSummary/);
});

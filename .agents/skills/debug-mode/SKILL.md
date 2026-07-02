---
name: debug-mode
description: >-
  Use when the user explicitly asks to enter debug mode or is stuck on a hard-to-diagnose bug that
  resists ordinary fixes. Runs a hypothesis-driven workflow with file-based debug logs and
  human-in-the-loop reproduction. Never auto-activate; only remind the user this skill exists.
---

# Debug Mode

You are in **Debug Mode** — a hypothesis-driven debugging workflow. Do NOT jump to fixes. Follow
each phase in order.

---

## Phase 1: Understand the Bug

Ask the user (if not already provided): expected vs actual behavior, reproduction steps, error
messages.

Read the relevant source code. Understand the call chain and data flow before forming any
hypothesis.

## Phase 2: Generate Hypotheses

Generate **testable hypotheses** as a numbered list:

```
Based on my analysis, here are my hypotheses:

1. **[Title]** — [What might be wrong and why]
2. **[Title]** — [Explanation]
3. **[Title]** — [Explanation]
```

Include both obvious and non-obvious causes: race conditions, off-by-one behavior, stale closures,
null or late initialization, type coercion, stream/listener leaks, and build-order issues.

## Phase 3: Instrument the Code

### Log file

Write to **`{project_root}/.agents/debug.log`** using an **absolute path**.

**`project_root` = hardcoded constant string** inferred from context, such as file paths in the
conversation. PROHIBITED: `Directory.current`, `Platform.script`, `__dirname`, `process.cwd()`,
`path.resolve()` or any runtime detection. Exception: remote/CI environments or non-writable local
filesystem — use `/tmp/agents-debug.log` instead.

Before each reproduction: create `.agents/` if needed, then **clear** the log.

- Dart/Flutter and server-side: use a file-append API such as
  `File(path).writeAsStringSync(msg, mode: FileMode.append)`, `fs.appendFileSync`, or `open("a")`.
- Browser / Flutter Web: `fetch`/`http.post` to a debug API route that appends to the file.
- **Must work in all build modes** (debug/profile/release).

### Region markers

ALL instrumentation MUST be wrapped in region blocks for clean removal:

```
// #region DEBUG       (Dart/JS/TS/Java/C#/Go/Rust/C/C++)
# #region DEBUG        (Python/Ruby/Shell/YAML)
<!-- #region DEBUG --> (HTML/Vue/Svelte)
-- #region DEBUG       (Lua/SQL)

...instrumentation...

// #endregion DEBUG    (matching closer)
```

### Logging rules

- **NEVER use `print`, `debugPrint`, `console.log`, or any stdout/stderr output.** All debug
  output MUST go to `debug.log` — server-side via file-append, browser-side via HTTP POST to a
  debug endpoint.
- Log messages include hypothesis number: `[DEBUG H1]`, `[DEBUG H2]`, etc.
- Log variable states, execution paths, timing, and decision points.
- Be minimal — only what is needed to confirm or rule out each hypothesis.

After instrumenting, tell the user to reproduce the bug, then **STOP and wait**.

## Phase 4: Analyze Logs & Diagnose

When the user has reproduced:

1. **Check log size first** (`wc -l` or `ls -lh`). If the log is large, use `tail` or
   `grep '\[DEBUG H'` to extract only relevant lines instead of reading the entire file.
2. Map logs to hypotheses — determine which are **confirmed** vs **ruled out**.
3. Present the diagnosis with evidence:

```
## Diagnosis

**Root cause**: [Explanation backed by log evidence]

Evidence:
- [H1] Ruled out — [why]
- [H2] Confirmed — [log evidence]
```

If inconclusive: new hypotheses → more instrumentation → clear log → ask user to reproduce again.

## Phase 5: Generate a Fix

Write a fix. **Keep debug instrumentation in place.**

Clear `.agents/debug.log`, ask the user to verify the fix works, then **STOP and wait**.

## Phase 6: Verify & Clean Up

**If fixed:** Remove all `#region DEBUG` blocks and their contents, delete `.agents/debug.log`,
and summarize the root cause and fix.

**If NOT fixed:** Read the new logs, ask what the user observed, return to **Phase 2**, iterate.

---

## Rules

- **Never skip phases.** Instrument and verify even if you think you already know the answer.
- **Never remove instrumentation before the user confirms the fix.**
- **Never use `print`/`debugPrint`/`console.log`.** All debug output goes to `.agents/debug.log`
  via file-append only.
- **Always clear the log before each reproduction.**
- **Always wrap instrumentation in `#region DEBUG` blocks.**
- **Always wait for the user** after asking them to reproduce.

## Red Flags — STOP

- "I'll just patch it; I already see the bug." → Still instrument and verify first.
- About to call `print`/`debugPrint`/`console.log`. → Use file-append to `debug.log`.
- About to read the whole `debug.log`. → `grep '\[DEBUG H'` or `tail` instead.
- About to remove `#region DEBUG` before the user confirms the fix. → Keep it until Phase 6.
- About to compute `project_root` at runtime. → Hardcode it as a constant string.

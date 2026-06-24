# Rule Config

Strength: `Mandatory`

## Strength Levels

- `Mandatory`: Follow unless a higher-priority instruction overrides it.
- `Default`: Follow unless the task or a more specific rule gives good reason to differ.
- `Advisory`: Guidance only — adapt to the task context when needed.

## Precedence

Resolve conflicts in order:

1. Direct system, developer, and user instructions override repository rules.
2. More specific rules (narrower `globs` or scope) override more general rules.
3. Among rules of equal specificity: `Mandatory` > `Default` > `Advisory`.
4. When an advisory guideline (e.g. structure layout) conflicts with a `Mandatory` project rule
   or an enforced lint, follow the enforced constraint.

## Source of Truth

Keep one source of truth per asset. Every platform-specific file is a thin wrapper that references
the source.

| Asset            | Source of truth                          |
| ---------------- | ---------------------------------------- |
| Project rules    | `.agents/rules/<nn>-<name>.md`           |
| Agent prompts    | `.agents/agents/<name>.md`               |
| Project skills   | `.agents/skills/<skill>/SKILL.md`        |
| Shared skills    | `.skillshare/skills/<skill>/SKILL.md`    |
| Copilot guidance | `.github/instructions/*.instructions.md` |

Core requirements:

- Use repository-root-relative paths. No absolute filesystem paths in tracked config.
- If the same content appears in two wrappers, move it back into the source and shrink the wrappers.
- A wrapper is thin when it carries only platform-specific metadata or runtime fields plus a
  one-line reference to the source.

## Wrapper Style

For rule sources, keep platform wrappers as references:

- Cursor: `.cursor/rules/<same-name>.mdc`
- Claude: `.claude/rules/<same-name>.md`
- Copilot: `.github/instructions/<same-name>.instructions.md`

Wrapper bodies should use this form:

```text
Apply @.agents/rules/<nn>-<name>.md
```

When adding a rule:

1. Author the source at `.agents/rules/<nn>-<name>.md`.
2. Add platform wrappers for Cursor, Claude, and Copilot when that platform should load the rule.
3. Update `AGENTS.md` when the rule changes which paths or workflows it applies to.

When adding a subagent:

1. Author the shared prompt at `.agents/agents/<name>.md`.
2. Add thin wrappers for Cursor, Claude, Codex, and Copilot when those platforms should expose it.
3. Keep repository-wide Copilot guidance in `.github/instructions/*.instructions.md`; subagent
   prompts do not duplicate it.

## Numbering Convention

| Range   | Scope                                                        |
| ------- | ------------------------------------------------------------ |
| `00–09` | Global rules: strength, personality, response format, skills. |
| `10–19` | Base rules: language conventions and other shared defaults.  |
| `20–29` | Project rules: tooling, conventions, structure, utilities.   |
| `30–39` | Module rules: features, screens, or bounded subsystems.      |
| `40–49` | Domain rules: testing and other cross-cutting concerns.      |
| `50–59` | Plugin, third-party plugin, or package-specific rules.       |

Finish reading the applicable `00–09` global rules before deciding whether any later numbered
rule applies.

## MCP Config

Server naming and intent must stay consistent across platforms. Keep concrete project server
names, ports, binaries, and service dependencies in the project tooling rule or config owner
docs, not in this global rule. Prefer relative or command-based config over machine-specific
paths.

| Platform    | File                 | Notes                                    |
| ----------- | -------------------- | ---------------------------------------- |
| Cursor      | `.cursor/mcp.json`   | Shared intent.                           |
| Claude      | `.claude/mcp.json`   | Thin wrapper aligned with shared intent. |
| Codex       | `.codex/config.toml` | Runtime MCP entries.                     |
| Copilot CLI | `.vscode/mcp.json`   | Top-level key is `servers`.              |

## Skill Layout

- Skills are portable units. Do not hardcode repository-specific paths into `SKILL.md`.
- Inside `SKILL.md`, reference skill-owned files relative to the skill directory.
- `.agents/skills/` is the runtime skill location. It can contain project-owned skills and synced
  or linked shared skills from `.skillshare/skills/`.
- Describe project targets semantically; let the agent resolve concrete paths at runtime.
- Repository-specific policy belongs in `.agents/rules/`. Reusable workflow that would apply in
  another repo belongs in a skill.

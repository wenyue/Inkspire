---
name: update-project-rules
description: >-
  Sync public agent rules, reusable skills, and reusable subagents from wenyue/agents into the
  current repository, then create or refresh project-local rules, entry files, platform wrappers,
  and optional third-party skill state.
---

# Update Project Rules

Synchronize public configuration from `wenyue/agents`, then update the current repository's local
project rules from repository evidence.

## Core Rules

- Treat `wenyue/agents` as the default public configuration source.
- Do not require the user to provide another repository as a comparison source.
- Do not copy project facts from `wenyue/agents` into local `20+` rules. Local project rules must
  be generated from the current repository's files, commands, tooling, modules, and runtime facts.
- Do not stop at drift reports. Calling this skill means updating files unless the repository is
  already aligned or one unsafe ambiguity requires user input.
- Keep wrappers thin: platform metadata plus one source reference.
- Use repository-root-relative paths. Do not write machine-specific absolute paths into tracked
  config.
- Do not use skillshare to install or sync `wenyue/agents` public rules, skills, or subagents.
  Skillshare is only for third-party skills that should remain independently upgradable.

## Public Source Sets

Public rules:

- `.agents/rules/00-global-rule-config.md`
- `.agents/rules/01-global-personality.md`
- `.agents/rules/02-global-response-format.md`
- `.agents/rules/03-global-skill-config.md`
- `.agents/rules/10-base-code.md`
- `.agents/rules/11-base-go.md`
- `.agents/rules/11-base-flutter.md`
- `.agents/rules/11-base-cpp.md`
- `.agents/rules/12-base-arb.md`

Public skills:

- `.agents/skills/update-project-rules/`
- `.agents/skills/refactor-code/`
- `.agents/skills/rename/`
- `.agents/skills/write-comment/`
- `.agents/skills/debug-mode/`

Public subagents:

- `.agents/agents/rename.md`
- `.agents/agents/verifier.md`

Excluded examples:

- `dart-verify`
- `l10n`
- `l10n-*`
- business-specific skills
- `create-icon`
- `take-screenshot`
- `get-runtime-errors`
- `flutter-inspector-vm-connection`
- `sentry-fix-issues`

## Workflow

1. Read `AGENTS.md`, then all applicable `00-*` through `09-*` rules already present in the current
   repository.
2. Locate the public source from the repository reference, attached workspace context, or local path
   provided to the coding agent. If the public source files are not readable, stop and ask the user
   to provide access to `wenyue/agents` instead of inventing a download or install flow.
3. Copy the public source sets into the current repository:
   - public rules to `.agents/rules/`
   - public skills to `.agents/skills/`
   - public subagents to `.agents/agents/`
4. Do not copy excluded skills, excluded subagents, project-owned rules, generated metadata, or
   source repository runtime files.
5. Create or update project-local rules from current repository evidence:
   - `20-project-tools.md`: commands, MCP/runtime services, watcher facts, verification workflows,
     and skill handoffs.
   - `21-project-rules.md`: project APIs, wrappers, generated-file boundaries, lint interpretation,
     lifecycle rules, and domain conventions.
   - `22-project-structure.md`: top-level modules, feature layout, dependency direction, shared
     locations, and configuration ownership.
6. Update `AGENTS.md` from the public template while preserving current project facts in local
   `20+` rules.
7. Align wrappers for existing platforms:
   - rule source `.agents/rules/<name>.md` maps to `.cursor/rules/<name>.mdc`,
     `.claude/rules/<name>.md`, and `.github/instructions/<name>.instructions.md`.
   - subagent source `.agents/agents/<name>.md` maps to `.cursor/agents/<name>.md`,
     `.claude/agents/<name>.md`, `.codex/agents/<name>.toml`, and
     `.github/agents/<name>.agent.md`.
8. If the project intentionally uses skillshare for third-party skills, run
   `skillshare update --all -p` and `skillshare sync -p`. Skip this step when no
   `.skillshare/config.yaml` exists, and never use it to sync the `wenyue/agents` public source.
9. Preserve existing project facts unless the user explicitly asks to change them.

## Local Rule Guidance

### `20-project-tools.md`

Record stable tooling facts: package manager, scripts, tests, builds, code generation, MCP servers,
runtime services, ports, health checks, watcher markers, verification order, and task-specific
skill handoffs.

### `21-project-rules.md`

Record project APIs and conventions: local hooks, services, routes, state management, theming,
logging, storage, generated-file boundaries, custom lint interpretation, domain terms, prefixes,
and lifecycle constraints.

### `22-project-structure.md`

Record layout and boundaries: top-level modules, feature layout, dependency direction, forbidden
dependencies, shared locations, and configuration ownership. If dependency order is enforced by a
real config file, link to that file instead of duplicating the full rule.

## Wrapper Maps

Rule wrappers use:

```text
Apply @.agents/rules/<nn>-<name>.md
```

Subagent wrappers use:

```text
Apply @.agents/agents/<name>.md
```

Codex subagent wrappers may use TOML fields required by Codex, but the prompt body should still be
only the source reference.

## Validation

Run fresh checks before reporting completion:

```bash
rg -n '/ho''me/|/Us''ers/|[A-Z]:\\' AGENTS.md .agents .cursor .claude .codex .github .vscode || true
rg -n 'copied fr''om|sync place''holder|wenyue/skills[.]git' \
  AGENTS.md README.md .agents .cursor .claude .codex .github .vscode || true
rg -n '^Apply @\.agents/rules/[0-9][0-9]-.*\.md$' .cursor/rules .claude/rules .github/instructions || true
rg -n '^Apply @\.agents/agents/.*\.md$' .cursor/agents .claude/agents .github/agents || true
```

If a listed directory does not exist, adjust the command to skip it instead of treating the missing
directory as a rule failure.

For documentation-only rule/config changes, skip language build or test commands unless code,
generated files, or executable scripts changed.

## Output

- List changed files, or state that no edits were required.
- Summarize copied public rules, public skills, public subagents, and adapted project-local rules.
- Report intentionally skipped excluded content.
- Report validation commands and whether language build/test commands were skipped.

---
name: update-project-rules
description: >-
  Update repository agent rule sources and their platform wrappers. Use when Codex must sync
  shared/base rules with a reference project, refresh project-owned rules from current repository
  facts, update AGENTS.md, align Cursor/Claude/GitHub/Codex rule or agent wrappers, or reconcile
  MCP/runtime config that follows the shared agent configuration structure.
---

# Update Project Rules

Update rule sources first. Then align every entry file, wrapper, and runtime config that follows
from those sources.

## Core Rules

- Use a rule-source workflow for `.agents/rules/*.md`: decide the rule range, scope, strength,
  target files, source-of-truth role, wrapper mapping, and validation before editing.
- Treat `.agents/rules/<nn>-<name>.md` as the source of truth for project rules.
- Do not stop at drift reports. Calling this skill means updating files unless the repository is
  already aligned or one unsafe ambiguity requires user input.
- When the user explicitly asks only to explain, review, or evaluate this skill or the rule system,
  do not edit files; report concrete recommendations instead.
- Do not update wrappers as a substitute for updating stale rule sources.
- Keep wrappers thin: platform metadata plus one `Apply @...` reference.

## Rule Ranges

- `00-*` through `09-*`: shared/global rules. When a reference project is supplied, copy or sync
  these from the reference unless the user explicitly says the current project is the source.
- `10-*` through `19-*`: shared/base rules, usually language-level defaults. Use a reference
  project heavily for structure and wording, but still verify the final content against the
  current repository's actual language, tooling, lint, build, and generated-file setup.
- `20-*` through `59-*`: project-owned rules. Update these from the current repository's actual
  tools, languages, modules, domains, packages, and verification workflows. Use a reference project
  only for structure or wording patterns.
- Other numbered ranges: follow the repository's own numbering policy. If none exists, treat them
  as project-owned.

## Workflow

1. Read `AGENTS.md`, then all applicable `00-*` through `09-*` rules.
2. Inventory current files:
   - `.agents/rules/*.md`
   - `AGENTS.md`
   - `.cursor/rules/*.mdc`, `.claude/rules/*.md`, `.github/instructions/*.instructions.md`
   - `.agents/agents/*.md`, `.cursor/agents/*.md`, `.claude/agents/*.md`,
     `.codex/agents/*.toml`, `.github/agents/*.agent.md` when agents are in scope
   - `.cursor/mcp.json`, `.claude/mcp.json`, `.codex/config.toml`, `.vscode/mcp.json`
     when MCP/runtime config is in scope.
3. If a reference project is supplied, inventory the same paths there.
4. Decide the final rule source set before editing:
   - which shared/global rules to copy or sync from the reference
   - which base rules to adapt from the reference after current-repository fact checks
   - which project-owned rules to create, rewrite, rename, or remove
   - which current project facts must be preserved
   - which reference-only facts must not be copied.
   Record this as a short decision table before making broad edits.
5. Update `.agents/rules/`:
   - directly copy platform-neutral shared/global rule text when appropriate
   - adapt shared/base language rules from both reference wording and current repository evidence
   - adapt project-owned rules from current repository evidence
   - keep repository-specific facts out of shared/base rules
   - keep reusable workflow guidance in skills, not project policy rules.
6. Align entry files and wrappers:
   - update `AGENTS.md` when rule paths, scopes, strengths, or application order change
   - create, rename, update, or remove rule wrappers to match the final rule source inventory
   - update agent wrappers and runtime config when shared agent prompts or entries drift
   - update MCP/runtime config only when it is part of the requested or discovered drift.
7. Preserve existing project facts unless the user explicitly asks to change them.

## Evidence Sources

Use current repository evidence for every project-owned rule and for any base rule that mentions
language tools or generated files. Prefer concrete files over assumptions, such as package
manifests, build and lint config, test directories, CI or script commands, MCP config, generated
file config, existing wrapper metadata, and the repository directory structure.

## Wrapper Maps

- Rule source `.agents/rules/<name>.md` maps to:
  - `.cursor/rules/<name>.mdc`
  - `.claude/rules/<name>.md`
  - `.github/instructions/<name>.instructions.md`
- Agent source `.agents/agents/<name>.md` maps to:
  - `.cursor/agents/<name>.md`
  - `.claude/agents/<name>.md`
  - `.codex/agents/<name>.toml`
  - `.github/agents/<name>.agent.md`
- MCP/runtime config uses the repository's shared platform files. Preserve platform schema
  differences and keep server intent aligned across platforms.
- Preserve required wrapper metadata or schema fields. Thin wrappers may keep platform metadata,
  but their reusable instruction body should be only the `Apply @...` reference.

## Validation

Run fresh checks before reporting completion:

```bash
find .cursor/rules .claude/rules .github/instructions -type f \
  \( -name '*.mdc' -o -name '*.md' -o -name '*.instructions.md' \) \
  -print -exec rg -n '^Apply @\.agents/rules/[0-9][0-9]-.*\.md$' {} \;
find .cursor/agents .claude/agents .github/agents -type f \
  \( -name '*.md' -o -name '*.agent.md' \) \
  -print -exec rg -n '^Apply @\.agents/agents/.*\.md$' {} \;
rg -n '/ho''me/|/Us''ers/|[A-Z]:\\' AGENTS.md .agents .cursor .claude .codex .github .vscode || true
rg -n 'copied fr''om|TODO sy''nc' AGENTS.md .agents .cursor .claude .codex .github .vscode || true
awk 'length($0) > 120 { print FILENAME ":" FNR ":" length($0) ":" $0 }' <changed-files>
```

If a listed directory does not exist, adjust the command to skip it instead of treating the missing
directory as a rule failure. Replace `<changed-files>` with the actual changed file list.

If a reference project was used, add its basename, old package names, and reference-only tool names
to the stale-reference scan.

For documentation-only rule/config changes, skip language build or test commands unless code,
generated files, or executable scripts changed.

## Output

- List changed files, or state that no edits were required.
- Summarize copied shared/base rules, adapted project-owned rules, and intentionally skipped
  reference-only content.
- Report configuration issues found, including fixed issues.
- Report validation commands and whether language build/test commands were skipped.

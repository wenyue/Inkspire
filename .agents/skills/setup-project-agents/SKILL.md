---
name: setup-project-agents
description: >-
  Set up or sync repository agent assets from the wenyue/agents public catalog. Use when Codex must
  initialize .agents rules, public skills, shared subagents, AGENTS.md, and thin
  Cursor/Claude/GitHub/Codex wrappers; refresh project-owned rules or project skills from current
  repository facts; or reconcile MCP/runtime config that follows the shared agent configuration
  structure.
---

# Setup Project Agents

Sync public assets, then regenerate project-owned rules and environment setup from current target
repository evidence.

## Core Rules

- Public assets mirrored from `wenyue/agents` stay public; do not locally adapt them.
- Project-owned rules and skills are regenerated from current target repository evidence.
- Write every generated or refreshed project-owned rule and skill in English.
- Run `scripts/sync_public_agent_assets.py` before changing project-owned agent assets.
- The sync script mirrors public assets, regenerates thin wrappers and entry files, and deletes
  retired skill directories associated with catalog entries. It does not generate project-owned
  content.
- The sync script always fetches the configured public GitHub archive. Do not use local source
  checkouts, caches, or stale snapshots.
- Treat `.agents/rules/<nn>-<name>.md` and `.agents/skills/<project-skill>/SKILL.md` as sources of
  truth in the target repository.
- Use a subagent to generate project-owned files from generator contracts and current evidence. If
  no subagent capability is available, report a blocker instead of generating them in the main
  agent.
- Review complete candidate file contents before applying them. Do not request or apply patch
  fragments for generated project-owned assets.

## Workflow

1. Read `AGENTS.md`, then all applicable `00-*` through `09-*` rules.
2. Run `python3 .agents/skills/setup-project-agents/scripts/sync_public_agent_assets.py`.
3. Review created, updated, and deleted paths. The public sync must
   delete `.agents/skills/project-development-workflow/` when present.
4. Do not read, copy, or migrate the deleted skill. Do not restore it if later generation or
   validation fails.
5. Dispatch a subagent to regenerate project rules from current target repository evidence and the
   public generator contracts, including `.agents/rules/20-project-tools.md`,
   `.agents/rules/21-project-rules.md`, and `.agents/rules/22-project-structure.md`.
6. Have the same subagent generate `.agents/skills/worktree-environment-setup/SKILL.md` entirely
   from current target repository evidence. The generated skill prepares an already-created
   worktree; it does not create, implement, verify a baseline, integrate, or clean up worktrees.
7. Review and apply the complete candidate files.
8. If `worktree-environment-setup` was created or materially changed, run the acceptance workflow
   below. The ordinary use of an unchanged generated skill does not repeat acceptance.
9. Run the public sync script again so wrappers and entry files reflect the refreshed sources.
10. Run validation and report final changed files, deletion/regeneration work, acceptance results,
    and blockers.

## Environment Skill Evidence

Generate the environment skill from:

- `.agents/rules/20-project-tools.md`;
- package manifests and lock files;
- build, lint, type-check, format, test, and code-generation configuration;
- project scripts and CI workflows;
- generated-file ownership;
- required local services, environment variables, credentials, data, and command working
  directories.

Do not infer commands from the deleted skill or from generic language conventions when the target
repository provides a concrete command.

## Environment Skill Acceptance

When the candidate was created or materially changed:

1. Create a real temporary worktree outside the generated environment skill.
2. Make the exact candidate skill and relevant tooling rules available there. When they are not
   committed, copy byte-identical content and verify equality before invoking the candidate.
3. Invoke the candidate from the temporary worktree.
4. Verify dependency setup, required generated files, required services, and command working
   directories.
5. Functionally invoke every required linter, checker, and formatter with real project
   configuration. A version command alone is insufficient; formatters use non-writing check or
   dry-run modes.
6. Confirm the candidate did not create or remove worktrees, implement business changes, create
   commits, integrate branches, or modify agent configuration.
7. Mark the candidate accepted only after every required check passes, then remove the acceptance
   worktree safely.

If acceptance fails, keep the new candidate marked unaccepted, report the exact failing command and
blocker, and do not restore `project-development-workflow`.

## Wrapper Maps

- Rule source `.agents/rules/<name>.md` maps to Cursor, Claude, and GitHub thin wrappers.
- Agent source `.agents/agents/<name>.md` maps to Cursor, Claude, Codex, and GitHub thin wrappers.
- Preserve platform metadata and schema differences; reusable wrapper bodies contain only their
  `Apply @...` reference.

## Validation

For public-source edits in `wenyue/agents`, run:

```bash
python3 .agents/skills/setup-project-agents/scripts/test_sync_public_agent_assets.py
```

For target repository updates after syncing public assets, run:

```bash
python3 .agents/skills/setup-project-agents/scripts/sync_public_agent_assets.py --check
```

## Output

- List final changed and deleted files.
- Summarize public sync and project-owned regeneration separately.
- Report environment-skill acceptance only when it ran.
- Report validation commands and blockers exactly; do not describe skipped checks as passed.

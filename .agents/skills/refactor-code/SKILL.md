---
name: refactor-code
description: >-
  Refactor code by first selecting one of three modes: format refactor, logic refactor, or deep
  refactor. Use when the user asks to refactor, restructure, clean up, improve readability, rename
  private code, simplify control flow, rewrite internals, remove legacy burden, or simplify public
  interfaces.
---

# Refactor Code

Use this skill to choose and execute the right refactoring depth.

If the user has not explicitly selected a mode, ask which refactor mode to use before editing:

1. Format refactor
2. Logic refactor
3. Deep refactor

All three modes must follow the current repository's `AGENTS.md` and applicable project rules before
making changes. Project rules take precedence over this skill.

## Format Refactor

Use format refactor to improve readability and local structure without changing behavior.

Constraints:

- Do not change logic.
- Do not change public interfaces.
- Do not change observable behavior, persistence formats, state semantics, or cross-module contracts.
- You may split or merge functions.
- You may rename functions or variables when the names are not public API.
- You may simplify local control flow, reorder branches, adjust helper boundaries, and reduce duplication.
- Do not extract tiny helpers only to reduce line count.

Workflow:

1. Identify the concrete readability problem: names, ordering, branching, duplication, helper
   boundaries, or local structure.
2. Read nearby code and follow the style already used in that area.
3. Refactor in behavior-preserving steps.
4. Remove dead code, obsolete parameters, or redundant wrappers only when the refactor clearly makes them unnecessary.
5. Verify with relevant tests, analyzer output, or project-specific checks before claiming completion.

## Logic Refactor

Use logic refactor to rebuild internal logic from scratch while preserving the external contract.
The goal is to remove historical burden and make the implementation easier to understand.

Constraints:

- Do not change public interfaces.
- Do not change external contracts, persistence formats, or user-visible behavior.
- You may rewrite internal logic, data flow, state ownership, and private helper structures.
- Do not preserve obsolete branches, wrappers, compatibility paths, or migration scaffolding after
  the new implementation replaces them, unless the user explicitly asks for a gradual migration
  path.

Workflow:

1. Read all code that needs refactoring and the relevant call sites.
2. Understand what the current code does before designing the replacement.
3. Ask the user about unclear domain rules, edge cases, compatibility requirements, or historical behavior.
4. Once the important details are understood, define the target internal model: responsibilities,
   data flow, state ownership, error handling, and caller interaction.
5. If the logic is complex or risky, add or update unit tests first to pin current output and
   boundary behavior. Unit tests are recommended for complex refactors but are not mandatory for
   simple or low-risk logic.
6. Rewrite the internal implementation from scratch instead of layering new patches on top of the old structure.
7. If tests relied on obsolete internals, update the tests to target the preserved external
   behavior and the new implementation shape.
8. Verify that behavior before and after the refactor remains consistent at the external boundary.

## Deep Refactor

Use deep refactor when logic refactor is not enough and simplifying public interfaces or external
contracts would make the design substantially cleaner.

Constraints:

- You may change public interfaces, public APIs, cross-module contracts, persistence formats,
  protocols, or user-visible behavior only after confirming with the user.
- Before changing an external surface, explain the reason, impact, migration cost, and reasonable alternatives.
- If you encounter compatibility issues such as old data, old protocols, old storage formats,
  integrations, or legacy callers, ask the user whether compatibility is required.
- Make the compatibility trade-off explicit: dropping compatibility may allow much cleaner code,
  and that cost may be acceptable for the project.
- You may delete or simplify obsolete public interfaces, adapters, compatibility branches, and old
  abstractions after confirmation.
- Do not introduce generic frameworks, configuration layers, or extension points for hypothetical future needs.

Workflow:

1. Perform the same understanding, modeling, and risk analysis required for a logic refactor.
2. List every public interface, external contract, persistence shape, protocol, or user-visible
   behavior that should change.
3. For each compatibility concern, ask whether the user wants to keep compatibility or accept a breaking cleanup.
4. Confirm the requested external changes with the user before editing those surfaces.
5. After confirmation, rewrite the implementation and update callers, tests, and documented contracts.
6. Remove old entry points and compatibility paths that the user agreed to drop.
7. Verify the new public surface and key behavior with relevant tests, analyzer output, or runtime checks.

## Anti-Patterns

- Expanding a format refactor into a logic or deep refactor without confirmation.
- Hiding behavior, contract, protocol, or persistence changes under the word "refactor".
- Producing a large code shuffle that does not improve readability, ownership, or logic clarity.
- Keeping the old architecture intact and wrapping a new abstraction around it.
- Adding public APIs, test seams, or adapters only to make tests easier.
- Leaving old paths behind after nothing should depend on them.

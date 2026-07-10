---
name: rename
description: >-
  Renaming specialist for classes, functions, methods, variables, and other symbols. Use
  proactively when the user asks to rename something, refactor names, fix typos, or enforce naming
  consistency.
user-invocable: false
---

# Rename Symbols

Carry out a complete rename: pin down the symbol identity, update every reference, align with
project naming conventions, and verify.

## Workflow

1. **Identify** the target symbol: name, kind, and scope. If the scope is ambiguous, ask the user
   or narrow the rename to the obviously intended target only.
2. **Find references** with a whole-word project-wide search. Ignore generated files unless the user
   explicitly asks to include them.
3. **Rename** in order: the declaration first, then all references. Also update comments and string
   literals that mirror the symbol. Leave JSON keys, external API field names, and config keys
   untouched unless the user says otherwise.
4. **Conventions**: follow the target project's type, member, and file naming rules. When the
   surrounding code already diverges from those defaults, match the existing project style.
5. **Verify**: run the analyzer and the relevant tests, and fix any new errors.

## Rules

- The same name in different scopes counts as separate renames. Do not apply a rename across scopes
  unless the user explicitly asks for project-wide renaming.
- For symbols that are part of a public API, add a deprecated alias where callers would otherwise
  break, and do not remove the old name without an agreed migration path.
- For generated files: rename the source and regenerate; never hand-edit generated output.

## Output

Short summary: what was renamed, how many call sites changed, and the result of verification.

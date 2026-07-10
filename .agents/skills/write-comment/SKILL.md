---
name: write-comment
description: >-
  Writes comments that satisfy project formatting rules and add non-obvious information. Use when
  adding or editing comments.
---

# Write Comment

Comments must satisfy the target project's formatting and lint rules. This skill additionally
enforces that every comment earns its place by carrying information the code alone does not convey.

## Format Rules

1. Uppercase first word, end with `.` `?` or `!`.
2. English only.
3. One space after `//` or `///`.
4. `///` for declarations (class, method, field, function). `//` for inline/body.

## Information Density

A comment must add something the reader cannot get from the name, signature, type, or the next
obvious line of code. If it only restates them, delete it.

- Good: behavior, constraints, edge cases, failure modes, invariants, intent, rationale.
- Bad: rephrasing the symbol name, or decorative labels that sound formal but say nothing.
- Test: "What would the reader miss without this comment?" If "nothing", do not write it.

## Tone

- **Imperative** for method doc comments: "Return the cached item for [id], or null if it expired."
- **Third person, present tense** for getters, fields, and behavior descriptions: "Returns null
  when the cache is stale." or "Cache for the last page fetched from disk."
- **Active voice over passive**: "Skips empty segments." not "Empty segments are skipped."
- One idea per comment.

## Per-Context Examples

| Context     | Style                             | Example                                                                       |
| ----------- | --------------------------------- | ----------------------------------------------------------------------------- |
| File header | `///` What this file does.        | `/// Widgets that align settings rows.`                                       |
| Class/enum  | `///` Responsibility.             | `/// Controller that serializes refresh requests to avoid duplicate fetches.` |
| Constructor | `///` What/when.                  | `/// Creates a tile that reserves space for the progress label.`              |
| Method      | `///` Imperative.                 | `/// Return the cached item for [id], or null if it expired.`                 |
| Getter      | `///` "Returns X." / "True if X." | `/// True if the queue still has retryable jobs.`                             |
| Field       | `///` What it holds.              | `/// Cache for the last page fetched from disk.`                              |
| Inline      | `//` Why, not what.               | `// Avoid rebuilding when key is unchanged.`                                  |

## Exempt (sentence-shape rules do not apply)

- **Markers**: `TODO`, `FIXME`, `NOTE`, `WARNING`, `DEPRECATED`, `HACK`, `XXX`, `BUG`,
  `NOCOMMIT`, `TEMP`, `TEMPORY`, `ignore:`, `ignore_for_file:`, `cspell:`.
- **URLs**: the comment contains `http://`, `https://`, `www.`, or `ftp://`.
- **Code-like**: the comment reads as code, e.g. `foo()`, `bar =`, `CONST_NAME`.
- **Doc/API directive**: the comment starts with `@` or `\`.
- **Short inline**: the comment sits on the same line as code and is at most 16 characters and 3 words.

## Multi-Line

- First line: standalone summary sentence.
- Following lines: detail; last line of paragraph ends with `.` `?` `!`.
- Blank line between paragraphs. Use `[paramName]` for parameter references.

## Sentence Patterns

- "Returns … when …." / "Returns … or null if …."
- "True if …." / "Checks whether …."
- "Loads … from …." / "Parses … while …."
- "Throws [Exception] if …." (multi-line only)

Avoid fragments: "The user id." → "The id of the user."

Use these patterns only when they add real information. `/// Loads the config.` above
`loadConfig()` is still a bad comment.

## When Not to Comment

- Obvious code (e.g. `// Increment i.` above `i++`).
- Redundant with name, full declaration, signature, or type.
- Hollow comments that add no behavior, constraints, rationale, or other non-obvious information.

## Workflow

1. `///` for declarations, `//` for inline/body.
2. Exempt? Leave as-is.
3. Otherwise: full sentence, uppercase start, end `.` `?` `!`.
4. Run the target project's lint or format command and fix comment-format reports.

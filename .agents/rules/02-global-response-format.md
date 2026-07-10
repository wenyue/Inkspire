# Response Format

Strength: `Default`

Scope: Assistant response language, tag protocol, formatting, and review/implementation reporting.

## Language

- The first assistant message after each user request restates the user's request in English.
- Final answers restate the user's request in English on the first line.
- Intermediate progress updates do not repeat the English restatement. Keep them concise and in
  Simplified Chinese.
- All remaining user-facing text is Simplified Chinese unless the user explicitly asks otherwise.

## Tag Protocol

Use these `##` headings to structure non-trivial replies. Omit empty tags and use plain prose for
very small replies.

| Tag  | Purpose                                                    |
| ---- | ---------------------------------------------------------- |
| `🎯`  | English restatement of the user's goal                     |
| `⚠️` | Risks, constraints, prerequisites, or notable assumptions  |
| `✅`  | Completed result, changed files, and verification          |
| `❌`  | Failure or blocker, with what is needed to proceed         |
| `🤖`  | User interaction: one clear question or a small option set |

Preferred order:

```text
🎯 → ⚠️ → ✅ or ❌ → 🤖
```

## Constraints

- `🎯` appears first when used, and its content is always English.
- `⚠️` appears only when there are meaningful risks or assumptions. Keep it to three items or fewer.
- `✅` and `❌` never coexist in the same final result.
- `🤖` is always terminal: after asking the user for input, stop.
- Do not add an analysis/planning section by default. Put only necessary trade-offs or decisions
  under `⚠️` or plain prose.

## General Formatting

- Use markdown: **bold**, `code`, blockquotes, tables, and fenced code blocks when they improve scanability.
- No low-information openers such as "Okay", "Got it", or "Sure".
- Prefer short paragraphs over long bullet lists for narrative text.
- Use `inline code` for paths, commands, symbols, config keys, and literal values.
- For implementation work, mention changed files and verification. If verification was skipped or
  blocked, say so plainly.
- For reviews, put findings first, ordered by severity, with file and line references when possible.
- For plans or design notes, write in Chinese and make trade-offs explicit.

## Tag Guide

### 🎯 Goal

Use for the required English restatement in the first assistant message after a user request, or
in the final answer. Do not use it for intermediate progress updates.

```markdown
## 🎯
#### Update the menu owner scope behavior.
```

### ⚠️ Warnings

Use only for meaningful risks, constraints, prerequisites, or assumptions.

```markdown
## ⚠️
> **Verification limit** — Widget behavior still needs a focused regression test.
```

### ✅ Completion

Use when work is complete. Include changed files and verification when relevant.

```markdown
## ✅
已更新 `menu_owner_scope.dart`，让 owner 变更时正确刷新菜单状态。

验证：已运行 `flutter test test/common/widgets/menu_owner_scope_test.dart`。
```

### ❌ Blocker

Use when the task cannot be completed.

```markdown
## ❌
> **缺少复现条件** — 当前信息不足以定位菜单状态不同步的触发路径。

需要提供具体操作步骤或失败测试。
```

### 🤖 Interaction

Use when ambiguity, trade-offs, scope expansion, convention deviation, or missing info warrants
user input.

Ask one question or present a small option set with a recommendation. Once `🤖` appears, end the
reply.

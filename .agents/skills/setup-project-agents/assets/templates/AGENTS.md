# Project Agent Entry

The source of truth for project instructions is `.agents/rules/`.
Do not duplicate or reinterpret those rules unless the user explicitly asks.

## How To Apply Rules

Always read the global rules first:

| Read when | Rule | Strength |
| --- | --- | --- |
{{global_rule_rows}}

Then read the base rules that apply:

| Read when | Rule | Strength |
| --- | --- | --- |
{{base_rule_rows}}

Then read the project-local rules that apply:

| Read when | Rule | Strength |
| --- | --- | --- |
{{project_rule_rows}}

The meaning of `Mandatory`, `Default`, and `Advisory` is defined in
`.agents/rules/00-global-rule-config.md`.

## Precedence

- Direct system, developer, and user instructions override everything in this file.
- Always finish reading applicable `00-09` global rules before deciding whether any later numbered
  rule applies.
- When multiple referenced rule files apply, prefer the more specific file-type or project-local
  rule over the general rule.

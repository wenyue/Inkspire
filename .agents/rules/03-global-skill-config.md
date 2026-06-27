# Skill Config

Strength: `Mandatory`

Scope: Project overrides for workflow tools, worktrees, git, and prose outputs.

## Git And Worktree

- Assume `master` is the working branch — do not switch branches or ask to confirm the branch
  unless the user requests it.
- Always operate in the current workspace. Do not create or switch into git worktrees.
- Do not automatically call `git` tools or commands. Use `git` only when the user explicitly asks
  for a git operation or asks to inspect git state.
- Never create git commits unless the user explicitly asks. This applies even when an invoked skill
  embeds `git commit` steps in its plans or prompts: skip those steps, do not pass them to
  subagents, and do not generate them when writing new plans. If commits are ever needed, ask the
  user first.

## Prose Output

- Plans, design documents, and other non-code prose files must be written in Chinese.

# Skill Config

Project overrides for skill and workflow tools. When an invoked skill conflicts with this file, follow this file.

## Superpowers

Constraints on Superpowers skills and their typical git / worktree / planning behavior. Also applies when project or other skills embed the same steps.

### Git and worktree

- Assume `master` is the working branch — do not switch branches or ask to confirm the branch unless the user requests it.
- Always operate in the current workspace. Do not create or switch into git worktrees.
- Do not automatically call `git` tools or commands. Use `git` only when the user explicitly asks for a git operation or asks to inspect git state.
- Never create git commits unless the user explicitly asks. This applies even when an invoked skill (e.g., `writing-plans`, `subagent-driven-development`, `executing-plans`) embeds `git commit` steps in its plans or prompts: skip those steps, do not pass them to subagents, and do not generate them when writing new plans. If commits are ever needed, ask the user first.

### Skill entry and output

- Do not invoke `/using-superpowers` proactively; use it only when explicitly requested.
- Plans, design documents, and other non-code prose files must be written in Chinese.

## Caveman

- Enable `caveman full` mode by default; change it only when the user explicitly asks to switch levels or disable it.

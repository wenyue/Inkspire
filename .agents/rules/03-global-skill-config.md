# Skill Config

Strength: `Mandatory`

Scope: Project overrides for workflow tools, worktrees, git, and prose outputs.

## Subagent Delegation

- The user authorizes Codex to spawn subagents when a task clearly benefits from bounded parallel
  delegation. This does not require repeating the authorization for each individual task.
- Keep delegated work concrete and self-contained. Assign disjoint ownership for code-editing
  subtasks so parallel agents do not overlap write scopes.
- Do not delegate the immediate blocking task when the main agent should handle it directly to keep
  the critical path moving.
- Report subagent usage in the final response, including the delegated purpose and whether any
  delegated changes were integrated.

## Superpowers

- Never invoke `superpowers:*` proactively.
- Use Superpowers only when the user explicitly requests it.
- References to Superpowers elsewhere do not authorize automatic activation.

## Git And Worktree

- Subject to the Superpowers policy above, delegate worktree timing, detection, consent, location,
  and creation to `superpowers:using-git-worktrees`.
- After creating a worktree, use the target repository's `worktree-environment-setup` skill when it
  exists, then run the baseline verification required by `superpowers:using-git-worktrees`.
- When worktree implementation is complete, use `worktree-integrate`. Its default review mode
  returns changes to the current checkout as unstaged or untracked work while preserving the
  current HEAD, index, and unrelated local changes.
- Use `worktree-integrate` commit mode only when the user explicitly requests committed local
  integration. The task's business changes must form one commit; a separate infrastructure commit
  that adds a missing worktree directory to `.gitignore` is allowed on the current branch.
- Use `superpowers:finishing-a-development-branch` for PR, keep-branch, or discard outcomes.
- Never overwrite, stash, reset, clean, or silently discard pre-existing local changes. A same-file
  overlap is not automatically a blocker: merge it when confidence is high and the result can be
  verified; otherwise stop and ask.
- Do not push or create a PR unless the user explicitly requests that remote action.

## Prose Output

- Use Simplified Chinese for normal user-facing prose, design documents, and other non-code prose
  files.
- Use English for concrete Superpowers execution plans. This exception applies to step-by-step
  implementation plans, not design documents.

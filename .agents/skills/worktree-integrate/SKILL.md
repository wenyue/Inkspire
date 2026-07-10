---
name: worktree-integrate
description: Use when implementation in a named Git worktree is complete and its verified changes need to return to the current checkout for manual review or an explicitly requested local commit.
---

# Worktree Integrate

Return verified task changes without losing local work. Review mode is the default. Commit mode is
available only when the user explicitly requests it.

## Shared Preflight

1. Require a linked, named task branch; stop on detached HEAD.
2. Confirm task verification passed. Classify working-tree changes and include all confirmed
   task-owned uncommitted changes in the business result; stop and ask about ambiguous or unrelated
   changes instead of committing, moving, or discarding them.
3. Discover the current/base checkout and branch using both `git worktree list --porcelain` and the
   Git common directory. Do not assume `master` or `main`; ask when the intended base is ambiguous.
4. Record the base HEAD, index tree, staged changes, unstaged changes, and untracked files.
5. On the task branch, consolidate task work relative to its merge base into exactly one business
   commit, then rebase it onto the current base HEAD. Intermediate task commits are allowed before
   this step. Auto-resolve a rebase conflict only when the result is unambiguous, limited to task
   scope, and verifiable; otherwise abort the rebase and ask the user. Require a clean task worktree
   afterward and rerun affected task checks when consolidation or rebase changed content.
6. Recompute the final commit's affected paths. Back them up outside the repository with a manifest
   that records file type and paths that were originally absent. Do not stash.
7. Immediately before touching the base, compare its branch and HEAD with the recorded values. If
   the base HEAD changed, return to the task worktree, rebase again before transfer, then refresh
   the base snapshot, affected paths, and backup. Repeat until the preflight state is current.

## Review Mode (Default)

Use this mode unless the user explicitly requests commit mode.

1. Keep the base HEAD and index unchanged.
2. For task paths without base-local changes, materialize the task result in the base working tree
   without staging it. Check the transfer first, then use only working-tree operations; never use a
   checkout, apply, or restore mode that updates the index.
3. For overlapping text paths, perform a three-way merge using the task commit parent, the current
   base working file, and the task result in temporary files before replacing the working file. A
   shared pathname alone is not a conflict. Resolve autonomously when confidence is high and
   verification can confirm the result.
4. Stop and ask for delete/modify conflicts, complex renames, binary conflicts, mutually exclusive
   behavior, ambiguous generated output, or any result that cannot be verified. Regenerate generated
   files from their source when the project provides a deterministic generator.
5. Run only verification commands known to be non-mutating; never run a formatter, generator, or
   fix mode in the base checkout. If adequate non-mutating verification is unavailable, report that
   limitation instead of risking extra paths. Then prove the recorded base HEAD and index tree are
   unchanged, the original staged state is preserved, the final working files contain both original
   local work and task work, and returned task changes are unstaged or untracked.
6. If transfer or automatic merge fails before a complete result exists, restore only touched paths
   from the external backup. On post-transfer verification failure, keep the returned working-tree
   result, task branch, worktree, and backup; report the exact failed command for manual review.

Keep the task branch and worktree after review-mode transfer so the user can inspect or recover the
source independently. Retain and report the external backup until the user accepts the review
result. Later cleanup must respect creation ownership: a platform or host worktree returns to its
native cleanup mechanism; this skill may remove only a worktree created through its Git fallback.

## Commit Mode (Explicit Only)

Use only after an explicit request for a committed integration.

1. If the base has staged, unstaged, or untracked changes on any task path, tell the user and
   downgrade to review mode.
2. Otherwise, preserve unrelated base-local changes and confirm the rebased task branch contains one
   business commit. Recheck the base branch and HEAD immediately before integration; if HEAD moved,
   return to Shared Preflight and rebase again before transfer.
3. Run `git merge --ff-only` from the base branch.
4. If fast-forward integration is refused, stop with the base and its local changes untouched; do
   not move, commit, or hide those changes to make the command succeed.
5. Re-run relevant verification and compare the preflight snapshot to prove unrelated staged,
   unstaged, and untracked state is unchanged. After verification passes, clean up according to
   creation ownership: delegate a platform or host worktree to its native mechanism; remove a Git
   fallback worktree from the base checkout, then safely delete its integrated task branch. Keep all
   recovery state when verification fails.

Never create a merge commit, push, pull, force-update, stash, reset, or clean as part of this skill.
For PR, keep-branch, or discard outcomes, hand off to `superpowers:finishing-a-development-branch`.

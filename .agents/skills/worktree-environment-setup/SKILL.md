---
name: worktree-environment-setup
description: Use when preparing an already-created linked Inkspire Git worktree before implementation begins.
---

# Worktree Environment Setup

Use this skill only inside an already-created linked Inkspire worktree. Prepare the environment
without changing the project implementation or generating assets.

## Procedure

1. Locate the repository:
   - Run `git rev-parse --show-toplevel`.
   - Change to the repository root returned by the command.
   - If the command fails, stop immediately and use the failure report format below.

2. Confirm that the repository is a linked worktree:
   - Run `git rev-parse --path-format=absolute --git-dir`.
   - Run `git rev-parse --path-format=absolute --git-common-dir`.
   - Normalize and compare the two absolute paths. Treat the repository as a linked worktree only
     when the paths differ.
   - If Git does not support these arguments, either command fails, or the result is ambiguous,
     inspect `git worktree list --porcelain`.
   - Accept the fallback only when the current repository root matches a secondary worktree entry.
     The main worktree does not qualify.
   - If a linked worktree cannot be confirmed, stop immediately.

3. Check the toolchain:
   - Run `node --version`, parse the major version, and require version `20` or later.
   - Run `npm --version` and require it to succeed.
   - Confirm that both `package.json` and `package-lock.json` exist in the repository root.
   - Stop immediately if any requirement is not met.

4. Install locked dependencies:
   - Run only `npm ci` from the repository root.
   - Do not substitute `npm install` or update the lockfile.
   - Stop immediately if installation fails.

5. Check required assets:
   - Confirm that `config/classic-artworks.json` is a file.
   - Confirm that `client/public/classic-artworks` is a directory.
   - Stop immediately if either asset is missing. Do not download or rebuild the assets.

6. Report success:
   - Report the repository root, confirmation of the linked worktree, the Node and npm versions,
     successful completion of `npm ci`, and the presence of both asset paths.
   - Stop here. Do not run any additional steps.

## Failure Report

If any step fails, report all of the following exactly:

- `Step`: Name of the failed step.
- `Command`: Command that was actually run, or the checked path for a file-only check.
- `Exit code`: Command exit code, or `N/A` when not applicable.
- `Output`: The stdout/stderr directly related to the failure, or the missing condition.
- `Action`: The smallest corrective action the user must take.

Do not hide output, assume success, continue to later steps, or automatically use an alternative.

## Prohibited Scope

Do not run baseline tests, type checks, or builds. Do not implement, commit, or integrate code. Do
not clean files, create or remove worktrees, synchronize agents, or download or rebuild the classic
artwork assets.

---
name: worktree-environment-setup
description: Use when defining, generating, or validating a target repository's environment setup skill for an already-created Git worktree.
---

# Worktree Environment Setup

This target-owned skill retains its generator contract and provides the executable Inkspire
procedure for ordinary use inside an already-created Git worktree.

## Generation Contract

`setup-project-agents` regenerates this file from current repository evidence, especially
`.agents/rules/20-project-tools.md`, package manifests, the root lockfile, project scripts, CI
configuration when present, and generated-file ownership.

The generated skill must prepare only an already-created Git worktree. It must check each command,
report the exact blocker, and stop after the environment is ready.

## What Belongs Here

- Dependency installation required in an already-created Git worktree.
- Project-specific setup for a linter, checker, formatter, compiler, or generator when the
  repository actually defines one.
- Checks for generated files, local data, credentials, environment variables, or services required
  before implementation.
- Exact failure reporting for missing tools, files, credentials, or services.
- The current executable ordinary-use preparation procedure.

## What Does Not Belong Here

- Worktree selection, consent, branch creation, or worktree creation.
- Business implementation, clean-baseline verification, task-completion verification, review,
  commit creation, rebase, integration, or cleanup.
- Agent configuration synchronization, wrapper generation, or public catalog changes.
- Commands or project facts not proven by current Inkspire evidence.
- A self-test that creates another worktree during ordinary use.

## Suggested Generated Content

The generated target skill should:

1. Confirm that it is running inside an already-created Git worktree and locate the repository
   root.
2. Install locked dependencies and perform only required environment preparation.
3. Confirm required generated files, assets, local services, and working directories.
4. Check every result and report the exact blocker without inventing a degraded path.
5. Stop when the environment is ready, leaving baseline tests, implementation, and Git integration
   to their owning workflows.

## Current Inkspire Ordinary-Use Procedure

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

## Acceptance Expectations

When `setup-project-agents` creates or materially changes this candidate, acceptance must invoke the
exact candidate from a real temporary worktree. If the candidate or relevant tooling rule is not
committed, copy byte-identical content into that worktree and verify equality before invocation.

Acceptance must functionally invoke every repository-defined linter, checker, and formatter with
real project configuration. A version command alone is insufficient; a formatter must use a
non-writing check or dry-run mode. Inkspire currently defines a TypeScript checker but no linter or
formatter. Acceptance is separate from ordinary use and must not be added to the procedure above.

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

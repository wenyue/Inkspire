# Go Base Conventions

Strength: `Default`

Scope: General Go conventions for Go code in this repository.

## Style Target

- Aim for compact, polished, readable Go: express the idea directly, keep scopes narrow, avoid
  repeated branches, and split only when a helper names a real concept or removes meaningful
  complexity.
- Do not compress code by fighting the linters. Keep the blank lines required by `wsl_v5`,
  `nlreturn`, and `whitespace`; readability here means clear blocks, not dense walls of code.
- Prefer early returns for invalid input, cancellation, and error paths. Keep the main success path
  shallow and easy to scan.
- Keep public APIs product-driven. Do not export names, add interfaces, or add seams solely for
  tests or speculative reuse.

## Formatting

- Format with `golangci-lint-v2 fmt`; do not hand-tune import grouping or line wrapping against
  `gci`, `gofmt`, `gofumpt`, `goimports`, or `golines`.
- Keep lines within `100` characters. Let `golines` wrap long calls and string concatenations.
- Import groups are standard library, third-party, then local module. Leave one blank line between
  groups and let the formatter sort them.

## Structure

- Keep functions below `funlen` limits (`80` lines / `50` statements) and below the configured
  complexity limits (`cyclop` `16`, `gocyclo` `20`, `nestif` `8`).
- Extract helpers when they flatten control flow, remove duplication, or name a domain step. Inline
  tiny one-use helpers when they only obscure straightforward code.
- Use small local structs or private helper types when they clarify data flow. Avoid broad package
  abstractions for one call site.
- Do not add `init()` functions. Initialize explicitly from constructors, `main`, or package-owned
  setup functions.

## Naming

- Exported identifiers use `PascalCase`; unexported identifiers use `camelCase`.
- Keep acronyms consistent: `ID`, `CID`, `IPFS`, `IPNS`, `DHT`, `URL`, `UDP`, `TCP`.
- Sentinel errors are `ErrX`; error types end with `Error`.
- Short names are fine only in tight scopes or the lint allow list (`err`, `ok`, `id`, `i`, `j`,
  `k`, `v`, `db`, `to`). Wider-scope values should state their role.
- Boolean names should read as predicates when practical (`ok`, `enabled`, `hasRoute`,
  `shouldRetry`).

## Errors

- Check every returned error, including blank assignments and type assertions.
- Wrap errors crossing a package boundary with useful context and `%w`; inspect with
  `errors.Is` / `errors.As`.
- Prefer existing sentinel errors before creating new dynamic errors.
- Type assertions use comma-ok form. Do not use bare `x.(T)` in production code.
- Avoid `panic`, `logger.Fatal`, and `os.Exit` outside top-level startup paths where continuing is
  impossible.

## Comments

- Write comments for intent, invariants, concurrency, retry behavior, security trade-offs, or
  non-obvious domain rules. Do not narrate the statement below the comment.
- Exported declarations need doc comments that start with the identifier and end with punctuation.
- Use short phase comments inside long multi-step functions when they make the scan path clearer.
- Keep comments in English, capitalized, and punctuated so `godot`, `revive`, and `misspell` stay
  quiet.
- Use `TODO(name): ...` / `FIXME(name): ...` only with a concrete follow-up action.
- Any `//nolint:<linter>` must include a concrete reason. Prefer code that satisfies the lint.

## Concurrency and Context

- Pass `context.Context` first where standard Go patterns apply, and honor cancellation in loops or
  long-running work.
- Avoid creating nested contexts inside loops or closures unless the code documents why the
  lifecycle is correct.
- Guard shared mutable state with the package's synchronization primitive. Keep package globals
  deliberate, stable, and initialized in one place.

## Data and Collections

- Prefer `const` for fixed values and named constants for tunable numbers. Avoid magic numbers in
  control flow.
- Preallocate slices and maps when the size is known or cheaply available.
- Deduplicate with a `map[T]struct{}` or a small helper when it makes order and uniqueness explicit.
- Use struct tags consistently; let `tagalign` and `tagliatelle` shape formatting and naming.

## Logging

- Use the package logger conventions from the owning package. Do not introduce `fmt.Print*` or the
  standard `log` package for runtime output.
- Log messages should name the operation and include the values needed to diagnose failure. Prefer
  formatted logger methods for messages with values.

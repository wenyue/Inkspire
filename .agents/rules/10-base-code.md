# Code Taste

Strength: `Default`

Scope: Cross-language code design and review defaults for production code shape.

## Ownership

- Keep behavior near the state, invariant, or module that owns it. A helper used by one class,
  service, model, or state owner belongs to that owner by default. Being stateless, pure, or
  easier to test is not enough reason to make it top-level.
- Use top-level functions or free functions only when the operation is independent of a single
  owner: shared domain logic, reusable normalization or parsing, factories without a clear owner,
  framework-required entry points, file-level declarations, or helpers used by multiple owners.
- Keep public boundaries product-driven. Do not add public APIs, test-only seams, extracted
  helpers, or adapters solely to make tests or call sites convenient.

## Naming

- Name by domain role and observable behavior, not by implementation detail.
- Prefer precise verbs for actions and state transitions. Avoid vague names such as `handle`,
  `process`, `manager`, or `utils` unless the surrounding domain makes the meaning specific.
- Boolean names should state the condition being tested, not the action to take.

## Extraction

- Prefer direct readable caller code over helper indirection. Extract only when the helper names a
  real concept, hides meaningful complexity, protects an invariant, or removes real duplication.
- Inline very small single-use helpers when their name does not add information.
- Split long workflows by decision or resource boundary, not by arbitrary line count. A longer
  function with a clear sequence is better than scattered steps that must be read together.
- Prefer functions under roughly 80 lines, but treat this as a readability guideline rather than a
  hard limit. Do not extract helpers only to satisfy a line count.

## Data and State

- Prefer immutable values and explicit data shapes. Avoid loose maps, raw tuples, flag clusters, or
  magic parameters when a named type or options object would make the contract clearer.
- Keep mutable state behind one owner. Make lifecycle, cancellation, and release paths explicit at
  that owner instead of spreading them across unrelated helpers.
- Cache stable dependencies before async or callback boundaries when the language/framework makes
  ownership fragile, but read changing state at the point of use.

## Dependencies

- Prefer passing the narrow dependency a unit needs over passing a broad owner, service, or global
  context.
- Keep dependency direction obvious from the caller. Avoid helpers that reach across layers or pull
  dependencies from hidden globals when the caller can supply them explicitly.
- Introduce adapters only at real external boundaries, not between code that already shares the
  same domain model.

## Control Flow

- Use early returns for invalid, empty, or completed cases so the main path stays visible.
- Handle expected failure locally with a typed result, status, or no-op return. Reserve exceptions
  or fatal paths for truly unexpected failures.
- Do not hide retries, fallback selection, or persistence side effects behind names that sound like
  simple getters or pure transforms.

## Comments

- Add comments sparingly when they preserve context that code cannot express clearly: intent,
  invariants, lifecycle constraints, external requirements, edge-case reasoning, non-obvious
  failure handling, or why an obvious alternative is wrong.
- Do not narrate what each line already says, describe the edit, duplicate names, or compensate for
  unclear structure that should be fixed in code.
- Prefer names and small data types over comments that explain unclear parameter order, boolean
  flags, or hidden ownership.

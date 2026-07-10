# C++ Guidelines

Strength: `Default`

Scope: C++ code style, docs, naming, and safety defaults.

## Core Defaults

English for code and docs. Explicit types. Doxygen for public APIs. Follow ODR.

## Naming

PascalCase (classes) · camelCase (variables/functions) · ALL_CAPS (constants/macros) · snake_case (files)

No magic numbers. Functions start with verbs. Booleans: `isX`/`hasX`/`canX`.

## Functions

- Single purpose, typically under 20 lines. Use early returns to flatten nesting.

```cpp
// ❌ BAD: deep nesting, many params
void process(int x, bool flag, bool verbose, int mode) {
  if (flag) {
    if (verbose) {
      /* ... */
    }
  }
}

// ✅ GOOD: flat, structured params
struct ProcessOpts { bool flag; bool verbose; int mode; };

void process(int x, const ProcessOpts& opts) {
  if (!opts.flag) { return; }
  if (!opts.verbose) { return; }
  /* ... */
}
```

## Data and Classes

- `const` for values that never change, `constexpr` for compile-time constants, `std::optional` for nullable values.
- SOLID. Composition over inheritance. Keep classes under ~200 lines.
- Rule of Five / Rule of Zero. Smart pointers over raw owning pointers. RAII for every resource.

## Errors

- Exceptions for truly unexpected errors. `std::optional` / `std::expected` / error codes for expected failure modes.

## Testing

Arrange-Act-Assert. One unit test per public function. Integration tests per module boundary.

## STL and Concurrency

- Prefer standard containers and types: `std::string`, `std::vector`, `std::map`,
  `std::optional`, `std::variant`, `std::filesystem`, `std::chrono`. Always prefer
  `std::vector` over C-style arrays.
- Concurrency: `std::thread`, `std::mutex`, `std::lock_guard`. Use `std::atomic` for lock-free shared state.

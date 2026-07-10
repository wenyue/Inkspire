# Dart And Flutter Taste

Strength: `Default`

Scope: Project-neutral Dart and Flutter application defaults.

## Boundaries

- Keep rules here reusable across Dart and Flutter apps.
- Do not put app names, project modules, custom lint package names, generated project paths, or
  project-only APIs here.
- Put repository APIs, module boundaries, custom lints, build watchers, and app-specific helpers in
  project rules instead.

## Dart Shape

### Public Surface

- Type public APIs explicitly. Let local variables infer their types when the initializer is clear.
- Keep public boundaries narrow and product-driven. Do not expose helpers for tests or convenience.
- Put required domain inputs first. Put optional execution context, such as `BuildContext?`,
  `WidgetRef?`, or provider readers, last.
- Prefer named parameters for framework-facing helpers and functions with more than one optional
  input.

### Ownership And Members

- Keep owner-local behavior as instance members by default.
- Use static members only for type-level behavior, static state, pre-instance work, or private
  construction support.
- Keep top-level functions for framework entry points, file-level declarations, shared algorithms,
  or logic with no clear owner.
- Put invariant-preserving creation or normalization on the value type that owns the invariant.

```dart
// BAD: `_isValid` only exists for `Parser`.
bool _isValid(String value) => value.isNotEmpty;

// GOOD: The helper stays with its owner.
class Parser {
  bool _isValid(String value) => value.isNotEmpty;
}
```

### Data Shape

- Keep generics concrete. Do not use raw generic types or `dynamic` unless the boundary requires it.
- Prefer immutable values. Use `final` by default and `const` for compile-time values.
- Use records only for small local tuple returns where a named type would not add clarity.
- In record destructuring, do not repeat field types that Dart can infer.

```dart
// BAD: Destructuring repeats the record field types.
final (String title, int count) = readSummary();

// GOOD: The record shape already carries the field types.
final (title, count) = readSummary();
```

### Local Style

- Write code, identifiers, and comments in English. Keep lines <= 100 characters.
- Prefer clear names and direct control flow over clever shorthand.
- Avoid `dynamic`, casts, and nullable escape hatches when a precise type or early return works.

## Naming

- Use `PascalCase` for types, `camelCase` for members, `_privateName` for private declarations,
  `snake_case.dart` for files, and `kName` for constants.
- Name booleans as conditions: `isReady`, `hasFocus`, `canSubmit`, or `shouldRetry`.
- Name operations by their effect: `load`, `save`, `update`, `delete`, `remove`, or `clear`.
- Use `delete` for destroying owned persistent data.
- Use `remove` for taking an item out of a collection, relationship, selection, cache, or view.
- Use `clear` for emptying a container while keeping the container itself.

## Declaration Order

- Treat every section comment as a new member-ordering group.
- Order declarations inside each group:
  constructors, public static fields, private static fields, public instance fields, private
  instance fields, getters, setters, public static methods, private static methods, public instance
  methods, private instance methods.
- Order public declaration modifiers as `protected`, `override`, no annotation, then
  `visibleForTesting`.

```dart
class SearchController {
  SearchController(this.query);

  static const maxResults = 50;
  static final _cache = <String, List<Result>>{};

  final String query;
  var _isLoading = false;

  bool get isLoading => _isLoading;

  static bool isCached(String query) => _cache.containsKey(query);

  Future<List<Result>> search() async => _readResults();

  Future<List<Result>> _readResults() async => _cache[query] ?? const [];
}
```

## Section Comments

- Use section comments only for top-level file regions or class/member groups.
- Do not use section comments as declaration documentation.
- Use exactly 20 `/` characters for each border line: `////////////////////`.
- Leave one blank line after the section comment before the first declaration in that section.

```dart
////////////////////
/// Public actions.
////////////////////

Future<void> refresh() async {
  await repository.refresh();
}
```

## Documentation And Comments

- Use comments for intent, invariants, lifecycle, constraints, and non-obvious failure handling.
- Do not restate the code.
- Use `///` for declaration documentation and file headers.
- Use `//` inside function bodies, for inline notes, TODO, FIXME, and ignore comments.
- Prose comments start with an uppercase letter and end with `.`, `?`, or `!`.
- Short inline comments are exempt when they are 16 characters or fewer and 3 words or fewer.
- Use `TODO(name): ...` and `FIXME(name): ...` with a concrete action or problem.
- Use phase comments only inside long multi-step functions.

```dart
/// Loads the first page and preserves any existing page while refreshing.
Future<void> refresh() async {
  // Keep stale content visible until the new page arrives.
  final previous = state.valueOrNull;

  // TODO(owner): Remove fallback after the migration completes.
  state = await AsyncValue.guard(() => repository.load(previous?.cursor));
}
```

## State Management

- Use Riverpod for shared, cross-widget, or feature-level state.
- Use `@riverpod` with generated providers when generation is already part of the app.
- Name providers with the `Provider` suffix.
- Use `ref.watch` in build methods, `ref.read` in event handlers, and `ref.listen` for side
  effects.
- Use `select` with `ref.watch` or `ref.listen` when only one part of a state object matters.
- Do not combine `ref.read` with `select`.
- Use `keepAlive: true` for services and repositories whose lifetime should not depend on one
  screen.
- Prefer widget-local state for simple local concerns that do not need provider identity.

```dart
final title = ref.watch(articleProvider.select((article) => article.title));

button.onPressed = () {
  ref.read(articleProvider.notifier).refresh();
};
```

## Provider Lifecycle

- Treat provider `build()` as a reactive method. It may run again whenever dependencies change.
- Register every `onDispose` callback immediately after creating the disposable resource.
- Register disposal before any `await`.
- Expect `onDispose` to run before rebuild and again when the provider is fully disposed.
- Do not assign `state`, read providers, or touch `Ref` inside `onDispose`.

```dart
@riverpod
class FeedSubscription extends _$FeedSubscription {
  @override
  Future<void> build() async {
    final subscription = feedStream.listen(_handleEvent);
    ref.onDispose(subscription.cancel);

    await _loadInitialPage();
  }
}
```

## Async Boundaries

- Add mounted checks only for lifecycle-bound objects used after an `await`.
- In widgets, one mounted check covers objects tied to the same widget lifecycle.
- In notifiers and providers, check `ref.mounted` before assigning `state`, reading providers
  again, or branching on provider-owned state after an `await`.
- Resolve stable dependencies before the async gap when they are needed later.
- Read changing provider state after the async gap, after the mounted check.

```dart
Future<void> save() async {
  final repository = ref.read(settingsRepositoryProvider);

  await repository.saveDraft();
  if (!ref.mounted) {
    return;
  }

  final current = ref.read(settingsProvider);
  state = AsyncData(current.markSaved());
}
```

## Widgets

- Prefer `StatelessWidget` or a small function for simple presentational UI.
- Prefer `HookWidget` and `HookConsumerWidget` when local controller lifecycle is needed.
- Use `StatefulHookWidget` or `StatefulHookConsumerWidget` only when `initState`, `dispose`, or
  inherited-widget integration is required.
- Prefer `const` constructors and stable child widgets.
- Use `Theme.of(context)` before introducing app-specific theme extensions.
- Do not hardcode colors in reusable widgets.

## Routing

- Use `go_router` for Flutter navigation.
- Prefer typed routes with code generation when the app already uses generated routes.
- Use router APIs for pages.
- Use `Navigator.of(context).pop(result)` for dialogs, sheets, and overlays owned by Navigator.

## Data Models

- Use `json_serializable` and `json_annotation` for JSON boundaries.
- Use Freezed for immutable data models that need equality, unions, or `copyWith`.
- Keep persistence models separate from domain models when storage details differ from app logic.
- Use records only for small local tuple returns where a named type would not add clarity.

## Imports

- Order imports as `dart:`, then `package:`, then relative imports.
- Prefer package imports across package or feature boundaries.
- Prefer relative imports inside one package or tightly scoped feature boundary.

## Analysis Defaults

- Use single quotes by default.
- Use trailing commas in multiline literals, parameter lists, and argument lists.
- Never put a control-flow body on the same line. Always use braces.
- Wrap code-like placeholders in documentation comments with backticks.
- Do not use `print`; use the app's logging mechanism.
- Do not use deprecated APIs.
- Use injectable or testable time sources when current time affects behavior.

```dart
// BAD: The branch body is hidden on the same line.
if (isReady) submit();

// GOOD: Control flow keeps a stable block shape.
if (isReady) {
  submit();
}
```

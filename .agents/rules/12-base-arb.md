# ARB Guidelines

Strength: `Mandatory`

Scope: ARB localization key naming, metadata, sorting, and generation rules.

## Source Files

- `zh.arb` is the Flutter `gen-l10n` template ARB and the source of truth for keys and metadata.
- `en.arb` is the runtime fallback when a translation is missing.
- Every key in `zh.arb` has a matching `@key` metadata entry.
- All keys within each ARB are sorted alphabetically.

## Key Naming: `${module}_${filename?}_${name}{index?}`

- **module** (required): lowerCamelCase module name. For keys used from Dart files, derive it
  from the first directory under `lib/`, converting snake_case to lowerCamelCase. Cross-module
  shared key modules should be configured in the target project's analyzer, lint, or localization
  configuration.
- **filename** (optional): camelCase from Dart file stem, for example
  `detail_base` → `detailBase`.
- **name** (required): camelCase purpose, such as title, button, tip, error, or
  success.
- **index** (optional): trailing digits on `name`, for repeated nearby strings that share the same
  purpose.

```text
✅ GOOD: album_title, album_detailBase_button, global_cancelButton, album_tip2
❌ BAD:  title, Album_Title, _album_title, album_detail_base_button
```

## Metadata Format

```json
"album_title": "专辑标题",
"@album_title": {
  "description": "[Album] > Album Page > title. ~4–12 chars.",
  "placeholders": { "count": { "type": "int", "example": "5" } }
}
```

- **Language**: metadata is always English. Only translation values use the
  target locale language.
- **Module**: capitalized in brackets, for example `[Album]` or `[Filter]`.
- **Location**: one readable filename level, for example
  `albumDetailBase` → `Album Detail Page`.
- **Purpose**: button, label, tooltip, error/success, title, or description.
- **Bounds**: infer `~min–max chars.` from widget layout at the call site, not
  from the current string length. Latin counts as 1; CJK counts as 2.

## Avoid

- Missing `@key` metadata.
- Wrong `[Module] > ...` metadata shape.
- Character bounds guessed from string length instead of layout.
- Undocumented placeholders.
- Keys without a module prefix or with inconsistent casing.
- Non-English metadata.

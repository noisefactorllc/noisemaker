# Effect Name

Brief one-sentence description of what the effect does.

## Description

More detailed explanation of the effect, its purpose, and how it works.
This section is optional for simple effects.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| paramName | float | 0.5 | 0-1 | What this parameter controls |
| mode | int | 0 | 0-3 | Selects the operating mode |

For effects with no parameters, use:

```
No configurable parameters.
```

## Notes

Optional section for tips, caveats, or additional context.

---

## Template Guidelines

1. **H1 title required** — Always start with `# funcName` (must match definition.js func)
2. **Use `## Parameters`** — Not "Arguments", "Uniforms", or "Controls"
3. **Use markdown tables** — Not bullet lists or H3 sections per parameter
4. **Table columns** — Parameter, Type, Default, Range, Description
5. **Range format** — Use `min-max` (hyphen), enum values, or `-` for N/A
6. **Code blocks** — Use triple backticks, no language specifier needed
7. **Section order** — Title → Description → Parameters → Notes
8. **Extra sections allowed** — Complex effects may add `## Algorithm`, `## Modes`, etc. after the core sections
9. **No empty files** — At minimum: H1 title + `## Parameters` with table or "No configurable parameters."
10. **No Usage section** — Usage examples are auto-generated at bundle time based on effect type

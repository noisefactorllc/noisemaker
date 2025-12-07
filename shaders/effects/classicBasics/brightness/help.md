# bright

Adjust brightness (-1..1). Alias: `brightness`.

## Arguments

### `a`
- **Type:** Number.
- **Default:** `0`.
- **Range:** -1–1.
- **Description:** Scalar multiplier applied to the effect.

## Examples

### Positional

```dsl
noise().bright(0.5).write()
```

### Keyword

```dsl
noise().bright(a: 0.5).write()
```

# saturate

Adjust saturation in the 0–10 range. Alias: `sat`.

## Arguments

### `a`
- **Type:** Number.
- **Default:** `1`.
- **Range:** 0–10.
- **Description:** Scalar multiplier applied to the effect.

## Examples

### Positional

```dsl
noise().sat(1.5).write()
```

### Keyword

```dsl
noise().sat(a: 1.5).write()
```

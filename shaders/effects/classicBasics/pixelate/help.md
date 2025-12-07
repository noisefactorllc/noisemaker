# pixelate

Blocky pixel effect.

## Arguments

### `x`
- **Type:** Number.
- **Default:** `20`.
- **Range:** 1–1000.
- **Description:** Horizontal factor or coordinate.
### `y`
- **Type:** Number.
- **Default:** `20`.
- **Range:** 1–1000.
- **Description:** Vertical factor or coordinate.

## Examples

### Positional

```dsl
noise().pixelate(40, 10).write()
```

### Keyword

```dsl
noise().pixelate(x: 40, y: 10).write()
```

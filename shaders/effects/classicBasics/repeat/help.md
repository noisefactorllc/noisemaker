# repeat

Tile the image.

## Arguments

### `x`
- **Type:** Number.
- **Default:** `3`.
- **Range:** 1–20.
- **Description:** Horizontal factor or coordinate.
### `y`
- **Type:** Number.
- **Default:** `3`.
- **Range:** 1–20.
- **Description:** Vertical factor or coordinate.
### `offsetX`
- **Type:** Number.
- **Default:** `0`.
- **Range:** -1–1.
- **Description:** Horizontal offset applied to the effect.
### `offsetY`
- **Type:** Number.
- **Default:** `0`.
- **Range:** -1–1.
- **Description:** Vertical offset applied to the effect.

## Examples

### Positional

```dsl
noise().repeat(4, 2).write()
```

### Keyword

```dsl
noise().repeat(x: 4, y: 2).write()
```

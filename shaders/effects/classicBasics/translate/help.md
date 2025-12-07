# translate

Shift the image horizontally and vertically.

## Arguments

### `x`
- **Type:** Number.
- **Default:** `0`.
- **Range:** -10–10.
- **Description:** Horizontal factor or coordinate.
### `y`
- **Type:** Number.
- **Default:** `0`.
- **Range:** -10–10.
- **Description:** Vertical factor or coordinate.

## Examples

### Positional

```dsl
noise().translate(0.1, 0.2).write()
```

### Keyword

```dsl
noise().translate(x: 0.1, y: 0.2).write()
```

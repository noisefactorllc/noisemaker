## Arguments

### `x`
- **Type:** Number.
- **Default:** `1`.
- **Range:** 0–10.
- **Description:** Horizontal factor or coordinate.
### `y`
- **Type:** Number.
- **Default:** `0`.
- **Range:** 0–10.
- **Description:** Vertical factor or coordinate.
### `centerX`
- **Type:** Number.
- **Default:** `0.5`.
- **Range:** 0–1.
- **Description:** Horizontal pivot point for scaling.
### `centerY`
- **Type:** Number.
- **Default:** `0.5`.
- **Range:** 0–1.
- **Description:** Vertical pivot point for scaling.

## Examples

### Positional

```dsl
noise().scale(1.5).write()
```

### Keyword

```dsl
noise().scale(x: 1.5).write()
```

````

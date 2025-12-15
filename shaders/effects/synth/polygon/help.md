## Arguments

### `sides`
- **Type:** Number.
- **Default:** `3`.
- **Range:** 0–100.
- **Description:** Number of polygon sides.
### `radius`
- **Type:** Number.
- **Default:** `0.3`.
- **Range:** 0–1.
- **Description:** Radius of the generated shape.
### `smooth`
- **Type:** Number.
- **Default:** `0.01`.
- **Range:** 0–1.
- **Description:** Smoothing amount applied to the effect.

## Examples

### Positional

```dsl
shape(4).write()
```

### Keyword

```dsl
shape(sides: 4).write()
```

````

````markdown
# thresh

Threshold effect.

## Arguments

### `level`
- **Type:** Number.
- **Default:** `0.5`.
- **Range:** 0–1.
- **Description:** Threshold level.
### `sharpness`
- **Type:** Number.
- **Default:** `0.5`.
- **Range:** 0–1.
- **Description:** Edge sharpness amount.

## Examples

### Positional

```dsl
noise().thresh(0.3, 0.2).write()
```

### Keyword

```dsl
noise().thresh(level: 0.3, sharpness: 0.2).write()
```

````

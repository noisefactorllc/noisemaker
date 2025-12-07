````markdown
# contrast

Adjust contrast in the 0–10 range. Alias: `cont`.

## Arguments

### `a`
- **Type:** Number.
- **Default:** `1`.
- **Range:** 0–10.
- **Description:** Scalar multiplier applied to the effect.

## Examples

### Positional

```dsl
noise().cont(2).write()
```

### Keyword

```dsl
noise().cont(a: 2).write()
```

````

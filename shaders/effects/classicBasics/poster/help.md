# poster

Reduce color precision. Aliases: `posterize`, `post`.

## Arguments

### `levels`
- **Type:** Number.
- **Default:** `3`.
- **Range:** 1–256.
- **Description:** Number of quantization steps for posterization.
### `gamma`
- **Type:** Number.
- **Default:** `0.6`.
- **Range:** 0.01–10.
- **Description:** Gamma correction amount.

## Examples

### Positional

```dsl
noise().poster(3, 0.6).write()
```

### Keyword

```dsl
noise().poster(levels: 3, gamma: 0.6).write()
```

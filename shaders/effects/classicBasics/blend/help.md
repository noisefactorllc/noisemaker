# blend

Cross-fade with another texture.

## Arguments

### `tex`
- **Type:** Texture.
- **Default:** None (required).
- **Description:** Texture or generator to sample or mix with.
### `amount`
- **Type:** Number.
- **Default:** `0.5`.
- **Range:** 0–1.
- **Description:** Blend amount contributed by the secondary input.

## Examples

### Positional

```dsl
noise().blend(noise(), 0.3).write()
```

### Keyword

```dsl
noise().blend(tex: noise(), amount: 0.3).write()
```

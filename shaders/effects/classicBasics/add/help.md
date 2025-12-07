````markdown
# add

Additive mix with another texture.

## Arguments

### `tex`
- **Type:** Texture.
- **Default:** None (required).
- **Description:** Texture or generator to sample or mix with.
### `amount`
- **Type:** Number.
- **Default:** `1`.
- **Range:** 0–1.
- **Description:** Blend amount contributed by the secondary input.

## Examples

### Positional

```dsl
noise().add(noise(), 0.5).write()
```

### Keyword

```dsl
noise().add(tex: noise(), amount: 0.5).write()
```

````

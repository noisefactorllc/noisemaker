````markdown
# layer

Overlay another texture on top of the current chain.

## Arguments

### `tex`
- **Type:** Texture.
- **Default:** None (required).
- **Description:** Texture or generator to sample or mix with.

## Examples

### Positional

```dsl
noise().layer(noise()).write()
```

### Keyword

```dsl
noise().layer(tex: noise()).write()
```

````

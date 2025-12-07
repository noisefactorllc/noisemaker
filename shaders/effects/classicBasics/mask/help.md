````markdown
# mask

Alpha mask.

## Arguments

### `tex`
- **Type:** Texture.
- **Default:** None (required).
- **Description:** Texture or generator to sample or mix with.

## Examples

### Positional

```dsl
noise().mask(noise()).write()
```

### Keyword

```dsl
noise().mask(tex: noise()).write()
```

````

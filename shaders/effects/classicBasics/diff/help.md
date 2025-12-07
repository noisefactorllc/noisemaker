````markdown
# diff

Difference blend.

## Arguments

### `tex`
- **Type:** Texture.
- **Default:** None (required).
- **Description:** Texture or generator to sample or mix with.

## Examples

### Positional

```dsl
noise().diff(noise()).write()
```

### Keyword

```dsl
noise().diff(tex: noise()).write()
```

````

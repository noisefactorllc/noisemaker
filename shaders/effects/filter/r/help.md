````markdown
# r

Extract the red channel from the incoming image.

## Arguments

### `scale`
- **Type:** Number.
- **Default:** `1`.
- **Range:** -10–10.
- **Description:** Overall scale of the effect.
### `offset`
- **Type:** Number.
- **Default:** `0`.
- **Range:** -10–10.
- **Description:** Offset amount applied to the effect.

## Examples

### Positional

```dsl
noise().r(0.5, 0.1).write()
```

### Keyword

```dsl
noise().r(scale: 0.5, offset: 0.1).write()
```

````

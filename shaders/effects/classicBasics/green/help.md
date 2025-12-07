````markdown
# green

Extract the green channel from the incoming image. Alias: `g`.

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
noise().g(0.5, 0.1).write()
```

### Keyword

```dsl
noise().g(scale: 0.5, offset: 0.1).write()
```

````

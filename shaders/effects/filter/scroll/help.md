## Arguments

### `x`
- **Type:** Number.
- **Default:** `0`.
- **Range:** -10–10.
- **Description:** Horizontal factor or coordinate.
### `y`
- **Type:** Number.
- **Default:** `0`.
- **Range:** -10–10.
- **Description:** Vertical factor or coordinate.
### `speedX`
- **Type:** Number.
- **Default:** `0`.
- **Range:** -10–10.
- **Description:** Horizontal animation speed.
### `speedY`
- **Type:** Number.
- **Default:** `0`.
- **Range:** -10–10.
- **Description:** Vertical animation speed.

## Examples

### Positional

```dsl
noise().scroll(0.1, -0.1).write()
```

### Keyword

```dsl
noise().scroll(x: 0.1, y: -0.1).write()
```

````

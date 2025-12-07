# rot

Turn the image with optional animation.

## Arguments

### `angle`
- **Type:** Number.
- **Default:** `0`.
- **Range:** -360–360.
- **Description:** Base rotation angle in degrees.
### `speed`
- **Type:** Number.
- **Default:** `0`.
- **Range:** -10–10.
- **Description:** Animation speed.

## Examples

### Positional

```dsl
noise().rot(0.5).write()
```

### Keyword

```dsl
noise().rot(angle: 0.5).write()
```

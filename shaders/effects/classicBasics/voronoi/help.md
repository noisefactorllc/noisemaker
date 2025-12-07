# voronoi

Cell-like pattern.

## Arguments

### `scale`
- **Type:** Number.
- **Default:** `5`.
- **Range:** 0–100.
- **Description:** Overall scale of the effect.
### `speed`
- **Type:** Number.
- **Default:** `0`.
- **Range:** -10–10.
- **Description:** Animation speed.
### `blend`
- **Type:** Number.
- **Default:** `0`.
- **Range:** 0–1.
- **Description:** Blend factor that mixes the Voronoi pattern back with the input.

## Examples

### Positional

```dsl
voronoi(8, 0.2).write()
```

### Keyword

```dsl
voronoi(scale: 8, speed: 0.2).write()
```

````markdown
# colorize

Colorize the incoming signal by applying per-channel multipliers.

## Arguments

### `r`
- **Type:** Number.
- **Default:** `1`.
- **Range:** 0–1.
- **Description:** Red channel multiplier or base value.
### `g`
- **Type:** Number.
- **Default:** `1`.
- **Range:** 0–1.
- **Description:** Green channel multiplier or base value.
### `b`
- **Type:** Number.
- **Default:** `1`.
- **Range:** 0–1.
- **Description:** Blue channel multiplier or base value.

## Examples

### Positional

```dsl
noise().colorize(#ff0000).write()
```

### Keyword

```dsl
noise().colorize(r: #ff0000).write()
```

````

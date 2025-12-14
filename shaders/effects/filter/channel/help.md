# channel

Extract a single channel (red, green, blue, or alpha) from the incoming image as grayscale.

## Arguments

### `channel`
- **Type:** `channel` enum.
- **Default:** `channel.r`.
- **Values:** `channel.r`, `channel.g`, `channel.b`, `channel.a`.
- **Description:** Which channel to extract.

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
noise().channel(channel.r, 0.5, 0.1).write()
```

### Keyword

```dsl
noise().channel(channel: channel.g, scale: 0.5, offset: 0.1).write()
```

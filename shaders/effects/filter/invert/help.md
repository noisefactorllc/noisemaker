# invert

Invert image luminance

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| mode | int | full | full/solarize | full inverts every channel (1-v); solarize folds bright values down (min(v, 1-v)) |

## Notes

- `mode=full` (default) is byte-identical to this effect's pre-`mode` behavior.
- `mode=solarize` is Solarize parity: per RGB channel, `v <= 128 ? v : 255 - v`
  (equivalently `min(v, 1-v)` in the shader's 0..1 range). Output never exceeds 0.5 per
  channel - dark input stays unchanged, bright input inverts and folds down into darkness
  (classic Sabattier effect).
- Alpha is always preserved unchanged, in both modes.

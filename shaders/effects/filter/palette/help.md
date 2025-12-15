## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| palette | enum | afterimage | palette enum | Palette to apply |
| alpha | float | 1.0 | 0–1 | Blend amount with original |

## Usage

```dsl
read().palette(palette: "plasma").write(o0)
```

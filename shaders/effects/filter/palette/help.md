# Palette

Applies cosine color palettes to the image. Uses luminance to sample from one of 55 cosine palettes.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| palette | enum | afterimage | palette enum | Palette to apply |
| alpha | float | 1.0 | 0–1 | Blend amount with original |

## Usage

```dsl
read().palette(palette: "plasma").write(o0)
```

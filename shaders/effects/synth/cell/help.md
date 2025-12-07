# Cell

Cellular/Voronoi noise generator with distance metric options. Creates organic cell-like patterns with configurable smoothing and variation.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| metric | int | circle | circle, diamond, hexagon, octagon, square, triangle | Distance metric for cell calculation |
| scale | float | 75 | 1–100 | Noise scale |
| cellScale | float | 87 | 1–100 | Cell size scale |
| cellSmooth | float | 11 | 0–100 | Cell edge smoothing |
| cellVariation | float | 50 | 0–100 | Cell shape variation |
| loopAmp | int | 1 | 0–5 | Animation speed |
| seed | int | 1 | 1–100 | Random seed |
| texSource | int | none | none, input | Texture source for modulation |
| texInfluence | int | cellScale | cellScale, noiseScale, add, divide, min, max, mod, multiply, subtract | How texture influences output |
| texIntensity | float | 100 | 0–100 | Texture influence intensity |

## Usage

```dsl
cell(metric: "hexagon", cellScale: 50).write(o0)
```

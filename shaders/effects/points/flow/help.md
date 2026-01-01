## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| behavior | int | 1 (obedient) | — | Agent behavior mode (see below) |
| stride | float | 10 | 1–1000 | Movement distance per step |
| strideDeviation | float | 0.05 | 0–0.5 | Per-agent stride variation |
| kink | float | 1 | 0–10 | Direction randomness/turbulence |
| quantize | boolean | false | — | Quantize movement to 8 directions |
| inputWeight | float | 100 | 0–100 | Weight of input texture influence |

## Behavior Modes

- **none** (0): No flow field influence
- **obedient** (1): Follow luminance gradient directly
- **crosshatch** (2): Move perpendicular to gradient
- **unruly** (3): Move against gradient
- **chaotic** (4): Random direction changes
- **randomMix** (5): Random mix of behaviors
- **meandering** (10): Smooth wandering paths

## Description

Agent-based luminosity flow field effect. Agents move according to the brightness of the input texture, creating painterly strokes and flow patterns.

## Usage

```
noise().pointsEmit().flow(behavior: obedient, stride: 20).pointsRender().write(o0)
```

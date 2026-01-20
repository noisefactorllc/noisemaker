# Flow

Agent-based luminosity flow field effect.

## Description

Agents move according to the brightness of the input texture, creating painterly strokes and flow patterns.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| behavior | int | obedient | none/obedient/crosshatch/unruly/chaotic/randomMix/meandering | Agent behavior mode |
| stride | float | 10 | 1–1000 | Movement distance per step |
| strideDeviation | float | 0.05 | 0–0.5 | Per-agent stride variation |
| kink | float | 1 | 0–10 | Direction randomness/turbulence |
| quantize | boolean | false | — | Quantize movement to 8 directions |
| inputWeight | float | 100 | 0–100 | Weight of input texture influence |

## Behavior Modes

- **none**: No flow field influence
- **obedient**: Follow luminance gradient directly
- **crosshatch**: Move perpendicular to gradient
- **unruly**: Move against gradient
- **chaotic**: Random direction changes
- **randomMix**: Random mix of behaviors
- **meandering**: Smooth wandering paths

## Usage

```
noise().pointsEmit().flow(behavior: obedient, stride: 20).pointsRender().write(o0)
```

# hydraulic

Hydraulic erosion flow simulation (gradient descent)

## Description

Agents flow downhill following the steepest descent of the input texture brightness, simulating water flowing over terrain. Use `inverse: true` for uphill flow (gradient ascent).

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| heightTex | surface | none | - | Height field; defaults to the chained input |
| diffuseTex | surface | none | - | Particle color map; none preserves the existing particle color |
| stride | float | 10 | 1-1000 | Stride |
| quantize | boolean | false | - | Quantize |
| inverse | boolean | false | - | Inverse |
| inputWeight | float | 100 | 0-100 | Input weight |

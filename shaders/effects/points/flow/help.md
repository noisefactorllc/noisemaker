# flow

Agent-based luminosity flow field with behaviors

## Description

Agents move according to the brightness of the input texture, creating painterly strokes and flow patterns.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| stateSize | int | 256 | - | - |
| behavior | int | obedient | none/obedient/crosshatch/unruly/chaotic/randomMix/meandering | Behavior |
| stride | float | 10 | 1-1000 | Stride |
| deviation | float | 0.05 | 0-0.5 | Stride deviation |
| kink | float | 1 | 0-10 | Kink |
| quantize | boolean | false | - | Quantize |
| inputWeight | float | 100 | 0-100 | Input weight |

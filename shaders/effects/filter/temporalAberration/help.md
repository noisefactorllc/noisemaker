# temporalAberration

Chromatic aberration via per-channel temporal frame delay

## Description

Separates red, green, and blue in *time* instead of space: each output
channel is sampled from a different past frame, so moving content leaves
color trails that lag behind or lead ahead. This is the temporal counterpart
to the spatial aberration filters (simpleAberration, chromaticAberration).

Internally the filter keeps an eight-frame history of its input. Each delay
control picks a frame age from 0 (live) to 8; fractional values interpolate
between the two adjacent stored frames.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| redDelay | float | 0 | 0-8 | Red channel delay, in frames |
| greenDelay | float | 4 | 0-8 | Green channel delay, in frames |
| blueDelay | float | 8 | 0-8 | Blue channel delay, in frames |

## Notes

- Static content is unaffected — with no motion, every past frame matches the live one
- History slots that have not been written yet fall back to the live frame, so the effect ramps in cleanly over the first frames instead of flashing black
- Output alpha comes from the live frame

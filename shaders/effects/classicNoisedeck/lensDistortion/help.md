# Lens Distortion

Lens distortion simulation with chromatic aberration.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| seed | int | 1 | 1–100 | Random seed |
| shape | int | 0 | circle/cosine/diamond/hexagon/octagon/square/triangle | Distortion shape |
| distortion | float | 0 | -100–100 | Barrel/pincushion distortion amount |
| loopScale | float | 100 | 1–100 | Animation loop scale |
| loopAmp | float | 0 | -100–100 | Animation loop power |
| aspectLens | boolean | false | — | Lock to 1:1 aspect ratio |
| mode | int | 0 | chromaticRgb/prismaticHsv | Aberration mode |
| aberrationAmt | float | — | — | Chromatic aberration amount |

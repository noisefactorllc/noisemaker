# Displace Mixer

Displacement-based mixing effect.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | — | Source surface B |
| mode | int | 1 | displace/reflect/refract | Displacement mode |
| displaceSource | int | 1 | inputTex/tex | Map source |
| intensity | float | 50 | 0–100 | Displacement intensity |
| direction | float | 0 | 0–360 | Displacement direction in degrees |
| wrap | int | 0 | clamp/mirror/repeat | Edge wrap mode |
| smoothing | float | 1 | 1–100 | Displacement smoothing |
| aberration | float | 0 | 0–100 | Chromatic aberration amount |

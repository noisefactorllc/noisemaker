# Composite

Multi-layer compositing with color-based masking.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | — | Source surface B |
| seed | int | 1 | 1–100 | Random seed |
| blendMode | int | 1 | colorSplash/greenscreenAB/greenscreenBA/aBBlack/aBColorBlack/aBHue/aBSaturation/aBValue/bABlack/bAColorBlack/bAHue/bASaturation/bAValue/mix/psychedelic/psychedelic2 | Compositing mode |
| inputColor | vec3 | [0,0,0] | — | Key color for masking |
| range | float | 20 | 0–100 | Color match range |
| mixAmt | float | 50 | 0–100 | Mix amount |

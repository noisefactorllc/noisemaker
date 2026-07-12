# parallax

Pseudo-3D perspective shift from a height map

## Description

Re-projects the input as if the height map extruded it into relief viewed from an angle:
1. **Height**: The height map's luminosity gives each pixel a height from 0 to 1
2. **Ray march**: For every output pixel, a view ray angled by **direction** is marched through the height field until it hits the surface (parallax occlusion mapping)
3. **Output**: The input texture sampled where the ray landed - tall features lean away from the viewer and cover what is behind them

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| heightMap | surface | inputTex | - | Height map |
| direction | vec3 | 0.5,0.5,1 | - | Direction |
| pivot | float | 0 | 0-1 | Pivot |

## Notes

- **direction** is the viewer angle: straight down (0,0,1) means no shift, glancing angles maximize it
- **pivot** picks the height plane that stays anchored: 0 locks the ground and features rise out of it, 1 locks the peaks and valleys sink inward
- With the default **heightMap** the input acts as its own height map (bright = tall)

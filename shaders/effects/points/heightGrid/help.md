# heightGrid

Arrange every slot allocated by `pointsEmit()` in a square XZ grid and set its Y elevation from height-map luminance. Sample the diffuse surface at the same grid coordinates for each particle's RGBA color. Both surfaces update every frame, independent of the emitter's layout and attrition. Velocities are reset to zero; per-particle seeds are retained.

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| heightTex | surface | inputTex | - | Height source; defaults to the incoming 2D surface |
| diffuseTex | surface | inputTex | - | Particle color and alpha source; defaults to the incoming 2D surface |
| gridScale | float | 80 | 1-400 | Width and depth of the square grid in world units |
| heightScale | float | 20 | -100-100 | Elevation for white; negative values invert the relief |
| heightOffset | float | 0 | -100-100 | Elevation for black in world units |

Use `pointsBillboardRender(viewMode: perspective)` for landscape viewing. `pointsEmit(stateSize: x256)` supplies a 256 by 256 grid. Surface dimensions can differ: each is sampled across its full extent. Height uses Rec. 709 luminance weights (0.2126 red, 0.7152 green, 0.0722 blue) applied to the sampled RGB channels. Diffuse RGBA is copied without conversion.

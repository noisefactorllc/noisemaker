# texture

Texture overlay blend. Generates a procedural height field and derives bump-map shading from it, then blends the shaded result into the source image.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| mode | int | paper | canvas/crosshatch/halftone/paper/stucco | Texture type |
| alpha | float | 0.5 | 0-1 | Blend opacity |
| scale | float | 1.0 | 0.1-5 | Texture density |

## Modes

- **canvas** — woven fabric pattern with subtle noise irregularity
- **crosshatch** — two overlapping diagonal line patterns
- **halftone** — regular circular dot grid
- **paper** — ridged multi-octave noise with embossed shading
- **stucco** — smooth, blobby bumps with strong shadows

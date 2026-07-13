# texture

Procedural surface and material texture overlay. Surface modes derive bump-map
shading from a height field; material modes blend a controlled noise structure
into the source image.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| mode | int | paper | see Modes | Texture type |
| alpha | float | 0.5 | 0-1 | Blend opacity |
| scale | float | 1.0 | 0.1-10 | Texture density |
| intensity | float | 40 | 0-100 | Material-noise deviation from neutral; active for regular through speckle |
| contrast | float | 50 | 0-100 | Material-noise contrast; active for regular through speckle |
| mono | bool | true | - | Use one noise field for all channels; active for regular through speckle |

## Modes

- **canvas** — woven fabric pattern with subtle noise irregularity
- **crosshatch** — two overlapping diagonal line patterns
- **halftone** — regular circular dot grid
- **paper** — ridged multi-octave noise with embossed shading
- **stucco** — smooth, blobby bumps with strong shadows
- **regular** — fine, smoothly interpolated material noise
- **soft** — compact isotropic low-pass noise with fine cells and no hard plateaus
- **sprinkles** — sparse rounded bright marks over a neutral field
- **clumped** — broad multi-scale clusters
- **contrasty** — steep, crisp tonal noise
- **enlarged** — coarse smoothly interpolated cells
- **stippled** — binary ink-like points
- **horizontal** — elongated horizontal fibers
- **vertical** — elongated vertical fibers
- **speckle** — fine noise concentrated around source-image edges

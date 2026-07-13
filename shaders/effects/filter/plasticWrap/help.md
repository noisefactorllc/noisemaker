# plasticWrap

Glossy specular plastic film hugging image contours

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| highlight | float | 60 | 0-100 | Specular highlight strength; 0 disables the effect |
| detail | float | 40 | 0-100 | Contour frequency of the sheen (higher = finer, higher-frequency height-field blur; lower = broader, softer contours) |
| smoothness | float | 30 | 0-100 | Specular falloff width: low values give tight, sharp glints; high values give a broad, soft sheen |
| lightDirection | vec3 | [-0.4, 0.6, 0.7] | - | Three-dimensional heading of the key light |

## Notes

- A separable Gaussian blur of the source (radius `mix(12, 2, detail/100)`, two passes: `pwBlurH` then `pwBlurV`) builds a height field from the blurred image's luminance. A central-difference gradient produces a per-pixel surface normal, and the configurable `lightDirection` plus a fixed view vector form a Blinn half-vector for a directional highlight. The flat-plane response is removed so unmodulated regions do not receive a milky wash.
- A two-dimensional five-point Laplacian (`4*h_c - h_l - h_r - h_b - h_t`, positive on local ridges) adds specular energy on contour crests equally in both axes, giving the shrink-wrapped look of glossy film hugging the image rather than a flat sheen.
- The specular term is screened onto the source image (`1 - (1-src)(1-spec)`); `highlight` scales the specular term before the screen blend, so `highlight: 0` reproduces the source exactly.
- Blurring rgb (rather than luminance directly) in the two blur passes keeps them generic; the luminance reduction happens once, in the specular pass, where the height field is actually consumed.

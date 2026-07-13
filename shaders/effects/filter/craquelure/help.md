# craquelure

Cracked-plaster groove network with carved relief shading over the image (Craquelure)

## Description

A jittered Voronoi cell field carves an organic network of plate-like
cracks across the image: the difference between each pixel's nearest and
second-nearest cell-seed distances (F2-F1) approaches zero exactly on a
cell border, producing a ridge-shaped groove mask that is darkened onto
the source image and beveled with directional relief shading (fixed
upper-left light) on the groove walls for a 3D carved-plaster look. The
crack borders are wobbled with a small noise perturbation so they read
as organic fissures rather than straight polygon edges.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| spacing | float | 40 | 5-100 | Crack cell size in pixels - larger values produce fewer, larger cracked plates |
| depth | float | 50 | 0-100 | Groove width and wall-shading strength - higher values widen the cracks and deepen the 3D bevel on their walls |
| brightness | float | 50 | 0-100 | Crack darkness - higher values leave cracks shallower and paler; lower values darken them toward black |
| seed | int | 1 | 1-100 | Randomizes the crack network's cell layout without changing its statistics |

## Notes

- Single pass, evaluated on global (tile-aware) pixel coordinates so the crack network and its wobble are continuous across CLI render tiles.
- The crack mask is a ridge function of `(F2-F1) * spacing`, where F1/F2 are the nearest/second-nearest distances from a jittered Voronoi cell search (Voronoi jitter is fixed at maximum for irregular, organic plate shapes).
- Wall shading is computed from a true central-difference gradient of the crack mask (5 bounded Voronoi evaluations per pixel total) fed through the same directional relief-shading model used by `filter/relief`, with the light angle fixed at 135 degrees (upper-left).
- Produces an organic cracked-plaster or crazed-glaze surface.

# patternMix

Mix inputs using geometric patterns

## Description

Divides the frame using one of six geometric patterns, showing source A in one region and source B in the other. The same pattern library as the synth/pattern generator, applied here as a spatial mixer between two inputs.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | - | Source B |
| type | int | stripes | stripes/checkerboard/grid/dots/hexagons/diamonds | Pattern type |
| scale | float | 15 | 1-20 | Pattern scale (lower = more repetitions) |
| thickness | float | 0.5 | 0-1 | Line/dot thickness |
| smoothness | float | 0.02 | 0-0.25 | Edge softness (0 = hard edge) |
| rotation | float | 0 | -180-180 | Rotation in degrees |
| invert | int | off | off/on | Swap which input appears in each region |

## Notes

- **stripes**: Vertical bands alternating between sources; thickness controls band width
- **checkerboard**: Alternating square tiles of each source
- **grid**: Source B appears in grid lines, source A fills the cells
- **dots**: Circular dots of source B on a field of source A
- **hexagons**: Honeycomb tiling alternating between sources
- **diamonds**: Herringbone/diamond brick pattern
- **smoothness at 0**: Hard pixel-perfect edges between pattern regions
- **smoothness increased**: Anti-aliased or soft transitions at pattern boundaries
- Rotation applies to the entire pattern coordinate space

# cellSplit

Split between inputs using Voronoi cell regions

## Description

Generates a Voronoi diagram and randomly assigns each cell to show either source A or source B. Creates an organic, stained-glass-like split between two inputs. Uses PCG hashing for deterministic, cross-platform results.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | - | Source B |
| scale | float | 8 | 1-30 | Number of cells (higher = more, smaller cells) |
| edgeWidth | float | 0.02 | 0-0.2 | Width of visible edge lines at cell boundaries |
| seed | int | 1 | 1-100 | Random seed for cell layout and assignment |
| invert | int | off | off/on | Swap which cells show source A vs B |

## Notes

- **scale**: Controls cell density; low values create a few large regions, high values create many small cells
- **edge width at 0**: No visible boundaries, cells tile seamlessly
- **edge width increased**: Sharp lines appear between cells, showing a 50/50 mix of both sources
- **seed**: Each seed produces a completely different cell layout and A/B assignment
- **invert**: Swaps which cells show source A and which show source B, without changing the cell geometry
- Cell assignment is roughly 50/50 between sources, determined by each cell's hash value

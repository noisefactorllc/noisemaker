# cellSplit

Split between inputs using Voronoi cell regions

## Description

Generates a Voronoi diagram and randomly assigns each cell to show either source A or source B. Creates an organic, stained-glass-like split between two inputs. Uses PCG hashing for deterministic, cross-platform results.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | - | Source B |
| mode | int | edges | edges/split | Edges uses cells for A and edges for B. Split assigns cells randomly to A/B  |
| scale | float | 25 | 1-30 | Number of cells (higher = more, smaller cells) |
| edgeWidth | float | 0.08 | 0-0.2 | Width of visible edge lines at cell boundaries |
| seed | int | 1 | 1-100 | Random seed for cell layout and assignment |
| invert | int | off | off/on | Swap source assignment |

## Notes

- **split mode**: Each cell is randomly assigned to show source A or source B, creating an organic mosaic. Edge pixels show a 50/50 mix of both sources.
- **edges mode**: All cell interiors show source A, cell boundaries show source B. Creates a Voronoi wireframe overlay.
- **scale**: Controls cell density; low values create many small cells, high values create a few large regions
- **edge width at 0**: No visible boundaries, cells tile seamlessly
- **edge width increased**: Sharp lines appear between cells
- **seed**: Each seed produces a completely different cell layout and A/B assignment
- **invert**: In split mode, swaps which cells show A vs B. In edges mode, swaps cells and edges.

# shadow

Cast a shadow or glow from one input onto another

Uses one input as a mask to generate an offset, blurred shadow that composites onto the other input. Select which input provides the mask shape and which channel to read. The threshold creates a hard silhouette, which is then offset, blurred, and spread to form the shadow. Use a dark color for shadows or a bright color for glows.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | — | Source B input surface |
| maskSource | int | sourceA | dropdown | Which input provides the mask shape (sourceA or sourceB) |
| channel | int | red | dropdown | Channel to read from mask (red, green, blue, alpha) |
| threshold | float | 0.5 | 0-1 | Cutoff for the mask — values above become shadow, below are ignored |
| color | color | black | — | Shadow or glow color |
| offsetX | float | 0.1 | -1-1 | Horizontal shadow offset as fraction of width |
| offsetY | float | -0.1 | -1-1 | Vertical shadow offset as fraction of height |
| wrap | int | mirror | dropdown | How offset mask samples outside the texture are handled (hide, mirror, repeat, clamp) | 
| blur | float | 1.0 | 0-3 | Gaussian blur radius for shadow softness |
| spread | float | 0.0 | 0-1 | Expand the shadow edge — higher values make the shadow cover more area |

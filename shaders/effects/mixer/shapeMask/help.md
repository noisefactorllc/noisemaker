# shapeMask

Composite inputs inside and outside a geometric shape

## Description

Uses a signed distance field to divide the frame into inside and outside regions of a chosen shape. Source A appears inside the shape, source B appears outside (swap with invert). Supports seven shapes with adjustable size, position, rotation, and edge softness.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | - | Source B (outside shape) |
| shape | int | circle | circle/triangle/square/pentagon/hexagon/flower/ring | Shape type |
| radius | float | 0.7 | 0-1 | Shape size |
| smoothness | float | 0.01 | 0-0.25 | Edge softness (0 = hard edge) |
| rotation | float | 0 | -180-180 | Rotation in degrees |
| posX | float | 0 | -1-1 | Horizontal position offset |
| posY | float | 0 | -1-1 | Vertical position offset |
| invert | int | off | off/on | Swap inside/outside sources |

## Notes

- **edge smooth at 0**: Perfectly sharp boundary between sources
- **edge smooth increased**: Creates a soft gradient transition at the shape boundary
- **flower**: Five-petal shape with alternating inner/outer radii
- **ring**: Hollow circle whose border width scales with radius
- Position and rotation are applied before the SDF, so the shape moves and spins in screen space
- Combine with animated position parameters for picture-in-picture or wipe transitions

# split

Split/wipe between two inputs

## Description

Divides the frame along a straight line, showing source A on one side and source B on the other. The line can be rotated to any angle and offset to any position. Use softness to feather the edge.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | - | Source B |
| position | float | 0 | -1-1 | Offset of the split line from center |
| rotation | float | 0 | -180-180 | Angle of the split line in degrees |
| softness | float | 0 | 0-1 | Edge feathering (0 = hard edge) |
| invert | int | off | off/on | Swap which side shows which source |
| speed | int | 0 | 0-4 | Animation speed

## Notes

- **rotation at 0**: Horizontal split (top/bottom)
- **rotation at 90**: Vertical split (left/right)
- **rotation at 45**: Diagonal split
- **position**: Slides the split line along its perpendicular axis
- **softness at 0**: Pixel-perfect hard edge between sources
- **softness increased**: Smooth gradient transition at the boundary
- Animate for wipe transitions between sources

# pointsBillboardRender

Render agent particles as billboard sprites with texture sampling

## Description

Each particle is rendered as a textured quad that can be sized, rotated, and varied.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | - | Sprite |
| pointSize | float | 8 | 1-64 | Point size |
| sizeVariation | float | 0 | 0-100 | Size variation |
| rotationVariation | float | 0 | 0-100 | Rotation variation |
| seed | float | 42 | 0-1000 | Seed |
| density | float | 50 | 0-100 | Density |
| intensity | float | 75 | 0-100 | Trail intensity |
| input mix | float | 10.15 | 0-100 | Input intensity |
| viewMode | int | flat | flat/ortho | View |
| rotateX | float | 0.3 | 0-6.283185 | Rotate X |
| rotateY | float | 0 | 0-6.283185 | Rotate Y |
| rotateZ | float | 0 | 0-6.283185 | Rotate Z |
| viewScale | float | 0.8 | 0.1-10 | Zoom |
| posX | float | 0 | -50-50 | Pos X |
| posY | float | 0 | -50-50 | Pos Y |

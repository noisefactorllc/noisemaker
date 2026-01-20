# Media Input

Video/camera input with transforms.

## Description

Displays camera or uploaded media with positioning, tiling, flip/mirror, and transform controls.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| position | int | midCenter | topLeft/topCenter/topRight/midLeft/midCenter/midRight/bottomLeft/bottomCenter/bottomRight | Anchor position |
| tiling | int | none | none/horizAndVert/horizOnly/vertOnly | Tiling mode |
| flip | int | none | none/all/horizontal/vertical/mirrorLtoR/mirrorRtoL/mirrorUtoD/mirrorDtoU/mirrorLtoRUtoD/mirrorLtoRDtoU/mirrorRtoLUtoD/mirrorRtoLDtoU | Flip/mirror mode |
| scaleAmt | float | 100 | 25–400 | Scale percentage |
| rotation | float | 0 | -180–180 | Rotation angle in degrees |
| offsetX | float | 0 | -100–100 | Horizontal offset |
| offsetY | float | 0 | -100–100 | Vertical offset |
| backgroundColor | vec3 | [0, 0, 0] | color | Background color |
| backgroundOpacity | float | 0 | 0–100 | Background opacity |

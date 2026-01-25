# media

Video/camera/image input

## Description

Displays camera or uploaded media with positioning, tiling, flip/mirror, and transform controls.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| position | int | midCenter | topLeft/topCenter/topRight/midLeft/midCenter/midRight/bottomLeft/bottomCenter/bottomRight | Position |
| tiling | int | none | none/horizAndVert/horizOnly/vertOnly | Tiling |
| flip | int | none | none/all/horizontal/vertical/mirrorLtoR/mirrorRtoL/mirrorUtoD/mirrorDtoU/mirrorLtoRUtoD/mirrorLtoRDtoU/mirrorRtoLUtoD/mirrorRtoLDtoU | Flip/mirror |
| scaleAmt | float | 100 | 25-400 | Scale % |
| rotation | float | 0 | -180-180 | Rotate |
| offsetX | float | 0 | -100-100 | Offset x |
| offsetY | float | 0 | -100-100 | Offset y |
| backgroundColor | color | 0,0,0 | - | Background color |
| backgroundOpacity | float | 0 | 0-100 | Background opacity |
| seed | float | 1 | 1-100 | - |
| imageSize | vec2 | 1024,1024 | - | - |

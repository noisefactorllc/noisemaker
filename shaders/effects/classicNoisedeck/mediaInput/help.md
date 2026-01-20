# Media Input

Media input source with transform controls.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| seed | int | 1 | 1–100 | Random seed |
| source | int | 1 | camera/file | Media source |
| file | file | — | — | Media file |
| position | int | 4 | topLeft/topCenter/topRight/midLeft/midCenter/midRight/bottomLeft/bottomCenter/bottomRight | Media position |
| tiling | int | 0 | none/horizAndVert/horizOnly/vertOnly | Tiling mode |
| flip | int | 0 | none/all/horizontal/vertical/leftToRight/rightToLeft/upToDown/downToUp/lrUd/lrDu/rlUd/rlDu | Flip or mirror mode |
| scaleAmt | float | 100 | 25–400 | Scale percentage |
| rotation | int | 0 | -180–180 | Rotation in degrees |
| offsetX | float | — | -100–100 | Horizontal offset |
| offsetY | float | — | -100–100 | Vertical offset |
| backgroundOpacity | float | — | 0–100 | Background opacity |
| backgroundColor | vec3 | — | — | Background color |

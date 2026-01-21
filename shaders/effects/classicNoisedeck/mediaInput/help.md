# mediaInput

Media input source

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| seed | int | 1 | 1-100 | Seed |
| source | int | file | camera/file | Source |
| file | file | null | - | Media file |
| position | int | midCenter | topLeft/topCenter/topRight/midLeft/midCenter/midRight/bottomLeft/bottomCenter/bottomRight | Position |
| tiling | int | none | none/horizAndVert/horizOnly/vertOnly | Tiling |
| flip | int | none | none/Flip:/all/horizontal/vertical/Mirror:/leftToRight/rightToLeft/upToDown/downToUp/lrUd/lrDu/rlUd/rlDu | Flip/mirror |
| scaleAmt | float | 100 | 25-400 | Scale % |
| rotation | int | 0 | -180-180 | Rotate |
| offsetX | float | 0 | -100-100 | Offset x |
| offsetY | float | 0 | -100-100 | Offset y |
| backgroundColor | color | 0,0,0 | - | Bkg color |
| backgroundOpacity | float | 0 | 0-100 | Bkg opacity |
| imageSize | vec2 | 1024,1024 | - | Image size |

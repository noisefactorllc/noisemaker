# effects

Multi-effect processor

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| seed | int | 1 | 1-100 | Seed |
| effect | int | none | none/bloom/blur/blurSharpen/cga/derivatives/derivDivide/edge/emboss/litEdge/outline/pixels/posterize/shadow/sharpen/smoothEdge/sobel/subpixel/zoomBlur | Effect |
| effectAmt | int | 1 | 0-20 | Effect amt |
| flip | int | none | none/Flip:/all/horizontal/vertical/Mirror:/leftToRight/rightToLeft/upToDown/downToUp/lrUd/lrDu/rlUd/rlDu | Flip/mirror |
| scaleAmt | float | 100 | 25-400 | Scale % |
| rotation | int | 0 | -180-180 | Rotate |
| offsetX | float | 0 | -100-100 | Offset x |
| offsetY | float | 0 | -100-100 | Offset y |
| intensity | int | 0 | -100-100 | Intensity |
| saturation | int | 0 | -100-100 | Saturation |

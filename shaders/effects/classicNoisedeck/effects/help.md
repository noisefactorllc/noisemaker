# Effects

Multi-effect processor with blur, edge detection, and color effects.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| seed | int | 1 | 1–100 | Random seed |
| effect | int | 0 | none/bloom/blur/blurSharpen/cga/derivatives/derivDivide/edge/emboss/litEdge/outline/pixels/posterize/shadow/sharpen/smoothEdge/sobel/subpixel/zoomBlur | Effect type |
| effectAmt | int | 1 | 0–20 | Effect intensity |
| flip | int | 0 | none/all/horizontal/vertical/leftToRight/rightToLeft/upToDown/downToUp/lrUd/lrDu/rlUd/rlDu | Flip or mirror mode |
| scaleAmt | float | 100 | 25–400 | Scale percentage |

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| fractalType | int | julia | julia, mandelbrot, newton | Fractal type |
| seed | int | 1 | 1–100 | Random seed |
| symmetry | int | 0 | — | Rotational symmetry |
| zoomAmt | float | 0 | 0–130 | Zoom level |
| rotation | int | 0 | -180–180 | Rotation angle |
| speed | float | 30 | 0–100 | Animation speed |
| offsetX | float | 70 | -100–100 | Horizontal offset |
| offsetY | float | 50 | -100–100 | Vertical offset |
| centerX | float | 0 | -100–100 | Center X position |
| centerY | float | 0 | -100–100 | Center Y position |
| mode | int | iter | iter, z | Output mode |
| iterations | int | 50 | 1–50 | Maximum iterations |
| levels | int | 0 | 0–32 | Posterization levels (0 = off) |
| backgroundColor | vec3 | [0, 0, 0] | color | Background color |
| backgroundOpacity | float | 100 | 0–100 | Background opacity |
| cutoff | float | 0 | 0–100 | Cutoff threshold |

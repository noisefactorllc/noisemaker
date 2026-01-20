# fractal

Escape-time fractal explorer with multiple types and smooth coloring

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| fractalType | int | julia | mandelbrot/julia/burningShip/tricorn/newton | Type |
| power | int | 2 | 2-8 | Power |
| iterations | int | 100 | 10-500 | Iterations |
| bailout | float | 4 | 2-100 | Bailout |
| centerX | float | 0 | -3-3 | Center x |
| centerY | float | 0 | -3-3 | Center y |
| zoom | float | 1 | 0.1-100 | Zoom |
| rotation | float | 0 | -180-180 | Rotation |
| juliaReal | float | -0.7 | -2-2 | Julia real |
| juliaImag | float | 0.4 | -2-2 | Julia imag |
| animateJulia | boolean | false | - | Animate c |
| speed | float | 0.2 | 0-2 | Speed |
| outputMode | int | iterations | iterations/distance/angle/potential | Output mode |
| colorCycles | float | 1 | 0.1-10 | Color cycles |
| smoothing | boolean | true | - | Smooth |
| invert | boolean | false | - | Invert |

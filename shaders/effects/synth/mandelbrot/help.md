# mandelbrot

Mandelbrot set explorer with deep zoom via double-single emulation, distance estimation, and curated points of interest

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| poi | int | manual | manual/birdOfParadise/doubleSpiral/elephantValley/feigenbaum/miniBrot/scepterValley/seahorseValley/spiralGalaxy | Preset location |
| outputMode | int | smoothIteration | distance/normalMap/orbitTrap/smoothIteration/stripeAverage | Output algorithm |
| iterations | int | 500 | 50–2000 | Max iterations |
| centerX | float | -0.5 | -3–3 | Center x (manual mode) |
| centerY | float | 0 | -3–3 | Center y (manual mode) |
| rotation | float | 0 | -180–180 | Rotation (manual mode) |
| zoomSpeed | float | 0 | 0–5 | Auto-zoom speed |
| zoomDepth | float | 0 | 0–14 | Zoom depth (powers of 10) |
| stripeFreq | float | 5 | 0.5–20 | Stripe frequency |
| trapShape | int | point | circle/cross/point | Orbit trap shape |
| lightAngle | float | 45 | 0–360 | Normal map light angle |
| invert | boolean | false | - | Invert output |

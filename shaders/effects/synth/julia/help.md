# julia

Julia set explorer with deep zoom, distance estimation, and curated c-value gallery

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| poi | int | douadyRabbit | manual/douadyRabbit/siegel/dendrite/basilica/galaxy/lightning/dragonCurve/sanMarco/starfish/doubleSpiral | Preset c-value |
| cReal | float | -0.123 | -2–2 | c real (manual mode) |
| cImag | float | 0.745 | -2–2 | c imaginary (manual mode) |
| cPath | int | none | none/cardioid/circle/bulb | Animated c-path |
| cSpeed | float | 0.3 | 0–2 | c animation speed |
| cRadius | float | 0.7885 | 0.01–1.5 | Circle path radius |
| centerX | float | 0 | -3–3 | Center x |
| centerY | float | 0 | -3–3 | Center y |
| zoom | float | 1 | 0.1–100 | Zoom level |
| rotation | float | 0 | -180–180 | Rotation (degrees) |
| outputMode | int | smoothIteration | smoothIteration/distance/stripeAverage/orbitTrap/normalMap | Output algorithm |
| iterations | int | 300 | 50–1000 | Max iterations |
| stripeFreq | float | 5 | 0.5–20 | Stripe frequency |
| trapShape | int | point | point/cross/circle | Orbit trap shape |
| lightAngle | float | 45 | 0–360 | Normal map light angle |
| invert | boolean | false | - | Invert output |
| zoomSpeed | float | 0 | 0–5 | Auto-zoom speed |
| zoomDepth | float | 4 | 1–7 | Zoom depth (powers of 10) |

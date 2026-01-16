# Fractal

A comprehensive escape-time fractal explorer supporting multiple classic fractal types with smooth iteration coloring and flexible output modes.

## Fractal Types

| Type | Formula | Description |
|------|---------|-------------|
| **Mandelbrot** | z = z² + c | The iconic fractal. Each pixel represents c, starting z at origin. Includes the main cardioid and bulbs. |
| **Julia** | z = z² + c | Companion to Mandelbrot. Each pixel is the starting z, with c as a fixed parameter. Different c values create vastly different patterns. |
| **Burning Ship** | z = (\|Re(z)\| + i\|Im(z)\|)² + c | Takes absolute values before squaring, creating distinctive asymmetric ship-like structures. |
| **Tricorn** | z = conj(z)² + c | Also called Mandelbar. Uses complex conjugate, producing three-cornered symmetry. |
| **Phoenix** | z = z² + c + p·z₋₁ | Incorporates a "memory" of the previous iteration, creating flowing, organic patterns. |
| **Newton** | z = z - f(z)/f'(z) | Root-finding fractal for z³ - 1. Colors by which of the three roots is reached and iteration count. |

## Parameters

### Core Settings

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| type | enum | mandelbrot | mandelbrot, julia, burningShip, tricorn, phoenix, newton | Fractal algorithm |
| power | float | 2.0 | 2–8 | Exponent for z^n (disabled for Newton) |
| iterations | int | 100 | 10–500 | Maximum iteration depth |
| bailout | float | 4.0 | 2–100 | Escape radius threshold (disabled for Newton) |

### Transform

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| center x | float | -0.5 | -3–3 | Horizontal center position |
| center y | float | 0 | -3–3 | Vertical center position |
| zoom | float | 1.0 | 0.1–100 | Magnification level |
| rotation | float | 0 | 0–1 | Rotation (0–1 = full turn) |

### Julia Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| julia real | float | -0.7 | -2–2 | Real component of c (when not animating) |
| julia imag | float | 0.27 | -2–2 | Imaginary component of c (when not animating) |
| animate c | bool | false | — | Animate c along a circle for morphing Julia sets |
| phoenix p | float | -0.5 | -1–1 | Memory coefficient for Phoenix fractal |

### Animation

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| speed | float | 0.2 | 0–2 | Animation speed multiplier |

### Output

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| output mode | enum | iterations | iterations, distance, angle, potential | How to map fractal data to grayscale |
| color cycles | float | 1.0 | 0.1–10 | Number of color gradient repetitions |
| smooth | bool | true | — | Enable smooth iteration coloring (disabled for Newton) |
| invert | bool | false | — | Invert output brightness |
| seed | int | 0 | 0–100 | Random seed (affects animation phase) |

## Output Modes

- **iterations**: Traditional coloring based on escape iteration count
- **distance**: Colors by the final magnitude of z
- **angle**: Colors by the argument (angle) of the final z value
- **potential**: Continuous potential function for smooth banding

## Tips

- **Exploration**: Start with zoom=1, adjust center x/y, then increase zoom to explore details
- **Julia Discovery**: Set type to Julia, enable "animate c" to see the parameter space morph
- **Burning Ship**: Flip vertically (rotation ~0.5) to see the ship right-side up
- **High Detail**: Increase iterations when zooming deep to maintain detail
- **Performance**: Lower iterations for real-time preview, increase for final renders


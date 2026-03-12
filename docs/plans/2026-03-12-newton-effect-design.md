# Newton Effect Design

**Effect:** `synth/newton`
**Date:** 2026-03-12
**Status:** Approved

## Overview

Dedicated Newton fractal shader effect. Newton-Raphson root finding for z^n - 1 with fractional degree, real-valued relaxation (Nova generalization), df64 deep zoom, and time-driven animation. Grayscale 0-1 output for downstream palette effects.

Single-pass fragment shader with smart iteration budgeting. No internal textures, no feedback. Every pixel is independent, every frame recomputes as a pure function of time and parameters.

## Fractal Mathematics

### Newton-Raphson Iteration

For polynomial f(z) = z^n - 1 with relaxation parameter a:

```
z_next = z - a * f(z) / f'(z)
       = z - a * (z^n - 1) / (n * z^(n-1))
```

### Fractional Degree

Degree `n` is a continuous float (3.0-8.0). Complex power uses polar form:

```
z^n = r^n * (cos(n*theta) + i*sin(n*theta))
```

Roots of z^n - 1 are evenly spaced on the unit circle:

```
root_k = exp(2*pi*i*k/n)  for k = 0..floor(n)-1
```

For fractional n, floor(n) roots are positioned at 2*pi*k/n angles. Basin structure morphs continuously as n changes.

### Convergence Detection

Each iteration checks distance to all roots. When |z - root_k| < tolerance, record root index k and iteration count. Early bailout -- Newton converges quadratically, so most pixels finish in 5-15 iterations.

### Smooth Iteration Count

Continuous interpolation to eliminate banding:

```
smooth_iter = iter + log(tolerance / |z - root|) / log(convergence_rate)
```

### Divergence Guard

If |z| > 1e10 or |f'(z)| approaches zero (degenerate critical point), bail out and output 0.0.

## df64 Coordinate System

Each center coordinate stored as two float32s (hi + lo) giving ~15 decimal digits of precision for deep zoom to ~10^15.

### df64 Operations

- `df64_add(a_hi, a_lo, b_hi, b_lo)` -- Knuth two-sum
- `df64_mul(a_hi, a_lo, b_hi, b_lo)` -- Dekker split multiplication
- `df64_div` -- reciprocal approximation

### Coordinate Transform Pipeline

1. Pixel position normalized to [-1, 1] (standard float32, screen space)
2. Scale by `2.5 / zoom` where `zoom = pow(10.0, zoomSpeed * time)` clamped to zoomDepth
3. Add center offset in df64: `(centerHi + centerLo) + scaled_pixel`
4. Result feeds into Newton iteration as starting z value in standard float32

df64 precision is needed to locate where each pixel sits in the complex plane at deep zoom. The Newton iteration itself works fine in float32 because it converges toward nearby roots -- values stay bounded.

## Output Mapping

Three modes, all producing grayscale 0.0-1.0:

### Mode 0: Iteration Count

```
value = smooth_iter / max_iterations
```

Pure boundary structure. Fast convergence → low values. Basin boundaries → high values. Reveals fractal filigree.

### Mode 1: Root Index

```
value = float(root_k) / float(num_roots)
```

Each basin gets an evenly-spaced value band. For degree 5: values 0.0, 0.2, 0.4, 0.6, 0.8. Downstream palette maps these to distinct regions. Non-converged pixels → 0.0.

### Mode 2: Blended (Default)

```
value = (float(root_k) + smooth_iter / max_iterations) / float(num_roots)
```

Root index sets coarse band, iteration count modulates within it. Richest signal for downstream palettes -- basin identity and boundary detail in one channel.

### Invert

`value = 1.0 - value` when enabled.

### Final Output

```glsl
fragColor = vec4(vec3(value), 1.0);
```

Synth effect, no input texture. Alpha is 1.0.

## Animation System

All animation driven by engine `time` uniform. No internal state -- pure functions of time.

### Zoom

```
zoom = pow(10.0, min(time * zoomSpeed, zoomDepth))
```

Exponential approach. zoomDepth caps max depth. Holds at max when reached.

### Degree Sweep

```
effective_degree = clamp(degree + degreeRange * sin(time * degreeSpeed * TAU), 3.0, 8.0)
```

Sinusoidal oscillation around base degree. Static when degreeSpeed = 0 or degreeRange = 0.

### Relaxation Sweep

```
effective_relaxation = clamp(relaxation + relaxRange * sin(time * relaxSpeed * TAU * PHI), 0.5, 2.0)
```

Golden ratio (PHI ≈ 1.618) multiplier prevents phase-locking with degree sweep. Two parameters at incommensurate frequencies create non-repeating evolution.

## Points of Interest

Pre-baked POI table as shader constants. Each stores df64 center coordinates, degree, and zoom depth.

| POI | Degree | Description |
|-----|--------|-------------|
| manual | any | Free exploration, user-controlled center |
| triplePoint3 | 3.0 | z³-1 primary triple-point at origin, infinite self-similarity |
| spiralJunction3 | 3.0 | z³-1 spiral arm, Wada basin boundaries |
| starCenter5 | 5.0 | z⁵-1 origin, five-fold symmetric star |
| pentaSpiral5 | 5.0 | z⁵-1 boundary spiral, five interleaving basins |
| hexWeb6 | 6.0 | z⁶-1 boundary network, hexagonal lattice |
| octoFlower8 | 8.0 | z⁸-1 origin, eight-fold floral symmetry |

When POI is selected: centerX/centerY controls hidden, degree locked to POI value, auto-zoom drives toward pre-baked coordinates via time * zoomSpeed.

POI coordinates determined empirically during implementation. Expandable by adding constants and dropdown choices.

## Parameters

### Category: Fractal

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| degree | float | 3.0-8.0 | 3.0 | Polynomial degree for z^n - 1 |
| relaxation | float | 0.5-2.0 | 1.0 | Newton damping factor (1.0 = standard) |
| iterations | int | 10-500 | 100 | Max iteration budget |
| tolerance | float | 0.0001-0.01 | 0.001 | Convergence threshold |

### Category: Zoom

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| poi | int/dropdown | 0-6 | 0 | Point of interest selector |
| zoomSpeed | float | 0.0-2.0 | 0.5 | Exponential zoom rate |
| zoomDepth | float | 1.0-15.0 | 10.0 | Max zoom exponent (10^n) |
| centerX | float | -2.0-2.0 | 0.0 | Manual center X (hidden when POI active) |
| centerY | float | -2.0-2.0 | 0.0 | Manual center Y (hidden when POI active) |

### Category: Animation

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| degreeSpeed | float | 0.0-1.0 | 0.0 | Degree sweep rate |
| degreeRange | float | 0.0-3.0 | 0.0 | Degree sweep amplitude |
| relaxSpeed | float | 0.0-1.0 | 0.0 | Relaxation sweep rate |
| relaxRange | float | 0.0-0.5 | 0.0 | Relaxation sweep amplitude |

### Category: Output

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| outputMode | int/dropdown | 0-2 | 2 | iteration / rootIndex / blended |
| invert | boolean | -- | false | Invert output value |

## Uniform Packing

5 vec4 slots:

| Slot | x | y | z | w |
|------|---|---|---|---|
| 0 | resolution.x | resolution.y | time | degree |
| 1 | relaxation | iterations | tolerance | poi |
| 2 | centerHi.x | centerHi.y | centerLo.x | centerLo.y |
| 3 | zoomSpeed | zoomDepth | degreeSpeed | degreeRange |
| 4 | relaxSpeed | relaxRange | outputMode | invert |

## Pass Structure

```javascript
passes: [
  { name: "render", program: "newton" }
]
```

Single-pass fragment shader. No internal textures, no compute passes, no feedback.

## Architecture Notes

- Tags: `["geometric"]`
- No alpha channel modification (project rule)
- No per-frame allocations in render path
- Both GLSL and WGSL shader sources required
- WGSL struct members end with `,` not `;`
- Compile-check both backends before committing

# flythrough3d

3D fractal flythrough volume generator with camera-relative sampling.

## Description

Generates a moving volume-of-interest (VOI) that samples fractal space around a spline-based camera path. Designed for deep interior flythroughs of Mandelbulb and Mandelbox fractals with smooth navigation and collision avoidance.

## Key Features

- **Camera-relative VOI**: The voxel grid moves with the camera, sampling fractal space around the current position
- **Distance estimation**: Uses DE for stable shell rendering, normals, and collision avoidance
- **Spline pathing**: Smooth Catmull-Rom spline trajectory through fractal space
- **Collision avoidance**: Automatic push-away from surfaces using DE gradient
- **Hybrid density**: Thin surface shell + soft interior haze for depth
- **Orbit trap coloring**: Rich color variation based on fractal dynamics

## Parameters

### Fractal

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `fractalType` | choice | mandelbox | mandelbulb, mandelbox | Fractal formula |
| `power` | float | 8.0 | 2-16 | Mandelbulb power exponent |
| `boxScale` | float | -1.5 | -3 to 3 | Mandelbox scale (negative = interesting interiors) |
| `iterations` | int | 12 | 4-24 | Fractal iteration depth |
| `bailout` | float | 4.0 | 1-16 | Escape radius |

### Density

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `shellWidth` | float | 0.05 | 0.001-0.2 | Surface shell thickness |
| `interiorHaze` | float | 0.3 | 0-1 | Interior volumetric contribution |

### Camera

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `speed` | float | 0.2 | 0-1 | Flight speed along path |
| `voiSize` | float | 0.5 | 0.1-2 | Half-extent of view volume |
| `lookAhead` | float | 0.3 | 0-1 | How far ahead camera looks |
| `safetyRadius` | float | 0.05 | 0.01-0.2 | Minimum distance from surfaces |

### Color

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `colorMode` | choice | orbitTrap | mono, orbitTrap, iteration, hybrid |
| `colorShift` | float | 0 | Palette hue rotation |

## Examples

Basic flythrough:
```
flythrough3d().render3d().out(o0)
```

Fast Mandelbulb flight:
```
flythrough3d(fractalType: mandelbulb, speed: 0.5, power: 8).render3d().out(o0)
```

Deep Mandelbox interior:
```
flythrough3d(fractalType: mandelbox, boxScale: -2.0, voiSize: 0.3, interiorHaze: 0.5).render3d().out(o0)
```

Voxel-style rendering:
```
flythrough3d().render3d(filtering: voxel, threshold: 0.4).out(o0)
```

## Architecture

1. **Flight Path**: Procedural spline through fractal space, seeded by `seed`
2. **VOI Transform**: Camera-relative bounding box mapped to voxel grid
3. **Fractal Sampling**: DE-based density with hybrid shell/interior
4. **Collision Response**: Gradient-based push when camera approaches surface
5. **Volume Output**: Compatible with render3d pipeline

## Tips

- **Mandelbox** with negative scale creates navigable cavern-like interiors
- **Lower voiSize** = more detail but smaller view distance
- **Higher interiorHaze** = more volumetric/nebula feel
- **Lower shellWidth** = sharper surface definition
- Change **seed** for different flight paths through the same fractal

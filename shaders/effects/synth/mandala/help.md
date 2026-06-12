# mandala

N-fold symmetric mandala generator

## Description

Generates centered radial mandalas built from `layers` concentric rings of `shape` glyphs (petal, triangle, or dot), folded around an N-fold symmetry axis. Supports several animation modes, all of which loop seamlessly.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| scale | float | 10 | 1-20 | Inverse-scale (lower = larger figure) |
| rotation | float | 0 | -180-180 | Static rotation in degrees |
| thickness | float | 0.2 | 0-1 | Shape size |
| smoothness | float | 0.02 | 0-1 | Edge softness |
| symmetry | int | 12 | 3-24 | N-fold radial symmetry |
| layers | int | 6 | 1-12 | Concentric shape rings |
| shape | int | petal | dot/petal/triangle | Per-layer glyph shape |
| layerSpacing | float | 1.5 | 0.5-3.0 | Radial gap between layers |
| twist | float | 0 | -45-45 | Degrees of rotation added per layer; non-zero produces a spiral |
| shapeGrowth | float | 0 | -1-1 | Shape size ramp across layers; positive = grow outward, negative = shrink outward |
| bindu | bool | false | - | Small filled dot at the center |
| animation | int | none | none/rotate/pulse/differential/counterRotate/spiralWave/ripple | Animation mode |
| speed | int | 1 | -5-5 | Animation speed and direction |
| pulseDepth | float | 0.15 | 0-1 | Amplitude for pulse and ripple animations |
| fgColor | color | 1,1,1 | - | Foreground color |
| bgColor | color | 0,0,0 | - | Background color |

## Animation

All modes loop seamlessly. Speed is integer-snapped so the loop is exact at any value.

- **rotate**: whole figure rotates uniformly.
- **pulse**: effective scale modulated by `sin(time)`. `pulseDepth` controls amplitude.
- **differential**: each layer rotates at a different speed (inner = base speed, layer i = speed + i turns/cycle). Galactic whirlpool.
- **counterRotate**: even layers forward, odd layers reverse. Shearing effect between adjacent rings.
- **spiralWave**: the `twist` value oscillates over the cycle. Spiral tightens, unwinds, reverses, and returns. Requires `twist` ≠ 0 to be visible (the param sets the amplitude).
- **ripple**: per-layer pulse with phase offset, so the size oscillation appears to travel outward through the layers. `pulseDepth` controls amplitude.

## Usage

```
search synth

mandala()
  .write(o0)

render(o0)
```

### Examples

```
// 12-fold petal mandala with 4 layers
mandala({ symmetry: 12, layers: 4, shape: 0 })
  .write(o0)

// 6-fold triangle mandala, slow rotation
mandala({ symmetry: 6, shape: 1, animation: 1, speed: 1 })
  .write(o0)

// 16-fold dot mandala, pulsing
mandala({ symmetry: 16, shape: 2, animation: 2, speed: 1, pulseDepth: 0.25 })
  .write(o0)

// Spiral with twist + bindu
mandala({ symmetry: 12, layers: 5, twist: 12, bindu: true })
  .write(o0)

// Blooming outward growth
mandala({ symmetry: 8, layers: 4, shapeGrowth: 0.7, layerSpacing: 2.0 })
  .write(o0)

// Whirlpool: each layer at its own speed
mandala({ symmetry: 8, layers: 6, animation: 3, speed: 1 })
  .write(o0)

// Counter-rotating rings
mandala({ symmetry: 12, layers: 4, animation: 4, speed: 1 })
  .write(o0)

// Spiral that tightens and unwinds
mandala({ symmetry: 8, layers: 5, twist: 20, animation: 5, speed: 1 })
  .write(o0)

// Ripple wave traveling outward
mandala({ symmetry: 8, layers: 6, animation: 6, speed: 1, pulseDepth: 0.4 })
  .write(o0)
```

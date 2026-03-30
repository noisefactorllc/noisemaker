# modPattern

This effect creates layered geometric patterns using modulo folding operations.
Three layers of shapes (plus, square, diamond) are combined with configurable
scales and blend modes to produce complex moiré and interference patterns.

## Parameters

### General
| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| blend | int | 0 | 0-3 | Blend mode: add (0), max (1), mix (2), rgb (3) |
| smoothing | int | 0 | 0-3 | Edge smoothing amount |

### Animation
| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| animMode | int | 0 | 0-2 | Animation mode: shift (0), pan (1), phase (2) |
| speed | int | 1 | 0-5 | Animation speed |

### Layer 1
| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| shape1 | int | 0 | 0-2 | Shape type: plus (0), square (1), diamond (2) |
| scale1 | float | 18.0 | 0.1-20 | Scale/frequency of the first layer |
| repeat1 | float | 5.0 | 0-20 | Repetition multiplier for interference patterns |

### Layer 2
| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| shape2 | int | 1 | 0-2 | Shape type: plus (0), square (1), diamond (2) |
| scale2 | float | 8.0 | 0.1-10 | Scale/frequency of the second layer |
| repeat2 | float | 8.0 | 0-10 | Repetition multiplier for interference patterns |

### Layer 3
| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| shape3 | int | 2 | 0-2 | Shape type: plus (0), square (1), diamond (2) |
| scale3 | float | 1.5 | 0.1-20 | Scale/frequency of the third layer |
| repeat3 | float | 1.5 | 0-5 | Repetition multiplier for interference patterns |

## Animation Modes

- **Shift**: Slides the combined pattern through fract space. Continuous forward motion, loops seamlessly at integer speed.
- **Pan**: Each layer oscillates in a different direction (right, up, left) via sine, with amplitude scaled to match visual weight across layers. Loops seamlessly.
- **Phase**: Each layer's value is offset independently over time, creating evolving moiré interference. Loops seamlessly at integer speed.

## Usage

```
modPattern()
  .write(o0)

render(o0)
```

### Custom parameters

```
modPattern(shape1: 2, scale1: 8.0, shape2: 0, scale2: 5.0, blend: 1)
  .write(o0)

render(o0)
```

### With color palette

```
modPattern(scale1: 6.0, repeat1: 10.0)
  .palette(preset: "rainbow")
  .write(o0)

render(o0)
```

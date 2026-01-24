# modPattern

This effect creates layered geometric patterns using modulo folding operations.
Three layers of shapes (plus, square, diamond) are combined with configurable
scales and blend modes to produce complex moiré and interference patterns.

## Parameters

### Layer 1
| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| shape1 | int | 0 | 0-2 | Shape type: plus (0), square (1), diamond (2) |
| scale1 | float | 4.0 | 0.1-20 | Scale/frequency of the first layer |
| repeat1 | float | 15.0 | 0-20 | Repetition multiplier for interference patterns |

### Layer 2
| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| shape2 | int | 1 | 0-2 | Shape type: plus (0), square (1), diamond (2) |
| scale2 | float | 3.0 | 0.1-10 | Scale/frequency of the second layer |
| repeat2 | float | 8.0 | 0-10 | Repetition multiplier for interference patterns |

### Layer 3
| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| shape3 | int | 2 | 0-2 | Shape type: plus (0), square (1), diamond (2) |
| scale3 | float | 3.0 | 0.1-20 | Scale/frequency of the third layer |
| repeat3 | float | 1.5 | 0-5 | Repetition multiplier for interference patterns |
| blend3 | int | 0 | 0-3 | Blend mode: add (0), max (1), mix (2), rgb (3) |
| speed | int | 1 | 0-5 | Animation speed multiplier |

## Usage

```
modPattern()
  .write(o0)

render(o0)
```

### Custom parameters

```
modPattern(shape1: 2, scale1: 8.0, shape2: 0, scale2: 5.0, blend3: 1)
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

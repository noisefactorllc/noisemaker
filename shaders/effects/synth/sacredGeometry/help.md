# sacredGeometry

Flower-of-life and related sacred-geometry figures

## Description

Generates classic sacred-geometry figures: Flower of Life, Seed of Life, Fruit of Life, Metatron's Cube, Vesica Piscis, Triquetra, Borromean Rings, and parametric star polygons. Pick the figure via the `geometry` dropdown. Supports rotation and pulse animation, both of which loop seamlessly.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| scale | float | 10 | 1-20 | Inverse-scale (lower = larger figure) |
| rotation | float | 0 | -180-180 | Static rotation in degrees |
| thickness | float | 0.2 | 0-1 | Line weight |
| smoothness | float | 0.02 | 0-1 | Edge softness |
| geometry | int | flower | borromean/flower/fruit/metatron/seed/starPolygon/triquetra/vesica | Figure family |
| rings | int | 3 | 1-6 | Hex shells from center (Flower only) |
| starPoints | int | 5 | 5-12 | Number of star points (Star Polygon only) |
| animation | int | none | none/pulse/ripple/rotate/unfold | Animation mode |
| speed | int | 1 | -5-5 | Animation speed and direction |
| pulseDepth | float | 0.15 | 0-1 | Amplitude for pulse and ripple |
| fgColor | color | 1,1,1 | - | Foreground color |
| bgColor | color | 0,0,0 | - | Background color |

## Geometries

- **flower (0)**: classic Flower of Life — overlapping circles on a hex grid out to `rings` shells. Each circle passes through its six neighbors' centers.
- **fruit (1)**: Fruit of Life — 13 tangent (non-overlapping) circles in a specific arrangement: one center + 6 inner + 6 outer.
- **metatron (3)**: Metatron's Cube — the 13 Fruit-of-Life circles plus all 78 line segments connecting every pair of centers. The five Platonic solids appear as projections within it.
- **seed (4)**: Seed of Life — 7 overlapping circles (one center + 6 in a hex ring), the inner kernel of the Flower of Life.
- **vesica (5)**: Vesica Piscis — two overlapping circles whose centers are separated by one radius.
- **borromean (6)**: Borromean Rings — three interlocked circles arranged in a triangle. In a 3D depiction, removing any one releases the other two; in 2D it reads as three overlapping rings.
- **starPolygon (7)**: parametric `{n/2}` star polygon. `starPoints=5` gives a pentagram, `7` a heptagram, `8` a Star of Lakshmi, etc. Even point counts with gcd(n, 2) = 2 produce two interlocking polygons.
- **triquetra (8)**: the classic Celtic trinity knot — three interlocking vesica piscises arranged at 120°. Each pair of circles contributes the boundary of their lens-shaped intersection (two arcs meeting at two cusps), giving six arcs and six cusps overall.

## Animation

All modes loop seamlessly. Speed is integer-snapped so the loop is exact at any value.

- **rotate**: whole figure spins around its center.
- **pulse**: effective scale modulated by `sin(time)`. `pulseDepth` controls amplitude.
- **ripple**: per-circle radius pulsation with phase offset based on each circle's distance from origin — pulses travel outward through the figure. For circle-based geometries (flower, seed, fruit, metatron, vesica, borromean, triquetra). On starPolygon, the polygon's radius pulsates as a whole.
- **unfold**: elements appear sequentially over the cycle, from center outward. On metatron, the 13 circles unfold in the first 60% of the cycle, then the 78 lines draw on. On starPolygon, lines fade in sequentially around the ring.

## Usage

```
search synth

sacredGeometry()
  .write(o0)

render(o0)
```

### Examples

```
// Classic Flower of Life
sacredGeometry({ geometry: 0, rings: 3 })
  .write(o0)

// Metatron's Cube
sacredGeometry({ geometry: 3, fgColor: [1, 0.8, 0.4] })
  .write(o0)

// Hexagram via star polygon (n=6)
sacredGeometry({ geometry: 7, starPoints: 6, animation: 1, speed: 1 })
  .write(o0)

// Seed of Life, breathing
sacredGeometry({ geometry: 4, animation: 2, speed: 1, pulseDepth: 0.3 })
  .write(o0)

// Pentagram
sacredGeometry({ geometry: 7, starPoints: 5 })
  .write(o0)

// 9-pointed enneagram
sacredGeometry({ geometry: 7, starPoints: 9 })
  .write(o0)

// Triquetra in warm tones
sacredGeometry({ geometry: 8, fgColor: [1, 0.7, 0.3], thickness: 0.3 })
  .write(o0)

// Flower of life rippling outward
sacredGeometry({ geometry: 0, rings: 4, animation: 4, speed: 1, pulseDepth: 0.3 })
  .write(o0)

// Metatron unfolding from center
sacredGeometry({ geometry: 3, animation: 5, speed: 1 })
  .write(o0)

// Heptagram with slow rotation
sacredGeometry({ geometry: 7, starPoints: 7, animation: 1, speed: 1 })
  .write(o0)
```

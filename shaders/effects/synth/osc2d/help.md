````markdown
# osc2d

2D oscillator pattern with values repeating along one axis. The oscillator smoothly transitions from 0 to 1 and back to 0 over the duration.

## Arguments

### `oscType`
- **Type:** Member (oscType enum).
- **Default:** `oscType.sine`.
- **Options:** `sine`, `linear` (triangle), `sawtooth`, `sawtoothInv`, `square`, `noise`.
- **Description:** The waveform shape of the oscillator.

### `frequency`
- **Type:** Integer.
- **Default:** `1`.
- **Range:** 1–32.
- **Description:** Number of complete oscillation cycles over the duration. Higher values cycle faster.

### `speed`
- **Type:** Number.
- **Default:** `4.0`.
- **Range:** 0–10.
- **Description:** Controls how fast the oscillator pattern moves along the orthogonal axis.

### `rotation`
- **Type:** Number.
- **Default:** `0`.
- **Range:** 0–360.
- **Description:** Rotation angle in degrees for the oscillator pattern.

### `seed`
- **Type:** Number.
- **Default:** `0`.
- **Range:** 0–1000.
- **Description:** Random seed for the noise oscillator type.

## Examples

### Positional

```dsl
osc2d(oscType.sine, 2, 1.0, 0, 0).write()
```

### Keyword

```dsl
osc2d(oscType: oscType.noise, frequency: 4, speed: 2.0, rotation: 45, seed: 42).write()
```

````

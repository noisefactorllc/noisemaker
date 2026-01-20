# Lenia

Particle Lenia artificial life simulation.

## Description

Particle Lenia is an artificial life system inspired by Lenia and continuous cellular automata. Unlike grid-based Lenia, this implementation uses particles that interact through potential fields, creating emergent self-organizing structures.

Based on [Particle Lenia](https://google-research.github.io/self-organising-systems/particle-lenia/) by Alexander Mordvintsev et al.

## Parameters

### Kernel (K)

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| kernel μ | float | — | — | Radius of the attraction shell. Larger values create looser structures |
| kernel σ | float | — | — | Width of the shell. Larger values create softer attraction |

### Growth (G)

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| growth μ | float | — | — | Target local density. Particles seek areas with this density |
| growth σ | float | — | — | Tolerance around target density. Larger values are more permissive |

### Motion

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| repulsion | float | — | — | Strength of particle-particle repulsion. Prevents collapse |
| time step | float | — | — | Simulation speed. Larger values are faster but less stable |
| search radius | float | — | — | Maximum interaction distance (optimization parameter) |

## Algorithm

**Lenia Field U(x)**: Each particle contributes to a scalar field through a gaussian shell kernel:
$U(x) = \sum K(\|x - p_i\|)$ where $K(r) = w_k \cdot \exp(-((r - \mu_k) / \sigma_k)^2)$

**Growth Field G(u)**: Selects the optimal density for particle attraction:
$G(u) = \exp(-((u - \mu_a) / \sigma_a)^2)$

**Repulsion Field R(x)**: Prevents particle overlap:
$R(x) = (c_{rep}/2) \cdot \sum \max(1 - \|x - p_i\|, 0)^2$

**Motion**: Particles follow local energy gradients:
$dp/dt = -\nabla E = \nabla G - \nabla R$

## Usage

```
pointsEmit({ count: 2048 }).lenia().pointsRender().write(o0)
```

## Notes

Typical behaviors:
- **Rotators**: Spinning formations that maintain stable structure
- **Gliders**: Self-propelling compact structures
- **Phase transitions**: Complex reorganization as particles find equilibrium
- **Crystallization**: Stable lattice-like arrangements at low energy

Tips:
- Start with default parameters and adjust gradually
- More particles (higher count in pointsEmit) create richer dynamics
- Lower time step for more stable simulations
- Adjust kernel μ to match your particle density

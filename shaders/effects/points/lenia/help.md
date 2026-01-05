# Lenia - Particle Lenia Simulation

Particle Lenia is an artificial life system inspired by Lenia and continuous cellular automata. Unlike grid-based Lenia, this implementation uses particles that interact through potential fields, creating emergent self-organizing structures.

## Algorithm

Based on [Particle Lenia](https://google-research.github.io/self-organising-systems/particle-lenia/) by Alexander Mordvintsev et al.

### Key Concepts

**Lenia Field U(x)**: Each particle contributes to a scalar field through a gaussian shell kernel:
```
U(x) = Σ K(||x - pᵢ||)
K(r) = wₖ * exp(-((r - μₖ) / σₖ)²)
```

**Growth Field G(u)**: Selects the optimal density for particle attraction:
```
G(u) = exp(-((u - μₐ) / σₐ)²)
```

**Repulsion Field R(x)**: Prevents particle overlap:
```
R(x) = (cᵣₑₚ/2) * Σ max(1 - ||x - pᵢ||, 0)²
```

**Motion**: Particles follow local energy gradients:
```
dp/dt = -∇E = ∇G - ∇R
```

## Parameters

### Kernel (K)
- **kernel μ**: Radius of the attraction shell. Larger values create looser structures.
- **kernel σ**: Width of the shell. Larger values create softer attraction.

### Growth (G)
- **growth μ**: Target local density. Particles seek areas with this density.
- **growth σ**: Tolerance around target density. Larger values are more permissive.

### Motion
- **repulsion**: Strength of particle-particle repulsion. Prevents collapse.
- **time step**: Simulation speed. Larger values are faster but less stable.
- **search radius**: Maximum interaction distance (optimization parameter).

## Usage

```javascript
pointsEmit({ count: 2048 }).lenia().pointsRender().write(o0)
```

## Typical Behaviors

- **Rotators**: Spinning formations that maintain stable structure
- **Gliders**: Self-propelling compact structures
- **Phase transitions**: Complex reorganization as particles find equilibrium
- **Crystallization**: Stable lattice-like arrangements at low energy

## Tips

- Start with default parameters and adjust gradually
- More particles (higher count in pointsEmit) create richer dynamics
- Lower time step for more stable simulations
- Adjust kernel μ to match your particle density

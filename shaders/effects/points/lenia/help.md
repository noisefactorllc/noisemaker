# lenia

Particle Lenia artificial life simulation

## Description

Particle Lenia is an artificial life system inspired by Lenia and continuous cellular automata. Unlike grid-based Lenia, this implementation uses particles that interact through potential fields, creating emergent self-organizing structures.

Based on [Particle Lenia](https://google-research.github.io/self-organising-systems/particle-lenia/) by Alexander Mordvintsev et al.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| muK | float | 25 | 1-30 | Kernel μ |
| sigmaK | float | 5 | 0.1-10 | Kernel σ |
| muG | float | 0.25 | 0.1-2 | Growth μ |
| sigmaG | float | 0.15 | 0.01-0.5 | Growth σ |
| repulsion | float | 0.5 | 0-5 | Repulsion |
| dt | float | 0.25 | 0.01-0.5 | Time step |
| searchRadius | float | 25 | 5-40 | Search radius |
| depositAmount | float | 3.6 | 0.1-5 | Deposit |

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

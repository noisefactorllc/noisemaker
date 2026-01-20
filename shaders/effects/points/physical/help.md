# Physical

Physics-based particle simulation with wind and gravity forces.

## Description

Particles fall under gravity, get pushed by wind, and experience drag and random wandering. Use negative gravity for rising particles (like smoke or bubbles).

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| gravity | float | 0.05 | -2–2 | Gravity force (negative = upward) |
| wind | float | 0 | -2–2 | Horizontal wind force |
| energy | float | 0.5 | 0–2 | Initial velocity energy |
| drag | float | 0.15 | 0–0.2 | Air resistance / velocity damping |
| stride | float | 0.75 | 0–1 | Per-agent stride variation |
| wander | float | 0.25 | 0–1 | Random wandering force |

## Usage

```
pointsEmit().physical(gravity: 0.1, wind: 0.05).pointsRender().write(o0)
```

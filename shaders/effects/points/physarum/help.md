# Physarum

Physarum slime mold simulation.

## Description

Agents sense pheromone trails using forward sensors and steer towards higher concentrations, depositing their own pheromone as they move. Creates organic network patterns. Lower `sensorAngle` creates tighter networks; higher values create more branching.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| moveSpeed | float | 1.78 | 0.05–3 | Agent movement speed |
| turnSpeed | float | 1 | 0–π | Maximum turn rate per step (radians) |
| sensorAngle | float | 1.26 | 0.1–1.5 | Angle between sensors (radians) |
| sensorDistance | float | 0.03 | 0.002–0.1 | Distance to sensor points (normalized) |
| inputWeight | float | 0 | 0–100 | Weight of input texture influence on steering |
| deposit | float | 0.5 | 0–1 | Pheromone deposit amount |
| decay | float | 0.1 | 0–1 | Pheromone decay rate |
| resetState | boolean | false | — | Button to reset simulation |

## Usage

```
pointsEmit().physarum(moveSpeed: 2, sensorAngle: 0.8).pointsRender().write(o0)
```

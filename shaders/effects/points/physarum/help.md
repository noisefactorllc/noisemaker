# physarum

Physarum slime mold simulation

## Description

Agents sense pheromone trails using forward sensors and steer towards higher concentrations, depositing their own pheromone as they move. Creates organic network patterns. Lower `sensorAngle` creates tighter networks; higher values create more branching.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| moveSpeed | float | 1.78 | 0.05-3 | Move speed |
| turnSpeed | float | 1 | 0-3.14159 | Turn speed |
| sensorAngle | float | 1.26 | 0.1-1.5 | Sensor angle |
| sensorDist | float | 0.03 | 0.002-0.1 | Sensor distance |
| inputWeight | float | 0 | 0-100 | Input weight |
| deposit | float | 0.5 | 0-1 | Deposit |
| decay | float | 0.1 | 0-1 | Decay |
| resetState | boolean | false | - | State |

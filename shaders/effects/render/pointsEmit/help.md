# pointsEmit

Initialize and maintain agent state for particle systems

## Description

This is the starting point for all agent-based effects. It creates and manages three state textures:
- **xyz**: Agent positions (x, y, z, alive_flag)
- **vel**: Agent velocities and per-agent data
- **rgba**: Agent colors (sampled from input texture)

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| stateSize | int | x256 | x64/x128/x256/x512/x1024/x2048 | State size |
| layout | int | random | random/grid/center/ring/clusters/spiral | Layout |
| seed | int | 0 | 0-100 | Seed |
| attrition | float | 0 | 0-10 | Attrition |
| resetState | boolean | false | - | State |

## Notes

Agent count by stateSize:
- 64 × 64 = 4,096 agents
- 128 × 128 = 16,384 agents
- 256 × 256 = 65,536 agents
- 512 × 512 = 262,144 agents
- 1024 × 1024 = 1,048,576 agents
- 2048 × 2048 = 4,194,304 agents

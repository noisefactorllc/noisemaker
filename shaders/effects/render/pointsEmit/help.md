# Points Emit

Initialize and maintain agent state for particle systems.

## Description

This is the starting point for all agent-based effects. It creates and manages three state textures:
- **xyz**: Agent positions (x, y, z, alive_flag)
- **vel**: Agent velocities and per-agent data
- **rgba**: Agent colors (sampled from input texture)

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| stateSize | int | 256 | 64–2048 | State texture size (controls agent count: 256² = 65k agents) |
| layout | int | random | random/grid/center/ring/clusters/spiral | Initial distribution |
| seed | float | 0 | 0–100 | Random seed for initial positions |
| attrition | float | 0 | 0–10 | Per-frame respawn chance (0 = none, 10 = 10% per frame) |
| resetState | boolean | false | — | Button to force all agents to respawn |

## Usage

```
noise().pointsEmit(stateSize: 512, layout: random).flow().pointsRender().write(o0)
```

## Notes

Agent count by stateSize:
- 64 × 64 = 4,096 agents
- 128 × 128 = 16,384 agents
- 256 × 256 = 65,536 agents
- 512 × 512 = 262,144 agents
- 1024 × 1024 = 1,048,576 agents
- 2048 × 2048 = 4,194,304 agents

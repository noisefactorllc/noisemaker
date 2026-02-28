# physical

Physics-based particle simulation with wind and gravity forces

## Description

Particles fall under gravity, get pushed by wind, and experience drag and random wandering. Use negative gravity for rising particles (like smoke or bubbles).

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| stateSize | int | 256 | - | - |
| gravity | float | 0.05 | -2-2 | Gravity |
| wind | float | 0 | -2-2 | Wind |
| energy | float | 0.5 | 0-2 | Energy |
| drag | float | 0.15 | 0-0.2 | Drag |
| deviation | float | 0.75 | 0-1 | Deviation |
| wander | float | 0.25 | 0-1 | Wander |

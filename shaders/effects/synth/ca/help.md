# ca

2D cellular automata with rule presets

## Description

Classic 2D cellular automata simulation supporting various rule sets including Conway's Game of Life and many others. Features zoom levels, smoothing interpolation, and optional texture input for seeding.

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| tex | surface | none | - | Texture |
| zoom | int | x32 | x1/x2/x4/x8/x16/x32/x64 | Zoom |
| smoothing | int | constant | constant/linear/hermite/catmullRom3x3/catmullRom4x4/bSpline3x3/bSpline4x4 | Smoothing |
| seed | float | 1 | 1-100 | Seed |
| speed | float | 10 | 1-100 | Speed |
| resetState | boolean | false | - | State |
| ruleIndex | int | classicLife | classicLife/highlife/seeds/coral/dayNight/lifeWithoutDeath/replicator/amoeba/maze/gliderWalk/diamoeba/size2x2/morley/anneal/size34Life/simpleReplicator/waffles/pondLife | Rules |
| weight | float | 0 | 0-100 | Input weight |
| source | int | 0 | 0-7 | - |

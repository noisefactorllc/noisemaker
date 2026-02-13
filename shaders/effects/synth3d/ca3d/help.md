# ca3d

3D cellular automata simulation

## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| volumeSize | int | x32 | x16/x32/x64/x128 | Volume size |
| seed | int | 1 | 1-100 | - |
| ruleIndex | int | rule445M | rule445M/rule678/amoeba/builder1/builder2/clouds/crystalGrowth/diamoeba/pyroclastic/slowDecay/spikeyGrowth | Rules |
| neighborMode | int | moore | moore/vonNeumann | Neighborhood |
| speed | float | 1 | 0.1-10 | Sim speed |
| density | float | 50 | 1-100 | Initial density % |
| colorMode | int | mono | mono/age | Color mode |
| resetState | boolean | false | - | State |
| source vol | volume | vol0 | - | Source volume |
| source feo | geometry | geo0 | - | Source geometry |
| weight | float | 0 | 0-100 | Input weight |

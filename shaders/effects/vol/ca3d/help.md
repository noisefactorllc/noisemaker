## Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| volumeSize | int | x32 | x16, x32, x64, x128 | Volume resolution |
| seed | float | 1 | 1–100 | Random seed |
| resetState | boolean | false | button | Reset simulation state |
| ruleIndex | int | rule445M | rule445M, rule678, amoeba, builder1, builder2, clouds, crystalGrowth, diamoeba, pyroclastic, slowDecay, spikeyGrowth | CA rule set |
| neighborMode | int | moore | moore, vonNeumann | Neighborhood mode |
| speed | float | 1 | 0.1–10 | Simulation speed |
| density | float | 50 | 1–100 | Initial density percentage |
| colorMode | int | mono | mono, age | Color mode |
| weight | float | 0 | 0–100 | Input weight from upstream |

## Usage

```dsl
ca3d(ruleIndex: "crystalGrowth", speed: 2).render3d().write(o0)
noise3d().ca3d().render3d().write(o0)  // chain from noise
```

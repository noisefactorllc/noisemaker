# synth/navierStokes — Real-time 2D fluid simulation

Status: autonomous design, no user-dialog brainstorming (per explicit "proceed completely autonomously" directive).
Reference siblings: `synth/reactionDiffusion`, `synth/cellularAutomata`, `synth/mnca` (the "sim" tagged effects).

## Goal

Add a self-sustaining 2D fluid synth effect that produces fluid-like motion via the Helmholtz-Hodge decomposition (Stam's stable fluids method). Output is dye/density advected through a divergence-free velocity field, optionally seeded by an input texture.

## Algorithm (split-step Navier-Stokes)

Incompressible Navier-Stokes momentum, time-split into independent passes per frame:

1. **Inject** impulses (forces + dye sources): velocity gets random or input-driven splats, dye gets injected at the same locations.
2. **Advect** velocity & dye along the existing velocity field (semi-Lagrangian backward trace).
3. **Divergence**: compute scalar ∇·u from current velocity.
4. **Pressure**: solve ∇²p = ∇·u via N Jacobi iterations (red/black not needed; standard Jacobi with ping-pong is fine).
5. **Project**: subtract ∇p from velocity → velocity is divergence-free.
6. **Render**: visualize dye / velocity / pressure with selectable display + smoothing.

Velocity decay and dye decay are folded into the advect pass as multiplicative damping. No explicit viscosity diffusion (the inherent numerical diffusion of bilinear-sampled semi-Lagrangian advection is already quite viscous at the low resolutions we run sims at).

## State textures

Both at zoom-divided resolution (matches `synth/reactionDiffusion` precedent).

| Texture | R | G | B | A |
|---|---|---|---|---|
| `global_ns_velocity` | velocity.x | velocity.y | dye | reserved |
| `global_ns_pressure` | pressure | divergence | reserved | reserved |

Velocity components are stored centered around 0 (mapped to/from `[0,1]` via `*0.5+0.5` on store, `*2.0-1.0` on load) so default fp render targets work without float16.

## Passes

Order matters; each pass reads `global_ns_*` and writes back (runtime ping-pongs).

| # | name | program | reads | writes | repeat |
|---|---|---|---|---|---|
| 1 | splat | `nsSplat` | velocity, input | velocity | 1 |
| 2 | advect | `nsAdvect` | velocity | velocity | 1 |
| 3 | divergence | `nsDivergence` | velocity, pressure | pressure | 1 |
| 4 | pressure | `nsPressure` | pressure | pressure | `iterations` |
| 5 | gradient | `nsGradient` | velocity, pressure | velocity | 1 |
| 6 | render | `ns` | velocity, input | outputTex | 1 |

`iterations` is exposed as a slider (default 20, range 4-40). Each Jacobi iteration ping-pongs the pressure texture, courtesy of the existing runtime repeat handling.

## Parameters (globals)

Following the convention of other sim effects:

| Param | Type | Default | Range | Notes |
|---|---|---|---|---|
| tex | surface | none | — | optional input |
| zoom | int dropdown | 4 | 1–32 | resolution divider |
| iterations | int slider | 20 | 4–40 | Jacobi pressure iter |
| smoothing | int dropdown | 1 (linear) | enum | display interpolation |
| speed | float slider | 60 | 5–145 | dt multiplier |
| splatForce | float slider | 50 | 0–100 | impulse magnitude |
| splatRadius | float slider | 30 | 5–100 | impulse gaussian σ |
| splatRate | float slider | 35 | 0–100 | per-frame chance of random splat |
| dyeDecay | float slider | 96 | 80–100 | dye persistence per frame |
| velocityDecay | float slider | 99 | 80–100 | velocity drag per frame |
| inputForce | float slider | 0 | 0–100 | use input as additive velocity source |
| inputDye | float slider | 0 | 0–100 | use input as dye source |
| displayMode | int dropdown | 0 (dye) | dye/velocity/pressure/composite | what to show |
| colorMode | int dropdown | 0 (rainbow) | rainbow/mono/heat/cool | dye colormap |
| weight | float slider | 0 | 0–100 | input weight (drives splat source) |
| resetState | boolean button | false | — | zero state |
| seed | int (hidden) | 1 | 1–100 | for hash-based randomness |

## Visual targets

- Without input: a self-running fluid simulator. Random impulses (driven by `splatRate` + hash of time/seed) keep introducing dye + force. Output should look like swirling, turbulent dye in an inviscid fluid.
- With input: the input's luminance can drive either velocity (force field) or dye sources. The intent matches how `mnca` uses its `tex` input.

## Files

```
shaders/effects/synth/navierStokes/
  definition.js
  help.md
  glsl/
    nsSplat.glsl
    nsAdvect.glsl
    nsDivergence.glsl
    nsPressure.glsl
    nsGradient.glsl
    ns.glsl
  wgsl/
    nsSplat.wgsl
    nsAdvect.wgsl
    nsDivergence.wgsl
    nsPressure.wgsl
    nsGradient.wgsl
    ns.wgsl
```

Plus an entry in `shaders/effects/manifest.json`.

## Parity strategy

GLSL is the reference. Each WGSL pass is a literal translation of its GLSL counterpart with:
- `texture()` → `textureSampleLevel(..., 0.0)` with the bound sampler
- `vec*` constructors → `vec*<f32>(...)`
- struct members terminated with `,` (project convention)
- `gl_FragCoord.xy` → `@builtin(position) pos.xy` argument
- uniforms packed into a `vec4` array

After each pass is written, validate with `mcp__shade__compileEffect`, `renderEffectFrame`, and `testPixelParity`.

## Out of scope (v1)

- Vorticity confinement (would add a 7th pass and feature creep; semi-Lagrangian advection already gives a watchable result without it).
- Viscosity diffusion (numerical diffusion is sufficient at sim resolutions).
- Boundary conditions beyond clamp-to-edge.
- 3D fluid (would be `synth3d/navierStokes3d`).

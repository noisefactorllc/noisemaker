# classicNoisedeck Palette Expansion

## Problem

classicNoisedeck effects have palette dropdowns that do nothing. These effects were extracted from noisedeck-pro, which had bespoke handling that expanded palette presets into separate uniforms (offset, amp, freq, phase, mode). That expansion logic was never ported.

The shaders already consume `paletteOffset`, `paletteAmp`, `paletteFreq`, `palettePhase` (vec3) and `paletteMode` (int) uniforms correctly. The gap is: when a user selects a palette preset, only the integer index gets set — the vec3 uniforms stay at their hardcoded defaults.

## Design

### 1. New module: `shaders/src/runtime/palette-expansion.js`

Self-contained module with no dependency on `palettes.js` or `palettes.json`.

**Embedded data:** JS array of 55 palette entries matching `filter/palette`'s shader const arrays (same order, same values). Each entry:

```js
{ amp: [r, g, b], freq: [r, g, b], offset: [r, g, b], phase: [r, g, b], mode: int }
```

Mode values match classicNoisedeck shader convention:
- 0 = none (no color conversion)
- 1 = hsv (shader converts hsv → rgb)
- 2 = oklab (shader converts oklab → rgb)
- 3 = rgb (no conversion needed)

**Export:** `expandPalette(index)` → `{ paletteOffset, paletteAmp, paletteFreq, palettePhase, paletteMode }`

Returns `null` for out-of-range indices.

### 2. Pipeline integration in `pipeline.js`

In `setUniform()`, after storing the value:
- Check if the effect definition has a global with `type: "palette"` for the uniform being set
- If so, call `expandPalette(value)` and also call `setUniform()` for the 5 dependent uniforms (paletteOffset, paletteAmp, paletteFreq, palettePhase, paletteMode)
- Guard against infinite recursion (the dependent setUniform calls should not re-trigger expansion)

### 3. No shader changes

The classicNoisedeck shaders already consume the separate uniforms correctly. No GLSL or WGSL modifications needed.

### 4. No effect definition changes

The existing hidden palette vec3 params (`paletteOffset`, etc. with `hidden: true`) stay as-is. They now get populated automatically by the pipeline when the palette dropdown changes.

## Affected effects

Effects with `type: "palette"` param + `colorMode` with palette option:
- **noise** (palette = colorMode 4)
- **fractal** (palette = colorMode 4)
- **cellNoise** (palette = colorMode 2)
- **colorLab** (palette = colorMode 4)
- **shapes3d** (palette = colorMode 10)

Effects that are always palette (no colorMode gating):
- **shapes**
- **shapeMixer**

## Palette mode mapping

From filter/palette's shader const array convention:
- `amp.w` encodes the mode: 0.0 = rgb, 1.0 = hsv, 2.0 = oklab

classicNoisedeck shader convention for `paletteMode` uniform:
- 0 = none
- 1 = hsv
- 2 = oklab
- 3 = rgb

The expansion module maps between these conventions.

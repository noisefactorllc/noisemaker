# Percentage-Based Automation DSL Design

**Date:** 2026-02-26
**Status:** Approved

## Problem

Automation DSL functions (`osc()`, `audio()`, `midi()`) use absolute min/max values. When one oscillator controls multiple parameters with different native ranges (e.g., `scale` 1-100 and `speed` 0.5-2), separate oscillator instances are needed for each parameter. This prevents sharing a single automation source across parameters with different ranges.

## Solution

Change min/max values in automation functions from absolute numbers to percentages (0-1). The engine scales percentages to absolute values based on the consumer parameter's range defined in effect definitions.

**Breaking change:** All existing DSL expressions with explicit non-default min/max values will need to be converted to percentages.

## Core Semantics

- `min: 0` = 0% of consumer parameter's range (maps to paramMin)
- `max: 1` = 100% of consumer parameter's range (maps to paramMax)
- Values are clamped to [0, 1] at validation time
- Default min/max remain 0 and 1 — default behavior is "sweep the full parameter range"

### Two-Stage Evaluation

1. **Evaluator** (unchanged): `pct = oscMin + rawValue * (oscMax - oscMin)` — produces percentage in [0, 1]
2. **Pipeline** (new): `output = paramMin + pct * (paramMax - paramMin)` — produces absolute value

### Example

```
let o = osc(sine, min: 0.25, max: 0.75)
noise(scale: o, speed: o)
```

- `scale` (range 1-100): oscillates 25.75 to 75.25
- `speed` (range 0.5-2): oscillates 0.875 to 1.625
- Same oscillator, same phase, different absolute ranges

## Architecture: Approach 2 — "Scale in Pipeline"

Chosen over "Bake in Expander" because downstream consumers (noisedeck) need automation configs to remain as pure percentage objects throughout the system. The pipeline does the final scaling at evaluation time.

### Layer Changes

#### 1. Validator (`shaders/src/lang/validator.js`)

Clamp automation min/max to [0, 1] after resolving:

```javascript
// After resolving osc params
value.min = Math.max(0, Math.min(1, value.min))
value.max = Math.max(0, Math.min(1, value.max))
```

No structural changes to AST nodes or config objects.

#### 2. Expander (`shaders/src/runtime/expander.js`)

When building passes, attach a `uniformSpecs` map to each pass:

```javascript
pass.uniformSpecs = {}
for (const [argName, spec] of Object.entries(effectDef.globals || {})) {
    const uniformName = spec.uniform || argName
    pass.uniformSpecs[uniformName] = {
        min: spec.min ?? 0,
        max: spec.max ?? 100  // match UI defaults when unspecified
    }
}
```

#### 3. Pipeline (`shaders/src/runtime/pipeline.js`)

`resolvePassUniforms()` passes consumer specs to `resolveUniformValue()`:

```javascript
resolvePassUniforms(pass, time) {
    for (const name in pass.uniforms) {
        const value = pass.uniforms[name]
        const spec = pass.uniformSpecs?.[name]
        const resolved = this.resolveUniformValue(value, time, spec)
        resolvedUniforms[name] = resolved
    }
    // ... existing proxy logic
}
```

`resolveUniformValue()` scales percentage output by consumer range:

```javascript
resolveUniformValue(value, time, paramSpec) {
    if (!value || typeof value !== 'object') return value

    let pct
    if (value.type === 'Oscillator' || value._ast?.type === 'Oscillator') {
        pct = evaluateOscillator(value, time)
    } else if (value.type === 'Midi' || value._ast?.type === 'Midi') {
        pct = evaluateMidi(value, this.externalState.midi, Date.now())
    } else if (value.type === 'Audio' || value._ast?.type === 'Audio') {
        pct = evaluateAudio(value, this.externalState.audio)
    } else {
        return value
    }

    // Scale percentage by consumer parameter range
    if (paramSpec) {
        return paramSpec.min + pct * (paramSpec.max - paramSpec.min)
    }
    return pct  // fallback: return raw percentage
}
```

Evaluator functions (`evaluateOscillator`, `evaluateMidi`, `evaluateAudio`) remain unchanged — they already compute `min + raw * (max - min)`, which now produces a percentage since min/max are in [0, 1].

#### 4. Unparser (`shaders/src/lang/unparser.js`)

No changes — outputs min/max values as-is (now percentages).

#### 5. Noisedeck AutomationPanel (`noisedeck/app/js/ui/automationPanel.js`)

- Min/max sliders change from range [-100, 100] to [0, 1] with step 0.01
- Show percentage labels: "0%" to "100%"
- Default values already 0 and 1 — no change needed

#### 6. Noisedeck AutomationManager (`noisedeck/app/js/pipeline/automationManager.js`)

- Defaults already `{ min: 0, max: 1 }` — no change needed
- Update any built-in presets that have absolute min/max values

## Data Flow

### Before (absolute min/max)

```
DSL: osc(sine, min: 5, max: 10)
  → Validator: { type: 'Oscillator', min: 5, max: 10 }
  → Expander: pass.uniforms.scale = { min: 5, max: 10 }
  → Pipeline: evaluateOscillator() → 5 + raw * 5 → absolute 5-10
```

### After (percentage min/max)

```
DSL: osc(sine, min: 0.25, max: 0.75)
  → Validator: { type: 'Oscillator', min: 0.25, max: 0.75 }  (clamped [0,1])
  → Expander: pass.uniforms.scale = { min: 0.25, max: 0.75 }
              pass.uniformSpecs.scale = { min: 1, max: 100 }  ← from effectDef
  → Pipeline: evaluateOscillator() → pct 0.25-0.75
              then: 1 + pct * 99 → absolute 25.75-75.25
```

### Shared variable case

```
DSL: let o = osc(sine)
     noise(scale: o, speed: o)

Expander:
  pass.uniforms.scale = { ref to o }
  pass.uniformSpecs.scale = { min: 1, max: 100 }
  pass.uniforms.speed = { ref to o }
  pass.uniformSpecs.speed = { min: 0.5, max: 2 }

Pipeline (same raw value 0.73):
  scale: 1 + 0.73 * 99 = 73.27
  speed: 0.5 + 0.73 * 1.5 = 1.595
```

## Edge Cases

| Case | Behavior |
|------|----------|
| No min/max in DSL (defaults 0, 1) | Full range sweep — 100% of consumer range |
| No min/max on effect global spec | Use UI defaults: min=0, max=100 |
| Consumer param is boolean | No scaling — automation disabled or 0.5 threshold |
| Consumer param is color | No scaling — colors use their own path |
| Consumer param has `choices` | No scaling — discrete values |
| DSL min > max (e.g., 0.8, 0.2) | Valid — inverts automation direction |

## Breaking Changes

**What breaks:**
- Any existing DSL with explicit non-0/1 min/max on osc/audio/midi
- Noisedeck presets with absolute min/max values
- Documentation examples

**Migration:**
- Convert: `new_pct = (old_abs - param_min) / (param_max - param_min)`
- Default min/max (0, 1) is unaffected — most common case

## Files to Change

### noisemaker-shaders (py-noisemaker/shaders/)

1. `src/lang/validator.js` — Clamp min/max to [0, 1]
2. `src/runtime/expander.js` — Build `uniformSpecs` on each pass
3. `src/runtime/pipeline.js` — Scale automation output by consumer specs in `resolveUniformValue()`
4. `tests/test_oscillators.js` — Update expected ranges
5. `tests/test_audio.js` — Update expected ranges
6. `tests/test_midi_audio_parser.js` — Update expected ranges

### noisedeck

7. `app/js/ui/automationPanel.js` — Slider ranges 0-1, show "0%"-"100%"
8. `app/js/pipeline/automationManager.js` — Update presets if needed
9. `tests/automation-manager.spec.js` — Update test expectations
10. `tests/automation-panel-basic.spec.js` — Update test expectations

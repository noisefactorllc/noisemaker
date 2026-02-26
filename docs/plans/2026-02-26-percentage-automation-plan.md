# Percentage-Based Automation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Change automation DSL min/max from absolute values to percentages (0-1) that scale against consumer parameter ranges.

**Architecture:** Two-stage evaluation — evaluator functions produce percentage output (unchanged code), pipeline scales by consumer's declared range (new). Expander attaches `uniformSpecs` to passes so pipeline knows each consumer's range.

**Tech Stack:** JavaScript ESM, custom DSL parser/validator/unparser, custom test runner (no framework).

**Design doc:** `docs/plans/2026-02-26-percentage-automation-design.md`

---

### Task 1: Validator — Clamp automation min/max to [0, 1]

**Files:**
- Modify: `shaders/src/lang/validator.js:1072-1084` (Oscillator), `:1118-1129` (Midi), `:1163-1172` (Audio)
- Test: `shaders/tests/test_oscillators.js`

**Step 1: Write the failing test**

Add to `shaders/tests/test_oscillators.js` before the "Integration Tests" section:

```javascript
test('Validator: Oscillator min/max are clamped to [0, 1]', () => {
    const result = compile('search synth, filter\nnoise(scale: osc(type: oscKind.sine, min: -0.5, max: 2)).write(o0)')
    const scaleArg = result.plans[0].chain[0].args.scale
    assertEqual(scaleArg.min, 0, 'min should be clamped to 0')
    assertEqual(scaleArg.max, 1, 'max should be clamped to 1')
})

test('Validator: Oscillator min/max within [0, 1] pass through unchanged', () => {
    const result = compile('search synth, filter\nnoise(scale: osc(type: oscKind.sine, min: 0.25, max: 0.75)).write(o0)')
    const scaleArg = result.plans[0].chain[0].args.scale
    assertEqual(scaleArg.min, 0.25, 'min should be 0.25')
    assertEqual(scaleArg.max, 0.75, 'max should be 0.75')
})
```

**Step 2: Run test to verify it fails**

Run: `node shaders/tests/test_oscillators.js`
Expected: FAIL — min will be -0.5 (not clamped) and max will be 2 (not clamped)

**Step 3: Implement clamping in validator**

In `shaders/src/lang/validator.js`, modify the Oscillator config (lines 1072-1084). After the value object is created, add clamping:

```javascript
value = {
    type: 'Oscillator',
    oscType: oscTypeValue,
    min: Math.max(0, Math.min(1, resolveOscParam(node.min) ?? 0)),
    max: Math.max(0, Math.min(1, resolveOscParam(node.max) ?? 1)),
    speed: resolveOscParam(node.speed) ?? 1,
    offset: resolveOscParam(node.offset) ?? 0,
    seed: resolveOscParam(node.seed) ?? 1,
    _ast: node,
    ...(node._varRef && { _varRef: node._varRef })
}
```

Apply the same pattern for Midi (lines 1118-1129):

```javascript
value = {
    type: 'Midi',
    channel: resolveMidiParam(node.channel) ?? 1,
    mode: modeValue,
    min: Math.max(0, Math.min(1, resolveMidiParam(node.min) ?? 0)),
    max: Math.max(0, Math.min(1, resolveMidiParam(node.max) ?? 1)),
    sensitivity: resolveMidiParam(node.sensitivity) ?? 1,
    _ast: node,
    ...(node._varRef && { _varRef: node._varRef })
}
```

And Audio (lines 1163-1172):

```javascript
value = {
    type: 'Audio',
    band: bandValue,
    min: Math.max(0, Math.min(1, resolveAudioParam(node.min) ?? 0)),
    max: Math.max(0, Math.min(1, resolveAudioParam(node.max) ?? 1)),
    _ast: node,
    ...(node._varRef && { _varRef: node._varRef })
}
```

**Step 4: Update existing tests that use absolute min/max**

In `shaders/tests/test_oscillators.js`, update tests that check absolute min/max values:

- `'Parser: Oscillator with all parameters'` — change DSL from `min: 2, max: 8` to `min: 0.2, max: 0.8`, update assertions to match
- `'Parser: Oscillator with positional arguments'` — change DSL from `osc(oscKind.saw, 1, 5)` to `osc(oscKind.saw, 0.1, 0.5)`, update assertions
- `'Parser: Oscillator stored in variable'` — change DSL from `min: 0, max: 10` to `min: 0, max: 1` (defaults)
- `'Validator: Oscillator resolves to oscillator config'` — change DSL from `min: 2, max: 8` to `min: 0.2, max: 0.8`, update assertEqual expectations
- `'Unparser: formatValue handles oscillator config'` — change config min/max from `2, 8` to `0.2, 0.8`, update `includes` assertions
- `'Integration: Full compile and unparse round-trip'` — change DSL from `min: 2, max: 8` to `min: 0.2, max: 0.8`
- `'Integration: Oscillator in complex chain'` — change DSL from `min: 1, max: 10` to `min: 0.1, max: 1`

In `shaders/tests/test_midi_audio_parser.js`, update:

- `'parses midi with all parameters'` — change DSL from `min: 2, max: 20` to `min: 0.2, max: 0.8`, update assertions
- `'parses midi with positional arguments'` — change DSL from `midi(1, midiMode.velocity, 0, 10)` to `midi(1, midiMode.velocity, 0, 1)`, update assertion
- `'parses audio with all parameters'` — change DSL from `min: 1, max: 100` to `min: 0.1, max: 1`, update assertions
- `'parses audio with positional arguments'` — change DSL from `audio(audioBand.high, 0, 50)` to `audio(audioBand.high, 0, 0.5)`, update assertion
- `'formats midi with non-default values'` — change config from `min: 2, max: 10` to `min: 0.2, max: 0.8`, update `includes`
- `'formats audio with non-default values'` — change config from `min: 5, max: 100` to `min: 0.25, max: 0.75`, update `includes`

**Step 5: Run all tests to verify they pass**

Run: `node shaders/tests/test_oscillators.js && node shaders/tests/test_midi_audio_parser.js`
Expected: All PASS

**Step 6: Commit**

```bash
git add shaders/src/lang/validator.js shaders/tests/test_oscillators.js shaders/tests/test_midi_audio_parser.js
git commit -m "feat: clamp automation min/max to [0, 1] percentage range"
```

---

### Task 2: Expander — Build `uniformSpecs` on each pass

**Files:**
- Modify: `shaders/src/runtime/expander.js:557-605`
- Test: `shaders/tests/test_oscillators.js` (new test for expander)

**Step 1: Write the failing test**

This requires a test that compiles a full DSL with effects loaded and checks that the expanded graph has `uniformSpecs`. Since the existing tests don't load effects, we'll test through the pipeline integration test in Task 3. For now, implement directly with manual verification.

**Step 2: Implement uniformSpecs in expander**

In `shaders/src/runtime/expander.js`, after the existing defaults loop (lines 588-605), and before the "Map Uniforms" section (line 607), add:

```javascript
// Build uniformSpecs for percentage-based automation scaling
// Maps uniform names to their consumer parameter's declared range
if (effectDef.globals) {
    pass.uniformSpecs = {}
    for (const [argName, def] of Object.entries(effectDef.globals)) {
        const uniformName = def.uniform || argName
        if (def.type === 'float' || def.type === 'int') {
            pass.uniformSpecs[uniformName] = {
                min: def.min ?? 0,
                max: def.max ?? 100
            }
        }
    }
}
```

**Step 3: Commit**

```bash
git add shaders/src/runtime/expander.js
git commit -m "feat: attach uniformSpecs to passes for automation scaling"
```

---

### Task 3: Pipeline — Scale automation output by consumer specs

**Files:**
- Modify: `shaders/src/runtime/pipeline.js:1171-1251`
- Test: `shaders/tests/test_audio.js` (update existing tests)

**Step 1: Write the failing test — percentage scaling with paramSpec**

Add to `shaders/tests/test_audio.js` before the "Edge Cases" section:

```javascript
// ============================================================================
// Percentage Scaling Tests
// ============================================================================

console.log('\n=== Percentage Scaling ===\n')

test('resolveUniformValue scales percentage by paramSpec', () => {
    const { pipeline, audioState } = createTestPipeline()
    audioState.low = 0.5

    const config = {
        type: 'Audio',
        band: 0,  // low
        min: 0,   // 0% (percentage)
        max: 1    // 100% (percentage)
    }
    const paramSpec = { min: 10, max: 50 }

    const result = pipeline.resolveUniformValue(config, 0, paramSpec)
    // audio raw = 0.5, pct = 0 + 0.5 * 1 = 0.5, output = 10 + 0.5 * 40 = 30
    assertApprox(result, 30, 0.01, 'should scale percentage by paramSpec')
})

test('resolveUniformValue with partial percentage range', () => {
    const { pipeline, audioState } = createTestPipeline()
    audioState.low = 0.5

    const config = {
        type: 'Audio',
        band: 0,
        min: 0.25,  // 25%
        max: 0.75   // 75%
    }
    const paramSpec = { min: 0, max: 100 }

    const result = pipeline.resolveUniformValue(config, 0, paramSpec)
    // audio raw = 0.5, pct = 0.25 + 0.5 * 0.5 = 0.5, output = 0 + 0.5 * 100 = 50
    assertApprox(result, 50, 0.01, 'should scale partial percentage by paramSpec')
})

test('resolveUniformValue without paramSpec returns raw percentage', () => {
    const { pipeline, audioState } = createTestPipeline()
    audioState.low = 0.5

    const config = {
        type: 'Audio',
        band: 0,
        min: 0,
        max: 1
    }

    const result = pipeline.resolveUniformValue(config, 0)
    // No paramSpec, returns raw percentage
    assertApprox(result, 0.5, 0.01, 'should return raw percentage without paramSpec')
})
```

**Step 2: Run test to verify it fails**

Run: `node shaders/tests/test_audio.js`
Expected: FAIL — `resolveUniformValue` doesn't accept a 3rd parameter, percentage scaling test will fail

**Step 3: Implement percentage scaling in pipeline**

In `shaders/src/runtime/pipeline.js`, replace `resolveUniformValue` (lines 1171-1192):

```javascript
/**
 * Resolve automation values (oscillators, MIDI, audio) in a uniform value.
 * If the value is an automation configuration, evaluate it and scale by consumer range.
 * @param {any} value - The uniform value (may be an automation config)
 * @param {number} time - Current time in seconds
 * @param {Object} [paramSpec] - Consumer parameter range { min, max }
 * @returns {any} The resolved value
 */
resolveUniformValue(value, time, paramSpec) {
    if (!value || typeof value !== 'object') return value

    let pct

    // Check if this is an oscillator configuration
    // Note: `time` is already normalized 0-1 from CanvasRenderer
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
    return pct
}
```

Then update `resolvePassUniforms` (lines 1201-1251) to pass `uniformSpecs`:

```javascript
resolvePassUniforms(pass, time) {
    if (!pass.uniforms) return pass

    const resolvedUniforms = this._resolvedUniforms
    let hasOscillators = false

    // Clear resolved uniforms (set to undefined to avoid delete deopt)
    for (const key in resolvedUniforms) {
        resolvedUniforms[key] = undefined
    }

    for (const name in pass.uniforms) {
        const value = pass.uniforms[name]
        const spec = pass.uniformSpecs?.[name]
        const resolved = this.resolveUniformValue(value, time, spec)
        resolvedUniforms[name] = resolved
        if (resolved !== value) {
            hasOscillators = true
        }
    }

    // If no oscillators, return original pass
    if (!hasOscillators) {
        return pass
    }

    // Use pre-allocated proxy object to avoid per-frame allocation
    // Copy all pass properties to proxy (this is rare - only for oscillator passes)
    const proxy = this._oscillatorPassProxy
    proxy.id = pass.id
    proxy.program = pass.program
    proxy.inputs = pass.inputs
    proxy.outputs = pass.outputs
    proxy.clear = pass.clear
    proxy.blend = pass.blend
    proxy.drawMode = pass.drawMode
    proxy.count = pass.count
    proxy.repeat = pass.repeat
    proxy.conditions = pass.conditions
    proxy.viewport = pass.viewport
    proxy.drawBuffers = pass.drawBuffers
    proxy.storageTextures = pass.storageTextures
    proxy.samplerTypes = pass.samplerTypes
    proxy.entryPoint = pass.entryPoint

    // Swap uniform references (avoid copying values)
    const proxyUniforms = proxy.uniforms
    proxy.uniforms = resolvedUniforms
    this._resolvedUniforms = proxyUniforms

    return proxy
}
```

**Step 4: Update existing audio tests for percentage semantics**

In `shaders/tests/test_audio.js`, update tests that use absolute min/max:

- `'low band maps to min/max range'` — now tests percentage without paramSpec. Change config to `min: 0, max: 1`, expected result becomes 0.5 (raw percentage). OR keep the test but pass paramSpec.
- `'mid band maps to min/max range'` — change config to `min: 0, max: 1`, expected result becomes 0.25
- `'high band maps to min/max range'` — change config from `min: -5, max: 5` to `min: 0, max: 1`, expected result becomes 1.0
- `'vol band maps to min/max range'` — change config from `min: 1, max: 11` to `min: 0, max: 1`, expected result becomes 0.8
- `'audio returns min when no audio state set'` — change config from `min: 5, max: 10` to `min: 0.5, max: 1`, expected result becomes 0.5

**Step 5: Run tests to verify they pass**

Run: `node shaders/tests/test_audio.js`
Expected: All PASS

**Step 6: Commit**

```bash
git add shaders/src/runtime/pipeline.js shaders/tests/test_audio.js
git commit -m "feat: scale automation percentage output by consumer parameter range"
```

---

### Task 4: Noisedeck — Update automation panel sliders

**Files:**
- Modify: `../noisedeck/app/js/ui/automationPanel.js:280-301`
- Modify: `../noisedeck/app/js/pipeline/automationManager.js:32` (gentle sway preset)

**Step 1: Update slider ranges**

In `../noisedeck/app/js/ui/automationPanel.js`, change all 6 min/max slider lines (280-281, 291-292, 298-299) from:

```javascript
this._addSliderControl(container, 'min', params, 0, -100, 100, 0.01, 'float', binding)
this._addSliderControl(container, 'max', params, 1, -100, 100, 0.01, 'float', binding)
```

to:

```javascript
this._addSliderControl(container, 'min', params, 0, 0, 1, 0.01, 'float', binding)
this._addSliderControl(container, 'max', params, 1, 0, 1, 0.01, 'float', binding)
```

**Step 2: Add percentage display labels**

Find `_addSliderControl` method (line 351) and check if it supports a format/display callback. If not, add percentage formatting to the label display. The slider value 0.5 should display as "50%".

Look at the `_addSliderControl` implementation to determine exact approach. If labels are already showing raw values, modify the label format to append "%" and multiply by 100 specifically for the 'min' and 'max' params.

**Step 3: Verify presets are valid**

In `../noisedeck/app/js/pipeline/automationManager.js`, check the "gentle sway" preset (line 32):

```javascript
{ name: 'gentle sway', params: { oscType: 'sine', min: 0.3, max: 0.7, speed: 0.3 } },
```

This already uses values in [0, 1] — no change needed. All other presets use defaults (0, 1) — no change needed.

**Step 4: Commit**

```bash
cd ../noisedeck
git add app/js/ui/automationPanel.js
git commit -m "feat: change automation min/max sliders to percentage range (0-1)"
```

---

### Task 5: Run full test suite and verify integration

**Step 1: Run all noisemaker-shaders tests**

```bash
cd /Users/aayars/source/py-noisemaker
node shaders/tests/test_oscillators.js
node shaders/tests/test_audio.js
node shaders/tests/test_midi_audio_parser.js
```

Expected: All PASS

**Step 2: Run noisedeck tests if applicable**

```bash
cd /Users/aayars/source/noisedeck
# Run relevant automation tests
npx playwright test tests/automation-manager.spec.js tests/automation-panel-basic.spec.js
```

Check for failures related to min/max value expectations.

**Step 3: Manual verification**

Open the demo UI and verify:
1. `osc(sine)` on a parameter sweeps the full parameter range
2. `osc(sine, min: 0.25, max: 0.75)` sweeps 25-75% of the range
3. Shared variables produce different absolute ranges on different params

**Step 4: Final commit if any fixups needed**

```bash
git add -u
git commit -m "fix: test fixups for percentage automation"
```

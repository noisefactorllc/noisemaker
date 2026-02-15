# classicNoisedeck Palette Expansion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make classicNoisedeck palette dropdowns work by expanding palette preset selection into the separate vec3/int uniforms the shaders expect.

**Architecture:** A self-contained JS module (`palette-expansion.js`) holds all 55 palette entries (matching `filter/palette`'s shader data). When a `type: "palette"` param changes, the runtime expands it into `paletteOffset`, `paletteAmp`, `paletteFreq`, `palettePhase` (vec3) and `paletteMode` (int) uniforms. Two integration points: `program-state._applyToPipeline()` (primary, for demo UI) and `Pipeline.setUniform()` (secondary, for API consumers).

**Tech Stack:** Vanilla JS modules, Node.js test runner (custom, not Jest)

---

### Task 1: Create palette-expansion.js

**Files:**
- Create: `shaders/src/runtime/palette-expansion.js`

**Step 1: Create the module**

This file is self-contained with no imports. The palette data is embedded directly, matching `filter/palette`'s shader const arrays (from `shaders/effects/filter/palette/wgsl/palette.wgsl` lines 34-145). The 55 entries are 1-indexed in the shader (index 0 is passthrough) — our JS array is 0-indexed so entry 0 = palette index 1.

Mode convention in filter/palette shaders: `amp.w` encodes mode as `0.0 = rgb, 1.0 = hsv, 2.0 = oklab`.

classicNoisedeck shaders expect `paletteMode` uniform: `0 = none, 1 = hsv, 2 = oklab, 3 = rgb`.

Mapping from filter/palette mode → classicNoisedeck mode:
- 0.0 (rgb in filter) → 3 (rgb in classic)
- 1.0 (hsv in filter) → 1 (hsv in classic)
- 2.0 (oklab in filter) → 2 (oklab in classic)

```js
/**
 * Palette Expansion for classicNoisedeck Effects
 *
 * Legacy support: classicNoisedeck shaders consume palette data as separate
 * vec3 uniforms (paletteOffset, paletteAmp, paletteFreq, palettePhase) plus
 * an int paletteMode uniform. When a user selects a palette preset, this
 * module expands the integer index into those uniforms.
 *
 * Palette data matches filter/palette's shader const arrays.
 * No dependency on palettes.js or palettes.json.
 */

// [amp, freq, offset, phase, mode]
// mode: 0=rgb, 1=hsv, 2=oklab (filter/palette shader convention)
const PALETTE_DATA = [
  // 1: seventiesShirt (rgb)
  { amp: [0.76, 0.88, 0.37], freq: [1.0, 1.0, 1.0], offset: [0.93, 0.97, 0.52], phase: [0.21, 0.41, 0.56], mode: 0 },
  // 2: fiveG (rgb)
  { amp: [0.56851584, 0.7740668, 0.23485267], freq: [1.0, 1.0, 1.0], offset: [0.5, 0.5, 0.5], phase: [0.727029, 0.08039695, 0.10427457], mode: 0 },
  // ... all 55 entries from filter/palette wgsl const array ...
  // (full data in implementation)
]

// Map filter/palette mode (amp.w) → classicNoisedeck paletteMode uniform
// filter: 0=rgb, 1=hsv, 2=oklab
// classic: 0=none, 1=hsv, 2=oklab, 3=rgb
const MODE_MAP = [3, 1, 2]  // index = filter mode, value = classic mode

/**
 * Expand a palette index into the 5 uniforms classicNoisedeck shaders expect.
 * @param {number} index - 1-based palette index (0 or out of range = null)
 * @returns {object|null} { paletteOffset, paletteAmp, paletteFreq, palettePhase, paletteMode }
 */
export function expandPalette(index) {
  if (index < 1 || index > PALETTE_DATA.length) return null
  const entry = PALETTE_DATA[index - 1]
  return {
    paletteOffset: entry.offset.slice(),
    paletteAmp: entry.amp.slice(),
    paletteFreq: entry.freq.slice(),
    palettePhase: entry.phase.slice(),
    paletteMode: MODE_MAP[entry.mode] ?? 0
  }
}
```

**Step 2: Commit**

```bash
git add shaders/src/runtime/palette-expansion.js
git commit -m "feat: add palette-expansion.js for classicNoisedeck legacy palette support"
```

---

### Task 2: Write unit tests for palette-expansion.js

**Files:**
- Create: `shaders/tests/test_palette_expansion.js`

**Step 1: Write the tests**

Use the project's existing test pattern (custom runner, see `test_pipeline.js`).

```js
/**
 * Palette Expansion Tests
 */
import { expandPalette } from '../src/runtime/palette-expansion.js'

const tests = []
function test(name, fn) { tests.push({ name, fn }) }

async function runTests() {
  console.log('\n=== Running Palette Expansion Tests ===\n')
  for (const { name, fn } of tests) {
    try {
      await fn()
      console.log(`PASS: ${name}`)
    } catch (e) {
      console.error(`FAIL: ${name}`)
      console.error(e)
      process.exit(1)
    }
  }
  console.log(`\nAll ${tests.length} tests passed\n`)
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed')
}

function assertClose(a, b, msg, tol = 0.0001) {
  if (Math.abs(a - b) > tol) throw new Error(`${msg}: ${a} !== ${b}`)
}

// --- Tests ---

test('returns null for index 0 (passthrough)', () => {
  assert(expandPalette(0) === null)
})

test('returns null for negative index', () => {
  assert(expandPalette(-1) === null)
})

test('returns null for out-of-range index', () => {
  assert(expandPalette(999) === null)
})

test('index 3 = afterimage returns correct rgb data', () => {
  // afterimage: amp=[0.5,0.5,0.5], freq=[1,1,1], offset=[0.5,0.5,0.5], phase=[0.3,0.2,0.2], rgb
  const result = expandPalette(3)
  assert(result !== null, 'should not be null')
  assertClose(result.paletteAmp[0], 0.5, 'amp[0]')
  assertClose(result.paletteOffset[0], 0.5, 'offset[0]')
  assertClose(result.palettePhase[0], 0.3, 'phase[0]')
  assertClose(result.palettePhase[1], 0.2, 'phase[1]')
  assert(result.paletteMode === 3, `rgb mode should be 3, got ${result.paletteMode}`)
})

test('index 12 = darkSatin returns hsv mode', () => {
  // darkSatin: hsv mode (amp.w = 1.0 in filter shader → paletteMode 1 in classic)
  const result = expandPalette(12)
  assert(result !== null)
  assert(result.paletteMode === 1, `hsv mode should be 1, got ${result.paletteMode}`)
})

test('index 40 = silvermane returns oklab mode', () => {
  // silvermane: oklab mode (amp.w = 2.0 in filter shader → paletteMode 2 in classic)
  const result = expandPalette(40)
  assert(result !== null)
  assert(result.paletteMode === 2, `oklab mode should be 2, got ${result.paletteMode}`)
})

test('index 55 = vintagePhoto (last entry) works', () => {
  const result = expandPalette(55)
  assert(result !== null, 'last entry should not be null')
  assertClose(result.paletteAmp[0], 0.68, 'amp[0]')
})

test('returned arrays are copies (not references)', () => {
  const a = expandPalette(3)
  const b = expandPalette(3)
  a.paletteAmp[0] = 999
  assertClose(b.paletteAmp[0], 0.5, 'should be independent copy')
})

runTests()
```

**Step 2: Run the tests**

Run: `node shaders/tests/test_palette_expansion.js`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add shaders/tests/test_palette_expansion.js
git commit -m "test: add unit tests for palette-expansion"
```

---

### Task 3: Integrate into program-state._applyToPipeline

**Files:**
- Modify: `demo/shaders/lib/program-state.js:958-1012`

This is the primary integration point. When `_applyToPipeline()` writes a `type: "palette"` param to pass uniforms, it also writes the 5 expanded uniforms.

**Step 1: Add import**

At the top of `program-state.js`, add:

```js
import { expandPalette } from '../../../shaders/src/runtime/palette-expansion.js'
```

**Step 2: Add palette expansion in _applyToPipeline**

Inside the inner loop of `_applyToPipeline()` (after the line `pass.uniforms[uniformName] = ...` at ~line 1006-1009), add palette expansion:

```js
// After writing the palette uniform value to pass.uniforms:

// Legacy classicNoisedeck palette expansion:
// When a type:"palette" param is set, expand the preset index
// into the separate vec3/int uniforms the shaders expect.
if (spec?.type === 'palette') {
    const expanded = expandPalette(converted)
    if (expanded) {
        for (const [uName, uValue] of Object.entries(expanded)) {
            if (uName in pass.uniforms) {
                pass.uniforms[uName] = Array.isArray(uValue)
                    ? uValue.slice()
                    : uValue
            }
        }
    }
}
```

This checks the spec type (already available as `spec` from line 996), calls `expandPalette`, and writes the 5 dependent uniforms into the same pass. Only writes to uniforms that already exist in the pass (the effect must declare them).

**Step 3: Commit**

```bash
git add demo/shaders/lib/program-state.js
git commit -m "feat: expand palette presets into uniforms in program-state"
```

---

### Task 4: Integrate into Pipeline.setUniform

**Files:**
- Modify: `shaders/src/runtime/pipeline.js:844-912`

Secondary integration point for API consumers who call `pipeline.setUniform('palette', N)` directly.

**Step 1: Add import**

At the top of `pipeline.js`:

```js
import { expandPalette } from './palette-expansion.js'
```

**Step 2: Add expansion in setUniform**

After `this.globalUniforms[name] = value` (line 856), before the pass iteration:

```js
// Legacy classicNoisedeck palette expansion:
// When a uniform named 'palette' is set with an integer value,
// expand the preset into the dependent vec3/int uniforms.
if (name === 'palette' && typeof value === 'number') {
    const expanded = expandPalette(value)
    if (expanded) {
        for (const [uName, uValue] of Object.entries(expanded)) {
            this.setUniform(uName, uValue)
        }
        return  // dependent setUniform calls handle pass propagation
    }
}
```

The `return` after the recursive calls avoids double-writing the dependent uniforms. The recursive `setUniform` calls for `paletteOffset` etc. won't re-trigger expansion because their names aren't `'palette'`.

**Step 3: Commit**

```bash
git add shaders/src/runtime/pipeline.js
git commit -m "feat: expand palette presets in Pipeline.setUniform"
```

---

### Task 5: Verify with Playwright smoke test

**Files:**
- Reference: `shaders/tests/playwright/effects.spec.js`

**Step 1: Manual verification**

Open the demo UI on port 8081, select a classicNoisedeck effect with palette support (e.g., `classicNoisedeck/noise`), set color mode to "palette", and change the palette dropdown. The colors should now change when selecting different palettes.

**Step 2: Run existing effects test**

Run: `npx playwright test shaders/tests/playwright/effects.spec.js --project=shaders-chromium`

This renders all effects and checks for console errors. It should pass with the new palette expansion code (no regressions).

**Step 3: Final commit with any fixes**

If any issues found, fix and commit.

# Let Statement Round-Trip Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve `let` declarations and variable references through compile/unparse round-trips.

**Architecture:** Two-file change. The validator's `substitute()` annotates replaced `Ident` nodes with `_varRef` metadata. The unparser emits `let` declarations from `compiled.vars` and relies on existing `_varRef` handling in `formatValue` for parameter references.

**Tech Stack:** JavaScript (ES modules), Node.js test runner

---

### Task 1: Write failing round-trip test for `let` with automation

**Files:**
- Create: `shaders/tests/test-let-roundtrip.mjs`

**Step 1: Write the test file**

```javascript
/**
 * Tests for let statement round-trip through compile/unparse
 * Run with: node shaders/tests/test-let-roundtrip.mjs
 */

import { compile, unparse } from '../src/lang/index.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (err) {
        console.error(`✗ ${name}`);
        console.error(`  ${err.message}`);
        failed++;
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`);
    }
}

function assertIncludes(str, substr, message) {
    if (!str.includes(substr)) {
        throw new Error(`${message}\n  String does not include: ${JSON.stringify(substr)}\n  Actual: ${JSON.stringify(str)}`);
    }
}

// Test 1: Automation variable round-trip
test('let with osc() round-trips through compile/unparse', () => {
    const src = `search synth

let wobble = osc(type: oscKind.sine, min: 0, max: 360)

noise(rotation: wobble)
  .write(o0)

render(o0)`;
    const compiled = compile(src);
    const result = unparse(compiled);
    assertIncludes(result, 'let wobble = osc(', 'Should include let declaration');
    assertIncludes(result, 'rotation: wobble', 'Should reference variable, not inline');
});

// Test 2: Numeric variable round-trip
test('let with numeric value round-trips', () => {
    const src = `search synth

let amount = 0.5

noise(scale: amount)
  .write(o0)

render(o0)`;
    const compiled = compile(src);
    const result = unparse(compiled);
    assertIncludes(result, 'let amount = 0.5', 'Should include let declaration');
    assertIncludes(result, 'scale: amount', 'Should reference variable');
});

// Test 3: Multiple let statements
test('multiple let statements round-trip', () => {
    const src = `search synth

let wobble = osc(type: oscKind.sine)
let amt = 0.5

noise(rotation: wobble, scale: amt)
  .write(o0)

render(o0)`;
    const compiled = compile(src);
    const result = unparse(compiled);
    assertIncludes(result, 'let wobble = osc(', 'Should include first let');
    assertIncludes(result, 'let amt = 0.5', 'Should include second let');
    assertIncludes(result, 'rotation: wobble', 'Should reference wobble');
    assertIncludes(result, 'scale: amt', 'Should reference amt');
});

// Test 4: Let with effect call (non-automation)
test('let with effect call round-trips', () => {
    const src = `search synth

let myScale = 3

noise(scale: myScale)
  .write(o0)

render(o0)`;
    const compiled = compile(src);
    const result = unparse(compiled);
    assertIncludes(result, 'let myScale = 3', 'Should include let declaration');
    assertIncludes(result, 'scale: myScale', 'Should reference variable');
});

// Test 5: Let with enum value
test('let with enum member round-trips', () => {
    const src = `search synth

let waveType = oscKind.sine
let wobble = osc(type: waveType)

noise(rotation: wobble)
  .write(o0)

render(o0)`;
    const compiled = compile(src);
    const result = unparse(compiled);
    assertIncludes(result, 'let waveType =', 'Should include enum let');
    assertIncludes(result, 'let wobble = osc(', 'Should include osc let');
});

// Test 6: Let with midi
test('let with midi() round-trips', () => {
    const src = `search synth

let knob = midi(channel: 1)

noise(scale: knob)
  .write(o0)

render(o0)`;
    const compiled = compile(src);
    const result = unparse(compiled);
    assertIncludes(result, 'let knob = midi(', 'Should include midi let');
    assertIncludes(result, 'scale: knob', 'Should reference variable');
});

// Test 7: Let with audio
test('let with audio() round-trips', () => {
    const src = `search synth

let bass = audio(band: audioBand.low)

noise(scale: bass)
  .write(o0)

render(o0)`;
    const compiled = compile(src);
    const result = unparse(compiled);
    assertIncludes(result, 'let bass = audio(', 'Should include audio let');
    assertIncludes(result, 'scale: bass', 'Should reference variable');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

**Step 2: Run tests to verify they fail**

Run: `node shaders/tests/test-let-roundtrip.mjs`
Expected: Multiple FAIL — `let` declarations missing from unparse output, variable references not preserved.

**Step 3: Commit the failing tests**

```bash
git add shaders/tests/test-let-roundtrip.mjs
git commit -m "test: add failing tests for let statement round-trip"
```

---

### Task 2: Add `_varRef` annotation in validator's `substitute()`

**Files:**
- Modify: `shaders/src/lang/validator.js:285-289`

**Step 1: Modify `substitute()` to add `_varRef` marker**

At line 287-288, change:

```javascript
        if (node.type === 'Ident' && symbols.has(node.name)) {
            return substitute(clone(symbols.get(node.name)))
        }
```

To:

```javascript
        if (node.type === 'Ident' && symbols.has(node.name)) {
            const result = substitute(clone(symbols.get(node.name)))
            if (result && typeof result === 'object') {
                result._varRef = node.name
            }
            return result
        }
```

This tags substituted values with the original variable name. The clone ensures we don't mutate shared state.

**Step 2: Run existing tests to confirm no regressions**

Run: `node shaders/tests/test-unparser.mjs`
Expected: All existing tests PASS (the `_varRef` property is invisible to existing code paths).

**Step 3: Commit**

```bash
git add shaders/src/lang/validator.js
git commit -m "feat: annotate substituted Ident nodes with _varRef in validator"
```

---

### Task 3: Add `formatLetExpr()` and emit `let` declarations in `unparse()`

**Files:**
- Modify: `shaders/src/lang/unparser.js:632-654`

**Step 1: Add `formatLetExpr` function**

Insert before the `unparse()` function (after `unparseChain` at line 632), add:

```javascript

/**
 * Format a let expression AST node back to DSL source
 * @param {object} expr - Expression AST node from a VarAssign
 * @param {object} options - Unparse options
 * @returns {string} DSL source for the expression
 */
function formatLetExpr(expr, options = {}) {
    if (!expr) return 'null'
    switch (expr.type) {
        case 'Number':
            return String(expr.value)
        case 'String':
            return JSON.stringify(expr.value)
        case 'Boolean':
            return expr.value ? 'true' : 'false'
        case 'Ident':
            return expr.name
        case 'Member':
            return expr.path.join('.')
        case 'Oscillator':
        case 'Midi':
        case 'Audio':
            return formatValue(expr, null, options)
        case 'Call':
            return unparseCall(expr, options)
        case 'Chain':
            return unparseChain(expr.chain, options)
        case 'Func':
            return `() => ${formatLetExpr(expr.body, options)}`
        default:
            return formatValue(expr, null, options)
    }
}
```

**Step 2: Emit `let` declarations in `unparse()`**

At line 654 (after the search directive block, before `// Track global step index`), insert:

```javascript

    // Emit let declarations
    if (compiled.vars && compiled.vars.length > 0) {
        for (const v of compiled.vars) {
            if (v.leadingComments && v.leadingComments.length > 0) {
                for (const c of v.leadingComments) {
                    lines.push(c)
                }
            }
            const exprStr = formatLetExpr(v.expr, options)
            lines.push(`let ${v.name} = ${exprStr}`)
        }
        lines.push('') // blank line separator after let block
    }
```

**Step 3: Run the round-trip tests**

Run: `node shaders/tests/test-let-roundtrip.mjs`
Expected: All tests PASS.

**Step 4: Run existing unparser tests for regressions**

Run: `node shaders/tests/test-unparser.mjs`
Expected: All existing tests PASS (no compiled objects in existing tests have `vars`).

**Step 5: Commit**

```bash
git add shaders/src/lang/unparser.js
git commit -m "feat: unparse let declarations and honor _varRef in variable references"
```

---

### Task 4: Verify full round-trip stability (double round-trip)

**Files:**
- Modify: `shaders/tests/test-let-roundtrip.mjs`

**Step 1: Add double round-trip test**

Append to the test file before the summary line:

```javascript
// Test 8: Double round-trip stability
test('double round-trip produces identical output', () => {
    const src = `search synth

let wobble = osc(type: oscKind.sine, min: 0, max: 360)
let amt = 0.5

noise(rotation: wobble, scale: amt)
  .write(o0)

render(o0)`;
    const compiled1 = compile(src);
    const unparsed1 = unparse(compiled1);
    const compiled2 = compile(unparsed1);
    const unparsed2 = unparse(compiled2);
    assertEqual(unparsed1, unparsed2, 'Double round-trip should be stable');
});
```

**Step 2: Run tests**

Run: `node shaders/tests/test-let-roundtrip.mjs`
Expected: All tests including double round-trip PASS.

**Step 3: Commit**

```bash
git add shaders/tests/test-let-roundtrip.mjs
git commit -m "test: add double round-trip stability test for let statements"
```

---

### Task 5: Run all existing tests for regressions

**Files:** None (verification only)

**Step 1: Run all test files**

Run: `node shaders/tests/test-unparser.mjs && node shaders/tests/test-let-roundtrip.mjs`
Expected: All tests PASS, zero failures.

**Step 2: If any Playwright tests exist for DSL, run those too**

Run: `ls shaders/tests/playwright/` to check for relevant tests.

If any DSL-related tests exist, run them. Otherwise skip.

**Step 3: Final commit if any fixes were needed**

Only if regressions were found and fixed.

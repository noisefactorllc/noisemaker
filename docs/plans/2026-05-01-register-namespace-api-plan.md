# `registerNamespace()` API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `registerNamespace(id, descriptor)` and `unregisterNamespace(id)` to the shader engine so external integrations can introduce a top-level namespace alongside the built-ins (`synth`, `filter`, etc.) — without vendoring `tags.js` or repurposing `user/`.

**Architecture:** Refactor the frozen namespace map in `shaders/src/runtime/tags.js` into a private mutable `Map` exposed through a read-only `Proxy`. Mutate the existing `VALID_NAMESPACES` array in place on register/unregister. Lift the lexer's keyword set out of the `lex()` function so `tags.js` can validate against it. Every existing export keeps its name and read shape — zero impact on existing consumers. No grammar or parser changes.

**Tech Stack:** Vanilla browser JS (ES modules), Node for tests, `Proxy`, `Map`, plain `node` test harness pattern matching `shaders/tests/test_parser.js`.

**Spec:** `docs/plans/2026-05-01-register-namespace-api-design.md`

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `shaders/src/lang/lexer.js` | Modify | Lift `keywords` const to module scope as exported `RESERVED_KEYWORDS`. No behavior change. |
| `shaders/src/runtime/tags.js` | Modify | Refactor frozen map → internal `Map` + `Proxy` + live array. Add `registerNamespace` + `unregisterNamespace` with full validation. |
| `shaders/src/index.js` | Modify | Re-export `registerNamespace` and `unregisterNamespace` from the existing `./runtime/tags.js` block. |
| `shaders/tests/test_register_namespace.js` | Create | Standalone test file with built-in test harness. Grows across tasks 1, 2, 3, 4, 5, 6. |
| `package.json` | Modify | Extend `test:shaders:lang` script to run the new test file. |

---

## Task 1: Export `RESERVED_KEYWORDS` from lexer

**Files:**
- Modify: `shaders/src/lang/lexer.js:19-34`
- Create: `shaders/tests/test_register_namespace.js`

- [ ] **Step 1: Create the test file with a harness and the first test**

Write `shaders/tests/test_register_namespace.js`:

```js
import { lex, RESERVED_KEYWORDS } from '../src/lang/lexer.js'

let failures = 0

function test(name, fn) {
    try {
        fn()
        console.log(`PASS: ${name}`)
    } catch (e) {
        failures++
        console.error(`FAIL: ${name}`)
        console.error(e)
    }
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'Assertion failed')
}

function assertEquals(actual, expected, msg) {
    if (actual !== expected) {
        throw new Error(`${msg || 'Mismatch'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    }
}

function assertThrows(fn, msgIncludes, label) {
    let threw = false
    let actual = null
    try { fn() } catch (e) { threw = true; actual = e }
    if (!threw) throw new Error(`Expected ${label || 'call'} to throw`)
    if (msgIncludes && !actual.message.includes(msgIncludes)) {
        throw new Error(`Expected error message to include '${msgIncludes}', got: ${actual.message}`)
    }
}

// ---------- Task 1: lexer keyword export + sync ----------

test('RESERVED_KEYWORDS exports the lexer keyword map', () => {
    assert(RESERVED_KEYWORDS && typeof RESERVED_KEYWORDS === 'object', 'RESERVED_KEYWORDS must be an object')
    assertEquals(RESERVED_KEYWORDS.search, 'SEARCH', 'search → SEARCH')
    assertEquals(RESERVED_KEYWORDS.let, 'LET', 'let → LET')
    assertEquals(RESERVED_KEYWORDS.render, 'RENDER', 'render → RENDER')
    assertEquals(RESERVED_KEYWORDS.subchain, 'SUBCHAIN', 'subchain → SUBCHAIN')
})

test('Lexer still tokenizes keywords correctly after refactor', () => {
    const sourceCheck = (src, expectedType) => {
        const tokens = lex(src)
        assertEquals(tokens[0].type, expectedType, `lex('${src}')[0].type`)
    }
    sourceCheck('search', 'SEARCH')
    sourceCheck('let', 'LET')
    sourceCheck('render', 'RENDER')
    sourceCheck('subchain', 'SUBCHAIN')
    sourceCheck('write3d', 'WRITE3D')
    sourceCheck('elif', 'ELIF')
})

// More tests added in subsequent tasks.

if (failures > 0) {
    console.error(`\n${failures} test(s) failed`)
    process.exitCode = 1
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node shaders/tests/test_register_namespace.js`
Expected: FAIL on `RESERVED_KEYWORDS exports the lexer keyword map` — the symbol is not yet exported. Error like `SyntaxError: The requested module '../src/lang/lexer.js' does not provide an export named 'RESERVED_KEYWORDS'`.

- [ ] **Step 3: Refactor `lexer.js` to lift and export `keywords`**

In `shaders/src/lang/lexer.js`, remove the local `const keywords = { ... }` block inside `lex()` (currently lines 19-34) and add a module-level export above the `lex` function. The current shape of `lex()`:

```js
export function lex(src) {
    // ... preamble (tokens, helpers, isDigit, isLetter)
    const keywords = {
        let: 'LET',
        render: 'RENDER',
        write: 'WRITE',
        write3d: 'WRITE3D',
        true: 'TRUE',
        false: 'FALSE',
        if: 'IF',
        elif: 'ELIF',
        else: 'ELSE',
        break: 'BREAK',
        continue: 'CONTINUE',
        return: 'RETURN',
        search: 'SEARCH',
        subchain: 'SUBCHAIN'
    }
    // ... rest of body uses keywords[lexeme]
}
```

Refactor to:

```js
export const RESERVED_KEYWORDS = Object.freeze({
    let: 'LET',
    render: 'RENDER',
    write: 'WRITE',
    write3d: 'WRITE3D',
    true: 'TRUE',
    false: 'FALSE',
    if: 'IF',
    elif: 'ELIF',
    else: 'ELSE',
    break: 'BREAK',
    continue: 'CONTINUE',
    return: 'RETURN',
    search: 'SEARCH',
    subchain: 'SUBCHAIN'
})

export function lex(src) {
    // ... preamble unchanged
    const keywords = RESERVED_KEYWORDS
    // ... rest of body unchanged (still uses `keywords[lexeme]`)
}
```

The `const keywords = RESERVED_KEYWORDS` shim keeps the existing two callsites (`if (keywords[lexeme])` and `add(keywords[lexeme], ...)`) intact without any further edits to the body of `lex()`. Net diff: ~16 lines moved out, 1 line added back inside `lex`, plus the new `RESERVED_KEYWORDS` export.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node shaders/tests/test_register_namespace.js`
Expected: both tests PASS.

- [ ] **Step 5: Run the full lang test suite to verify no regression**

Run: `npm run test:shaders:lang`
Expected: all existing parser/unparser tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add shaders/src/lang/lexer.js shaders/tests/test_register_namespace.js
git commit -m "$(cat <<'EOF'
Export RESERVED_KEYWORDS from lexer

Lift the local keywords map out of lex() to module scope so tags.js
validation can source the canonical keyword set from a single place.
No lexer behavior change. Adds a new test file with the harness that
later tasks for registerNamespace() will extend.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Refactor `tags.js` to internal Map + read-only Proxy

**Files:**
- Modify: `shaders/src/runtime/tags.js:69-152`
- Modify: `shaders/tests/test_register_namespace.js` (add tests)

- [ ] **Step 1: Add the failing tests for the refactor**

Append to `shaders/tests/test_register_namespace.js` (right before the `if (failures > 0)` block, replacing the `// More tests added in subsequent tasks.` placeholder):

```js
// ---------- Task 2: tags.js Proxy refactor ----------

import {
    NAMESPACE_DESCRIPTIONS,
    VALID_NAMESPACES,
    isValidNamespace,
    getNamespaceDescription,
    BUILTIN_NAMESPACE,
    IO_FUNCTIONS
} from '../src/runtime/tags.js'

test('Built-in namespaces are still readable through NAMESPACE_DESCRIPTIONS', () => {
    assertEquals(NAMESPACE_DESCRIPTIONS.synth?.id, 'synth', 'NAMESPACE_DESCRIPTIONS.synth.id')
    assertEquals(NAMESPACE_DESCRIPTIONS.synth?.description, 'Generator effects', 'NAMESPACE_DESCRIPTIONS.synth.description')
    assert('filter' in NAMESPACE_DESCRIPTIONS, "'filter' in NAMESPACE_DESCRIPTIONS")
    assertEquals(NAMESPACE_DESCRIPTIONS.notARealNamespace, undefined, 'unknown key returns undefined')
})

test('Object.keys(NAMESPACE_DESCRIPTIONS) enumerates all built-ins', () => {
    const keys = Object.keys(NAMESPACE_DESCRIPTIONS).sort()
    const expected = ['classicNoisedeck', 'filter', 'filter3d', 'io', 'mixer', 'points', 'render', 'synth', 'synth3d', 'user']
    assertEquals(JSON.stringify(keys), JSON.stringify(expected), 'all 10 built-in keys enumerated')
})

test('NAMESPACE_DESCRIPTIONS direct mutation throws', () => {
    assertThrows(() => { NAMESPACE_DESCRIPTIONS.foo = { id: 'foo', description: 'x' } }, null, 'set on proxy')
    assertThrows(() => { delete NAMESPACE_DESCRIPTIONS.synth }, null, 'delete on proxy')
})

test('VALID_NAMESPACES is a live array reflecting all built-ins', () => {
    assert(Array.isArray(VALID_NAMESPACES), 'VALID_NAMESPACES is an array')
    assert(VALID_NAMESPACES.includes('synth'), "'synth' in VALID_NAMESPACES")
    assert(VALID_NAMESPACES.includes('user'), "'user' in VALID_NAMESPACES")
    assertEquals(VALID_NAMESPACES.length, 10, 'all 10 built-ins')
})

test('isValidNamespace returns true for built-ins, false for unknowns', () => {
    assertEquals(isValidNamespace('synth'), true, "isValidNamespace('synth')")
    assertEquals(isValidNamespace('user'), true, "isValidNamespace('user')")
    assertEquals(isValidNamespace('notReal'), false, "isValidNamespace('notReal')")
})

test('getNamespaceDescription returns descriptors for built-ins', () => {
    const synth = getNamespaceDescription('synth')
    assertEquals(synth?.id, 'synth', 'synth.id')
    assertEquals(synth?.description, 'Generator effects', 'synth.description')
    assertEquals(getNamespaceDescription('notReal'), null, 'unknown returns null')
})

test('BUILTIN_NAMESPACE and IO_FUNCTIONS are unchanged', () => {
    assertEquals(BUILTIN_NAMESPACE, 'io', "BUILTIN_NAMESPACE === 'io'")
    assert(IO_FUNCTIONS.includes('read'), "IO_FUNCTIONS includes 'read'")
    assert(IO_FUNCTIONS.includes('write3d'), "IO_FUNCTIONS includes 'write3d'")
    assert(IO_FUNCTIONS.includes('render'), "IO_FUNCTIONS includes 'render'")
})
```

- [ ] **Step 2: Run the tests — most should pass already**

Run: `node shaders/tests/test_register_namespace.js`
Expected: All Task 2 tests should PASS already against the existing frozen-object implementation, EXCEPT possibly `NAMESPACE_DESCRIPTIONS direct mutation throws` (the existing `Object.freeze` throws `TypeError` on set in strict mode, which ESM modules use — so it should also pass). If any test FAILs at this stage, that's expected once we begin refactoring; don't be alarmed.

This step is mostly a baseline. The point of the refactor is that **after** the refactor these tests still all pass, proving backward-compatible read shape.

- [ ] **Step 3: Refactor `tags.js`**

Replace lines 69-152 of `shaders/src/runtime/tags.js` (the `NAMESPACE_DESCRIPTIONS` definition through `getNamespaceDescription` function) with this new implementation. Lines 1-68 (header, `TAG_DEFINITIONS`, `VALID_TAGS`) and lines 153-196 (`validateTags`, `isIOFunction`) stay untouched.

```js
/**
 * Namespace descriptions.
 * Namespace acts as an implicit tag - effects receive it automatically.
 */
const _builtinDescriptors = [
    { id: 'io',               description: 'Pipeline I/O functions (built-in, no search required)' },
    { id: 'classicNoisedeck', description: 'Complex shaders ported from the original noisedeck.app pipeline' },
    { id: 'synth',            description: 'Generator effects' },
    { id: 'mixer',            description: 'Blend two sources from A to B' },
    { id: 'filter',           description: 'Apply special effects to 2D input' },
    { id: 'render',           description: 'Rendering utilities and feedback loops' },
    { id: 'points',           description: 'Particle and agent-based simulations' },
    { id: 'synth3d',          description: '3D volumetric generators' },
    { id: 'filter3d',         description: '3D volumetric processors' },
    { id: 'user',             description: 'User-defined effects' }
]

const _namespaces = new Map(
    _builtinDescriptors.map(d => [d.id, Object.freeze({ id: d.id, description: d.description })])
)

const _builtinIds = new Set(_namespaces.keys())

/**
 * Read-only object view of all registered namespaces.
 * Mutation throws — use registerNamespace() / unregisterNamespace().
 */
export const NAMESPACE_DESCRIPTIONS = new Proxy({}, {
    get(_, key) {
        return typeof key === 'string' ? _namespaces.get(key) : undefined
    },
    has(_, key) {
        return typeof key === 'string' && _namespaces.has(key)
    },
    ownKeys() {
        return [..._namespaces.keys()]
    },
    getOwnPropertyDescriptor(_, key) {
        if (typeof key === 'string' && _namespaces.has(key)) {
            return { enumerable: true, configurable: true, value: _namespaces.get(key) }
        }
        return undefined
    },
    set(_, key) {
        throw new TypeError(`Cannot mutate NAMESPACE_DESCRIPTIONS directly; use registerNamespace() to add namespace '${String(key)}'`)
    },
    deleteProperty(_, key) {
        throw new TypeError(`Cannot delete from NAMESPACE_DESCRIPTIONS directly; use unregisterNamespace() to remove namespace '${String(key)}'`)
    }
})

/**
 * Built-in namespace that is always implicitly available.
 * Functions in this namespace do not require a search directive.
 */
export const BUILTIN_NAMESPACE = 'io'

/**
 * Functions that belong to the built-in io namespace.
 * These are pipeline-level I/O operations, not effects per se.
 */
export const IO_FUNCTIONS = Object.freeze([
    'read',      // Read from 2D surface
    'write',     // Write to 2D surface
    'read3d',    // Read from 3D volume/geometry
    'write3d',   // Write to 3D volume/geometry
    'render',    // Set render output (special directive)
    'render3d'   // Render 3D volume to 2D
])

/**
 * Live array of valid namespace IDs. Mutated in place by
 * registerNamespace() / unregisterNamespace().
 */
export const VALID_NAMESPACES = [..._namespaces.keys()]

/**
 * Check if a tag ID is valid.
 * @param {string} tagId - Tag ID to validate
 * @returns {boolean} True if valid
 */
export function isValidTag(tagId) {
    return VALID_TAGS.includes(tagId)
}

/**
 * Check if a namespace ID is valid.
 * @param {string} namespaceId - Namespace ID to validate
 * @returns {boolean} True if valid
 */
export function isValidNamespace(namespaceId) {
    return _namespaces.has(namespaceId)
}

/**
 * Get tag definition by ID.
 * @param {string} tagId - Tag ID
 * @returns {object|null} Tag definition or null if not found
 */
export function getTagDefinition(tagId) {
    return TAG_DEFINITIONS[tagId] || null
}

/**
 * Get namespace description by ID.
 * @param {string} namespaceId - Namespace ID
 * @returns {object|null} Namespace description or null if not found
 */
export function getNamespaceDescription(namespaceId) {
    return _namespaces.get(namespaceId) ?? null
}
```

- [ ] **Step 4: Run the test to verify everything still passes**

Run: `node shaders/tests/test_register_namespace.js`
Expected: all tests PASS (Task 1 tests + Task 2 tests).

- [ ] **Step 5: Run the full lang test suite + parser tests**

Run: `npm run test:shaders:lang`
Expected: all existing parser/unparser tests still PASS — the refactor is invisible to existing callers.

- [ ] **Step 6: Commit**

```bash
git add shaders/src/runtime/tags.js shaders/tests/test_register_namespace.js
git commit -m "$(cat <<'EOF'
Refactor namespace exports to internal Map + read-only Proxy

Replace the frozen NAMESPACE_DESCRIPTIONS object with a Proxy over a
private Map, and replace the frozen VALID_NAMESPACES array with a live
mutable array seeded from the same map. All read patterns
(obj[key], 'key' in obj, Object.keys, Object.values, Object.entries,
for..in) continue to work identically. Direct mutation throws via the
Proxy's set/deleteProperty traps. Sets up the structure that
registerNamespace() will extend in the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add `registerNamespace` + `unregisterNamespace` happy path

**Files:**
- Modify: `shaders/src/runtime/tags.js` (append two new functions)
- Modify: `shaders/tests/test_register_namespace.js` (add tests)

- [ ] **Step 1: Add the failing tests**

Append to `shaders/tests/test_register_namespace.js` (still before the `if (failures > 0)` footer):

```js
// ---------- Task 3: register/unregister happy path ----------

import { registerNamespace, unregisterNamespace } from '../src/runtime/tags.js'

test('registerNamespace adds a new namespace and unregisterNamespace removes it', () => {
    assertEquals(isValidNamespace('myFooHappy'), false, "before: isValidNamespace('myFooHappy')")
    const desc = registerNamespace('myFooHappy', { description: 'Foo collection' })
    try {
        assertEquals(desc?.id, 'myFooHappy', 'returned descriptor.id')
        assertEquals(desc?.description, 'Foo collection', 'returned descriptor.description')
        assertEquals(isValidNamespace('myFooHappy'), true, "after register: isValidNamespace('myFooHappy')")
        assert(VALID_NAMESPACES.includes('myFooHappy'), "VALID_NAMESPACES includes 'myFooHappy'")
        assert('myFooHappy' in NAMESPACE_DESCRIPTIONS, "'myFooHappy' in NAMESPACE_DESCRIPTIONS")
        assertEquals(NAMESPACE_DESCRIPTIONS.myFooHappy?.description, 'Foo collection', 'proxy read after register')
        assertEquals(getNamespaceDescription('myFooHappy')?.description, 'Foo collection', 'getNamespaceDescription after register')
        assertEquals(Object.isFrozen(desc), true, 'returned descriptor is frozen')
    } finally {
        const removed = unregisterNamespace('myFooHappy')
        assertEquals(removed, true, 'unregisterNamespace returns true')
    }
    assertEquals(isValidNamespace('myFooHappy'), false, "after unregister: isValidNamespace('myFooHappy')")
    assertEquals(VALID_NAMESPACES.includes('myFooHappy'), false, "VALID_NAMESPACES no longer includes 'myFooHappy'")
    assertEquals('myFooHappy' in NAMESPACE_DESCRIPTIONS, false, "'myFooHappy' no longer in NAMESPACE_DESCRIPTIONS")
})

test('unregisterNamespace returns false for never-registered ids', () => {
    assertEquals(unregisterNamespace('neverRegistered'), false, 'never registered → false')
})

test('unregisterNamespace returns false on second call (idempotent removal)', () => {
    registerNamespace('myFooTwice', { description: 'twice' })
    assertEquals(unregisterNamespace('myFooTwice'), true, 'first remove → true')
    assertEquals(unregisterNamespace('myFooTwice'), false, 'second remove → false')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node shaders/tests/test_register_namespace.js`
Expected: FAIL on the import line — `registerNamespace` and `unregisterNamespace` are not yet exported. Error like `SyntaxError: The requested module '../src/runtime/tags.js' does not provide an export named 'registerNamespace'`.

- [ ] **Step 3: Add minimal `registerNamespace` and `unregisterNamespace` to `tags.js`**

Append to `shaders/src/runtime/tags.js` (after `getNamespaceDescription`, before `validateTags`):

```js
/**
 * Register a new effect namespace. Once registered the id is accepted by
 * the DSL parser's `search` directive and by `isValidNamespace`.
 *
 * Validation rules: the id must match /^[a-z][a-zA-Z0-9]*$/, must not be
 * a DSL reserved keyword or function name, and must not collide with a
 * built-in namespace. Re-registering with the same description is an
 * idempotent no-op; with a different description, throws. Built-ins
 * cannot be re-registered.
 *
 * @param {string} id - Namespace identifier.
 * @param {{description: string}} descriptor - Descriptor with non-empty description.
 * @returns {{id: string, description: string}} The registered descriptor (frozen).
 * @throws {Error} on invalid id, reserved word, built-in collision, or
 *   re-registration with a different description.
 */
export function registerNamespace(id, descriptor) {
    const frozen = Object.freeze({ id, description: descriptor.description })
    _namespaces.set(id, frozen)
    VALID_NAMESPACES.push(id)
    return frozen
}

/**
 * Remove a previously-registered namespace. Built-ins cannot be unregistered.
 * Effects already registered under the namespace remain in the registry but
 * become unreachable via `search`. Primarily for test isolation.
 *
 * @param {string} id - Namespace identifier.
 * @returns {boolean} true if removed, false if not registered.
 * @throws {Error} on built-in id.
 */
export function unregisterNamespace(id) {
    if (!_namespaces.has(id)) return false
    _namespaces.delete(id)
    const i = VALID_NAMESPACES.indexOf(id)
    if (i >= 0) VALID_NAMESPACES.splice(i, 1)
    return true
}
```

(This is the minimal implementation. Validation is added in Task 4; idempotency, conflict detection, and built-in protection in Task 5.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node shaders/tests/test_register_namespace.js`
Expected: all tests so far PASS.

- [ ] **Step 5: Commit**

```bash
git add shaders/src/runtime/tags.js shaders/tests/test_register_namespace.js
git commit -m "$(cat <<'EOF'
Add minimal registerNamespace/unregisterNamespace happy path

Adds the two functions with no validation yet — registers and removes
namespaces in the internal Map and live VALID_NAMESPACES array.
Validation rules and built-in protection follow in subsequent commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add validation rules

**Files:**
- Modify: `shaders/src/runtime/tags.js` (add validation to `registerNamespace`)
- Modify: `shaders/tests/test_register_namespace.js` (add tests)

- [ ] **Step 1: Add the failing validation tests**

Append to `shaders/tests/test_register_namespace.js`:

```js
// ---------- Task 4: validation rules ----------

test('registerNamespace rejects invalid id shapes', () => {
    assertThrows(() => registerNamespace('', { description: 'x' }), 'must be a non-empty string', "''")
    assertThrows(() => registerNamespace(null, { description: 'x' }), 'must be a non-empty string', 'null')
    assertThrows(() => registerNamespace(undefined, { description: 'x' }), 'must be a non-empty string', 'undefined')
    assertThrows(() => registerNamespace(42, { description: 'x' }), 'must be a non-empty string', '42')
    assertThrows(() => registerNamespace('Foo', { description: 'x' }), 'must match', "'Foo'")
    assertThrows(() => registerNamespace('1foo', { description: 'x' }), 'must match', "'1foo'")
    assertThrows(() => registerNamespace('foo-bar', { description: 'x' }), 'must match', "'foo-bar'")
    assertThrows(() => registerNamespace('foo bar', { description: 'x' }), 'must match', "'foo bar'")
    assertThrows(() => registerNamespace('foo.bar', { description: 'x' }), 'must match', "'foo.bar'")
})

test('registerNamespace rejects reserved DSL keywords', () => {
    for (const kw of ['render', 'let', 'search', 'subchain', 'write', 'write3d', 'if', 'elif', 'else', 'break', 'continue', 'return']) {
        assertThrows(() => registerNamespace(kw, { description: 'x' }), 'reserved DSL keyword', kw)
    }
})

test('registerNamespace rejects IO function names', () => {
    for (const fn of ['read', 'write', 'read3d', 'write3d', 'render', 'render3d']) {
        // Note: write/write3d/render are also lexer keywords and may be caught earlier;
        // read/read3d/render3d are pure IO function names.
        assertThrows(() => registerNamespace(fn, { description: 'x' }), null, fn)
    }
})

test('registerNamespace rejects reserved function names (from/osc/midi/audio)', () => {
    for (const fn of ['from', 'osc', 'midi', 'audio']) {
        assertThrows(() => registerNamespace(fn, { description: 'x' }), 'reserved', fn)
    }
})

test('registerNamespace rejects bad descriptors', () => {
    assertThrows(() => registerNamespace('myFooDesc', null), 'descriptor', 'null descriptor')
    assertThrows(() => registerNamespace('myFooDesc', undefined), 'descriptor', 'undefined descriptor')
    assertThrows(() => registerNamespace('myFooDesc', 'string'), 'descriptor', 'string descriptor')
    assertThrows(() => registerNamespace('myFooDesc', {}), 'description', 'missing description')
    assertThrows(() => registerNamespace('myFooDesc', { description: '' }), 'description', 'empty description')
    assertThrows(() => registerNamespace('myFooDesc', { description: 42 }), 'description', 'non-string description')
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node shaders/tests/test_register_namespace.js`
Expected: most/all of the new tests FAIL — `registerNamespace` currently does no validation, so calls like `registerNamespace('', ...)` succeed instead of throwing.

- [ ] **Step 3: Add full validation to `registerNamespace`**

In `shaders/src/runtime/tags.js`, add the import for `RESERVED_KEYWORDS` at the top of the file (after the existing module header, before `TAG_DEFINITIONS`):

```js
import { RESERVED_KEYWORDS } from '../lang/lexer.js'
```

Then add a private constant near the other module-private state (after `_builtinIds`):

```js
/**
 * Function names that are reserved but aren't lexer keywords or IO_FUNCTIONS.
 * Registering a namespace with one of these would shadow the function in
 * bare-name resolution.
 *   from    — namespace-override directive (handled in parser; would shadow)
 *   osc     — external-input function (oscillator)
 *   midi    — external-input function (MIDI controller value)
 *   audio   — external-input function (audio FFT/level)
 */
const _RESERVED_FUNCTION_NAMES = ['from', 'osc', 'midi', 'audio']

const _ID_PATTERN = /^[a-z][a-zA-Z0-9]*$/
```

Then replace the body of `registerNamespace` with:

```js
export function registerNamespace(id, descriptor) {
    if (typeof id !== 'string' || id.length === 0) {
        throw new Error(`Invalid namespace id: must be a non-empty string`)
    }
    if (!_ID_PATTERN.test(id)) {
        throw new Error(`Invalid namespace id '${id}': must match ${_ID_PATTERN}`)
    }
    if (Object.prototype.hasOwnProperty.call(RESERVED_KEYWORDS, id)) {
        throw new Error(`Cannot register namespace '${id}': reserved DSL keyword`)
    }
    if (IO_FUNCTIONS.includes(id)) {
        throw new Error(`Cannot register namespace '${id}': reserved IO function name`)
    }
    if (_RESERVED_FUNCTION_NAMES.includes(id)) {
        throw new Error(`Cannot register namespace '${id}': reserved function name`)
    }
    if (descriptor === null || typeof descriptor !== 'object') {
        throw new Error(`Invalid descriptor for namespace '${id}': must be an object`)
    }
    if (typeof descriptor.description !== 'string' || descriptor.description.length === 0) {
        throw new Error(`Invalid descriptor for namespace '${id}': 'description' must be a non-empty string`)
    }
    const frozen = Object.freeze({ id, description: descriptor.description })
    _namespaces.set(id, frozen)
    VALID_NAMESPACES.push(id)
    return frozen
}
```

(The `id` shape and reserved-word checks fire before the descriptor check, so a call like `registerNamespace('render', null)` reports the keyword issue rather than the descriptor issue. Tests in Step 1 use valid `description: 'x'` for shape checks and varied descriptors only when `id` is valid.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node shaders/tests/test_register_namespace.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add shaders/src/runtime/tags.js shaders/tests/test_register_namespace.js
git commit -m "$(cat <<'EOF'
Add validation rules to registerNamespace

Validates id shape against /^[a-z][a-zA-Z0-9]*$/, rejects RESERVED_KEYWORDS
from the lexer, rejects IO_FUNCTIONS, rejects an explicit list of reserved
function names (from/osc/midi/audio), and validates the descriptor object
shape. Each rule failure throws Error with a message naming the violation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Idempotency, conflict detection, built-in protection

**Files:**
- Modify: `shaders/src/runtime/tags.js`
- Modify: `shaders/tests/test_register_namespace.js`

- [ ] **Step 1: Add the failing tests**

Append to `shaders/tests/test_register_namespace.js`:

```js
// ---------- Task 5: idempotency, conflict, built-in protection ----------

test('registerNamespace is idempotent for same descriptor', () => {
    const a = registerNamespace('myFooIdem', { description: 'same' })
    try {
        const b = registerNamespace('myFooIdem', { description: 'same' })
        assertEquals(a, b, 'idempotent register returns the same frozen descriptor')
        assertEquals(VALID_NAMESPACES.filter(n => n === 'myFooIdem').length, 1, 'no duplicate in VALID_NAMESPACES')
    } finally {
        unregisterNamespace('myFooIdem')
    }
})

test('registerNamespace throws on conflicting re-registration', () => {
    registerNamespace('myFooConflict', { description: 'first' })
    try {
        assertThrows(
            () => registerNamespace('myFooConflict', { description: 'different' }),
            'different description',
            'conflicting re-register'
        )
    } finally {
        unregisterNamespace('myFooConflict')
    }
})

test('registerNamespace throws on built-in collision', () => {
    for (const builtin of ['io', 'classicNoisedeck', 'synth', 'mixer', 'filter', 'render', 'points', 'synth3d', 'filter3d', 'user']) {
        assertThrows(() => registerNamespace(builtin, { description: 'x' }), null, builtin)
    }
})

test('unregisterNamespace throws on built-in', () => {
    for (const builtin of ['synth', 'filter', 'user']) {
        assertThrows(() => unregisterNamespace(builtin), 'built-in', builtin)
    }
})

test('built-ins remain after attempted built-in unregister', () => {
    try { unregisterNamespace('synth') } catch {}
    assertEquals(isValidNamespace('synth'), true, "synth still valid after attempted unregister")
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node shaders/tests/test_register_namespace.js`
Expected: FAIL on idempotency (currently re-register would push a duplicate id into `VALID_NAMESPACES` and overwrite the Map entry), conflict (currently no conflict detection), built-in collision (currently allowed), and built-in unregister (currently allowed).

- [ ] **Step 3: Add idempotency, conflict, and built-in protection**

In `shaders/src/runtime/tags.js`, replace the body of `registerNamespace` again with the full version. This adds the built-in collision check and the idempotency/conflict detection. (The validation rules from Task 4 stay in place.)

```js
export function registerNamespace(id, descriptor) {
    if (typeof id !== 'string' || id.length === 0) {
        throw new Error(`Invalid namespace id: must be a non-empty string`)
    }
    if (!_ID_PATTERN.test(id)) {
        throw new Error(`Invalid namespace id '${id}': must match ${_ID_PATTERN}`)
    }
    if (Object.prototype.hasOwnProperty.call(RESERVED_KEYWORDS, id)) {
        throw new Error(`Cannot register namespace '${id}': reserved DSL keyword`)
    }
    if (IO_FUNCTIONS.includes(id)) {
        throw new Error(`Cannot register namespace '${id}': reserved IO function name`)
    }
    if (_RESERVED_FUNCTION_NAMES.includes(id)) {
        throw new Error(`Cannot register namespace '${id}': reserved function name`)
    }
    if (_builtinIds.has(id)) {
        throw new Error(`Cannot register namespace '${id}': built-in namespace`)
    }
    if (descriptor === null || typeof descriptor !== 'object') {
        throw new Error(`Invalid descriptor for namespace '${id}': must be an object`)
    }
    if (typeof descriptor.description !== 'string' || descriptor.description.length === 0) {
        throw new Error(`Invalid descriptor for namespace '${id}': 'description' must be a non-empty string`)
    }
    const existing = _namespaces.get(id)
    if (existing) {
        if (existing.description !== descriptor.description) {
            throw new Error(`Cannot re-register namespace '${id}' with a different description`)
        }
        return existing
    }
    const frozen = Object.freeze({ id, description: descriptor.description })
    _namespaces.set(id, frozen)
    VALID_NAMESPACES.push(id)
    return frozen
}
```

And replace `unregisterNamespace` with:

```js
export function unregisterNamespace(id) {
    if (_builtinIds.has(id)) {
        throw new Error(`Cannot unregister namespace '${id}': built-in namespace`)
    }
    if (!_namespaces.has(id)) return false
    _namespaces.delete(id)
    const i = VALID_NAMESPACES.indexOf(id)
    if (i >= 0) VALID_NAMESPACES.splice(i, 1)
    return true
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node shaders/tests/test_register_namespace.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add shaders/src/runtime/tags.js shaders/tests/test_register_namespace.js
git commit -m "$(cat <<'EOF'
Protect built-ins and add idempotency/conflict detection

registerNamespace now throws on built-in collision and on re-registration
with a mismatched description; same-description re-registration returns
the existing frozen descriptor (idempotent for module-load-time
double-registration). unregisterNamespace throws on built-in ids,
mirroring registerNamespace's built-in collision throw.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: index.js re-exports + DSL integration test + test runner wiring

**Files:**
- Modify: `shaders/src/index.js:23-36`
- Modify: `shaders/tests/test_register_namespace.js` (add final tests)
- Modify: `package.json:23` (extend `test:shaders:lang` script)

- [ ] **Step 1: Add the failing integration test**

Append to `shaders/tests/test_register_namespace.js`:

```js
// ---------- Task 6: DSL integration + index re-export ----------

import { registerEffect, getEffect } from '../src/runtime/registry.js'
import { parse } from '../src/lang/parser.js'
import * as engineIndex from '../src/index.js'

test('registerNamespace and unregisterNamespace are re-exported from index.js', () => {
    assertEquals(typeof engineIndex.registerNamespace, 'function', 'engineIndex.registerNamespace')
    assertEquals(typeof engineIndex.unregisterNamespace, 'function', 'engineIndex.unregisterNamespace')
})

test('DSL search directive accepts a registered namespace', () => {
    registerNamespace('myFooDsl', { description: 'Foo DSL test' })
    const stub = { name: 'bar', namespace: 'myFooDsl' }
    registerEffect('myFooDsl/bar', stub)
    try {
        const tokens = lex('search myFooDsl\nbar().write(o0)')
        const ast = parse(tokens)
        assert(ast.namespace, 'AST has namespace metadata')
        assert(Array.isArray(ast.namespace.searchOrder), 'AST has searchOrder array')
        assertEquals(ast.namespace.searchOrder.length, 1, 'one namespace in searchOrder')
        assertEquals(ast.namespace.searchOrder[0], 'myFooDsl', 'searchOrder[0] is myFooDsl')
    } finally {
        unregisterNamespace('myFooDsl')
    }
})

test('DSL search directive rejects an unregistered namespace', () => {
    assertThrows(() => parse(lex('search notAnyNamespace\nfoo().write(o0)')), 'Invalid namespace', 'unregistered ns')
})

test('DSL search rejects an unregistered namespace AFTER it has been unregistered', () => {
    registerNamespace('myFooEphemeral', { description: 'temp' })
    unregisterNamespace('myFooEphemeral')
    assertThrows(() => parse(lex('search myFooEphemeral\nfoo().write(o0)')), 'Invalid namespace', 'unregistered ns')
})

test('Unregister hides namespace from search but leaves the registry alone', () => {
    registerNamespace('myFooRegistry', { description: 'reg' })
    const stub = { name: 'bar', namespace: 'myFooRegistry' }
    registerEffect('myFooRegistry/bar', stub)
    unregisterNamespace('myFooRegistry')
    assertEquals(getEffect('myFooRegistry/bar'), stub, 'effect remains in registry after unregister')
    assertThrows(() => parse(lex('search myFooRegistry\nbar().write(o0)')), 'Invalid namespace', 'search rejects')
})
```

- [ ] **Step 2: Run the tests to verify the index re-export test fails**

Run: `node shaders/tests/test_register_namespace.js`
Expected: FAIL on `registerNamespace and unregisterNamespace are re-exported from index.js` — they're not yet in `index.js`'s re-export block. Other tests in this task may pass already (since they import the functions from `tags.js` directly).

- [ ] **Step 3: Add the re-exports to `index.js`**

In `shaders/src/index.js`, edit the existing `// Tags & Namespaces` export block (currently lines 23-36) to include the two new functions. Add `registerNamespace,` and `unregisterNamespace,` to the export list:

Current:
```js
// Tags & Namespaces
export {
    TAG_DEFINITIONS,
    NAMESPACE_DESCRIPTIONS,
    VALID_TAGS,
    VALID_NAMESPACES,
    BUILTIN_NAMESPACE,
    IO_FUNCTIONS,
    isValidTag,
    isValidNamespace,
    isIOFunction,
    getTagDefinition,
    getNamespaceDescription,
    validateTags
} from './runtime/tags.js'
```

Change to:
```js
// Tags & Namespaces
export {
    TAG_DEFINITIONS,
    NAMESPACE_DESCRIPTIONS,
    VALID_TAGS,
    VALID_NAMESPACES,
    BUILTIN_NAMESPACE,
    IO_FUNCTIONS,
    isValidTag,
    isValidNamespace,
    isIOFunction,
    getTagDefinition,
    getNamespaceDescription,
    validateTags,
    registerNamespace,
    unregisterNamespace
} from './runtime/tags.js'
```

- [ ] **Step 4: Run the tests to verify all pass**

Run: `node shaders/tests/test_register_namespace.js`
Expected: all tests PASS.

- [ ] **Step 5: Wire the new test file into `npm run test:shaders:lang`**

In `package.json`, edit the `test:shaders:lang` script (currently line 23):

Current:
```json
"test:shaders:lang": "node shaders/tests/test-unparser.mjs && node shaders/tests/test_parser.js",
```

Change to:
```json
"test:shaders:lang": "node shaders/tests/test-unparser.mjs && node shaders/tests/test_parser.js && node shaders/tests/test_register_namespace.js",
```

- [ ] **Step 6: Run the full lang test suite to verify everything still passes**

Run: `npm run test:shaders:lang`
Expected: `test-unparser.mjs` PASS, `test_parser.js` PASS, `test_register_namespace.js` PASS (all tests). Exit code 0.

- [ ] **Step 7: Run the full JS test suite as a regression sanity check**

Run: `node scripts/run-js-tests.js --skip-parity`
Expected: all non-parity tests PASS. (The parity suite requires Python and is irrelevant to this change.)

- [ ] **Step 8: Commit**

```bash
git add shaders/src/index.js shaders/tests/test_register_namespace.js package.json
git commit -m "$(cat <<'EOF'
Re-export registerNamespace/unregisterNamespace and wire DSL test

Add the two new functions to the Tags & Namespaces export block in
shaders/src/index.js so they flow into the CDN bundle. Wire
test_register_namespace.js into the test:shaders:lang npm script. Add
end-to-end tests proving the DSL search directive accepts registered
namespaces, rejects them after unregister, and that unregister leaves
the effect registry alone.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review (already done by plan author)

**Spec coverage:**

| Spec section | Implementing task |
|---|---|
| API surface (registerNamespace, unregisterNamespace) | Task 3 (minimal) → Task 5 (full) |
| `tags.js` refactor (Map + Proxy + live array) | Task 2 |
| Lexer `RESERVED_KEYWORDS` export | Task 1 |
| Validation rules (id shape, reserved words, descriptor) | Task 4 |
| `unregisterNamespace` semantics (false / built-in throw) | Task 5 |
| `index.js` re-exports | Task 6 |
| Test cases 1-17 (in spec) | Tasks 1, 2, 3, 4, 5, 6 (one-to-one mapped, see below) |
| Test runner wiring | Task 6 |
| Migration impact (read-shape compat) | Verified by Task 2 tests + Task 5 step 5 (`npm run test:shaders:lang`) |

**Spec test case → plan task mapping:**

| Spec test | Task |
|---|---|
| 1. Register-and-resolve happy path | Task 6 (DSL integration) |
| 2. isValidNamespace reflects registration | Task 3 |
| 3. NAMESPACE_DESCRIPTIONS reflects registration | Task 3 |
| 4. getNamespaceDescription returns descriptor | Task 3 |
| 5. VALID_NAMESPACES includes new id | Task 3 |
| 6. Built-in collision throws | Task 5 |
| 7. Reserved keyword throws | Task 4 |
| 8. IO function name throws | Task 4 |
| 9. Reserved function name throws | Task 4 |
| 10. Invalid id shape throws | Task 4 |
| 11. Missing/bad descriptor throws | Task 4 |
| 12. Idempotent re-registration | Task 5 |
| 13. Conflicting re-registration throws | Task 5 |
| 14. unregisterNamespace returns true/false correctly | Task 3 |
| 15. unregisterNamespace of built-in throws | Task 5 |
| 16. Unregister hides from search but leaves registry | Task 6 |
| 17. Lexer keyword sync | Task 1 |

**Type consistency:** `_namespaces` (Map), `_builtinIds` (Set), `_RESERVED_FUNCTION_NAMES` (Array), `_ID_PATTERN` (RegExp), `RESERVED_KEYWORDS` (frozen Object), `NAMESPACE_DESCRIPTIONS` (Proxy), `VALID_NAMESPACES` (live Array), `IO_FUNCTIONS` (frozen Array). All names used consistently across tasks 2-6.

**No placeholders found.** Every step shows actual code or actual commands with expected output.

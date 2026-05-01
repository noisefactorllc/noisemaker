# Design — `registerNamespace()` API

**Date:** 2026-05-01
**Source PRD:** `hydra-synth/docs/upstream-prds/2026-05-01-register-namespace-api.md`
**Status:** approved for implementation planning

## Summary

Add `registerNamespace(id, descriptor)` and `unregisterNamespace(id)` to the
shader engine so external consumers (e.g. integrations that ship their own
effect collection over the CDN) can introduce a top-level namespace alongside
the built-ins (`synth`, `filter`, `mixer`, etc.). Today the namespace
allowlist is `Object.freeze`d in `shaders/src/runtime/tags.js`, and the only
workarounds are to share `user/` (collision-prone) or to vendor and patch
`tags.js` (defeats the CDN distribution model).

The change is small and additive: refactor the frozen namespace map into a
mutable internal `Map` exposed through a read-only `Proxy`, mutate
`VALID_NAMESPACES` in place on register/unregister, and run new ids through a
combined reserved-word check sourced from the lexer's keyword set, the
existing `IO_FUNCTIONS` export, and a small explicit list of reserved
function names. No DSL grammar changes. No effect-registry changes.

## Goals / non-goals

**Goals**
- Public, runtime-callable API: `registerNamespace`, `unregisterNamespace`.
- Once registered, the id is accepted by the DSL parser's `search` directive
  and by `isValidNamespace`.
- Existing exports (`NAMESPACE_DESCRIPTIONS`, `VALID_NAMESPACES`,
  `isValidNamespace`, `getNamespaceDescription`, `BUILTIN_NAMESPACE`,
  `IO_FUNCTIONS`) keep their names and read shapes — zero impact on existing
  consumers.
- Symmetric, predictable error semantics: built-ins are immutable; collisions
  with mismatched descriptors throw; idempotent re-registration is a no-op.

**Non-goals**
- No grammar changes to `search` or `from()`.
- No `Effect` schema changes — `instance.namespace` is already the consumer's
  escape hatch.
- No registry-side cleanup on unregister — the namespace de-list just hides
  ops from `search`.
- No automatic discovery, scoping, versioning, or `listNamespaces` API.
  (`Object.keys(NAMESPACE_DESCRIPTIONS)` already enumerates registered
  namespaces and continues to work through the proxy.)

## API surface

Two new functions in `shaders/src/runtime/tags.js`, re-exported from
`shaders/src/index.js`:

```js
/**
 * Register a new effect namespace. Once registered the id is accepted by
 * the DSL parser's `search` directive and by `isValidNamespace`.
 *
 * @param {string} id
 * @param {object} descriptor
 * @param {string} descriptor.description
 * @returns {object} The registered descriptor (frozen).
 * @throws {Error} on invalid id, reserved word, built-in collision, or
 *   re-registration with a different description.
 */
export function registerNamespace(id, descriptor) { … }

/**
 * Remove a previously-registered namespace. Built-ins cannot be unregistered.
 * Effects already registered under the namespace remain in the registry but
 * become unreachable via `search`. Primarily for test isolation.
 *
 * @param {string} id
 * @returns {boolean} true if removed, false if not registered.
 * @throws {Error} on built-in id.
 */
export function unregisterNamespace(id) { … }
```

`getNamespaceDescription(id)` already exists and is already re-exported. No
new accessor is added; once `tags.js` is rebuilt on top of the mutable map,
the existing function returns descriptors for newly-registered namespaces
too.

## Implementation

### `shaders/src/runtime/tags.js` refactor

Replace the frozen exports with a single internal `Map` plus accessors that
return live snapshots. All existing export names and shapes are preserved.

**Internal state (module-private):**

```js
const _namespaces = new Map([
    ['io',               { id: 'io',               description: '…', builtin: true }],
    ['classicNoisedeck', { id: 'classicNoisedeck', description: '…', builtin: true }],
    // … all current built-ins, each with builtin: true
])
const _builtinIds = new Set(_namespaces.keys())
```

**Existing exports — backward-compatible reshapes:**

- `NAMESPACE_DESCRIPTIONS` becomes a `Proxy` over `_namespaces` that supports
  `obj[id]`, `id in obj`, `Object.keys(obj)`, `for..in`, `Object.values(obj)`,
  and `Object.entries(obj)`. Reads pass through to the live map so
  newly-registered namespaces appear immediately. Writes (`set`,
  `deleteProperty`) throw `TypeError` to preserve the read-only contract that
  `Object.freeze` previously enforced.
- `VALID_NAMESPACES` stays a real array, mutated in place. Initial seed is
  `Array.from(_namespaces.keys())`. `registerNamespace` calls
  `VALID_NAMESPACES.push(id)`; `unregisterNamespace` splices the id out. The
  `Object.freeze` wrapper is dropped. Existing parser usage
  (`VALID_NAMESPACES.includes(...)` and `VALID_NAMESPACES.join(', ')`)
  reflects the live state.
- `isValidNamespace(id)` is unchanged in shape; the underlying
  `VALID_NAMESPACES.includes` now sees registered namespaces.
- `getNamespaceDescription(id)` is rewritten to read from
  `_namespaces.get(id)`.
- `BUILTIN_NAMESPACE`, `IO_FUNCTIONS`, and all tag-related exports are
  untouched.

**Why a Proxy instead of a plain unfrozen object:** A Proxy keeps a single
source of truth (`_namespaces`). The alternative — maintaining the existing
plain object alongside the map — would require keeping two structures in
sync on every register/unregister and risks drift. The Proxy is transparent
for read access: `NAMESPACE_DESCRIPTIONS[id]`, `key in NAMESPACE_DESCRIPTIONS`,
and key enumeration all work as before.

### `shaders/src/lang/lexer.js` change

Lift the local `keywords` const out of the `lex()` function to module scope,
freeze it, and export it. The `lex()` body reads from the module-level
binding instead of redeclaring locally. No behavior change for the lexer.

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
```

`tags.js` imports `RESERVED_KEYWORDS` for validation. The runtime→lang
import direction is acceptable: `tags.js` already exists to support DSL
parsing concerns (it is the source of `isValidNamespace`, which the parser
calls), so the layering boundary is not actually inverted.

### Validation rules in `registerNamespace`

The `id` argument must:

1. Be a non-empty string.
2. Match `/^[a-z][a-zA-Z0-9]*$/`. This preserves the parser's
   identifier-token assumption (lowercase-leading ident shape).
3. Not appear in the combined reserved-word set:
   - `Object.keys(RESERVED_KEYWORDS)` — imported from lexer.
   - `IO_FUNCTIONS` — already exported from tags.js
     (`read, write, read3d, write3d, render, render3d`).
   - `_RESERVED_FUNCTION_NAMES`, a small private constant in tags.js:
     `['from', 'osc', 'midi', 'audio']`. Documented inline with a comment
     explaining each entry — `from` is the namespace-override directive that
     would shadow if registered as a namespace; `osc`, `midi`, `audio` are
     external-input function names whose bare-name resolution would become
     ambiguous if shadowed.
4. Not collide with an already-registered namespace whose descriptor differs.
   Collision with same-description is an idempotent no-op; collision with
   mismatched description throws.

The `descriptor` argument must:

- Be a non-null object.
- Have `description` as a non-empty string.

Extra fields on the descriptor are silently allowed (forward-compat) but
only `description` is used.

Each rule failure throws `Error` with a message naming the violation. Sample
messages:

- `Invalid namespace id 'foo-bar': must match /^[a-z][a-zA-Z0-9]*$/`
- `Cannot register namespace 'render': reserved DSL keyword`
- `Cannot register namespace 'synth': built-in namespace`
- `Cannot re-register namespace 'foo' with a different description`

### `unregisterNamespace` semantics

- Returns `true` if the id was registered (and is now removed).
- Returns `false` if the id was never registered (cheap idempotent cleanup).
- Throws `Error` if the id is a built-in. This is symmetric with
  `registerNamespace`'s built-in collision throw — touching a built-in is
  always an error, while `false` is reserved for the "wasn't registered"
  semantic case.
- Does not touch the effect registry. `getEffect('myFoo/bar')` continues to
  return the registered effect after `unregisterNamespace('myFoo')`; the
  namespace de-list only hides the ops from the DSL `search` directive. This
  is documented behavior, primarily intended to support test isolation.

### `shaders/src/index.js` change

Add `registerNamespace, unregisterNamespace` to the existing
`export { … } from './runtime/tags.js'` block. No other index.js changes.
The CDN bundle script imports from `index.js`, so the new exports flow into
`noisemaker-shaders-core.esm.min.js` automatically.

## Tests

New file: `shaders/tests/test_register_namespace.js`. Plain `node` script,
console-based, no test framework — matches the existing pattern in
`test_parser.js`.

Each test that registers a namespace ends with `unregisterNamespace(id)` to
clean up, so tests do not leak state. The `unregisterNamespace` API supports
this directly (its PRD-stated secondary purpose).

**Test cases:**

1. **Register-and-resolve happy path.** `registerNamespace('myFoo', {description: 'Foo'})`,
   then `registerEffect('myFoo/bar', stub)` and `registerOp('myFoo.bar', opSpec)`,
   then `parse(lex('search myFoo\nbar().write(o0)'))` succeeds and the AST
   has `searchOrder: ['myFoo']`.
2. **`isValidNamespace` reflects registration.** `false` → `true` →
   (after `unregisterNamespace`) `false`.
3. **`NAMESPACE_DESCRIPTIONS[id]` reflects registration.** Object access
   through the proxy returns the registered descriptor;
   `Object.keys(NAMESPACE_DESCRIPTIONS)` includes the new id.
4. **`getNamespaceDescription(id)` returns the registered descriptor.**
5. **`VALID_NAMESPACES` array includes the new id** after registration;
   excludes it after unregister. Confirms in-place mutation works for code
   that holds the array reference.
6. **Built-in collision throws.** `registerNamespace('synth', …)` throws.
7. **Reserved keyword throws.** `registerNamespace('render', …)`, `'let'`,
   `'search'`, `'subchain'` each throw.
8. **IO function name throws.** `registerNamespace('write', …)`, `'read'`,
   `'render3d'` each throw.
9. **Reserved function name throws.** `registerNamespace('from', …)`,
   `'osc'`, `'midi'`, `'audio'` each throw.
10. **Invalid id shape throws.** `''`, `'Foo'` (capital lead), `'1foo'`,
    `'foo-bar'`, `'foo bar'`, `null`, `undefined`, `42` each throw.
11. **Missing/bad descriptor throws.** `registerNamespace('myFoo', null)`,
    `registerNamespace('myFoo', {})`,
    `registerNamespace('myFoo', {description: ''})` each throw.
12. **Idempotent re-registration.** Two calls with the same description
    succeed (return the same descriptor); the namespace stays registered
    exactly once.
13. **Conflicting re-registration throws.** Same id, different description
    → throw on second call.
14. **`unregisterNamespace` returns true/false correctly.** `false` for
    never-registered; `true` for successful removal; `false` for second
    remove of the same id.
15. **`unregisterNamespace` of built-in throws.** `unregisterNamespace('synth')`
    throws.
16. **Unregister hides from search but leaves registry alone.** Register
    `myFoo`, register effect `myFoo/bar`, unregister `myFoo`. The DSL
    `search myFoo` now throws Invalid namespace; `getEffect('myFoo/bar')`
    still returns the effect.
17. **Lexer keyword sync.** Imports `RESERVED_KEYWORDS` from lexer.js and
    asserts the keyword token mapping still works (`lex('search')` → `SEARCH`,
    `lex('let')` → `LET`, etc.). Catches regressions if someone edits
    `RESERVED_KEYWORDS` carelessly.

**Test runner wiring:** extend `package.json`'s `test:shaders:lang` script
to invoke the new file:

```json
"test:shaders:lang": "node shaders/tests/test-unparser.mjs && node shaders/tests/test_parser.js && node shaders/tests/test_register_namespace.js"
```

## Migration impact

Zero observable change for existing consumers:

- `NAMESPACE_DESCRIPTIONS` keeps its export name and reads exactly as
  before. The proxy is transparent for all read patterns
  (`obj[id]`, `key in obj`, `Object.keys`, `Object.values`, `Object.entries`,
  `for..in`).
- `VALID_NAMESPACES` keeps its export name and array shape. The only
  difference is it is no longer frozen; mutations are still gated by the
  public API.
- `isValidNamespace`, `getNamespaceDescription`, `BUILTIN_NAMESPACE`,
  `IO_FUNCTIONS`, and all tag-related exports are unchanged.
- The DSL parser, grammar, and lexer behavior are unchanged. The lexer
  refactor lifts an internal const to module scope without altering tokens.
- The effect registry, `registerEffect`, `registerOp`, and effect resolution
  are unchanged.

The only theoretically-observable change: code that did
`try { NAMESPACE_DESCRIPTIONS.x = … } catch {}` to detect "frozen-ness" loses
that signal — the proxy's `set` trap still throws, but the throw type/message
may differ from the native `Object.freeze` error. No known consumers do this.

## Acceptance criteria

A consumer who does:

```js
import { registerNamespace, registerEffect, registerOp } from '<engine>'
registerNamespace('myFoo', { description: 'Foo collection' })
registerEffect('myFoo/bar',  myFooBarInstance)
registerEffect('myFoo.bar',  myFooBarInstance)
registerOp    ('myFoo.bar',  myFooBarOpSpec)
```

…can then compile and run:

```
search myFoo
bar(...).write(o0)
```

…through `compileGraph(source)` + `new Pipeline(graph, backend)` with no
vendor patches, no DSL workarounds, and no string-shape gymnastics.

All test cases above pass. The CDN-bundled exports
(`shaders.noisedeck.app/1/noisemaker-shaders-core.esm.min.js`) expose
`registerNamespace` and `unregisterNamespace` at the same names as
source-imports (satisfied transitively via `index.js`).

## Out of scope, follow-ups

- Namespace-scoped param/effect aliases (already work via `${ns}.${func}`
  keying; no change needed).
- A namespace-level discovery API beyond `Object.keys(NAMESPACE_DESCRIPTIONS)`
  (e.g. a dedicated `listNamespaces()` returning `[{id, description, builtin}]`).
- Tooling integration (effect-listing UIs, search-order generators).
- Registry-side cleanup on `unregisterNamespace`: if a future need emerges to
  drop `<ns>.<func>` registry entries on unregister, that is a follow-up;
  the current contract intentionally leaves them in place.

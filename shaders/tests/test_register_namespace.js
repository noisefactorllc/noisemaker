import { lex, RESERVED_KEYWORDS } from '../src/lang/lexer.js'
import {
    NAMESPACE_DESCRIPTIONS,
    VALID_NAMESPACES,
    isValidNamespace,
    getNamespaceDescription,
    BUILTIN_NAMESPACE,
    IO_FUNCTIONS,
    registerNamespace,
    unregisterNamespace
} from '../src/runtime/tags.js'
import { registerEffect, getEffect } from '../src/runtime/registry.js'
import { parse } from '../src/lang/parser.js'
import * as engineIndex from '../src/index.js'

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

// ---------- Task 2: tags.js Proxy refactor ----------

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

// ---------- Task 3: register/unregister happy path ----------

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

// ---------- Task 6: DSL integration + index re-export ----------

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

// ---------- Code review follow-ups: I-1, I-2, M-2 ----------

test('NAMESPACE_DESCRIPTIONS supports primitive coercion (String, template, concat)', () => {
    // Regression test for I-1: previously the Proxy's get trap returned
    // undefined for Symbol.toPrimitive/toString/valueOf, breaking String().
    let s
    s = String(NAMESPACE_DESCRIPTIONS)
    assertEquals(s, '[object Object]', 'String(NAMESPACE_DESCRIPTIONS)')
    s = `${NAMESPACE_DESCRIPTIONS}`
    assertEquals(s, '[object Object]', 'template literal')
    s = '' + NAMESPACE_DESCRIPTIONS
    assertEquals(s, '[object Object]', 'string concat')
    assertEquals(Object.prototype.toString.call(NAMESPACE_DESCRIPTIONS), '[object Object]', 'Object.prototype.toString.call')
})

test('delete on a non-registered key is a silent no-op', () => {
    // Regression test for I-2: previously deleteProperty threw on any key,
    // including non-existent ones. Object.freeze({...}) returns true silently.
    let result
    result = (delete NAMESPACE_DESCRIPTIONS.notARealKey)
    assertEquals(result, true, 'delete missing key returns true')
})

test('delete on a registered key still throws', () => {
    assertThrows(() => { delete NAMESPACE_DESCRIPTIONS.synth }, 'unregisterNamespace', 'delete built-in')
})

test("registerNamespace rejects 'null' and 'undefined' as namespace ids", () => {
    assertThrows(() => registerNamespace('null', { description: 'x' }), 'reserved', "'null'")
    assertThrows(() => registerNamespace('undefined', { description: 'x' }), 'reserved', "'undefined'")
})

if (failures > 0) {
    console.error(`\n${failures} test(s) failed`)
    process.exitCode = 1
}

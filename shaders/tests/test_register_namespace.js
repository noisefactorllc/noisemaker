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

if (failures > 0) {
    console.error(`\n${failures} test(s) failed`)
    process.exitCode = 1
}

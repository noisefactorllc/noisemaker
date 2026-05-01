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

if (failures > 0) {
    console.error(`\n${failures} test(s) failed`)
    process.exitCode = 1
}

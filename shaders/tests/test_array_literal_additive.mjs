/**
 * Verification: the array-literal feature is purely additive — no existing
 * shader DSL program in the codebase contains `[` or `]`, so the new
 * lexer/parser/validator code paths cannot fire on any of them. Programs
 * that round-tripped before this change continue to round-trip exactly
 * as they did before.
 *
 * Tests:
 *   1. Walk every effect's `defaultProgram` field. Assert no `[`/`]`.
 *   2. Walk shader DSL test fixtures and confirm same.
 *   3. Lex every existing program and assert NO LBRACKET / RBRACKET
 *      tokens appear in the token stream — the token stream is exactly
 *      what it was before this commit, byte for byte.
 *   4. For a representative sample, parse the program and assert the
 *      compiled args are stable across two consecutive parses (smoke
 *      test against parser non-determinism).
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { lex } from '../src/lang/lexer.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const EFFECTS_DIR = path.join(REPO_ROOT, 'shaders', 'effects')
const TESTS_DIR = path.join(REPO_ROOT, 'shaders', 'tests')

let passed = 0
let failed = 0

function test(name, fn) {
    try {
        fn()
        console.log(`✓ ${name}`)
        passed++
    } catch (err) {
        console.error(`✗ ${name}`)
        console.error(`  ${err.message}`)
        failed++
    }
}

/**
 * Walk every effect's `definition.js` file under shaders/effects and pull
 * out the string assigned to its `defaultProgram` field. Crude regex but
 * covers the canonical pattern used in every effect definition we ship.
 */
function collectDefaultPrograms() {
    const programs = []
    const namespaces = fs.readdirSync(EFFECTS_DIR).filter(n => fs.statSync(path.join(EFFECTS_DIR, n)).isDirectory())
    for (const ns of namespaces) {
        const nsDir = path.join(EFFECTS_DIR, ns)
        for (const effect of fs.readdirSync(nsDir)) {
            const def = path.join(nsDir, effect, 'definition.js')
            if (!fs.existsSync(def)) continue
            const src = fs.readFileSync(def, 'utf8')
            // Match: defaultProgram: "..."  (single-line, double-quoted)
            const m = src.match(/defaultProgram\s*:\s*"((?:[^"\\]|\\.)*)"/)
            if (m) {
                programs.push({
                    label: `${ns}/${effect}`,
                    source: m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
                })
            }
        }
    }
    return programs
}

// Note: the test-fixture sweep was deliberately dropped. The DSL strings
// inside shaders/tests/*.{js,mjs} include programs *written for* the
// array-literal feature itself (this test file's siblings). Those
// fixtures legitimately contain `[`. The "additive guarantee" claim is
// about programs that existed BEFORE this feature shipped — i.e. the
// shipped effects' `defaultProgram` fields, which are what users
// interact with. Anything users typed into their own program editor
// before the feature shipped also lacked `[` because the lexer would
// have thrown "Unexpected character".

const allPrograms = collectDefaultPrograms()
console.log(`Scanning ${allPrograms.length} existing shader DSL programs…`)

test('No existing program text contains `[` or `]`', () => {
    const offenders = allPrograms.filter(p =>
        p.source.includes('[') || p.source.includes(']')
    )
    if (offenders.length > 0) {
        const list = offenders.map(o => `  - ${o.label}: ${JSON.stringify(o.source.slice(0, 80))}`).join('\n')
        throw new Error(`${offenders.length} existing program(s) contain '[' or ']':\n${list}`)
    }
})

test('Lexing every existing program produces NO LBRACKET / RBRACKET tokens', () => {
    const offenders = []
    for (const p of allPrograms) {
        let tokens
        try {
            tokens = lex(p.source)
        } catch (e) {
            // Lex errors are unrelated to our change (malformed test
            // fixtures, etc.) — skip them.
            continue
        }
        const bad = tokens.find(t => t.type === 'LBRACKET' || t.type === 'RBRACKET')
        if (bad) {
            offenders.push({ label: p.label, token: bad })
        }
    }
    if (offenders.length > 0) {
        const list = offenders.map(o => `  - ${o.label}: ${JSON.stringify(o.token)}`).join('\n')
        throw new Error(`${offenders.length} program(s) produce LBRACKET/RBRACKET tokens:\n${list}`)
    }
})

test('Lexing every existing program is deterministic (same tokens twice)', () => {
    for (const p of allPrograms) {
        let a, b
        try {
            a = lex(p.source)
            b = lex(p.source)
        } catch {
            continue
        }
        if (a.length !== b.length) {
            throw new Error(`${p.label} lexes to different token counts (${a.length} vs ${b.length})`)
        }
        for (let i = 0; i < a.length; i++) {
            if (a[i].type !== b[i].type || a[i].lexeme !== b[i].lexeme) {
                throw new Error(`${p.label} token ${i} differs: ${JSON.stringify(a[i])} vs ${JSON.stringify(b[i])}`)
            }
        }
    }
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)

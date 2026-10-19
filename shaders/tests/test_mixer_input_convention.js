/**
 * Test to verify two-input mixer effects take the chain input as inputTex and
 * their second surface as tex.
 *
 * The nd mixers this test first covered were renamed into classicNoisedeck or
 * removed (73ec67c5, a4eeaa88, 9a0fe987). It now covers every current mixer
 * that declares a `tex` surface parameter, in mixer/ and classicNoisedeck/.
 */

import { existsSync, readdirSync } from 'node:fs'

const effectsRoot = new URL('../effects/', import.meta.url)
const candidates = [
    ...readdirSync(new URL('mixer/', effectsRoot)).map((name) => `mixer/${name}`),
    'classicNoisedeck/coalesce',
    'classicNoisedeck/composite',
]

const mixerEffects = []
for (const id of candidates) {
    const definitionUrl = new URL(`${id}/definition.js`, effectsRoot)
    if (!existsSync(definitionUrl)) continue
    const definition = (await import(definitionUrl.href)).default
    const effect = typeof definition === 'function' ? new definition() : definition
    if (effect.globals?.tex?.type === 'surface') mixerEffects.push({ name: id, effect })
}

function test(name, fn) {
    try {
        console.log(`Running test: ${name}`)
        fn()
        console.log(`✓ PASS: ${name}`)
        return true
    } catch (e) {
        console.error(`✗ FAIL: ${name}`)
        console.error(e)
        return false
    }
}

let passed = 0
let failed = 0


// Test each mixer effect
if (mixerEffects.length < 2) {
    console.error(`✗ FAIL: expected the current two-input mixers, found ${mixerEffects.length}`)
    failed++
}

for (const { name, effect } of mixerEffects) {
    if (test(`${name} - uses inputTex and tex with correct values`, () => {
        const firstPass = effect.passes[0]

        if (!firstPass.inputs) {
            throw new Error(`${name} doesn't have inputs`)
        }

        if (!firstPass.inputs.inputTex) {
            throw new Error(`${name} doesn't have inputTex in inputs`)
        }

        if (!firstPass.inputs.tex) {
            throw new Error(`${name} doesn't have tex in inputs`)
        }

        if (firstPass.inputs.inputTex !== "inputTex") {
            throw new Error(`${name} inputTex maps to ${firstPass.inputs.inputTex}, expected "inputTex"`)
        }

        if (firstPass.inputs.tex !== "tex") {
            throw new Error(`${name} tex maps to ${firstPass.inputs.tex}, expected "tex"`)
        }
    })) {
        passed++
    } else {
        failed++
    }
}



console.log(`\n============================================================`)
console.log(`Results: ${passed} passed, ${failed} failed (out of ${passed + failed} tests)`)
console.log(`============================================================`)

process.exit(failed > 0 ? 1 : 0)

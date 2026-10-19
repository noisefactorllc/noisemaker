/**
 * Test to verify inputTex convention is properly applied
 */

// The nd effects moved to classicNoisedeck (73ec67c5). nd/erosion-worms has no
// successor; filter/fibers covers the same case, inputTex beside another input.
import ColorLab from '../effects/classicNoisedeck/colorLab/definition.js'
import Fibers from '../effects/filter/fibers/definition.js'
import Glitch from '../effects/classicNoisedeck/glitch/definition.js'
import Refract from '../effects/classicNoisedeck/refract/definition.js'

import { existsSync, readdirSync, statSync } from 'node:fs'

// Definitions export either an Effect instance or a class.
const instantiate = (definition) => (typeof definition === 'function' ? new definition() : definition)

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

// Test 1: ColorLab effect uses inputTex
if (test("ColorLab - uses inputTex in inputs", () => {
    const colorLab = instantiate(ColorLab)
    const firstPass = colorLab.passes[0]
    if (!firstPass.inputs.inputTex) {
        throw new Error("ColorLab doesn't have inputTex in inputs")
    }
    if (firstPass.inputs.inputTex !== "inputTex") {
        throw new Error(`ColorLab inputTex maps to ${firstPass.inputs.inputTex}, expected "inputTex"`)
    }
})) {
    passed++
} else {
    failed++
}

// Test 2: Glitch effect uses inputTex
if (test("Glitch - uses inputTex in inputs", () => {
    const glitch = instantiate(Glitch)
    const firstPass = glitch.passes[0]
    if (!firstPass.inputs.inputTex) {
        throw new Error("Glitch doesn't have inputTex in inputs")
    }
    if (firstPass.inputs.inputTex !== "inputTex") {
        throw new Error(`Glitch inputTex maps to ${firstPass.inputs.inputTex}, expected "inputTex"`)
    }
})) {
    passed++
} else {
    failed++
}

// Test 3: Refract effect uses inputTex
if (test("Refract - uses inputTex in inputs", () => {
    const refract = instantiate(Refract)
    const firstPass = refract.passes[0]
    if (!firstPass.inputs.inputTex) {
        throw new Error("Refract doesn't have inputTex in inputs")
    }
    if (firstPass.inputs.inputTex !== "inputTex") {
        throw new Error(`Refract inputTex maps to ${firstPass.inputs.inputTex}, expected "inputTex"`)
    }
})) {
    passed++
} else {
    failed++
}

// Test 4: Fibers has inputTex along with other inputs
if (test("Fibers - uses inputTex with other inputs", () => {
    const fibers = instantiate(Fibers)
    const firstPass = fibers.passes[0]
    if (!firstPass.inputs.inputTex) {
        throw new Error("Fibers doesn't have inputTex in inputs")
    }
    if (firstPass.inputs.inputTex !== "inputTex") {
        throw new Error(`Fibers inputTex maps to ${firstPass.inputs.inputTex}, expected "inputTex"`)
    }
    if (!firstPass.inputs.overlayTex) {
        throw new Error("Fibers should still have overlayTex")
    }
})) {
    passed++
} else {
    failed++
}


// Test 5: every current effect whose first pass reads the chain input names it inputTex
const effectsRoot = new URL('../effects/', import.meta.url)
const chainReaders = []
for (const namespace of readdirSync(effectsRoot).filter((name) => statSync(new URL(name, effectsRoot)).isDirectory())) {
    for (const name of readdirSync(new URL(`${namespace}/`, effectsRoot))) {
        const definitionUrl = new URL(`${namespace}/${name}/definition.js`, effectsRoot)
        if (!existsSync(definitionUrl)) continue
        const effect = instantiate((await import(definitionUrl.href)).default)
        const inputs = effect.passes?.[0]?.inputs ?? {}
        const uniforms = Object.entries(inputs).filter(([, texture]) => texture === 'inputTex').map(([uniform]) => uniform)
        if (uniforms.length > 0) chainReaders.push({ id: `${namespace}/${name}`, uniforms })
    }
}
if (test(`Every effect whose first pass reads the chain input uses inputTex (${chainReaders.length} effects)`, () => {
    if (chainReaders.length < 100) {
        throw new Error(`Expected the current chain-reading effects, found ${chainReaders.length}`)
    }
    const offenders = chainReaders.filter(({ uniforms }) => !uniforms.includes('inputTex'))
    if (offenders.length > 0) {
        throw new Error(`Chain input bound under another name: ${offenders.map(({ id, uniforms }) => `${id} (${uniforms.join(', ')})`).join('; ')}`)
    }
})) {
    passed++
} else {
    failed++
}


console.log(`\n============================================================`)
console.log(`Results: ${passed} passed, ${failed} failed (out of ${passed + failed} tests)`)
console.log(`============================================================`)

process.exit(failed > 0 ? 1 : 0)

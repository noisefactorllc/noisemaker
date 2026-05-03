/**
 * Regression test: expand() must populate palette-dependent uniforms at compile
 * time so consumers that skip ProgramState (e.g. polymorphic, embeds, anyone
 * calling renderer.compile() directly) get the correct palette on the first
 * frame.
 *
 * Bug: expand() wrote the palette index uniform from step.args but never
 * called expandPalette(), leaving paletteOffset/Amp/Freq/Phase/Mode at their
 * spec defaults. The pipeline rendered the default cosine palette until
 * something else (setUniform, applyStepParameterValues, _applyToPipeline)
 * happened to expand it.
 *
 * Run:  node shaders/tests/test_expander_palette.js
 */

import {
    compile, registerEffect, registerOp, registerStarterOps,
    mergeIntoEnums, stdEnums, getEffect
} from '../src/index.js'
import { expand } from '../src/runtime/expander.js'

mergeIntoEnums(stdEnums)

let passed = 0
let failed = 0

function test(name, fn) {
    try {
        fn()
        console.log(`PASS: ${name}`)
        passed++
    } catch (err) {
        console.error(`FAIL: ${name}`)
        console.error(err)
        failed++
    }
}

function assertArrayClose(actual, expected, label, tol = 1e-6) {
    if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) {
        throw new Error(`${label}: shape mismatch — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    }
    for (let i = 0; i < expected.length; i++) {
        if (Math.abs(actual[i] - expected[i]) > tol) {
            throw new Error(`${label}[${i}]: expected ${expected[i]}, got ${actual[i]}`)
        }
    }
}

async function loadEffect(file, namespace, name) {
    const mod = await import(file)
    const def = mod.default
    const instance = (typeof def === 'function') ? new def() : def
    registerEffect(instance.func, instance)
    registerEffect(`${namespace}.${instance.func}`, instance)
    registerEffect(`${namespace}/${name}`, instance)
    registerEffect(`${namespace}.${name}`, instance)

    const args = Object.entries(instance.globals || {}).map(([key, spec]) => {
        let enumPath = spec.enum || spec.enumPath
        if (spec.choices && !enumPath) enumPath = `${namespace}.${instance.func}.${key}`
        return {
            name: key,
            type: spec.type === 'vec4' ? 'color' : spec.type,
            default: spec.default,
            enum: enumPath,
            enumPath,
            min: spec.min,
            max: spec.max,
            uniform: spec.uniform,
            choices: spec.choices
        }
    })
    registerOp(`${namespace}.${instance.func}`, { name: instance.func, args })

    const isStarter = !((instance.passes || []).some(p =>
        p.inputs && Object.values(p.inputs).some(v =>
            ['inputTex', 'inputTex3d', 'src', 'o0', 'o1'].includes(v))))
    if (isStarter) registerStarterOps([`${namespace}.${instance.func}`])
    if (instance.enums) mergeIntoEnums(instance.enums)
    if (instance.globals) {
        const choicesEnum = {}
        for (const [key, spec] of Object.entries(instance.globals)) {
            if (spec.choices) {
                const inner = {}
                for (const [n, v] of Object.entries(spec.choices)) {
                    if (n.endsWith(':')) continue
                    inner[n] = { type: 'Number', value: v }
                }
                choicesEnum[key] = inner
            }
        }
        if (Object.keys(choicesEnum).length) {
            const top = { [namespace]: { [instance.func]: choicesEnum } }
            mergeIntoEnums(top)
        }
    }
}

await loadEffect(
    new URL('../effects/classicNoisedeck/cellNoise/definition.js', import.meta.url).pathname,
    'classicNoisedeck',
    'cellNoise'
)

function buildGraph(dsl) {
    return expand(compile(dsl))
}

// ---------------------------------------------------------------------------

test('compile + expand populates palette-dependent uniforms (barstow, mode 3)', () => {
    const graph = buildGraph(
        'search classicNoisedeck, synth, filter\ncellNoise(colorMode: palette, palette: barstow).write(o0)\nrender(o0)'
    )
    const pass = graph.passes.find(p => p.effectKey === 'classicNoisedeck.cellNoise')

    assertArrayClose(pass.uniforms.paletteOffset, [0.7, 0.2, 0.2], 'paletteOffset')
    assertArrayClose(pass.uniforms.paletteAmp, [0.45, 0.2, 0.1], 'paletteAmp')
    assertArrayClose(pass.uniforms.paletteFreq, [1, 1, 1], 'paletteFreq')
    assertArrayClose(pass.uniforms.palettePhase, [0.5, 0.4, 0], 'palettePhase')
    if (pass.uniforms.paletteMode !== 3) {
        throw new Error(`paletteMode: expected 3 (rgb), got ${pass.uniforms.paletteMode}`)
    }
})

test('compile + expand populates dependent uniforms for hsv-mode palette', () => {
    // darkSatin is index 12 with mode 1 (hsv) — proves the integer-write branch
    // (paletteMode) flows through alongside the vec3 branches.
    const graph = buildGraph(
        'search classicNoisedeck, synth, filter\ncellNoise(colorMode: palette, palette: darkSatin).write(o0)\nrender(o0)'
    )
    const pass = graph.passes.find(p => p.effectKey === 'classicNoisedeck.cellNoise')
    if (pass.uniforms.paletteMode !== 1) {
        throw new Error(`paletteMode: expected 1 (hsv), got ${pass.uniforms.paletteMode}`)
    }
    assertArrayClose(pass.uniforms.paletteAmp, [0.0, 0.0, 0.51], 'paletteAmp (darkSatin)')
})

test('palette index 0 leaves dependents at spec defaults (no expansion)', () => {
    // expandPalette(0) returns null. The dependent uniforms should remain at
    // whatever the per-param loop wrote — the spec defaults for cellNoise.
    // Use the integer form because `palette: none` is a magic alias the
    // unparser-side resolves separately.
    const graph = buildGraph(
        'search classicNoisedeck, synth, filter\ncellNoise(palette: none).write(o0)\nrender(o0)'
    )
    const pass = graph.passes.find(p => p.effectKey === 'classicNoisedeck.cellNoise')
    if (pass.uniforms.palette !== 0) {
        throw new Error(`palette: expected 0, got ${pass.uniforms.palette}`)
    }
    // cellNoise spec defaults — proves we did not run expansion for index 0.
    assertArrayClose(pass.uniforms.paletteOffset, [0.5, 0.5, 0.5], 'paletteOffset (default)')
    assertArrayClose(pass.uniforms.paletteFreq, [2, 2, 2], 'paletteFreq (default)')
})

console.log()
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)

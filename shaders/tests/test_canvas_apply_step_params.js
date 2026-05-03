/**
 * Regression test for CanvasRenderer.applyStepParameterValues palette expansion.
 *
 * Bug: applyStepParameterValues was writing the per-param spec defaults for
 *      paletteOffset/Amp/Freq/Phase/Mode straight to pass.uniforms, clobbering
 *      the values that ProgramState._applyToPipeline had just expanded from the
 *      palette index. Net effect on noisedeck (and any consumer that calls
 *      applyStepParameterValues after fromDsl): initial render shows the
 *      default cosine palette; the correct palette only shows up after the
 *      next setValue call re-runs _applyToPipeline.
 *
 * Run:  node shaders/tests/test_canvas_apply_step_params.js
 */

import { CanvasRenderer } from '../src/renderer/canvas.js'
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

function buildPipeline(dsl) {
    const compiled = compile(dsl)
    const graph = expand(compiled)
    const renderer = Object.create(CanvasRenderer.prototype)
    renderer._pipeline = { graph }
    return { renderer, graph }
}

function buildStepParamsFromDefaults(effectKey, overrides = {}) {
    const def = getEffect(effectKey)
    const params = {}
    for (const [name, spec] of Object.entries(def.globals)) {
        if (spec.default !== undefined) params[name] = spec.default
    }
    return Object.assign(params, overrides)
}

// ---------------------------------------------------------------------------

test('palette index expands into amp/freq/offset/phase/mode uniforms', () => {
    const { renderer, graph } = buildPipeline(
        'search classicNoisedeck, synth, filter\ncellNoise(colorMode: palette, palette: barstow).write(o0)\nrender(o0)'
    )

    const stepParams = buildStepParamsFromDefaults('classicNoisedeck.cellNoise', {
        colorMode: 2, // palette
        palette: 4,   // barstow (1-based index)
    })
    renderer.applyStepParameterValues({ step_0: stepParams })

    const pass = graph.passes.find(p => p.effectKey === 'classicNoisedeck.cellNoise')

    assertArrayClose(pass.uniforms.paletteOffset, [0.7, 0.2, 0.2], 'paletteOffset')
    assertArrayClose(pass.uniforms.paletteAmp, [0.45, 0.2, 0.1], 'paletteAmp')
    assertArrayClose(pass.uniforms.paletteFreq, [1, 1, 1], 'paletteFreq')
    assertArrayClose(pass.uniforms.palettePhase, [0.5, 0.4, 0], 'palettePhase')
    if (pass.uniforms.paletteMode !== 3) {
        throw new Error(`paletteMode: expected 3, got ${pass.uniforms.paletteMode}`)
    }
})

test('per-param spec defaults do not clobber expansion (regression)', () => {
    // Stress: stepParams iteration order puts paletteOffset/Amp/Freq/Phase
    // BEFORE the palette param. Without expansion-after-loop, these would win.
    const { renderer, graph } = buildPipeline(
        'search classicNoisedeck, synth, filter\ncellNoise(colorMode: palette, palette: barstow).write(o0)\nrender(o0)'
    )

    const stepParams = {
        paletteOffset: [0.5, 0.5, 0.5],
        paletteAmp: [0.5, 0.5, 0.5],
        paletteFreq: [2, 2, 2],
        palettePhase: [1, 1, 1],
        colorMode: 2,
        palette: 4,
    }
    renderer.applyStepParameterValues({ step_0: stepParams })

    const pass = graph.passes.find(p => p.effectKey === 'classicNoisedeck.cellNoise')
    assertArrayClose(pass.uniforms.paletteOffset, [0.7, 0.2, 0.2], 'paletteOffset (after defaults)')
    assertArrayClose(pass.uniforms.paletteAmp, [0.45, 0.2, 0.1], 'paletteAmp (after defaults)')
})

console.log()
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)

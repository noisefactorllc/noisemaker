import assert from 'node:assert/strict'
import test from 'node:test'
import { CanvasRenderer, compile, registerStarterOps, predictReplacement, replaceEffect, listSteps } from '../src/index.js'
import { ops } from '../src/lang/ops.js'
import noise from '../effects/synth/noise/definition.js'
import blendMode from '../effects/mixer/blendMode/definition.js'

const renderer = new CanvasRenderer()
renderer.registerEffectWithRuntime({ namespace: 'synth', name: 'Noise', instance: noise })
renderer.registerEffectWithRuntime({ namespace: 'mixer', name: 'BlendMode', instance: blendMode })
registerStarterOps(['synth.noise'])

test('retired parameter names fail validation while canonical names compile', () => {
    const retired = compile('search synth\nnoise(xScale: 4).write(o0)')
    assert.ok(retired.diagnostics.some(d => d.code === 'S001' && d.message.includes("Unknown argument 'xScale'")),
        JSON.stringify(retired.diagnostics))
    assert.ok(!retired.diagnostics.some(d => d.code === 'S007'))

    const canonical = compile('search synth\nnoise(scaleX: 4).write(o0)')
    assert.ok(!canonical.diagnostics.some(d => d.severity === 'error'), JSON.stringify(canonical.diagnostics))
    assert.equal(canonical.plans[0].chain[0].args.scaleX, 4)
})

test('retired mixer parameter names fail validation while canonical names compile', () => {
    const retired = compile('search synth, mixer\nnoise().write(o0)\nread(o0).blendMode(mixAmt: 4).write(o1)')
    assert.ok(retired.diagnostics.some(d => d.code === 'S001' && d.message.includes("Unknown argument 'mixAmt'")),
        JSON.stringify(retired.diagnostics))
    assert.ok(!retired.diagnostics.some(d => d.code === 'S007'))

    const canonical = compile('search synth, mixer\nnoise().write(o0)\nread(o0).blendMode(mix: 4).write(o1)')
    assert.ok(!canonical.diagnostics.some(d => d.severity === 'error'), JSON.stringify(canonical.diagnostics))
    assert.equal(canonical.plans[1].chain[1].args.mix, 4)
})

test('replacement preflight reports retired names as unknown', () => {
    const spec = ops['synth.noise']
    const retired = predictReplacement('synth.noise', spec, { xScale: 4 }, null, { preflight: true })
    assert.deepEqual(retired.arguments.unknown, ['xScale'])
    const canonical = predictReplacement('synth.noise', spec, { scaleX: 4 }, null, { preflight: true })
    assert.deepEqual(canonical.arguments.unknown, [])
})

test('replacement preflight rejects retired names and accepts canonical names', () => {
    const compiled = compile('search synth\nnoise().write(o0)')
    const stepIndex = listSteps(compiled)[0].stepIndex
    const retired = replaceEffect(compiled, stepIndex, 'noise', { xScale: 4 }, { preflight: true })
    assert.equal(retired.success, false)
    assert.match(retired.error, /Unknown argument\(s\).*xScale/)
    assert.equal(retired.program, undefined)

    const canonical = replaceEffect(compiled, stepIndex, 'noise', { scaleX: 4 }, { preflight: true })
    assert.equal(canonical.success, true)
    assert.equal(canonical.program.plans[0].chain[0].args.scaleX, 4)
})

test('portable effects reject parameter alias metadata', async () => {
    const raw = {
        namespace: 'user', name: 'retiredAliasProbe', func: 'retiredAliasProbe',
        globals: { scaleX: { type: 'float', default: 1 } },
        paramAliases: { xScale: 'scaleX' },
        passes: [{ name: 'main', program: 'main', inputs: {}, outputs: { fragColor: 'outputTex' } }],
        shaders: { main: { glsl: '#version 300 es\nvoid main() {}' } }
    }
    await assert.rejects(() => new CanvasRenderer().registerPortableEffect(raw), /paramAliases/)
})

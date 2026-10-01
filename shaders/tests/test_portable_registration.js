import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CanvasRenderer, Effect, compile, getEffect, registerEffect, mergeIntoEnums } from '../src/index.js'
import { expand } from '../src/runtime/expander.js'
import { isStarterOp } from '../src/lang/validator.js'

function definition(func, overrides = {}) {
    return {
        namespace: 'user', name: func, func,
        globals: {},
        passes: [{ name: 'main', program: 'main', inputs: {}, outputs: { fragColor: 'outputTex' } }],
        shaders: { main: { glsl: '#version 300 es\nvoid main() {}' } },
        ...overrides
    }
}

test('Portable registration preserves the Effect lifecycle and render definition', async () => {
    const renderer = new CanvasRenderer()
    const raw = definition('portableContract', {
        textures: { history: { width: 32, height: 32, format: 'rgba16f' } },
        outputTex3d: { width: 8, height: 8, depth: 8 },
        outputGeo: { count: 16 },
        uniformLayout: { time: 'float' }, uniformLayouts: { main: { time: 'float' } },
        passes: [{ name: 'main', program: 'main', type: 'compute', drawMode: 'points', count: 16,
            inputs: { previous: 'history' }, outputs: { fragColor: 'outputTex' } }],
        defaultProgram: 'search user\nportableContract().write(o0)\nrender(o0)'
    })
    const effect = await renderer.registerPortableEffect(raw)
    assert.ok(effect.instance instanceof Effect)
    assert.equal(effect.instance.asyncInit, Effect.prototype.asyncInit)
    assert.equal(getEffect('user.portableContract'), effect.instance)
    assert.equal(getEffect('user/portableContract'), effect.instance)
    assert.equal(getEffect('portableContract'), undefined)
    assert.equal(await renderer.loadEffect('user/portableContract'), effect)
    for (const key of ['shaders', 'textures', 'outputTex3d', 'outputGeo', 'uniformLayout', 'uniformLayouts', 'passes', 'defaultProgram']) {
        assert.deepEqual(effect.instance[key], raw[key], key)
    }
})

test('Portable aliases, choice names and explicit enum paths compile to shader uniforms', async () => {
    await mergeIntoEnums({ portableExplicit: { Keep: { type: 'Number', value: 7 } } })
    const renderer = new CanvasRenderer()
    await renderer.registerPortableEffect(definition('portableParams', {
        globals: {
            mode: { type: 'int', default: 0, uniform: 'modeUniform', choices: { 'Modes:': -1, 'Soft Light': 3 } },
            pinned: { type: 'int', default: 0, uniform: 'pinnedUniform', enumPath: 'portableExplicit', choices: { Keep: 99 } },
            primary: { type: 'int', default: 0, uniform: 'primaryUniform', enum: 'portableExplicit', enumPath: 'missing', choices: { Keep: 99 } }
        },
        paramAliases: { oldMode: 'mode' }
    }))
    const compiled = compile('search user\nportableParams(oldMode: SoftLight, pinned: Keep, primary: Keep).write(o0)\nrender(o0)')
    const graph = expand(compiled)
    const pass = graph.passes.find(p => p.effectKey === 'user.portableParams')
    assert.ok(pass, JSON.stringify(compiled.diagnostics))
    assert.equal(pass.uniforms.modeUniform, 3)
    assert.equal(pass.uniforms.pinnedUniform, 7)
    assert.equal(pass.uniforms.primaryUniform, 7)
    assert.equal(renderer.resolveEnumValue('user.portableParams.mode.SoftLight'), 3)
})

test('Portable starter inference covers every pipeline input and honors explicit overrides', async () => {
    const renderer = new CanvasRenderer()
    const bindings = ['inputTex', 'inputTex3d', 'inputGeo', 'inputXyz', 'inputVel', 'inputRgba', 'src', 'o0', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7']
    for (const [index, binding] of bindings.entries()) {
        const func = `portableInput${index}`
        await renderer.registerPortableEffect(definition(func, {
            passes: [{ program: 'main', inputs: { source: binding }, outputs: { fragColor: 'outputTex' } }]
        }))
        assert.equal(isStarterOp(`user.${func}`), false, binding)
    }
    await renderer.registerPortableEffect(definition('portableExplicitFilter', { starter: false }))
    assert.equal(isStarterOp('user.portableExplicitFilter'), false)
    await renderer.registerPortableEffect(definition('portableExplicitStarter', {
        starter: true, passes: [{ program: 'main', inputs: { source: 'inputTex' } }]
    }))
    assert.equal(isStarterOp('user.portableExplicitStarter'), true)
    await renderer.registerPortableEffect(definition('portableInferredStarter'))
    assert.equal(isStarterOp('user.portableInferredStarter'), true)
    assert.equal(isStarterOp('portableInferredStarter'), false)
})

test('Invalid Portable packages fail before registration and leave a valid name available', async () => {
    const renderer = new CanvasRenderer()
    const invalid = [null, [], definition('bad-name'), definition('portableInvalid', { namespace: 'synth' }),
        definition('portableInvalid', { passes: [] }), definition('portableInvalid', { passes: [null] }),
        definition('portableInvalid', { passes: [{ program: 'main', inputs: { src: 42 } }] }),
        definition('portableInvalid', { passes: [{ program: 'main', outputs: null }] }),
        definition('portableInvalid', { passes: [{ program: 'main', outputs: { color: '' } }] }),
        definition('portableInvalid', { shaders: {} }), definition('portableInvalid', { shaders: { main: { glsl: ' ' } } }),
        definition('portableInvalid', { passes: [{ program: 'a' }, { program: 'b' }],
            shaders: { a: { glsl: 'source' }, b: { wgsl: 'source' } } }),
        definition('portableInvalid', { globals: { amount: null } }), definition('portableInvalid', { starter: 'false' })]
    invalid.push(definition('portableInvalid', { paramAliases: 'bad' }),
        definition('portableInvalid', { paramAliases: { old: 42 } }),
        definition('portableInvalid', { paramAliases: { old: 'absent' } }),
        definition('portableInvalid', { globals: { mode: { type: 'int', choices: 'abc' } } }),
        definition('portableInvalid', { globals: { mode: { type: 'int', choices: { Broken: {} } } } }))
    for (const raw of invalid) {
        await assert.rejects(() => renderer.registerPortableEffect(raw), /Portable/)
        assert.equal(getEffect('user.portableInvalid'), undefined)
        assert.equal(renderer.loadedEffects.size, 0)
    }
    await renderer.registerPortableEffect(definition('portableInvalid'))
    assert.ok(getEffect('user.portableInvalid') instanceof Effect)
})

test('A name-only Portable effect preserves an existing bare built-in name', async () => {
    const prior = new Effect({ namespace: 'synth', func: 'portableNameOnly' })
    registerEffect('portableNameOnly', prior)
    const renderer = new CanvasRenderer()
    const raw = definition('portableNameOnly')
    delete raw.func
    const effect = await renderer.registerPortableEffect(raw)
    assert.equal(getEffect('portableNameOnly'), prior)
    assert.equal(getEffect('user.portableNameOnly'), effect.instance)
    assert.equal(effect.instance.func, 'portableNameOnly')
    assert.equal(isStarterOp('user.portableNameOnly'), true)
})

test('Duplicate Portable names cannot replace an accepted effect in the same realm', async () => {
    const renderer = new CanvasRenderer()
    const first = await renderer.registerPortableEffect(definition('portableDuplicate'))
    const secondRenderer = new CanvasRenderer()
    await assert.rejects(() => secondRenderer.registerPortableEffect(definition('portableDuplicate', { starter: false })), /already registered/)
    assert.equal(getEffect('user.portableDuplicate'), first.instance)
    assert.equal(isStarterOp('user.portableDuplicate'), true)
    assert.equal(secondRenderer.loadedEffects.size, 0)
})

test('Portable names and metadata cannot write through object prototypes', async () => {
    const renderer = new CanvasRenderer()
    const choices = { mode: { type: 'int', default: 0, choices: { Choice: 1 } } }
    for (const name of ['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty']) {
        const invalid = [
            definition(name, { globals: choices }),
            definition('portableReserved', { globals: { [name]: choices.mode } }),
            definition('portableReserved', { globals: { mode: { ...choices.mode, choices: { [name]: 1 } } } })
        ]
        for (const raw of invalid) {
            await assert.rejects(() => renderer.registerPortableEffect(raw), /Portable.*reserved/)
            assert.equal(getEffect('user.portableReserved'), undefined)
            assert.equal(renderer.loadedEffects.size, 0)
            assert.equal(Object.hasOwn(Object.prototype, 'mode'), false)
        }
    }
})

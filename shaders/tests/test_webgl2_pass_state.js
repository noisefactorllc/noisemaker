/**
 * WebGL2 backend: the pass fields that only a scene pass may set.
 *
 * In 1.x the WebGL2 backend does not read a pass's `clear` or `cullMode`: it
 * culls the back faces of every triangle pass and clears depth before each.
 * A pass of an effect definition keeps that behaviour. A pass of the scene
 * renderer, whose frame state carries `scenePasses`, has the fields applied.
 */

import assert from 'assert'
import { WebGL2Backend } from '../src/runtime/backends/webgl2.js'

/**
 * Stub WebGL2 context. It records every method call, answers success for
 * compile and link queries, and gives each constant a stable number.
 */
function createRecordingGL() {
    const calls = []
    const cache = new Map()
    let nextConst = 1

    const gl = new Proxy({}, {
        get(_target, prop) {
            if (cache.has(prop)) return cache.get(prop)

            let value
            if (prop === 'NO_ERROR') {
                value = 0
            } else if (prop === 'getShaderParameter') {
                value = () => true
            } else if (prop === 'getProgramParameter') {
                value = (_program, pname) => (pname === cache.get('LINK_STATUS') ? true : 0)
            } else if (prop === 'getAttribLocation' || prop === 'getUniformLocation') {
                value = () => -1
            } else if (prop === 'checkFramebufferStatus') {
                value = () => gl.FRAMEBUFFER_COMPLETE
            } else if (prop === 'getError') {
                value = () => 0
            } else if (prop === 'createProgram' || prop === 'createShader' ||
                prop === 'createBuffer' || prop === 'createVertexArray') {
                value = () => ({})
            } else if (prop === 'canvas') {
                value = null
            } else if (prop === 'drawingBufferWidth' || prop === 'drawingBufferHeight') {
                value = 8
            } else if (typeof prop === 'string' && /^[A-Z][A-Z0-9_]*$/.test(prop)) {
                value = nextConst++
            } else {
                value = (...args) => { calls.push([prop, ...args]) }
            }

            cache.set(prop, value)
            return value
        }
    })

    void gl.LINK_STATUS
    return { gl, calls }
}

/** The calls `executePass` makes for one pass, up to and including its draw. */
async function callsOf(pass, state) {
    const { gl, calls } = createRecordingGL()
    const backend = new WebGL2Backend(gl, null)
    await backend.compileProgram('prog0', { source: 'void main() {}' })
    calls.length = 0
    backend.executePass({ id: 'p0', program: 'prog0', outputs: { color: 'screen' }, ...pass }, state)
    const draw = calls.findIndex(([name]) => name === 'drawArrays')
    assert.ok(draw >= 0, 'precondition: the pass draws')
    return { gl, calls: calls.slice(0, draw + 1) }
}

const has = (calls, name, ...args) =>
    calls.some(call => call[0] === name && args.every((arg, i) => call[i + 1] === arg))

const EFFECT_STATE = { globalUniforms: {}, surfaces: {} }
const SCENE_STATE = { ...EFFECT_STATE, scenePasses: true }

const tests = []
const test = (name, fn) => tests.push({ name, fn })

test('a pass of an effect definition that sets clear does not clear its colour target', async () => {
    const { gl, calls } = await callsOf({ clear: true }, EFFECT_STATE)
    assert.ok(!has(calls, 'clear', gl.COLOR_BUFFER_BIT), 'as in 1.x, WebGL2 does not read `clear` for this pass')
})

test('a scene pass that sets clear clears its colour target', async () => {
    const { gl, calls } = await callsOf({ clear: true }, SCENE_STATE)
    assert.ok(has(calls, 'clearColor', 0, 0, 0, 0))
    assert.ok(has(calls, 'clear', gl.COLOR_BUFFER_BIT))
})

test('a scene pass that does not set clear keeps its colour target', async () => {
    const { gl, calls } = await callsOf({}, SCENE_STATE)
    assert.ok(!has(calls, 'clear', gl.COLOR_BUFFER_BIT))
})

const TRIANGLES = { drawMode: 'triangles', count: 3 }

test('a triangle pass of an effect definition culls back faces whatever its cullMode', async () => {
    for (const cullMode of ['none', 'front', 'back', undefined]) {
        const { gl, calls } = await callsOf({ ...TRIANGLES, cullMode }, EFFECT_STATE)
        assert.ok(has(calls, 'enable', gl.CULL_FACE), `cullMode ${cullMode}: culling stays on`)
        assert.ok(!has(calls, 'disable', gl.CULL_FACE), `cullMode ${cullMode}: culling is not turned off`)
        assert.ok(has(calls, 'cullFace', gl.BACK), `cullMode ${cullMode}: back faces are culled`)
        assert.ok(!has(calls, 'cullFace', gl.FRONT), `cullMode ${cullMode}: front faces are drawn`)
    }
})

test('a triangle pass of an effect definition clears depth whatever its clear', async () => {
    for (const clear of [false, true, undefined]) {
        const { gl, calls } = await callsOf({ ...TRIANGLES, clear }, EFFECT_STATE)
        assert.ok(has(calls, 'clear', gl.DEPTH_BUFFER_BIT), `clear ${clear}: depth is cleared`)
    }
})

test('a scene triangle pass has its cullMode applied', async () => {
    const none = await callsOf({ ...TRIANGLES, cullMode: 'none' }, SCENE_STATE)
    assert.ok(has(none.calls, 'disable', none.gl.CULL_FACE))
    assert.ok(!has(none.calls, 'enable', none.gl.CULL_FACE))

    const front = await callsOf({ ...TRIANGLES, cullMode: 'front' }, SCENE_STATE)
    assert.ok(has(front.calls, 'enable', front.gl.CULL_FACE))
    assert.ok(has(front.calls, 'cullFace', front.gl.FRONT))

    const back = await callsOf({ ...TRIANGLES, cullMode: 'back' }, SCENE_STATE)
    assert.ok(has(back.calls, 'enable', back.gl.CULL_FACE))
    assert.ok(has(back.calls, 'cullFace', back.gl.BACK))
})

test('a scene triangle pass keeps depth only when it sets clear to false', async () => {
    const kept = await callsOf({ ...TRIANGLES, cullMode: 'back', clear: false }, SCENE_STATE)
    assert.ok(!has(kept.calls, 'clear', kept.gl.DEPTH_BUFFER_BIT))

    for (const clear of [true, undefined]) {
        const { gl, calls } = await callsOf({ ...TRIANGLES, cullMode: 'back', clear }, SCENE_STATE)
        assert.ok(has(calls, 'clear', gl.DEPTH_BUFFER_BIT), `clear ${clear}: depth is cleared`)
    }
})

let failed = 0
for (const { name, fn } of tests) {
    try {
        await fn()
        console.log(`PASS: ${name}`)
    } catch (err) {
        failed++
        console.error(`FAIL: ${name}`)
        console.error(err)
    }
}
if (failed > 0) process.exit(1)
console.log(`All ${tests.length} WebGL2 pass state tests passed`)

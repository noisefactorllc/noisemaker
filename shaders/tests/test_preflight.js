/**
 * Regression test for effect preflight.
 *
 * preflightEffect(definition, capabilities, shaders) statically reports,
 * before any pipeline initialization or compilation:
 *   1. per-backend authorability — WebGL2 needs a GLSL source
 *      (spec.source/glsl/fragment), WebGPU needs WGSL (spec.wgsl or a
 *      non-GLSL source/fragment); a program missing its backend's source
 *      makes that backend not authorable;
 *   2. how device limits change texture formats — MRT attachments that
 *      exceed maxColorBytesPerSample are predicted to be demoted from
 *      rgba32f to rgba16f exactly as Pipeline.applyMrtFormatBudget() does,
 *      and texture dimensions past maxTextureSize are reported as clamps;
 *   3. MRT passes writing more color attachments than maxDrawBuffers make
 *      both backends not renderable.
 *
 * Without shader information the source checks are skipped (unknown), so
 * preflight stays a structural/limit report — it never fabricates a verdict.
 *
 * Run:  node shaders/tests/test_preflight.js
 */

import { preflightEffect, mrtFormatBytes } from '../src/runtime/preflight.js'
import { Pipeline } from '../src/runtime/pipeline.js'

let passed = 0
let failed = 0

async function test(name, fn) {
    try {
        await fn()
        console.log(`PASS: ${name}`)
        passed++
    } catch (err) {
        console.error(`FAIL: ${name}`)
        console.error(err)
        failed++
    }
}

const assert = {
    equal(actual, expected, msg) {
        if (actual !== expected) {
            throw new Error(`${msg || 'assert.equal'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
        }
    },
    deepEqual(actual, expected, msg) {
        const a = JSON.stringify(actual)
        const b = JSON.stringify(expected)
        if (a !== b) throw new Error(`${msg || 'assert.deepEqual'}: expected ${b}, got ${a}`)
    },
    ok(value, msg) {
        if (!value) throw new Error(msg || 'assert.ok: value is falsy')
    }
}

// ---------------------------------------------------------------------------

await test('programs with only GLSL are webgl2-authorable, not webgpu-authorable', () => {
    const report = preflightEffect(
        { passes: [{ name: 'draw', program: 'p' }] },
        {},
        { p: { fragment: '#version 300 es\nvoid main() {}' } }
    )
    assert.equal(report.backends.webgl2.authorable, true, 'webgl2')
    assert.equal(report.backends.webgpu.authorable, false, 'webgpu')
    assert.equal(report.backends.webgpu.reasons.length, 1, 'one webgpu reason')
    assert.ok(report.backends.webgpu.reasons[0].includes('p'), 'reason names the program')
})

await test('programs with only WGSL are webgpu-authorable, not webgl2-authorable', () => {
    const report = preflightEffect(
        { passes: [{ program: 'p' }] },
        {},
        { p: { wgsl: '@fragment fn main() {}' } }
    )
    assert.equal(report.backends.webgl2.authorable, false, 'webgl2')
    assert.equal(report.backends.webgpu.authorable, true, 'webgpu')
})

await test('a program with both sources is authorable on both backends', () => {
    const report = preflightEffect(
        { passes: [{ program: 'p' }] },
        {},
        { p: { glsl: 'void main() {}', wgsl: '@fragment fn f() {}' } }
    )
    assert.equal(report.backends.webgl2.authorable, true, 'webgl2')
    assert.equal(report.backends.webgpu.authorable, true, 'webgpu')
})

await test('non-GLSL generic source/fragment counts as WGSL for WebGPU', () => {
    const report = preflightEffect(
        { passes: [{ program: 'p' }] },
        {},
        { p: { source: '@compute @workgroup_size(8) fn c() {}' } }
    )
    assert.equal(report.backends.webgpu.authorable, true, 'webgpu')
    assert.equal(report.backends.webgl2.authorable, false, 'webgl2')
})

await test('a vertex shader alone is not a WebGL2 program source', () => {
    // WebGL2 compileProgram() reads source, then glsl, then fragment, and
    // throws ERR_SHADER_MISSING when none is present.
    const report = preflightEffect(
        { passes: [{ program: 'p' }] },
        {},
        { p: { vertex: '#version 300 es\nvoid main() {}', wgsl: '@fragment fn f() {}' } }
    )
    assert.equal(report.backends.webgl2.authorable, false, 'webgl2')
    assert.equal(report.backends.webgpu.authorable, true, 'webgpu')
})

await test('a GLSL generic source beside WGSL is authorable on both backends', () => {
    // WebGL2 selects source first; WebGPU selects wgsl first.
    const report = preflightEffect(
        { passes: [{ program: 'p' }] },
        {},
        { p: { source: '#version 300 es\nvoid main() {}', wgsl: '@fragment fn f() {}' } }
    )
    assert.equal(report.backends.webgl2.authorable, true, 'webgl2')
    assert.equal(report.backends.webgpu.authorable, true, 'webgpu')
})

await test('without shader info, source availability is not judged', () => {
    const report = preflightEffect({ passes: [{ program: 'p' }] }, {})
    assert.equal(report.backends.webgl2.authorable, true, 'webgl2')
    assert.equal(report.backends.webgpu.authorable, true, 'webgpu')
    assert.deepEqual(report.backends.webgl2.reasons, [])
    assert.deepEqual(report.backends.webgpu.reasons, [])
})

await test('MRT outputs past maxDrawBuffers make both backends not renderable', () => {
    const report = preflightEffect(
        {
            passes: [{
                program: 'p',
                outputs: { a: 't1', b: 't2', c: 't3' }
            }]
        },
        { maxDrawBuffers: 2 }
    )
    assert.equal(report.backends.webgl2.authorable, false, 'webgl2')
    assert.equal(report.backends.webgpu.authorable, false, 'webgpu')
    assert.ok(report.backends.webgl2.reasons[0].includes('3 color attachments'), 'reason mentions count')
})

await test('over-budget MRT predicts the trailing rgba32f -> rgba16f demotion', () => {
    const textures = {
        xyz: { format: 'rgba32f' },
        vel: { format: 'rgba32f' },
        rgba: { format: 'rgba8' }
    }
    const report = preflightEffect(
        {
            passes: [{
                name: 'emit',
                program: 'p',
                outputs: { pos: 'xyz', vel: 'vel', col: 'rgba' }
            }],
            textures
        },
        { maxColorBytesPerSample: 32 }
    )
    assert.deepEqual(report.formatChanges, [{
        texture: 'vel',
        pass: 'emit',
        from: 'rgba32f',
        to: 'rgba16f',
        budget: 32
    }])
    // And the runtime demotion actually produces the predicted formats.
    assert.equal(mrtFormatBytes('rgba32f'), 16)
    assert.equal(mrtFormatBytes('rgba16f'), 8)
    assert.equal(mrtFormatBytes('rgba8'), 4)
    assert.equal(mrtFormatBytes(undefined), 8)
    // Single-channel formats cost their own size, in both spellings.
    for (const [formats, bytes] of [[['r32f', 'r32float'], 4], [['r16f', 'r16float'], 2], [['r8', 'r8unorm'], 1]]) {
        for (const format of formats) assert.equal(mrtFormatBytes(format), bytes, format)
    }
})

await test('within-budget MRT predicts no format changes', () => {
    const report = preflightEffect(
        {
            passes: [{ program: 'p', outputs: { a: 't1', b: 't2' } }],
            textures: { t1: { format: 'rgba32f' }, t2: { format: 'rgba16f' } }
        },
        { maxColorBytesPerSample: 32 }
    )
    assert.deepEqual(report.formatChanges, [])
})

await test('dimensions past maxTextureSize are reported as clamps', () => {
    const report = preflightEffect(
        { passes: [] },
        { maxTextureSize: 4096 },
        undefined
    )
    // definition-level textures
    const report2 = preflightEffect(
        {
            passes: [],
            textures: {
                big: { width: 8192, height: 4096 },
                ok: { width: 1024, height: 1024 },
                vol: { width: 8192, height: 8192, depth: 8192, is3D: true }
            }
        },
        { maxTextureSize: 4096 }
    )
    assert.deepEqual(report.clamps, [])
    assert.deepEqual(report2.clamps, [
        { texture: 'big', field: 'width', requested: 8192, limit: 4096 },
        { texture: 'vol', field: 'width', requested: 8192, limit: 4096 },
        { texture: 'vol', field: 'height', requested: 8192, limit: 4096 },
        { texture: 'vol', field: 'depth', requested: 8192, limit: 4096 }
    ])
})

await test('preflight never mutates the definition', () => {
    const definition = {
        passes: [{ program: 'p', outputs: { a: 't1', b: 't2' } }],
        textures: { t1: { format: 'rgba32f' }, t2: { format: 'rgba32f' } }
    }
    const snapshot = JSON.stringify(definition)
    preflightEffect(definition, { maxColorBytesPerSample: 32 }, {})
    assert.equal(JSON.stringify(definition), snapshot, 'definition unchanged')
})

await test('malformed input is reported, not thrown', () => {
    for (const bad of [null, undefined, 42, 'x']) {
        const report = preflightEffect(bad, {})
        assert.deepEqual(report.formatChanges, [])
        assert.deepEqual(report.clamps, [])
        assert.equal(report.backends.webgl2.authorable, true)
    }
})

class StubBackend {
    constructor(capabilities) {
        this.textures = new Map()
        if (capabilities) this.capabilities = capabilities
    }
    createTexture(id, spec) { this.textures.set(id, { width: spec.width, height: spec.height, format: spec.format }) }
    destroyTexture(id) { this.textures.delete(id) }
}

await test('Pipeline.preflight() matches applyMrtFormatBudget() demotion', async () => {
    const textures = new Map([
        ['global_xyz', { format: 'rgba32f' }],
        ['global_vel', { format: 'rgba32f' }],
        ['global_rgba', { format: 'rgba8' }],
        ['o0', { format: 'rgba16f' }]
    ])
    const graph = {
        passes: [{
            id: 'emit',
            name: 'emit',
            program: 'emitProgram',
            outputs: { pos: 'global_xyz', vel: 'global_vel', col: 'global_rgba' }
        }],
        textures
    }
    const caps = { maxColorBytesPerSample: 32, maxTextureSize: 8192, maxDrawBuffers: 8 }
    const pipeline = new Pipeline(graph, new StubBackend(caps))
    pipeline.width = 256
    pipeline.height = 256

    const report = pipeline.preflight()
    assert.equal(report.backends.webgl2.authorable, true, 'webgl2 authorable')
    assert.equal(report.backends.webgpu.authorable, true, 'webgpu authorable')
    const demoted = report.formatChanges.filter(c => c.from === 'rgba32f' && c.to === 'rgba16f')
    assert.ok(demoted.length >= 1, 'predicted at least one rgba16f demotion')

    // Runtime must agree: after applyMrtFormatBudget the demoted textures match.
    pipeline.createSurfaces()
    for (const change of demoted) {
        const spec = graph.textures.get(change.texture)
        assert.equal(spec.format, 'rgba16f', `texture ${change.texture} actually demoted`)
    }
})

await test('Pipeline.preflight() without shader specs skips source judgments', () => {
    const graph = { passes: [{ program: 'p', outputs: { a: 't1' } }], textures: new Map([['t1', { format: 'rgba16f' }]]) }
    const pipeline = new Pipeline(graph, new StubBackend({ maxTextureSize: 4096 }))
    const report = pipeline.preflight()
    assert.equal(report.backends.webgl2.authorable, true)
    assert.equal(report.backends.webgpu.authorable, true)
})

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)

/**
 * Regression tests for the uncopied pass-field propagation (GAP-005).
 *
 * The register row describes five pass fields that `expand()` dropped from the
 * constructed pass object:
 *   - `name` and `type`: queryable pass labels (backend shader-kind dispatch
 *     stays source-derived);
 *   - `viewport`: per-pass viewport spec (numbers or dimension expressions),
 *     resolved to backend {x, y, w, h} numbers at execution time;
 *   - `clear`: per-pass clear flag consumed by the WebGPU render-pass loadOp;
 *   - `samplerTypes`: per-binding sampler selection consumed by the WebGPU
 *     backend.
 *
 * All paths go through public entry points: `compileGraph()` (expansion) and
 * the `Pipeline` class with a recording backend that captures every pass
 * handed to `executePass()`.
 *
 * Run:  node shaders/tests/test_pass_fields.js
 */

import assert from 'node:assert/strict'
import { compileGraph } from '../src/runtime/compiler.js'
import { Pipeline } from '../src/runtime/pipeline.js'
import { Backend } from '../src/runtime/backend.js'
import { Effect } from '../src/runtime/effect.js'
import {
    registerEffect, registerOp, registerStarterOps
} from '../src/index.js'

let passed = 0
let failed = 0

async function test(name, fn) {
    try {
        await fn()
        console.log(`PASS: ${name}`)
        passed++
    } catch (e) {
        console.error(`FAIL: ${name}`)
        console.error(e && e.message ? e.message : e)
        failed++
    }
}

// ---------------------------------------------------------------------------
// Probe effects
// ---------------------------------------------------------------------------

const fieldProbeDef = {
    name: 'Pass Field Probe',
    namespace: 'synth',
    func: 'passFieldProbe',
    description: 'Pass-field propagation probe used by tests',
    tags: ['noise', 'util'],
    globals: {
        vol: {
            type: 'int', default: 16, min: 1, max: 64, uniform: 'vol',
            ui: { label: 'vol', control: 'slider' }
        }
    },
    textures: {
        acc: { width: 64, height: 64, format: 'rgba16f' }
    },
    shaders: {
        probe: {
            fragment: `#version 300 es
precision highp float;
out vec4 fragColor;
void main() { fragColor = vec4(0.0); }`,
            wgsl: `@fragment
fn main() -> @location(0) vec4<f32> {
    return vec4f(0.0);
}`,
            fragmentEntryPoint: 'main'
        }
    },
    passes: [
        {
            name: 'probePass',
            program: 'probe',
            type: 'compute',
            clear: true,
            samplerTypes: { src: 'nearest' },
            viewport: { x: 2, y: 4, width: { param: 'vol', default: 16 }, height: 64 },
            inputs: {},
            outputs: { color: 'acc' }
        }
    ]
}

const plainProbeDef = {
    name: 'Plain Pass Probe',
    namespace: 'synth',
    func: 'plainPassProbe',
    description: 'Default pass probe used by tests',
    tags: ['noise', 'util'],
    textures: {
        scratch: { width: 32, height: 32, format: 'rgba16f' }
    },
    shaders: {
        probe: {
            fragment: `#version 300 es
precision highp float;
out vec4 fragColor;
void main() { fragColor = vec4(0.0); }`,
            wgsl: `@fragment
fn main() -> @location(0) vec4<f32> {
    return vec4f(0.0);
}`,
            fragmentEntryPoint: 'main'
        }
    },
    passes: [
        { program: 'probe', inputs: {}, outputs: { color: 'scratch' } }
    ]
}

for (const def of [fieldProbeDef, plainProbeDef]) {
    const instance = new Effect(def)
    // Effect's config constructor copies neither `shaders` nor `textures3d`;
    // tests set them as instance fields exactly like shipped class effects.
    if (def.shaders) instance.shaders = def.shaders
    if (def.textures3d) instance.textures3d = def.textures3d
    registerEffect(instance.func, instance)
    registerEffect(`synth.${instance.func}`, instance)
    registerOp(`synth.${instance.func}`, {
        name: instance.func,
        args: Object.entries(instance.globals || {}).map(([key, spec]) => ({
            name: key,
            type: spec.type,
            default: spec.default
        }))
    })
    const isStarter = !((instance.passes || []).some(p =>
        p.inputs && Object.values(p.inputs).some(v =>
            ['inputTex', 'inputTex3d', 'src', 'o0', 'o1'].includes(v))))
    if (isStarter) registerStarterOps([`synth.${instance.func}`])
}

// ---------------------------------------------------------------------------
// Part 1: expansion — authored pass fields are copied into expanded passes
// ---------------------------------------------------------------------------

await test('expand() copies name/type/clear/samplerTypes/viewport into the expanded pass', () => {
    const graph = compileGraph('search synth\npassFieldProbe().write(o0)\nrender(o0)')
    const probePass = graph.passes.find(p => p.effectFunc === 'passFieldProbe')
    assert.ok(probePass, 'expanded graph must contain the probe pass')
    assert.equal(probePass.name, 'probePass')
    assert.equal(probePass.type, 'compute')
    assert.equal(probePass.clear, true)
    assert.deepEqual(probePass.samplerTypes, { src: 'nearest' })
    assert.deepEqual(probePass.viewport, {
        x: 2, y: 4, width: { param: 'vol', default: 16 }, height: 64
    })
})

await test('expand() leaves unauthored pass fields absent (default parity)', () => {
    const graph = compileGraph('search synth\nplainPassProbe().write(o0)\nrender(o0)')
    const plainPass = graph.passes.find(p => p.effectFunc === 'plainPassProbe')
    assert.ok(plainPass, 'expanded graph must contain the plain pass')
    assert.equal(plainPass.name, undefined)
    assert.equal(plainPass.type, undefined)
    assert.equal(plainPass.clear, undefined)
    assert.equal(plainPass.samplerTypes, undefined)
    assert.equal(plainPass.viewport, undefined)
})

// ---------------------------------------------------------------------------
// Part 2: pipeline — fields reach backend execution
// ---------------------------------------------------------------------------

class RecordingBackend extends Backend {
    constructor() {
        super(null)
        this.executed = []
    }

    async init() {}

    createTexture(id, spec) {
        this.textures.set(id, {
            id, width: spec.width, height: spec.height, format: spec.format
        })
        return this.textures.get(id)
    }

    createTexture3D(id, spec) {
        this.textures.set(id, {
            id, width: spec.width, height: spec.height, depth: spec.depth,
            format: spec.format, is3D: true
        })
        return this.textures.get(id)
    }

    destroyTexture() {}

    async compileProgram(id, spec) { return { handle: id, type: spec.type } }

    executePass(pass) { this.executed.push(pass) }

    beginFrame() {}

    endFrame() {}

    resize() {}

    async readPixels() {
        return { width: 1, height: 1, data: new Uint8Array(4) }
    }

    getName() { return 'Recording' }

    static isAvailable() { return true }
}

function pipelineFor(source) {
    const graph = compileGraph(source)
    graph.renderSurface = null // recording backend has no present path
    const backend = new RecordingBackend()
    const pipeline = new Pipeline(graph, backend)
    return { pipeline, backend }
}

await test('pipeline executes the probe pass with clear/samplerTypes/name/type', async () => {
    const { pipeline, backend } = pipelineFor('search synth\npassFieldProbe().write(o0)\nrender(o0)')
    await pipeline.init(256, 256)

    backend.executed.length = 0
    pipeline.render(0)
    assert.equal(backend.executed.length, 1, 'the probe pass must execute once per frame')
    const pass = backend.executed[0]
    assert.equal(pass.clear, true, 'authored clear flag must reach backend execution')
    assert.deepEqual(pass.samplerTypes, { src: 'nearest' },
        'authored samplerTypes must reach backend execution')
    assert.equal(pass.name, 'probePass')
    assert.equal(pass.type, 'compute')
})

await test('pipeline resolves an authored dimension viewport to backend numbers', async () => {
    const { pipeline, backend } = pipelineFor('search synth\npassFieldProbe().write(o0)\nrender(o0)')
    await pipeline.init(256, 256)

    backend.executed.length = 0
    pipeline.render(0)
    const pass = backend.executed[0]
    // width {param: 'vol', default: 16} with vol=16 in pass uniforms -> 16;
    // height 64; x/y defaults applied from the authored spec.
    assert.deepEqual(pass.viewportResolved, { x: 2, y: 4, w: 16, h: 64 },
        'authored dimension viewport must resolve to backend x/y/w/h numbers')
    assert.deepEqual(pass.viewport,
        { x: 2, y: 4, width: { param: 'vol', default: 16 }, height: 64 },
        'the authored viewport spec must stay queryable on the expanded pass')
})

await test('authored viewport resolution tracks the pass uniform value', async () => {
    const { pipeline, backend } = pipelineFor('search synth\npassFieldProbe().write(o0)\nrender(o0)')
    await pipeline.init(256, 256)

    backend.executed.length = 0
    pipeline.render(0)
    const pass = backend.executed[0]
    pass.uniforms.vol = 32
    backend.executed.length = 0
    pipeline.render(0)
    assert.deepEqual(backend.executed[0].viewportResolved, { x: 2, y: 4, w: 32, h: 64 },
        'a param-driven viewport must track the updated uniform value')
})

await test('numeric authored viewports pass through unchanged', async () => {
    const graph = compileGraph('search synth\nplainPassProbe().write(o0)\nrender(o0)')
    graph.passes[0].viewport = { x: 2, y: 3, w: 8, h: 8 }
    graph.renderSurface = null
    const backend = new RecordingBackend()
    const pipeline = new Pipeline(graph, backend)
    await pipeline.init(256, 256)

    backend.executed.length = 0
    pipeline.render(0)
    assert.deepEqual(backend.executed[0].viewportResolved, { x: 2, y: 3, w: 8, h: 8 },
        'a numeric viewport must pass through exactly')
})

await test('plain passes carry no viewport resolution (default parity)', async () => {
    const { pipeline, backend } = pipelineFor('search synth\nplainPassProbe().write(o0)\nrender(o0)')
    await pipeline.init(256, 256)

    backend.executed.length = 0
    pipeline.render(0)
    const pass = backend.executed[0]
    assert.equal(pass.viewport, undefined)
    assert.equal(pass.viewportResolved, undefined)
    assert.equal(pass.clear, undefined)
    assert.equal(pass.samplerTypes, undefined)
})

await test('oscillator uniform resolution keeps the resolved viewport', async () => {
    const graph = compileGraph('search synth\npassFieldProbe().write(o0)\nrender(o0)')
    graph.passes[0].uniforms.vol = { type: 'Oscillator', waveform: 'sine', frequency: 1, amplitude: 4, offset: 8 }
    graph.renderSurface = null
    const backend = new RecordingBackend()
    const pipeline = new Pipeline(graph, backend)
    await pipeline.init(256, 256)

    backend.executed.length = 0
    pipeline.render(0)
    const pass = backend.executed[0]
    assert.ok(Number.isFinite(pass.uniforms.vol), 'oscillator uniforms must be resolved for the frame')
    const resolved = pass.viewportResolved
    assert.ok(resolved, 'the oscillator pass proxy must carry a resolved viewport')
    assert.equal(resolved.x, 2)
    assert.equal(resolved.y, 4)
    assert.equal(resolved.w, pass.uniforms.vol,
        'the resolved viewport width must track the resolved uniform value')
    assert.equal(resolved.h, 64)
    assert.equal(pass.clear, true, 'the oscillator pass proxy must carry clear')
    assert.deepEqual(pass.samplerTypes, { src: 'nearest' },
        'the oscillator pass proxy must carry samplerTypes')
})

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

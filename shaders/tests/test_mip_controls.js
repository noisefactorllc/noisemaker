/**
 * Regression tests for the mip and persistent-across-frames texture controls
 * (GAP-004).
 *
 * The register row describes three missing authoring/query controls:
 *   - mip policy: definition-level 2D `mipmaps` (full mip chain allocation +
 *     per-frame regeneration from the frame's level-0 writes);
 *   - persistence: definition-level `persistent` (contents preserved through
 *     pipeline recreation at a new size, resampled via backend.copyTexture);
 *   - definition-level 3D `filter` ('nearest' | 'linear') copied by
 *     `extractTextureSpecs()` instead of being silently discarded;
 *   - unknown texture spec fields are rejected as typos by the definition
 *     validator instead of being ignored.
 *
 * All paths go through public entry points: `validateEffectDefinition()`,
 * `compileGraph()`, and the `Pipeline` class with a recording backend.
 *
 * Run:  node shaders/tests/test_mip_controls.js
 */

import assert from 'node:assert/strict'
import { validateEffectDefinition } from '../src/runtime/effect-validator.js'
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
// Part 1: definition validator — texture spec policy fields and typo rejection
// ---------------------------------------------------------------------------

const baseDefinition = (textures, textures3d) => ({
    name: 'Mip Probe',
    namespace: 'synth',
    func: 'mipProbe',
    description: 'Texture policy probe used by tests',
    tags: ['noise', 'util'],
    textures,
    textures3d,
    passes: [
        {
            program: 'probe',
            inputs: {},
            outputs: { color: 'acc' }
        }
    ]
})

await test('validator accepts mipmaps/persistent on 2D specs and filter on 3D specs', () => {
    const errors = validateEffectDefinition(baseDefinition(
        { acc: { width: 64, height: 64, format: 'rgba16f', mipmaps: true, persistent: true } },
        { vol: { width: 8, height: 8, depth: 8, format: 'rgba16f', filter: 'nearest' } }
    ))
    assert.deepEqual(errors, [], `expected no errors, got: ${JSON.stringify(errors)}`)
})

await test('validator rejects unknown texture spec fields (typo protection)', () => {
    const errors = validateEffectDefinition(baseDefinition(
        { acc: { width: 64, height: 64, mipps: true } },
        undefined
    ))
    assert.ok(errors.some(e => e.includes("unknown field 'mipps'")),
        `missing unknown-field report: ${JSON.stringify(errors)}`)
})

await test('validator rejects filter outside textures3d', () => {
    const errors = validateEffectDefinition(baseDefinition(
        { acc: { width: 64, height: 64, filter: 'nearest' } },
        undefined
    ))
    assert.ok(errors.some(e => e.includes('"filter" is only supported on 3D')),
        `missing filter-container report: ${JSON.stringify(errors)}`)
})

await test('validator rejects unknown filter values', () => {
    const errors = validateEffectDefinition(baseDefinition(
        undefined,
        { vol: { width: 8, height: 8, depth: 8, filter: 'bilinear' } }
    ))
    assert.ok(errors.some(e => e.includes("unknown filter 'bilinear'")),
        `missing filter-value report: ${JSON.stringify(errors)}`)
})

await test('validator rejects mipmaps/persistent on 3D specs and non-boolean values', () => {
    const errors = validateEffectDefinition(baseDefinition(
        { acc: { width: 64, height: 64, mipmaps: 'yes', persistent: 1 } },
        { vol: { width: 8, height: 8, depth: 8, mipmaps: true, persistent: true } }
    ))
    for (const fragment of [
        '"mipmaps" must be a boolean',
        '"persistent" must be a boolean',
        '"mipmaps" is only supported on 2D',
        '"persistent" is only supported on 2D'
    ]) {
        assert.ok(errors.some(e => e.includes(fragment)),
            `missing report for ${fragment}: ${JSON.stringify(errors)}`)
    }
})

// ---------------------------------------------------------------------------
// Part 2: compileGraph — extractTextureSpecs() copies the policy fields
// ---------------------------------------------------------------------------

function registerProbeEffects() {
    // Probe with every policy field (2D + 3D)
    const probeDef = {
        ...baseDefinition(
            { acc: { width: 64, height: 64, format: 'rgba16f', mipmaps: true, persistent: true } },
            { vol: { width: 8, height: 8, depth: 8, format: 'rgba16f', filter: 'nearest' } }
        ),
        outputTex3d: 'vol'
    }
    // Probe without any policy fields (default parity)
    const plainDef = {
        name: 'Plain Probe',
        namespace: 'synth',
        func: 'plainProbe',
        description: 'Default texture probe used by tests',
        tags: ['noise', 'util'],
        textures: {
            scratch: { width: 32, height: 32, format: 'rgba16f' }
        },
        passes: [
            { program: 'probe', inputs: {}, outputs: { color: 'scratch' } }
        ]
    }
    for (const def of [probeDef, plainDef]) {
        const instance = new Effect(def)
        // Effect's config constructor copies `textures` but not `textures3d`;
        // shipped definitions that need it set it as an instance field.
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
}
registerProbeEffects()

await test('extractTextureSpecs copies mipmaps/persistent/filter from definitions', () => {
    const graph = compileGraph('search synth\nmipProbe().write(o0)\nrender(o0)')
    const entries = [...graph.textures.entries()]
    const acc = entries.find(([, spec]) => spec.mipmaps === true && spec.persistent === true)
    assert.ok(acc, `no texture spec carries mipmaps+persistent: ${JSON.stringify(entries)}`)
    const vol = entries.find(([, spec]) => spec.is3D === true && spec.filter === 'nearest')
    assert.ok(vol, `no 3D texture spec carries filter 'nearest': ${JSON.stringify(entries)}`)
})

await test('extractTextureSpecs leaves policy fields absent on plain specs (default parity)', () => {
    const graph = compileGraph('search synth\nplainProbe().write(o0)\nrender(o0)')
    for (const [, spec] of graph.textures) {
        assert.equal(spec.mipmaps, undefined, 'plain 2D spec must not carry mipmaps')
        assert.equal(spec.persistent, undefined, 'plain 2D spec must not carry persistent')
        assert.equal(spec.filter, undefined, 'plain spec must not carry filter')
    }
})

// ---------------------------------------------------------------------------
// Part 3: Pipeline — allocation records, preservation across resize, mip
// regeneration each frame
// ---------------------------------------------------------------------------

class RecordingBackend extends Backend {
    constructor() {
        super(null)
        this.created = []       // { id, spec }
        this.destroyed = []
        this.copies = []        // [srcId, dstId]
        this.mipRegens = []     // ids arrays passed to generateMipmaps
    }

    async init() {}

    createTexture(id, spec) {
        this.created.push({ id, spec })
        this.textures.set(id, {
            id, width: spec.width, height: spec.height, format: spec.format,
            mipmaps: spec.mipmaps === true,
            mipLevels: spec.mipmaps === true ? 4 : 1,
            persistent: spec.persistent === true
        })
        return this.textures.get(id)
    }

    createTexture3D(id, spec) {
        this.created.push({ id, spec, is3D: true })
        this.textures.set(id, {
            id, width: spec.width, height: spec.height, depth: spec.depth,
            format: spec.format, is3D: true, filter: spec.filter
        })
        return this.textures.get(id)
    }

    destroyTexture(id) { this.destroyed.push(id); this.textures.delete(id) }

    copyTexture(srcId, dstId) { this.copies.push([srcId, dstId]) }

    generateMipmaps(ids) { this.mipRegens.push([...ids]) }

    async compileProgram(id, spec) { return { handle: id, type: spec.type } }

    executePass() {}

    beginFrame() {}

    endFrame() {}

    resize() {}

    async readPixels() {
        return { width: 1, height: 1, data: new Uint8Array(4) }
    }

    getName() { return 'Recording' }

    static isAvailable() { return true }
}

function buildGraph() {
    return {
        passes: [],
        textures: new Map([
            ['probe_acc', {
                width: 'screen', height: 'screen', format: 'rgba16f',
                usage: ['render', 'sample', 'copySrc', 'copyDst'],
                mipmaps: true, persistent: true
            }],
            ['probe_scratch', {
                width: 'screen', height: 'screen', format: 'rgba16f',
                usage: ['render', 'sample', 'copySrc', 'copyDst']
            }]
        ])
    }
}

await test('pipeline passes policy fields to backend texture creation', async () => {
    const backend = new RecordingBackend()
    const pipeline = new Pipeline(buildGraph(), backend)
    await pipeline.init(256, 256)

    const acc = backend.textures.get('probe_acc')
    assert.ok(acc, 'persistent mipmapped texture must exist after init')
    assert.equal(acc.mipmaps, true, 'record must expose mipmaps (queryable)')
    assert.ok(acc.mipLevels > 1, 'record must expose the allocated mip level count')
    assert.equal(acc.persistent, true, 'record must expose persistent (queryable)')

    const scratch = backend.textures.get('probe_scratch')
    assert.equal(scratch.mipmaps, false, 'plain texture must not gain a mip chain')
    assert.equal(scratch.persistent, false, 'plain texture must not gain persistence')
})

await test('persistent textures preserve contents across resize; plain textures do not', async () => {
    const backend = new RecordingBackend()
    const pipeline = new Pipeline(buildGraph(), backend)
    await pipeline.init(256, 256)

    backend.copies.length = 0
    pipeline.resize(128, 128)

    const accCopies = backend.copies.filter(([src, dst]) =>
        src === 'probe_acc' || dst === 'probe_acc')
    assert.ok(accCopies.length >= 2,
        `persistent texture recreation must copy old content out and back in: ${JSON.stringify(backend.copies)}`)
    const scratchCopies = backend.copies.filter(([src, dst]) =>
        src === 'probe_scratch' || dst === 'probe_scratch')
    assert.equal(scratchCopies.length, 0,
        'non-persistent texture must be recreated without content preservation')
})

await test('mipmapped textures are regenerated after each frame', async () => {
    const backend = new RecordingBackend()
    const pipeline = new Pipeline(buildGraph(), backend)
    await pipeline.init(256, 256)

    backend.mipRegens.length = 0
    pipeline.render(0)
    assert.ok(backend.mipRegens.length > 0, 'render must call backend.generateMipmaps')
    for (const ids of backend.mipRegens) {
        assert.ok(ids.includes('probe_acc'),
            `mip regeneration targets must include the mipmapped texture: ${JSON.stringify(ids)}`)
        assert.ok(!ids.includes('probe_scratch'),
            `mip regeneration must skip plain textures: ${JSON.stringify(ids)}`)
    }
})

await test('global surface resize recreates each half exactly once (no orphaned texture)', async () => {
    const backend = new RecordingBackend()
    const graph = {
        passes: [{ id: 'p0', program: 'probe', inputs: { src: 'o0' }, outputs: { color: 'o0' } }],
        textures: new Map(),
        programs: { probe: { fragment: 'void main() {}' } }
    }
    const pipeline = new Pipeline(graph, backend)
    await pipeline.init(256, 256)

    const id = 'global_o0_read'
    assert.equal(backend.created.filter(c => c.id === id).length, 1,
        'init must create the global read texture exactly once')
    assert.ok(backend.textures.has(id), 'global read texture must be registered after init')

    pipeline.resize(128, 128)

    assert.equal(backend.created.filter(c => c.id === id).length, 2,
        'resize must recreate the global read texture exactly once (a third create orphans the previous GL texture)')
    assert.equal(backend.destroyed.filter(d => d === id).length, 1,
        'resize must destroy the old global read texture exactly once')
    assert.ok(backend.textures.has(id), 'recreated texture must be registered')
    assert.equal(backend.textures.get(id).width, 128, 'recreated texture must use the new size')
})

// ---------------------------------------------------------------------------
// Part 3: WebGL2 backend — mip chain allocation and generation (real backend
// against a recording stub GL context, per the error-gating test pattern)
// ---------------------------------------------------------------------------

import { WebGL2Backend } from '../src/runtime/backends/webgl2.js'

const mipLevelSize = (dim, level) => Math.max(1, dim >> level)
const mipLevelCountOf = (w, h) => 1 + Math.floor(Math.log2(Math.max(w, h)))

function createRecordingGL() {
    const calls = {
        texImage2D: [], texParameteri: [],
        framebufferTexture2D: [], blitFramebuffer: []
    }
    const cache = new Map()
    let nextConst = 1

    const gl = new Proxy({}, {
        get(_target, prop) {
            if (cache.has(prop)) return cache.get(prop)
            let value
            if (prop === 'NO_ERROR') {
                value = 0
            } else if (prop === 'getError') {
                value = () => 0
            } else if (prop === 'texImage2D') {
                value = (_target, level, _internal, width, height) =>
                    calls.texImage2D.push({ level, width, height })
            } else if (prop === 'texParameteri') {
                value = (_target, pname, param) =>
                    calls.texParameteri.push({ pname, param })
            } else if (prop === 'framebufferTexture2D') {
                value = (_target, _attach, _texTarget, _tex, level) =>
                    calls.framebufferTexture2D.push({ level })
            } else if (prop === 'blitFramebuffer') {
                value = (_sx, _sy, sw, sh, _dx, _dy, dw, dh) =>
                    calls.blitFramebuffer.push({ srcW: sw, srcH: sh, dstW: dw, dstH: dh })
            } else if (prop === 'drawingBufferWidth' || prop === 'drawingBufferHeight') {
                value = 8
            } else if (typeof prop === 'string' && /^[A-Z][A-Z0-9_]*$/.test(prop)) {
                value = nextConst++
            } else {
                value = () => undefined
            }
            cache.set(prop, value)
            return value
        }
    })
    return { gl, calls }
}

await test('WebGL2 allocates every mip level of an opt-in chain at creation', async () => {
    const { gl, calls } = createRecordingGL()
    const backend = new WebGL2Backend(gl, null)

    backend.createTexture('mipped', { width: 64, height: 64, format: 'rgba16f', mipmaps: true })

    const expected = mipLevelCountOf(64, 64)
    const levels = calls.texImage2D.map(c => c.level).sort((a, b) => a - b)
    assert.equal(calls.texImage2D.length, expected,
        `mipmapped texture must allocate all ${expected} levels, got ${calls.texImage2D.length}`)
    for (let level = 0; level < expected; level++) {
        assert.ok(levels.includes(level), `level ${level} must be allocated`)
        const call = calls.texImage2D.find(c => c.level === level)
        assert.equal(call.width, mipLevelSize(64, level), `level ${level} width`)
        assert.equal(call.height, mipLevelSize(64, level), `level ${level} height`)
    }

    // The chain must be flagged mipmap-min-filtered so sampling is complete
    const params = calls.texParameteri
    const nearestParam = gl.NEAREST
    const minFilterCalls = params.filter(c => c.pname === gl.TEXTURE_MIN_FILTER)
    assert.ok(minFilterCalls.some(c => c.param !== nearestParam),
        'mipmapped texture must set a mipmap min filter')
})

await test('WebGL2 plain textures keep the single-level allocation', async () => {
    const { gl, calls } = createRecordingGL()
    const backend = new WebGL2Backend(gl, null)

    backend.createTexture('plain', { width: 64, height: 64, format: 'rgba16f' })

    assert.equal(calls.texImage2D.length, 1, 'plain texture must allocate exactly level 0')
    assert.equal(calls.texImage2D[0].level, 0)
    assert.equal(calls.texImage2D[0].width, 64)
    assert.equal(calls.texImage2D[0].height, 64)
})

await test('WebGL2 generateMipmaps blits level N-1 into N for the whole chain', async () => {
    const { gl, calls } = createRecordingGL()
    const backend = new WebGL2Backend(gl, null)

    backend.createTexture('mipped', { width: 64, height: 64, format: 'rgba16f', mipmaps: true })
    calls.blitFramebuffer.length = 0
    calls.framebufferTexture2D.length = 0

    backend.generateMipmaps(['mipped'])

    const expected = mipLevelCountOf(64, 64) - 1
    assert.equal(calls.blitFramebuffer.length, expected,
        `one blit per mip transition, expected ${expected}`)
    for (let level = 1; level <= expected; level++) {
        const blit = calls.blitFramebuffer[level - 1]
        assert.equal(blit.srcW, mipLevelSize(64, level - 1), `blit ${level} source width`)
        assert.equal(blit.dstW, mipLevelSize(64, level), `blit ${level} dest width`)
    }
    assert.equal(calls.framebufferTexture2D.length, expected * 2,
        'each transition must attach the source and destination levels')
    assert.deepEqual(calls.framebufferTexture2D.map(c => c.level),
        [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6].slice(0, expected * 2),
        'blits must run level N-1 -> N in ascending order')
})

await test('WebGL2 generateMipmaps skips plain textures', async () => {
    const { gl, calls } = createRecordingGL()
    const backend = new WebGL2Backend(gl, null)

    backend.createTexture('plain', { width: 64, height: 64, format: 'rgba16f' })
    backend.generateMipmaps(['plain'])

    assert.equal(calls.blitFramebuffer.length, 0, 'no blits for non-mipmapped textures')
})

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

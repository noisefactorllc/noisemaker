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

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

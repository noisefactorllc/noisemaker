/**
 * The fixed-step simulation clock in the real Pipeline, on a mock backend:
 * which passes step, the uniforms of a step, renders with no due step, the
 * surface bindings after a render, starts after a resize, cube captures,
 * resets, edit marks and the scene split. A graph without state renders as it
 * did before the clock.
 */

import assert from 'node:assert/strict'
import { Pipeline } from '../src/runtime/pipeline.js'
import { Backend } from '../src/runtime/backend.js'

class MockBackend extends Backend {
    constructor() {
        super(null)
        this.log = []
        this.cleared = []
    }
    async init() {}
    createTexture(id, spec) {
        this.textures.set(id, { id, width: spec.width, height: spec.height, format: spec.format })
        return this.textures.get(id)
    }
    destroyTexture(id) { this.textures.delete(id) }
    async compileProgram(id) { this.programs.set(id, {}); return this.programs.get(id) }
    executePass(pass, state) {
        const g = state.globalUniforms
        const bindings = {}
        for (const id of Object.values(pass.outputs || {})) {
            if (typeof id === 'string' && id.startsWith('global_')) {
                const name = id.slice('global_'.length)
                bindings[name] = { read: state.surfaces[name]?.id, write: state.writeSurfaces[name] }
            }
        }
        this.log.push({ kind: 'pass', id: pass.id, time: g.time, deltaTime: g.deltaTime, frame: g.frame, bindings })
    }
    beginFrame() { this.log.push({ kind: 'begin' }) }
    endFrame() { this.log.push({ kind: 'end' }) }
    resize() {}
    clearTexture(id) { this.cleared.push(id) }
    async readPixels() { return { width: 1, height: 1, data: new Uint8Array(4) } }
    getName() { return 'Mock' }
    static isAvailable() { return true }
}

const screen = { width: 'screen', height: 'screen', format: 'rgba16f' }
const programs = names => Object.fromEntries(names.map(name => [name, { fragment: 'void main() {}' }]))

// Effect state: a node-local feedback texture, as synth/roll keeps.
const effectState = () => ({
    passes: [
        { id: 'scroll', program: 'p', inputs: { fb: 'node_0__rollFb' }, outputs: { c: 'node_0_out' } },
        { id: 'copy', program: 'p', inputs: { s: 'node_0_out' }, outputs: { c: 'node_0__rollFb' } },
        { id: 'blit', program: 'p', inputs: { s: 'node_0_out' }, outputs: { c: 'global_o0' } },
    ],
    textures: new Map([['node_0__rollFb', screen], ['node_0_out', screen]]),
    programs: programs(['p']),
    renderSurface: 'o0',
})

// Shared ping-pong state fed by a stateless producer, as particles are.
const sharedState = () => ({
    passes: [
        { id: 'noise', program: 'p', inputs: {}, outputs: { c: 'node_0_out' } },
        { id: 'physics', program: 'p', inputs: { xyz: 'global_xyz', src: 'node_0_out' }, outputs: { c: 'global_xyz' } },
        { id: 'draw', program: 'p', inputs: { xyz: 'global_xyz' }, outputs: { c: 'global_o0' } },
    ],
    textures: new Map([['node_0_out', screen], ['global_xyz', { width: 8, height: 8, format: 'rgba32f' }]]),
    programs: programs(['p']),
    renderSurface: 'o0',
})

async function pipelineFor(graph, loopDuration = 10) {
    const backend = new MockBackend()
    const pipeline = new Pipeline(graph, backend)
    pipeline.setLoopDuration(loopDuration)
    await pipeline.init(16, 16)
    return { pipeline, backend }
}

const passesRun = (backend, id) => backend.log.filter(entry => entry.kind === 'pass' && (!id || entry.id === id))

const tests = []
const test = (name, fn) => tests.push({ name, fn })

test('the step set holds state writers, readers before a write, and their producers', async () => {
    const sets = async graph => {
        const { pipeline } = await pipelineFor(graph)
        return { step: [...pipeline._simulation.stepPasses].sort(), state: [...pipeline._simulation.stateKeys].sort() }
    }
    assert.deepEqual(await sets(effectState()), { step: [0, 1], state: ['node_0__rollFb'] })
    assert.deepEqual(await sets(sharedState()), { step: [0, 1], state: ['global:xyz'] })
    // Program feedback: a chain reads o0 before it writes it.
    assert.deepEqual(await sets({
        passes: [
            { id: 'mix', program: 'p', inputs: { prev: 'global_o0' }, outputs: { c: 'node_0_out' } },
            { id: 'write', program: 'p', inputs: { s: 'node_0_out' }, outputs: { c: 'global_o0' } },
        ],
        textures: new Map([['node_0_out', screen]]), programs: programs(['p']), renderSurface: 'o0',
    }), { step: [0, 1], state: ['global:o0'] })
    // A conditional write is not definite, so its reader reads state.
    assert.deepEqual(await sets({
        passes: [
            { id: 'init', program: 'p', inputs: {}, outputs: { c: 'global_mem' }, conditions: { runIf: [{ uniform: 'frame', equals: 0 }] } },
            { id: 'show', program: 'p', inputs: { m: 'global_mem' }, outputs: { c: 'global_o0' } },
        ],
        textures: new Map(), programs: programs(['p']), renderSurface: 'o0',
    }), { step: [0, 1], state: ['global:mem'] })
    // A tap that reads its history before the shift, and the producer of both.
    assert.deepEqual(await sets({
        passes: [
            { id: 'gen', program: 'p', inputs: {}, outputs: { c: 'node_a' } },
            { id: 'tap', program: 'p', inputs: { h: 'node_hist', a: 'node_a' }, outputs: { c: 'global_o0' } },
            { id: 'shift', program: 'p', inputs: { a: 'node_a' }, outputs: { c: 'node_hist' } },
        ],
        textures: new Map([['node_a', screen], ['node_hist', screen]]), programs: programs(['p']), renderSurface: 'o0',
    }), { step: [0, 1, 2], state: ['node_hist'] })
    // A viewport the size of its target, as a volume generator writes its atlas,
    // is a full write; a smaller viewport without a clear reads its target.
    const viewportGraph = viewport => ({
        passes: [
            { id: 'gen', program: 'p', inputs: {}, outputs: { c: 'node_vol' }, viewport },
            { id: 'show', program: 'p', inputs: { v: 'node_vol' }, outputs: { c: 'global_o0' } },
        ],
        textures: new Map([['node_vol', { width: 16, height: 256, format: 'rgba16f' }]]), programs: programs(['p']), renderSurface: 'o0',
    })
    assert.deepEqual(await sets(viewportGraph({ width: 16, height: 256 })), { step: [], state: [] })
    // The partial write is not definite, so its reader reads earlier content too.
    assert.deepEqual(await sets(viewportGraph({ width: 8, height: 256 })), { step: [0, 1], state: ['node_vol'] })
    assert.deepEqual(await sets(viewportGraph({ x: 4, width: 16, height: 256 })), { step: [0, 1], state: ['node_vol'] })
    // A write after a definite write is not state.
    assert.deepEqual(await sets({
        passes: [
            { id: 'clear', program: 'p', inputs: {}, outputs: { c: 'global_o1' } },
            { id: 'add', program: 'p', inputs: { s: 'global_o1' }, outputs: { c: 'global_o1' } },
            { id: 'blit', program: 'p', inputs: { s: 'global_o1' }, outputs: { c: 'global_o0' } },
        ],
        textures: new Map(), programs: programs(['p']), renderSurface: 'o0',
    }), { step: [], state: [] })
})

test('a draw pass that reads a surface between two step-set writes of it joins the step set', async () => {
    // noise -> o1, blur(o1) -> o2, perlin -> o1, feedback(o1, o0) -> o0
    const graph = {
        passes: [
            { id: 'noise', program: 'p', inputs: {}, outputs: { c: 'global_o1' } },
            { id: 'blur', program: 'p', inputs: { s: 'global_o1' }, outputs: { c: 'global_o2' } },
            { id: 'perlin', program: 'p', inputs: {}, outputs: { c: 'global_o1' } },
            { id: 'feedback', program: 'p', inputs: { s: 'global_o1', prev: 'global_o0' }, outputs: { c: 'global_o0' } },
        ],
        textures: new Map(), programs: programs(['p']), renderSurface: 'o0',
    }
    const { pipeline, backend } = await pipelineFor(graph)
    assert.deepEqual([...pipeline._simulation.stepPasses].sort(), [0, 1, 2, 3])
    pipeline.render(0.1)
    // blur reads noise's write, as in graph order.
    const ids = passesRun(backend).map(p => p.id)
    assert.deepEqual(ids, ['noise', 'blur', 'perlin', 'feedback'])
})

test('a draw pass after a scene-dependent pass that writes the same texture also runs after the scene', async () => {
    const graph = {
        passes: [
            { id: 'fb', program: 'p', inputs: { prev: 'global_fb' }, outputs: { c: 'global_fb' } },
            { id: 'overScene', program: 'p', inputs: { s: 'scene_color' }, outputs: { c: 'global_o1' } },
            { id: 'plainOverwrite', program: 'p', inputs: { s: 'global_fb' }, outputs: { c: 'global_o1' } },
        ],
        textures: new Map(), programs: programs(['p']), renderSurface: 'o1',
    }
    const { pipeline } = await pipelineFor(graph)
    assert.deepEqual([...pipeline._simulation.sceneDrawPasses].sort(), [1, 2])

    // A later draw pass that overwrites a texture a scene-dependent pass reads
    // also runs after the scene, so that pass still reads the earlier write.
    const overwrite = {
        passes: [
            { id: 'fb', program: 'p', inputs: { prev: 'global_fb' }, outputs: { c: 'global_fb' } },
            { id: 'first', program: 'p', inputs: { s: 'global_fb' }, outputs: { c: 'global_o1' } },
            { id: 'sceneUse', program: 'p', inputs: { s: 'scene_color', o: 'global_o1' }, outputs: { c: 'global_o0' } },
            { id: 'second', program: 'p', inputs: {}, outputs: { c: 'global_o1' } },
        ],
        textures: new Map(), programs: programs(['p']), renderSurface: 'o0',
    }
    const split = await pipelineFor(overwrite)
    assert.deepEqual([...split.pipeline._simulation.sceneDrawPasses].sort(), [2, 3])
})

test('a simulation texture recreated by a parameter change makes the next render a start', async () => {
    const graph = sharedState()
    graph.textures.set('global_xyz', { width: { param: 'stateSize', default: 8 }, height: { param: 'stateSize', default: 8 }, format: 'rgba32f' })
    graph.passes[1].uniforms = { stateSize: 8 }
    const { pipeline } = await pipelineFor(graph)
    pipeline.render(0.1)
    pipeline.render(0.1 + 1 / 600)
    pipeline.recreateTextures({ stateSize: 16 })
    pipeline.render(0.1 + 1 / 600)
    assert.equal(pipeline.lastClockResult.start, true)
    assert.equal(pipeline.lastClockResult.steps.length, 1)
})

test('a recompile between advance() and draw() renders the new graph whole', async () => {
    const { pipeline, backend } = await pipelineFor(effectState())
    pipeline.advance(0.1)
    pipeline.endSceneSplit()
    const replacement = effectState()
    replacement.passes[2] = { ...replacement.passes[2], id: 'blit2' }
    pipeline.graph = replacement
    pipeline.createSurfaces()
    pipeline.recreateTextures({})
    backend.log = []
    pipeline.draw()
    const ids = passesRun(backend).map(p => p.id)
    assert.ok(ids.includes('blit2'), ids.join())
    assert.ok(!backend.log.some((e, i) => e.kind === 'begin' && backend.log[i + 1]?.kind === 'begin'), 'frames stay balanced')
})

test('a step pass that samples a mipmapped texture is refused', async () => {
    const graph = effectState()
    graph.textures.set('node_0__rollFb', { ...screen, mipmaps: true })
    await assert.rejects(pipelineFor(graph), /mipmapped/)
})

test('a step pass sees deltaTime = 1/N and its grid time on every step, the wrap included', async () => {
    for (const L of [10, 30]) {
        const n = Math.round(60 * L)
        const { pipeline, backend } = await pipelineFor(effectState(), L)
        for (const k of [n - 2, n - 1, 0, 1]) pipeline.render(k / n)
        const steps = passesRun(backend, 'scroll')
        assert.deepEqual(steps.map(s => s.deltaTime), [1 / n, 1 / n, 1 / n, 1 / n], `L = ${L}`)
        assert.deepEqual(steps.map(s => s.time), [(n - 2) / n, (n - 1) / n, 0, 1 / n], `L = ${L}`)
        assert.deepEqual(steps.map(s => s.frame), [0, 1, 2, 3], `L = ${L}`)
        // The draw pass runs once a render, at the render time.
        assert.equal(passesRun(backend, 'blit').length, 4)
    }
})

test('the step after a frame at time 0 is one step of 1/N', async () => {
    const { pipeline, backend } = await pipelineFor(effectState())
    pipeline.render(0)
    pipeline.render(1 / 600)
    pipeline.render(2 / 600)
    assert.deepEqual(passesRun(backend, 'scroll').map(s => s.deltaTime), [1 / 600, 1 / 600, 1 / 600])
})

test('24, 30 and 60 renders a second run the same steps by the same loop times', async () => {
    const stepsBy = async fps => {
        const { pipeline, backend } = await pipelineFor(sharedState())
        const shown = new Map()
        for (let k = 0; k <= fps; k++) {
            pipeline.render(k / (fps * 10))
            const last = passesRun(backend, 'physics').at(-1)
            shown.set(k * 60 / fps, last.frame)
        }
        return { shown, count: passesRun(backend, 'physics').length }
    }
    const a = await stepsBy(24), b = await stepsBy(30), c = await stepsBy(60)
    // One second of loop: steps 0 to 60, 61 steps, at every frame rate.
    assert.deepEqual([a.count, b.count, c.count], [61, 61, 61])
    for (const [position, frame] of a.shown) {
        if (b.shown.has(position)) assert.equal(b.shown.get(position), frame)
        if (c.shown.has(position)) assert.equal(c.shown.get(position), frame)
    }
    assert.equal(a.shown.get(10), 10)
})

test('a render with no due step runs no step pass and leaves the state bindings alone', async () => {
    const { pipeline, backend } = await pipelineFor(sharedState())
    pipeline.render(0.25)
    const bindings = name => ({ read: pipeline.surfaces.get(name).read, write: pipeline.surfaces.get(name).write })
    const xyz = bindings('xyz')
    backend.log = []
    pipeline.render(0.25)
    assert.deepEqual(passesRun(backend).map(p => p.id), ['draw'])
    assert.deepEqual(bindings('xyz'), xyz)
})

test('after a render, a surface written zero, one or two times reads its last write', async () => {
    const graph = {
        passes: [
            { id: 'fb', program: 'p', inputs: { prev: 'global_fb' }, outputs: { c: 'global_fb' } },
            { id: 'once', program: 'p', inputs: { s: 'global_fb' }, outputs: { c: 'global_o1' } },
            { id: 'twiceA', program: 'p', inputs: { s: 'global_fb' }, outputs: { c: 'global_o2' } },
            { id: 'twiceB', program: 'p', inputs: { s: 'global_o2' }, outputs: { c: 'global_o2' } },
            { id: 'out', program: 'p', inputs: { s: 'global_o1' }, outputs: { c: 'global_o0' } },
        ],
        textures: new Map(), programs: programs(['p']), renderSurface: 'o0',
    }
    const { pipeline, backend } = await pipelineFor(graph)
    const bindings = name => ({ read: pipeline.surfaces.get(name).read, write: pipeline.surfaces.get(name).write })
    const o3 = bindings('o3')
    pipeline.render(0.1)
    const lastWrite = id => passesRun(backend, id).at(-1).bindings
    assert.equal(pipeline.surfaces.get('o1').read, lastWrite('once').o1.write)
    assert.equal(pipeline.surfaces.get('o2').read, lastWrite('twiceB').o2.write)
    assert.deepEqual(bindings('o3'), o3, 'an unwritten surface keeps its bindings')
})

test('a resize that recreates simulation textures makes the next render a start; a persistent one does not', async () => {
    const { pipeline } = await pipelineFor(effectState())
    pipeline.render(0.1)
    pipeline.render(0.1 + 1 / 600)
    pipeline.resize(32, 32)
    pipeline.render(0.1 + 2 / 600)
    assert.equal(pipeline.lastClockResult.start, true)

    const persistent = effectState()
    persistent.textures = new Map([['node_0__rollFb', { ...screen, persistent: true }], ['node_0_out', { width: 16, height: 16, format: 'rgba16f' }]])
    const kept = await pipelineFor(persistent)
    kept.pipeline.render(0.1)
    kept.pipeline.resize(32, 32)
    kept.pipeline.render(0.1 + 1 / 600)
    assert.equal(kept.pipeline.lastClockResult.start, false)
    assert.deepEqual(kept.pipeline.lastClockResult.steps.length, 1)
})

test('the six faces of renderCubemap() on a stateful chain read one state', async () => {
    const graph = {
        passes: [
            { id: 'fb', program: 'p', inputs: { prev: 'global_fb' }, outputs: { c: 'global_fb' } },
            { id: 'cube', program: 'p', inputs: { s: 'global_fb' }, outputs: { c: 'global_o0' }, uniforms: { cubeBasis: [1, 0, 0, 0, 1, 0, 0, 0, 1] } },
        ],
        textures: new Map(), programs: programs(['p']), renderSurface: 'o0',
    }
    const { pipeline, backend } = await pipelineFor(graph)
    pipeline.render(0.3)
    backend.log = []
    await pipeline.renderCubemap({ size: 16, time: 0.3 })
    assert.equal(passesRun(backend, 'cube').length, 6)
    assert.ok(passesRun(backend, 'fb').length <= 1, `${passesRun(backend, 'fb').length} steps over six faces`)
})

test('renderCubemap() refuses a cube-rendering pass that is a simulation step', async () => {
    const graph = {
        passes: [
            { id: 'cube', program: 'p', inputs: { prev: 'global_fb' }, outputs: { c: 'global_fb' }, uniforms: { cubeBasis: [1, 0, 0, 0, 1, 0, 0, 0, 1] } },
            { id: 'show', program: 'p', inputs: { s: 'global_fb' }, outputs: { c: 'global_o0' } },
        ],
        textures: new Map(), programs: programs(['p']), renderSurface: 'o0',
    }
    const { pipeline } = await pipelineFor(graph)
    await assert.rejects(pipeline.renderCubemap({ size: 16 }), /simulation step/)
})

test('resetSimulation() clears node-local state, shared state and held outputs, and the next render is a start', async () => {
    const { pipeline, backend } = await pipelineFor(effectState())
    pipeline.render(0.1)
    pipeline.resetSimulation(0)
    assert.ok(backend.cleared.includes('node_0__rollFb'), backend.cleared.join())
    assert.ok(backend.cleared.includes('node_0_out'), backend.cleared.join())
    pipeline.render(0)
    assert.equal(pipeline.lastClockResult.start, true)

    const shared = await pipelineFor(sharedState())
    shared.pipeline.render(0.1)
    shared.pipeline.resetSimulation(0)
    const xyz = shared.pipeline.surfaces.get('xyz')
    assert.ok(shared.backend.cleared.includes(xyz.read) && shared.backend.cleared.includes(xyz.write), shared.backend.cleared.join())
})

test('an edit while stopped steps once; an edit while running, setUniform and a repaint do not', async () => {
    const { pipeline, backend } = await pipelineFor(effectState())
    pipeline.setLoopRunning(false)
    pipeline.render(0.5)
    backend.log = []
    pipeline.markEdit()
    pipeline.render(0.5)
    assert.equal(passesRun(backend, 'scroll').length, 1, 'a paused edit steps once')
    backend.log = []
    pipeline.render(0.5)
    pipeline.setUniform('resetState', true)
    pipeline.render(0.5)
    assert.equal(passesRun(backend, 'scroll').length, 0, 'a repaint and setUniform do not step')
    pipeline.setLoopRunning(true)
    pipeline.markEdit()
    pipeline.render(0.5)
    pipeline.setLoopRunning(false)
    pipeline.render(0.5)
    assert.equal(passesRun(backend, 'scroll').length, 0, 'an edit while running does not step, and stop() clears it')
})

test('a ProgramState edit marks an edit on the pipeline', async () => {
    const { ProgramState } = await import('../../demo/shaders/lib/program-state.js')
    const { pipeline, backend } = await pipelineFor(effectState())
    pipeline.setLoopRunning(false)
    pipeline.render(0.5)
    backend.log = []
    const state = Object.create(ProgramState.prototype)
    state._renderer = { pipeline }
    state._stepStates = new Map()
    state._applyToPipeline()
    pipeline.render(0.5)
    assert.equal(passesRun(backend, 'scroll').length, 1)
})

test('for a scene program, draw passes that depend on the scene image run after the split', async () => {
    const graph = {
        passes: [
            { id: 'fb', program: 'p', inputs: { prev: 'global_fb' }, outputs: { c: 'global_fb' } },
            { id: 'plain', program: 'p', inputs: { s: 'global_fb' }, outputs: { c: 'global_o1' } },
            { id: 'blitScene', program: 'p', inputs: { s: 'scene_color' }, outputs: { c: 'node_s' } },
            { id: 'overScene', program: 'p', inputs: { s: 'node_s' }, outputs: { c: 'global_o0' } },
        ],
        textures: new Map([['node_s', screen]]), programs: programs(['p']), renderSurface: 'o0',
    }
    const { pipeline, backend } = await pipelineFor(graph)
    assert.deepEqual([...pipeline._simulation.sceneDrawPasses].sort(), [2, 3])
    pipeline.advance(0.2)
    pipeline.endSceneSplit()
    const fbRead = pipeline.surfaces.get('fb').read
    assert.equal(fbRead, passesRun(backend, 'fb').at(-1).bindings.fb.write, 'the scene sees this render\'s state')
    backend.log.push({ kind: 'scene' })
    pipeline.draw()
    const order = backend.log.map(e => e.kind === 'pass' ? e.id : e.kind)
    assert.deepEqual(order, ['begin', 'fb', 'plain', 'end', 'scene', 'begin', 'blitScene', 'overScene', 'end'])
})

test('a graph without state renders every pass once a render, in graph order, as before the clock', async () => {
    const graph = {
        passes: [
            { id: 'a', program: 'p', inputs: {}, outputs: { c: 'node_a' } },
            { id: 'b', program: 'p', inputs: { s: 'node_a' }, outputs: { c: 'global_o0' } },
        ],
        textures: new Map([['node_a', screen]]), programs: programs(['p']), renderSurface: 'o0',
    }
    const { pipeline, backend } = await pipelineFor(graph)
    assert.equal(pipeline.hasSimulation, false)
    pipeline.render(0)
    pipeline.render(0)
    pipeline.render(0.5)
    assert.deepEqual(passesRun(backend).map(p => p.id), ['a', 'b', 'a', 'b', 'a', 'b'])
    // The display surface swaps at the end of every frame, as before.
    const o1 = { ...pipeline.surfaces.get('o1') }
    pipeline.render(0.6)
    assert.deepEqual({ read: pipeline.surfaces.get('o1').read, write: pipeline.surfaces.get('o1').write }, { read: o1.write, write: o1.read })
})

for (const { name, fn } of tests) {
    try {
        await fn()
        console.log(`PASS: ${name}`)
    } catch (error) {
        console.error(`FAIL: ${name}`)
        console.error(error)
        process.exit(1)
    }
}

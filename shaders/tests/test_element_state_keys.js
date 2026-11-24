// State keyed by an element's `_id:`. An element with an id keys its state
// textures and size parameters by the id and its resolved, namespaced op name,
// so inserting, deleting or reordering other elements leaves its state in
// place. An element without an id keeps its position key, as before.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
    registerEffect, registerOp, registerStarterOps, mergeIntoEnums, stdEnums
} from '../src/index.js'
import { compileGraph, recompile } from '../src/runtime/compiler.js'
import { elementStateKey } from '../src/runtime/expander.js'
import { Pipeline } from '../src/runtime/pipeline.js'
import { CanvasRenderer } from '../src/renderer/canvas.js'
import { ProgramState } from '../../demo/shaders/lib/program-state.js'

mergeIntoEnums(stdEnums)

for (const [namespace, name] of [
    ['synth', 'perlin'], ['synth', 'noise'], ['synth', 'solid'], ['synth', 'reactionDiffusion'], ['synth', 'cellularAutomata'],
    ['mixer', 'blendMode'], ['filter', 'feedback'], ['filter', 'invert'], ['filter', 'fibers'],
    ['render', 'pointsEmit'], ['render', 'pointsRender']
]) {
    const { default: definition } = await import(`../effects/${namespace}/${name}/definition.js`)
    const effect = typeof definition === 'function' ? new definition() : definition
    registerEffect(`${namespace}.${effect.func}`, effect)
    const choices = {}
    const args = Object.entries(effect.globals || {}).map(([key, spec]) => {
        const enumPath = spec.enum || spec.enumPath || (spec.choices ? `${namespace}.${effect.func}.${key}` : undefined)
        if (spec.choices) {
            choices[key] = Object.fromEntries(Object.entries(spec.choices)
                .filter(([label]) => !label.endsWith(':'))
                .map(([label, value]) => [label, { type: 'Number', value }]))
        }
        return {
            name: key, type: spec.type === 'vec4' ? 'color' : spec.type,
            default: spec.default, enum: enumPath, enumPath,
            min: spec.min, max: spec.max, uniform: spec.uniform, choices: spec.choices
        }
    })
    registerOp(`${namespace}.${effect.func}`, { name: effect.func, args })
    if (Object.keys(choices).length) mergeIntoEnums({ [namespace]: { [effect.func]: choices } })
    if (effect.enums) mergeIntoEnums(effect.enums)
}
registerStarterOps(['synth.perlin', 'synth.noise', 'synth.solid', 'synth.reactionDiffusion', 'synth.cellularAutomata'])

class RecordingBackend {
    textures = new Map()
    copies = []
    createTexture(id, spec) { this.textures.set(id, { ...spec }) }
    createTexture3D(id, spec) { this.textures.set(id, { ...spec }) }
    destroyTexture(id) { this.textures.delete(id) }
    copyTexture(from, to) { this.copies.push([from, to]) }
}

const HEAD = 'search synth, mixer, filter, render\n'
const program = body => `${HEAD}${body}\nrender(o0)`
const POND = elementStateKey('pond', 'synth.reactionDiffusion')
const LOOP = elementStateKey('loop', 'filter.feedback')

function pipelineFor(source) {
    const pipeline = new Pipeline(compileGraph(source), new RecordingBackend())
    pipeline.width = 256
    pipeline.height = 256
    pipeline.createSurfaces()
    pipeline.recreateTextures(pipeline.collectDefaultUniforms())
    return pipeline
}

// The backend records that hold an element's state: both halves of a state
// surface, and a node-local texture.
const stateRecords = pipeline => {
    const backend = pipeline.backend
    const surface = pipeline.surfaces.get(`rd_state_${POND}`)
    return {
        pondRead: surface && backend.textures.get(surface.read),
        pondWrite: surface && backend.textures.get(surface.write),
        loop: backend.textures.get(`${LOOP}__selfTex`)
    }
}

test('the key is the id and the resolved op name', () => {
    assert.equal(POND, 'id_pond@synth.reactionDiffusion')
    assert.notEqual(elementStateKey('a', 'synth.reactionDiffusion'), elementStateKey('a', 'synth.cellularAutomata'))
})

test('an element with _id: keys its state textures and size parameters by its key', () => {
    const graph = compileGraph(program('reactionDiffusion(_id: "pond", zoom: x4).write(o0)\nnoise().feedback(_id: "loop").write(o1)'))
    assert.ok(graph.textures.has(`global_rd_state_${POND}`), [...graph.textures.keys()].join(', '))
    assert.ok(graph.textures.has(`${LOOP}__selfTex`), [...graph.textures.keys()].join(', '))
    const rdPasses = graph.passes.filter(pass => pass.effectFunc === 'reactionDiffusion')
    assert.ok(rdPasses.length > 0)
    for (const pass of rdPasses) {
        assert.equal(pass.scopedParams.zoom, `zoom_${POND}`)
        assert.equal(pass.uniforms[`zoom_${POND}`], 4)
    }
    assert.deepEqual(graph.elementKeys, {
        pond: { op: 'synth.reactionDiffusion', key: POND, state: { global_rd_state: `global_rd_state_${POND}`, zoom: `zoom_${POND}` } },
        loop: { op: 'filter.feedback', key: LOOP, state: { _selfTex: `${LOOP}__selfTex` } }
    })
})

test('an element without _id:, or a repeated one, keeps its position key', () => {
    const plain = compileGraph(program('reactionDiffusion(zoom: x4).write(o0)\nnoise().feedback().write(o1)'))
    assert.ok(plain.textures.has('global_rd_state_chain_0'))
    // Steps 0 and 1 are reactionDiffusion and its write, so feedback is step 3.
    assert.ok(plain.textures.has('node_3__selfTex'), [...plain.textures.keys()].join(', '))
    assert.equal(plain.elementKeys, undefined)
    const repeated = compileGraph(program('reactionDiffusion(_id: "pond").write(o0)\nreactionDiffusion(_id: "pond").write(o1)'))
    assert.ok(repeated.textures.has(`global_rd_state_${POND}`))
    assert.ok(repeated.textures.has('global_rd_state_chain_1'), 'the S010 duplicate keeps its position key')
})

test('a replacement effect under the same id gets new state', () => {
    const before = compileGraph(program('reactionDiffusion(_id: "a").write(o0)'))
    const after = compileGraph(program('cellularAutomata(_id: "a").write(o0)'))
    const keys = graph => [...graph.textures.keys()].filter(key => key.includes('id_a@'))
    assert.ok(keys(before).length > 0 && keys(after).length > 0)
    assert.equal(keys(before).filter(key => keys(after).includes(key)).length, 0)
})

const BASE = 'perlin().write(o1)\nnoise().blendMode(tex: reactionDiffusion(_id: "pond", zoom: x4)).feedback(_id: "loop").write(o0)'
const EDITS = {
    'a chain is inserted before its chain': `solid(color: #ff0000).write(o2)\n${BASE}`,
    'an effect is inserted before it': 'perlin().write(o1)\nnoise().invert().blendMode(tex: reactionDiffusion(_id: "pond", zoom: x4)).invert().feedback(_id: "loop").write(o0)',
    'an earlier chain is deleted': 'noise().blendMode(tex: reactionDiffusion(_id: "pond", zoom: x4)).feedback(_id: "loop").write(o0)',
    'the chains are reordered': 'noise().blendMode(tex: reactionDiffusion(_id: "pond", zoom: x4)).feedback(_id: "loop").write(o0)\nperlin().write(o1)'
}

for (const [edit, body] of Object.entries(EDITS)) {
    test(`an element with _id: keeps its state across a recompile after ${edit}`, () => {
        const pipeline = pipelineFor(program(BASE))
        const before = stateRecords(pipeline)
        assert.ok(before.pondRead && before.pondWrite && before.loop, 'the state is allocated')
        assert.ok(recompile(pipeline, program(body)), 'the edit compiles')
        const after = stateRecords(pipeline)
        assert.equal(after.pondRead, before.pondRead)
        assert.equal(after.pondWrite, before.pondWrite)
        assert.equal(after.loop, before.loop)
    })
}

test('without _id:, inserting a chain before moves the state to a new key', () => {
    const pipeline = pipelineFor(program('reactionDiffusion(zoom: x4).write(o0)'))
    assert.ok(pipeline.surfaces.has('rd_state_chain_0'))
    recompile(pipeline, program('perlin().write(o1)\nreactionDiffusion(zoom: x4).write(o0)'))
    assert.ok(pipeline.graph.textures.has('global_rd_state_chain_1'))
    assert.ok(!pipeline.graph.textures.has('global_rd_state_chain_0'))
})

function rendererFor(pipeline) {
    const renderer = Object.create(CanvasRenderer.prototype)
    renderer._pipeline = pipeline
    return renderer
}

test('keyOf() returns an element key, and null for an element or name it does not have', () => {
    const renderer = rendererFor(pipelineFor(program(BASE)))
    assert.equal(renderer.keyOf('pond', 'global_rd_state'), `global_rd_state_${POND}`)
    assert.equal(renderer.keyOf('pond', 'zoom'), `zoom_${POND}`)
    assert.equal(renderer.keyOf('loop', '_selfTex'), `${LOOP}__selfTex`)
    assert.equal(renderer.keyOf('missing', 'global_rd_state'), null)
    assert.equal(renderer.keyOf('pond', 'missing'), null)
    assert.equal(rendererFor(null).keyOf('pond', 'global_rd_state'), null)
})

test('moveState() copies live state from one key to another, and refuses a key that does not exist', () => {
    const pipeline = pipelineFor(program(BASE))
    const renderer = rendererFor(pipeline)
    const from = renderer.keyOf('pond', 'global_rd_state')
    const fromLoop = renderer.keyOf('loop', '_selfTex')
    // The rename action: the program text gets the new id, and the state moves to it.
    recompile(pipeline, program(BASE.replace('"pond"', '"lake"').replace('"loop"', '"ring"')))
    const to = renderer.keyOf('lake', 'global_rd_state')
    const toLoop = renderer.keyOf('ring', '_selfTex')
    assert.ok(to && toLoop)
    const fromSurface = pipeline.surfaces.get(from.slice('global_'.length))
    const toSurface = pipeline.surfaces.get(to.slice('global_'.length))
    pipeline.backend.copies.length = 0
    assert.equal(renderer.moveState(from, to), true)
    assert.deepEqual(pipeline.backend.copies, [[fromSurface.read, toSurface.read], [fromSurface.write, toSurface.write]])
    pipeline.backend.copies.length = 0
    assert.equal(renderer.moveState(fromLoop, toLoop), true)
    assert.deepEqual(pipeline.backend.copies, [[fromLoop, toLoop]])
    pipeline.backend.copies.length = 0
    assert.equal(renderer.moveState('global_missing', to), false)
    assert.equal(renderer.moveState(to, to), false)
    assert.equal(renderer.moveState(fromLoop, to), false, 'a texture and a surface are not one kind of state')
    assert.equal(renderer.moveState('global_o1', 'global_o0'), false, 'a surface no element keys is not element state')
    assert.equal(renderer.moveState(to, toLoop), false, 'two different states are not one state under two ids')
    assert.equal(rendererFor(null).moveState(from, to), false)
    assert.deepEqual(pipeline.backend.copies, [])
})

const widthOf = (pipeline, surfaceName) => pipeline.backend.textures.get(pipeline.surfaces.get(surfaceName).read).width

test('moveState() refuses textures of two formats, and 3D textures', () => {
    const pipeline = pipelineFor(program(BASE))
    const renderer = rendererFor(pipeline)
    const from = renderer.keyOf('loop', '_selfTex')
    recompile(pipeline, program(BASE.replace('"loop"', '"ring"')))
    const to = renderer.keyOf('ring', '_selfTex')
    const textures = pipeline.backend.textures
    textures.set(to, { ...textures.get(to), format: 'rgba8' })
    assert.equal(renderer.moveState(from, to), false, 'two formats')
    textures.set(to, { ...textures.get(from), depth: 4, is3D: true })
    assert.equal(renderer.moveState(from, to), false, '3D')
    assert.deepEqual(pipeline.backend.copies.filter(([a]) => a === from), [])
})

test('moveState() takes the place of the id from the element, not from the name', () => {
    // A state name that itself holds `id_` cannot pass for another state.
    const copies = []
    const surface = name => ({ read: `global_${name}_read`, write: `global_${name}_write` })
    const names = ['grid_state_id_pond@x.y', 'grid_other_id_pond@x.y', 'grid_other_id_lake@x.y']
    const fake = {
        graph: { elementKeys: { pond: { op: 'x.y', key: 'id_pond@x.y', state: { global_grid_other: 'global_grid_other_id_pond@x.y' } } } },
        surfaces: new Map(names.map(name => [name, surface(name)])),
        backend: {
            textures: new Map(names.flatMap(name => [[`global_${name}_read`, { format: 'rgba16f' }], [`global_${name}_write`, { format: 'rgba16f' }]])),
            copyTexture: (from, to) => copies.push([from, to])
        },
        parseGlobalName: Pipeline.prototype.parseGlobalName,
        isRenameOf: Pipeline.prototype.isRenameOf
    }
    assert.equal(Pipeline.prototype.moveState.call(fake, 'global_grid_state_id_pond@x.y', 'global_grid_other_id_pond@x.y'), false)
    assert.equal(Pipeline.prototype.moveState.call(fake, 'global_grid_other_id_lake@x.y', 'global_grid_other_id_pond@x.y'), true)
    assert.deepEqual(copies, [['global_grid_other_id_lake@x.y_read', 'global_grid_other_id_pond@x.y_read'],
        ['global_grid_other_id_lake@x.y_write', 'global_grid_other_id_pond@x.y_write']])
})

test('the same effect name in two namespaces gives two keys', () => {
    assert.notEqual(elementStateKey('n', 'synth.noise'), elementStateKey('n', 'classicNoisedeck.noise'))
})

test('the program state applies a step stateSize to an element-keyed emitter through the device cap', () => {
    const emitter = elementStateKey('e', 'render.pointsEmit')
    const pipeline = pipelineFor(program('noise().pointsEmit(_id: "e").pointsRender().write(o0)'))
    pipeline.backend.capabilities = { maxStateSize: 512 }
    const step = pipeline.graph.passes.find(pass => pass.effectFunc === 'pointsEmit').stepIndex
    ProgramState.prototype._applyToPipeline.call({
        _renderer: { pipeline },
        _stepStates: new Map([[`step_${step}`, { values: { stateSize: 2048 } }]])
    })
    assert.equal(widthOf(pipeline, `xyz_${emitter}`), 512)
})

test('a host write of a sizing parameter resizes the element-keyed state', () => {
    const pipeline = pipelineFor(program('reactionDiffusion(_id: "pond", zoom: x4).write(o0)'))
    assert.equal(widthOf(pipeline, `rd_state_${POND}`), 64)
    pipeline.setUniform('zoom', 8)
    for (const pass of pipeline.graph.passes.filter(p => p.effectFunc === 'reactionDiffusion')) {
        assert.equal(pass.uniforms[`zoom_${POND}`], 8)
    }
    assert.equal(widthOf(pipeline, `rd_state_${POND}`), 32)
})

test('an emitter with _id: keys its particle state, and a host stateSize write resizes it', () => {
    const emitter = elementStateKey('e', 'render.pointsEmit')
    const pipeline = pipelineFor(program('noise().pointsEmit(_id: "e").pointsRender().write(o0)'))
    assert.ok(pipeline.graph.textures.has(`global_xyz_${emitter}`), [...pipeline.graph.textures.keys()].join(', '))
    const before = widthOf(pipeline, `xyz_${emitter}`)
    const size = before === 128 ? 256 : 128
    pipeline.setUniform('stateSize', size)
    assert.equal(widthOf(pipeline, `xyz_${emitter}`), size)
})

test('two uses of a part keep their own state, keyed by the use path and the element id', () => {
    const FB = 'part fb {\n  .feedback(_id: "loop")\n}\n'
    const graph = compileGraph(program(`${FB}noise().use(fb, _id: "a").write(o0)\nnoise().use(fb, _id: "b").write(o1)`))
    const selfTextures = [...graph.textures.keys()].filter(key => key.endsWith('__selfTex')).sort()
    assert.deepEqual(selfTextures, [`${elementStateKey('a/loop', 'filter.feedback')}__selfTex`, `${elementStateKey('b/loop', 'filter.feedback')}__selfTex`])
    assert.deepEqual(Object.keys(graph.elementKeys).sort(), ['a/loop', 'b/loop'])
})

test('a part used inside a part keys its state by every enclosing use, outermost first', () => {
    const parts = 'part fb {\n  .feedback(_id: "loop")\n}\npart outer {\n  .invert().use(fb, _id: "inner")\n}\n'
    const graph = compileGraph(program(`${parts}noise().use(outer, _id: "x").write(o0)`))
    assert.deepEqual(Object.keys(graph.elementKeys), ['x/inner/loop'])
    assert.equal(graph.elementKeys['x/inner/loop'].key, elementStateKey('x/inner/loop', 'filter.feedback'))
})

test('a use whose id repeats an earlier one keys its state by its own key name', () => {
    const FB = 'part fb {\n  .feedback(_id: "loop")\n}\n'
    const graph = compileGraph(program(`${FB}noise().use(fb, _id: "a").write(o0)\nnoise().use(fb, _id: "a").write(o1)`))
    const ids = Object.keys(graph.elementKeys)
    assert.equal(ids.length, 2, ids.join(', '))
    assert.ok(ids.includes('a/loop'), ids.join(', '))
})

test('state in a part instance survives an insertion before its use, and a rename of the use moves it', () => {
    const FB = 'part fb {\n  .feedback(_id: "loop")\n}\n'
    const base = `${FB}noise().use(fb, _id: "a").write(o0)`
    const pipeline = pipelineFor(program(base))
    const renderer = rendererFor(pipeline)
    const key = renderer.keyOf('a/loop', '_selfTex')
    assert.equal(key, `${elementStateKey('a/loop', 'filter.feedback')}__selfTex`)
    const record = pipeline.backend.textures.get(key)
    recompile(pipeline, program(`${FB}solid(color: #ff0000).write(o2)\nnoise().invert().use(fb, _id: "a").write(o0)`))
    assert.equal(renderer.keyOf('a/loop', '_selfTex'), key)
    assert.equal(pipeline.backend.textures.get(key), record, 'the same texture holds the state')
    recompile(pipeline, program(base.replace('_id: "a"', '_id: "b"')))
    const to = renderer.keyOf('b/loop', '_selfTex')
    pipeline.backend.copies.length = 0
    assert.equal(renderer.moveState(key, to), true)
    assert.deepEqual(pipeline.backend.copies, [[key, to]])
})

test('an overlay effect with _id: draws into its element-keyed texture', () => {
    const pipeline = pipelineFor(program('noise().fibers(_id: "f").write(o0)'))
    const key = rendererFor(pipeline).keyOf('f', 'overlayTex')
    assert.equal(key, `${elementStateKey('f', 'filter.fibers')}_overlayTex`)
    const nodeId = pipeline.graph.passes.find(pass => pass.effectFunc === 'fibers').nodeId
    assert.equal(`${pipeline.stateIdOf(nodeId)}_overlayTex`, key)
    assert.ok(pipeline.graph.textures.has(key))
})

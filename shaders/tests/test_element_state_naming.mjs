// A host that gives an element an `_id:` reads the element's names from its
// planned step, reads its state's position keys with stateKeysOf() before the
// compile, and moves that state to the element's keys with moveState() after
// it, so the element keeps its running state.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from '../src/lang/index.js'
import {
    registerEffect, registerOp, registerStarterOps, mergeIntoEnums, stdEnums
} from '../src/index.js'
import { compileGraph, recompile } from '../src/runtime/compiler.js'
import { elementStateKey } from '../src/runtime/expander.js'
import { Pipeline } from '../src/runtime/pipeline.js'
import { CanvasRenderer } from '../src/renderer/canvas.js'

mergeIntoEnums(stdEnums)

const STARTERS = ['synth.perlin', 'synth.noise', 'synth.solid', 'synth.reactionDiffusion', 'synth.cellularAutomata', 'synth.media']
for (const [namespace, name] of [
    ['synth', 'perlin'], ['synth', 'noise'], ['synth', 'solid'], ['synth', 'reactionDiffusion'], ['synth', 'cellularAutomata'],
    ['synth', 'media'], ['filter', 'feedback'], ['filter', 'motionBlur'], ['filter', 'fibers'], ['filter', 'bloom'],
    ['mixer', 'blendMode'], ['points', 'flow'],
    ['render', 'pointsEmit'], ['render', 'pointsRender'], ['render', 'loopBegin'], ['render', 'loopEnd']
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
registerStarterOps(STARTERS)

class RecordingBackend {
    textures = new Map()
    copies = []
    createTexture(id, spec) { this.textures.set(id, { ...spec }) }
    createTexture3D(id, spec) { this.textures.set(id, { ...spec }) }
    destroyTexture(id) { this.textures.delete(id) }
    copyTexture(from, to) { this.copies.push([from, to]) }
}

const program = body => `search synth, filter, mixer, points, render\n${body}\nrender(o0)`
// Every planned step, in plan order, inside branches and part statements too.
const allSteps = node => !node || typeof node !== 'object' ? []
    : Array.isArray(node) ? node.flatMap(allSteps)
        : [...(Array.isArray(node.chain) ? node.chain : []), ...['then', 'elif', 'else', 'body', 'plans'].flatMap(key => allSteps(node[key]))]
const steps = source => allSteps(compile(program(source)).plans)
const POND = elementStateKey('pond', 'synth.reactionDiffusion')
const LOOP = elementStateKey('loop', 'filter.feedback')
// Steps 0 and 1 are reactionDiffusion and its write; 2 is noise and 3 feedback.
const UNNAMED = 'reactionDiffusion(zoom: x4).write(o0)\nnoise().feedback().write(o1)'
const NAMED = 'reactionDiffusion(_id: "pond", zoom: x4).write(o0)\nnoise().feedback(_id: "loop").write(o1)'

function pipelineFor(source) {
    const pipeline = new Pipeline(compileGraph(source), new RecordingBackend())
    pipeline.width = 256
    pipeline.height = 256
    pipeline.createSurfaces()
    pipeline.recreateTextures(pipeline.collectDefaultUniforms())
    return pipeline
}

function rendererFor(pipeline) {
    const renderer = Object.create(CanvasRenderer.prototype)
    renderer._pipeline = pipeline
    return renderer
}

const surfaceOf = (pipeline, key) => pipeline.surfaces.get(key.slice('global_'.length))

test('each planned step records its occurrence name and its key name', () => {
    const noises = steps('noise().write(o0)\nnoise(_id: "noise_1").write(o1)\nnoise().write(o2)')
        .filter(step => step.op === 'synth.noise')
    assert.deepEqual(noises.map(({ occurrence, keyName }) => ({ occurrence, keyName })), [
        // Its occurrence name is another element's _id:, so its key name takes a `'`.
        { occurrence: 'noise_1', keyName: "noise_1'" },
        { occurrence: 'noise_2', keyName: 'noise_1' },
        { occurrence: 'noise_3', keyName: 'noise_3' }
    ])
    assert.ok(noises.every(step => !('usePath' in step)), 'a step outside a part body has no use path')
})

test('a step from a chain held by a let records no names: its element is written in the let', () => {
    const held = steps('let c = perlin().feedback(_id: "fb")\nnoise().blendMode(tex: c).write(o0)')
    const [perlin, feedback] = ['synth.perlin', 'filter.feedback'].map(op => held.find(step => step.op === op))
    assert.ok(perlin && feedback)
    for (const step of [perlin, feedback]) {
        assert.ok(!('occurrence' in step) && !('keyName' in step), `${step.op}: ${JSON.stringify(step)}`)
    }
    const noise = held.find(step => step.op === 'synth.noise')
    assert.deepEqual([noise.occurrence, noise.keyName], ['noise_1', 'noise_1'])
    // A let that holds one call, passed as a value, applied, or read twice.
    for (const [source, op] of [
        ['let t = reactionDiffusion()\nnoise().blendMode(tex: t).write(o0)\nreactionDiffusion().write(o1)', 'synth.reactionDiffusion'],
        ['let y = feedback()\nnoise().y().write(o0)\nnoise().feedback().write(o1)', 'filter.feedback'],
        ['let y = noise()\ny().write(o0)\ny().write(o1)', 'synth.noise']
    ]) {
        const all = steps(source).filter(step => step.op === op)
        const written = all.filter(step => 'occurrence' in step)
        const fromLet = all.filter(step => !('occurrence' in step) && !('keyName' in step))
        assert.equal(fromLet.length, op === 'synth.noise' ? 2 : 1, `${source}: ${JSON.stringify(all)}`)
        assert.equal(written.length, op === 'synth.noise' ? 0 : 1, source)
    }
    // Elements passed as values inside a let, read once or twice, or applied.
    // Only the elements written outside the let are named.
    for (const [source, written] of [
        ['let c = perlin().blendMode(tex: noise().feedback())\nnoise().blendMode(tex: c).write(o0)',
            ['synth.noise', 'mixer.blendMode']],
        ['let c = perlin().blendMode(tex: noise().feedback())\nnoise().blendMode(tex: c).write(o0)\nnoise().blendMode(tex: c).write(o1)',
            ['synth.noise', 'mixer.blendMode', 'synth.noise', 'mixer.blendMode']],
        ['let c = perlin().blendMode(tex: noise(_id: "inner").feedback())\nnoise().blendMode(tex: c).write(o0)',
            ['synth.noise', 'mixer.blendMode']],
        ['let y = blendMode(tex: perlin().feedback())\nnoise().y().write(o0)', ['synth.noise']],
        // The let's call applied two values deep, and as the head of a value.
        ['let y = bloom()\nnoise().blendMode(tex: perlin().blendMode(tex: solid().y())).write(o0)',
            ['synth.noise', 'synth.perlin', 'synth.solid', 'mixer.blendMode', 'mixer.blendMode']],
        ['let y = perlin()\nnoise().blendMode(tex: solid().blendMode(tex: y().bloom())).write(o0)',
            ['synth.noise', 'synth.solid', 'filter.bloom', 'mixer.blendMode', 'mixer.blendMode']],
        // An alias renames the effect that the applied let calls, two values deep.
        ['let y = bloom()\nlet bloom = feedback\nnoise().blendMode(tex: perlin().blendMode(tex: solid().y())).write(o0)',
            ['synth.noise', 'synth.perlin', 'synth.solid', 'mixer.blendMode', 'mixer.blendMode']],
        // An alias called outside any let is written where it is called,
        // and so is a part let that a use argument replaces with an alias.
        ['let a = feedback\nnoise().a().write(o0)', ['synth.noise', 'filter.feedback']],
        ['part p {\n  let h = bloom();\n  .h()\n}\nnoise().use(p, h: feedback).write(o0)', ['synth.noise', 'filter.feedback']]
    ]) {
        const compiled = compile(program(source))
        assert.deepEqual(compiled.diagnostics.filter(d => d.severity === 'error'), [], source)
        const named = allSteps(compiled.plans).filter(step => 'occurrence' in step || 'keyName' in step || 'usePath' in step)
        assert.deepEqual(named.map(step => step.op).sort(), [...written].sort(), `${source}: ${JSON.stringify(named.map(({ op, occurrence }) => [op, occurrence]))}`)
        assert.ok(named.every(step => step.args?._id === undefined), source)
    }
})

test('a step in a part body records its use path, and its names count within the part body', () => {
    const feedbacks = steps('part fb {\n  .feedback()\n}\nnoise().feedback().use(fb, _id: "a").write(o0)\nnoise().use(fb).write(o1)')
        .filter(step => step.op === 'filter.feedback')
    assert.deepEqual(feedbacks.map(({ occurrence, keyName, usePath }) => ({ occurrence, keyName, usePath })), [
        { occurrence: 'feedback_1', keyName: 'feedback_1', usePath: undefined },
        { occurrence: 'feedback_1', keyName: 'feedback_1', usePath: ['a'] },
        { occurrence: 'feedback_1', keyName: 'feedback_1', usePath: ['use_2'] }
    ])
    // Nested uses, outermost first, by id and by occurrence name.
    const nested = 'part i {\n  .feedback()\n}\npart o {\n  .use(i, _id: "ia")\n}\n'
    assert.deepEqual(steps(`${nested}noise().use(o, _id: "ob").write(o0)`).filter(step => step.op === 'filter.feedback').map(step => step.usePath),
        [['ob', 'ia']])
    const plain = 'part i {\n  .feedback()\n}\npart o {\n  .use(i)\n}\n'
    assert.deepEqual(steps(`${plain}noise().use(o).write(o0)\nperlin().use(o).write(o1)`).filter(step => step.op === 'filter.feedback').map(step => step.usePath),
        [['use_1', 'use_1'], ['use_2', 'use_1']])
})

test('an element written in a use argument that replaces a part\'s let records no names, at any depth', () => {
    const FB = 'part p {\n  let h = feedback();\n  .h()\n}\n'
    for (const [source, written] of [
        [`${FB}noise().use(p, h: blendMode(tex: perlin())).write(o0)`, ['synth.noise']],
        [`${FB}noise().use(p, h: blendMode(tex: perlin().feedback())).write(o0)`, ['synth.noise']],
        [`${FB}noise().use(p, h: blendMode(tex: pick(perlin(), solid()))).write(o0)`, ['synth.noise']],
        // The part body's own blendMode is written in the part, not in a let.
        ['part p {\n  let h = perlin();\n  .blendMode(tex: h)\n}\nnoise().use(p, h: perlin().blendMode(tex: solid())).write(o0)',
            ['synth.noise', 'mixer.blendMode']],
        ['part p {\n  let h = perlin();\n  let g = blendMode(tex: h);\n  .g()\n}\nnoise().use(p, h: solid()).write(o0)', ['synth.noise']],
        ['part a {\n  let h = feedback();\n  .h()\n}\npart b {\n  .use(a, h: blendMode(tex: solid()))\n}\nnoise().use(b).write(o0)', ['synth.noise']],
        ['part q {\n  let h = feedback();\n  noise().h().write(o0)\n}\nuse(q, h: blendMode(tex: perlin()))', ['synth.noise']]
    ]) {
        const compiled = compile(program(source))
        assert.deepEqual(compiled.diagnostics.filter(d => d.severity === 'error'), [], source)
        const named = allSteps(compiled.plans).filter(step => 'occurrence' in step || 'keyName' in step || 'usePath' in step)
        assert.deepEqual(named.map(step => step.op), written, `${source}: ${JSON.stringify(named.map(({ op, occurrence }) => [op, occurrence]))}`)
    }
})

test('stateKeysOf() returns a step\'s own state by its position keys, and null for a step with no effect', () => {
    const renderer = rendererFor(pipelineFor(program(UNNAMED)))
    assert.deepEqual(renderer.stateKeysOf(0), { global_rd_state: 'global_rd_state_chain_0', zoom: 'zoom_chain_0' })
    assert.deepEqual(renderer.stateKeysOf(2), {}, 'noise holds no state')
    assert.deepEqual(renderer.stateKeysOf(3), { _selfTex: 'node_3__selfTex' })
    assert.equal(renderer.stateKeysOf(1), null, 'a write is not an effect step')
    assert.equal(renderer.stateKeysOf(99), null)
    assert.equal(rendererFor(null).stateKeysOf(0), null)
    renderer.stateKeysOf(0).zoom = 'changed'
    assert.equal(renderer.stateKeysOf(0).zoom, 'zoom_chain_0', 'a caller gets a copy')
})

test('stateKeysOf() returns the keys that keyOf() returns once the element has an _id:', () => {
    const renderer = rendererFor(pipelineFor(program(NAMED)))
    assert.deepEqual(renderer.stateKeysOf(0), { global_rd_state: `global_rd_state_${POND}`, zoom: `zoom_${POND}` })
    assert.deepEqual(renderer.stateKeysOf(3), { _selfTex: renderer.keyOf('loop', '_selfTex') })
})

test('a step lists the state that its element keys once it has an _id:, and no texture that the chain shares', () => {
    const pairs = [
        ['reactionDiffusion().write(o0)', 'reactionDiffusion(_id: "e").write(o0)'],
        ['cellularAutomata().write(o0)', 'cellularAutomata(_id: "e").write(o0)'],
        ['noise().feedback().write(o0)', 'noise().feedback(_id: "e").write(o0)'],
        ['noise().motionBlur().write(o0)', 'noise().motionBlur(_id: "e").write(o0)'],
        ['noise().fibers().write(o0)', 'noise().fibers(_id: "e").write(o0)'],
        ['noise().bloom().write(o0)', 'noise().bloom(_id: "e").write(o0)'],
        ['media().write(o0)', 'media(_id: "e").write(o0)'],
        ['noise().pointsEmit().pointsRender().write(o0)', 'noise().pointsEmit(_id: "e").pointsRender().write(o0)'],
        // Particle textures outside a particle pipeline are the element's own.
        ['noise().flow().write(o0)', 'noise().flow(_id: "e").write(o0)'],
        ['noise().pointsRender().write(o0)', 'noise().pointsRender(_id: "e").write(o0)'],
        ['noise().loopBegin().loopEnd().write(o0)', 'noise().loopBegin(_id: "e").loopEnd().write(o0)']
    ]
    for (const [unnamed, named] of pairs) {
        const before = compileGraph(program(unnamed))
        const after = compileGraph(program(named))
        const element = after.elementKeys.e
        const step = Object.entries(after.stepStateKeys).find(([, record]) => record.op === element.op)
        assert.ok(step, named)
        const position = before.stepStateKeys[step[0]]
        assert.equal(position.op, element.op, unnamed)
        assert.deepEqual(Object.keys(position.state).sort(), Object.keys(element.state).sort(), unnamed)
        assert.deepEqual(after.stepStateKeys[step[0]].state, element.state, named)
    }
    const media = compileGraph(program('media().write(o0)'))
    assert.deepEqual(media.stepStateKeys[0].state, { imageTex: 'imageTex_step_0' }, 'the external texture is the element\'s own')
    const flow = compileGraph(program('noise().flow().write(o0)'))
    assert.ok(Object.keys(flow.stepStateKeys[1].state).includes('global_flow_base_color'), JSON.stringify(flow.stepStateKeys[1]))
    // In a particle pipeline, the emitter lists the particle textures it
    // creates; an effect of the pipeline that reads and writes them does not.
    const pipeline = compileGraph(program('noise().pointsEmit().flow().pointsRender().write(o0)'))
    const emitter = Object.values(pipeline.stepStateKeys).find(record => record.op === 'render.pointsEmit')
    const flowStep = Object.values(pipeline.stepStateKeys).find(record => record.op === 'points.flow')
    assert.ok(Object.hasOwn(emitter.state, 'global_xyz'), JSON.stringify(emitter))
    for (const key of Object.values(emitter.state)) {
        assert.ok(!Object.values(flowStep.state).includes(key), `${key} is the emitter's, not flow's`)
    }
})

test('moveState() moves an element\'s state from the position keys it had in the previous program', () => {
    const pipeline = pipelineFor(program(UNNAMED))
    const renderer = rendererFor(pipeline)
    const from = renderer.stateKeysOf(0).global_rd_state
    const fromLoop = renderer.stateKeysOf(3)._selfTex
    recompile(pipeline, program(NAMED))
    const to = renderer.keyOf('pond', 'global_rd_state')
    const toLoop = renderer.keyOf('loop', '_selfTex')
    pipeline.backend.copies.length = 0
    assert.equal(renderer.moveState(from, to), true)
    assert.deepEqual(pipeline.backend.copies, [
        [surfaceOf(pipeline, from).read, surfaceOf(pipeline, to).read],
        [surfaceOf(pipeline, from).write, surfaceOf(pipeline, to).write]
    ])
    pipeline.backend.copies.length = 0
    assert.equal(renderer.moveState(fromLoop, toLoop), true)
    assert.deepEqual(pipeline.backend.copies, [[fromLoop, toLoop]])
    assert.equal(toLoop, `${LOOP}__selfTex`)
})

test('moveState() refuses a position key that is not the same state of the same effect in the previous program', () => {
    // A position key from two compiles back.
    const pipeline = pipelineFor(program('reactionDiffusion().write(o0)\nnoise().feedback().write(o1)'))
    const renderer = rendererFor(pipeline)
    const old = renderer.stateKeysOf(0).global_rd_state
    recompile(pipeline, program('perlin().write(o2)\nreactionDiffusion().write(o0)\nnoise().feedback().write(o1)'))
    const previous = renderer.stateKeysOf(2).global_rd_state
    assert.notEqual(previous, old)
    recompile(pipeline, program('perlin().write(o2)\nreactionDiffusion(_id: "pond").write(o0)\nnoise().feedback().write(o1)'))
    const to = renderer.keyOf('pond', 'global_rd_state')
    pipeline.backend.copies.length = 0
    assert.equal(renderer.moveState(old, to), false, 'the previous program has no such step')
    assert.equal(renderer.moveState(previous, to), true)

    // The same state name under another effect at that position: feedback
    // and motionBlur both hold a node-local `_selfTex`.
    const other = pipelineFor(program('noise().motionBlur().write(o0)'))
    const otherRenderer = rendererFor(other)
    const blur = otherRenderer.stateKeysOf(1)._selfTex
    assert.equal(blur, 'node_1__selfTex')
    recompile(other, program('noise().feedback(_id: "loop").write(o0)'))
    assert.equal(otherRenderer.moveState(blur, otherRenderer.keyOf('loop', '_selfTex')), false, 'another effect\'s state')

    // A key of the previous program that the current program gives to
    // another effect: the texture now holds that effect's state.
    const reused = pipelineFor(program('noise().feedback().write(o0)'))
    const reusedRenderer = rendererFor(reused)
    const feedbackKey = reusedRenderer.stateKeysOf(1)._selfTex
    recompile(reused, program('noise().motionBlur().write(o0)\nnoise().feedback(_id: "loop").write(o1)'))
    assert.equal(reusedRenderer.stateKeysOf(1)._selfTex, feedbackKey, 'motionBlur now holds the key')
    reused.backend.copies.length = 0
    assert.equal(reusedRenderer.moveState(feedbackKey, reusedRenderer.keyOf('loop', '_selfTex')), false,
        'a key that another effect of the current program holds')
    assert.deepEqual(reused.backend.copies, [])

    // A key that the current program gives to the same state of the same
    // effect stays a valid source: that texture holds that effect's state.
    const same = pipelineFor(program('reactionDiffusion().write(o0)'))
    const sameRenderer = rendererFor(same)
    const rd = sameRenderer.stateKeysOf(0).global_rd_state
    recompile(same, program('reactionDiffusion().write(o0)\nreactionDiffusion(_id: "b").write(o1)'))
    assert.equal(sameRenderer.stateKeysOf(0).global_rd_state, rd)
    assert.equal(sameRenderer.moveState(rd, sameRenderer.keyOf('b', 'global_rd_state')), true)

    // Another state of the same step.
    const mixed = pipelineFor(program(UNNAMED))
    const mixedRenderer = rendererFor(mixed)
    const zoom = mixedRenderer.stateKeysOf(0).zoom
    const selfTex = mixedRenderer.stateKeysOf(3)._selfTex
    recompile(mixed, program(NAMED))
    assert.equal(mixedRenderer.moveState(selfTex, mixedRenderer.keyOf('pond', 'global_rd_state')), false, 'another state')
    assert.equal(mixedRenderer.moveState(zoom, mixedRenderer.keyOf('pond', 'zoom')), false, 'a size parameter holds no state')
})

test('a new pipeline has no previous program, and a recompile keeps the one it replaced', () => {
    const pipeline = pipelineFor(program(UNNAMED))
    assert.equal(pipeline.previousStepStateKeys, null)
    const replaced = pipeline.graph.stepStateKeys
    recompile(pipeline, program(NAMED))
    assert.equal(pipeline.previousStepStateKeys, replaced)
})

test('every effect step outside a let records both names, and a builtin step neither', () => {
    const all = steps(UNNAMED)
    assert.deepEqual(all.filter(step => !step.builtin).map(({ op, occurrence, keyName }) => [op, occurrence, keyName]), [
        ['synth.reactionDiffusion', 'reactionDiffusion_1', 'reactionDiffusion_1'],
        ['synth.noise', 'noise_1', 'noise_1'],
        ['filter.feedback', 'feedback_1', 'feedback_1']
    ])
    for (const step of all.filter(step => step.builtin)) {
        assert.ok(!('occurrence' in step) && !('keyName' in step) && !('usePath' in step), JSON.stringify(step))
    }
})

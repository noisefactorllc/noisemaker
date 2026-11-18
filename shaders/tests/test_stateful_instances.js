import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
    registerEffect, registerOp, registerStarterOps, mergeIntoEnums, stdEnums
} from '../src/index.js'
import { compileGraph } from '../src/runtime/compiler.js'
import { Pipeline } from '../src/runtime/pipeline.js'
import { CanvasRenderer } from '../src/renderer/canvas.js'

mergeIntoEnums(stdEnums)

for (const [namespace, name] of [
    ['synth', 'perlin'], ['synth', 'reactionDiffusion'], ['synth', 'cellularAutomata'],
    ['mixer', 'blendMode'], ['filter', 'watercolor'],
    ['render', 'loopBegin'], ['render', 'loopEnd'],
    ['render', 'meshLoader'], ['render', 'meshRender']
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
registerStarterOps(['synth.perlin', 'synth.reactionDiffusion', 'synth.cellularAutomata', 'render.meshLoader'])

class RecordingBackend {
    textures = new Map()
    createTexture(id, spec) { this.textures.set(id, { ...spec }) }
    destroyTexture(id) { this.textures.delete(id) }
}

function build(chain) {
    const graph = compileGraph(`search synth, mixer, filter, render\n${chain}\nrender(o0)`)
    const pipeline = new Pipeline(graph, new RecordingBackend())
    pipeline.width = 1024
    pipeline.height = 1024
    pipeline.createSurfaces()
    return { graph, pipeline }
}

function instances(graph, effectFunc, statePrefix) {
    const nodes = new Map()
    for (const pass of graph.passes.filter(p => p.effectFunc === effectFunc)) {
        if (!nodes.has(pass.nodeId)) nodes.set(pass.nodeId, { passes: [], textures: new Set(), stepIndex: pass.stepIndex })
        const node = nodes.get(pass.nodeId)
        node.passes.push(pass)
        for (const texture of [...Object.values(pass.inputs || {}), ...Object.values(pass.outputs || {})]) {
            if (typeof texture === 'string' && texture.startsWith(statePrefix)) node.textures.add(texture)
        }
    }
    return [...nodes.values()].map(node => {
        assert.equal(node.textures.size, 1, 'all passes in an instance must use the same state')
        return { ...node, texture: [...node.textures][0] }
    })
}

function assertSize(pipeline, texture, size) {
    for (const side of ['read', 'write']) {
        const spec = pipeline.backend.textures.get(`${texture}_${side}`)
        assert.ok(spec, `${texture}_${side} must be allocated`)
        assert.deepEqual([spec.width, spec.height], [size, size], `${texture}_${side}`)
    }
}

const programs = {
    A: 'reactionDiffusion(zoom: x4).blendMode(tex: reactionDiffusion(zoom: x16)).write(o0)',
    B: 'perlin().blendMode(tex: reactionDiffusion(zoom: x4)).blendMode(tex: reactionDiffusion(zoom: x16)).write(o0)',
    C: 'perlin().watercolor().watercolor().write(o0)'
}

for (const id of ['A', 'B']) {
    test(`program ${id}: reactionDiffusion instances have independent state and zoom sizes`, () => {
        const { graph, pipeline } = build(programs[id])
        const nodes = instances(graph, 'reactionDiffusion', 'global_rd_state')
        assert.equal(nodes.length, 2)
        assert.notEqual(nodes[0].texture, nodes[1].texture, 'state textures must be distinct')
        assertSize(pipeline, nodes[0].texture, 256)
        assertSize(pipeline, nodes[1].texture, 64)
        for (const [index, node] of nodes.entries()) {
            const sizingParam = graph.textures.get(node.texture).width.screenDivide
            for (const pass of node.passes) {
                assert.equal(pass.scopedParams.zoom, sizingParam)
                assert.equal(pass.uniforms[sizingParam], [4, 16][index])
            }
        }
    })

    test(`program ${id}: changing one instance's zoom leaves the other's state size and uniform intact`, () => {
        const { graph, pipeline } = build(programs[id])
        const nodes = instances(graph, 'reactionDiffusion', 'global_rd_state')
        const renderer = Object.create(CanvasRenderer.prototype)
        renderer._pipeline = pipeline
        renderer.applyStepParameterValues({ [`step_${nodes[1].stepIndex}`]: { zoom: 2 } })
        assertSize(pipeline, nodes[0].texture, 256)
        assertSize(pipeline, nodes[1].texture, 512)
        renderer.applyStepParameterValues({ [`step_${nodes[0].stepIndex}`]: { zoom: 32 } })
        assertSize(pipeline, nodes[0].texture, 32)
        assertSize(pipeline, nodes[1].texture, 512)
        for (const pass of nodes[1].passes) assert.equal(pass.uniforms.zoom, 2)
    })
}

test('program C: watercolor instances have independent ping-pong state', () => {
    const { graph, pipeline } = build(programs.C)
    const nodes = instances(graph, 'watercolor', 'global_wc_state')
    assert.equal(nodes.length, 2)
    assert.notEqual(nodes[0].texture, nodes[1].texture, 'state textures must be distinct')
    for (const node of nodes) assertSize(pipeline, node.texture, 1024)
})

test('different stateful effects in one chain size from their own zoom', () => {
    for (const chain of [
        'reactionDiffusion(zoom: x4).blendMode(tex: cellularAutomata(zoom: x16)).write(o0)',
        'perlin().blendMode(tex: reactionDiffusion(zoom: x4)).blendMode(tex: cellularAutomata(zoom: x16)).write(o0)'
    ]) {
        const { graph, pipeline } = build(chain)
        const [rd] = instances(graph, 'reactionDiffusion', 'global_rd_state')
        const [ca] = instances(graph, 'cellularAutomata', 'global_ca_state')
        assert.equal(rd.texture, 'global_rd_state_chain_0')
        assert.equal(ca.texture, 'global_ca_state_chain_0')
        const rdParam = graph.textures.get(rd.texture).width.screenDivide
        const caParam = graph.textures.get(ca.texture).width.screenDivide
        assert.notEqual(rdParam, caParam, 'size parameters must be distinct')
        assertSize(pipeline, rd.texture, 256)
        assertSize(pipeline, ca.texture, 64)

        const renderer = Object.create(CanvasRenderer.prototype)
        renderer._pipeline = pipeline
        renderer.applyStepParameterValues({ [`step_${ca.stepIndex}`]: { zoom: 2 } })
        assertSize(pipeline, rd.texture, 256)
        assertSize(pipeline, ca.texture, 512)
        renderer.applyStepParameterValues({ [`step_${rd.stepIndex}`]: { zoom: 32 } })
        assertSize(pipeline, rd.texture, 32)
        assertSize(pipeline, ca.texture, 512)
    }
})

test('loopBegin and loopEnd retain their shared accumulator', () => {
    for (const chain of [
        'perlin().loopBegin().loopEnd().write(o0)',
        'perlin().loopBegin().loopEnd().loopBegin().loopEnd().write(o0)'
    ]) {
        const { graph } = build(chain)
        for (const pass of graph.passes) {
            if (pass.effectFunc === 'loopBegin') assert.equal(pass.inputs.accumTex, 'global_accum_chain_0')
            if (pass.effectFunc === 'loopEnd' && pass.outputs.fragColor.startsWith('global_')) {
                assert.equal(pass.outputs.fragColor, 'global_accum_chain_0')
            }
        }
    }
})

test('meshLoader and meshRender retain their shared mesh buffers', () => {
    const { graph } = build('meshLoader().meshRender().meshRender().write(o0)')
    const loader = graph.passes.find(p => p.effectFunc === 'meshLoader')
    const renderers = graph.passes.filter(p => p.effectFunc === 'meshRender' && p.inputs.meshPositions)
    assert.equal(renderers.length, 2)
    assert.equal(loader.inputs.positionsTex, 'global_mesh0_positions_chain_0')
    assert.equal(loader.inputs.normalsTex, 'global_mesh0_normals_chain_0')
    for (const renderer of renderers) {
        assert.equal(renderer.inputs.meshPositions, loader.inputs.positionsTex)
        assert.equal(renderer.inputs.meshNormals, loader.inputs.normalsTex)
    }
})

test('repeated state preserves each explicit or default zoom', () => {
    const { graph, pipeline } = build('reactionDiffusion(zoom: x4).blendMode(tex: reactionDiffusion()).blendMode(tex: reactionDiffusion(zoom: x16)).write(o0)')
    const nodes = instances(graph, 'reactionDiffusion', 'global_rd_state')
    assert.equal(new Set(nodes.map(node => node.texture)).size, 3)
    for (const [index, node] of nodes.entries()) assertSize(pipeline, node.texture, [256, 128, 64][index])
})

test('repeated mesh renderers keep external buffers when the loader is in another chain', () => {
    const { graph } = build('meshLoader().write(o0)\nread(o0).meshRender().meshRender().write(o1)')
    const renderers = graph.passes.filter(p => p.effectFunc === 'meshRender' && p.inputs.meshPositions)
    assert.equal(renderers.length, 2)
    for (const renderer of renderers) {
        assert.equal(renderer.inputs.meshPositions, 'global_mesh0_positions_chain_1')
        assert.equal(renderer.inputs.meshNormals, 'global_mesh0_normals_chain_1')
    }
})

test('single instances retain their existing texture IDs', () => {
    const { graph, pipeline } = build('perlin().write(o0)\nreactionDiffusion(zoom: x4).watercolor().write(o1)')
    assert.equal(instances(graph, 'reactionDiffusion', 'global_rd_state')[0].texture, 'global_rd_state_chain_1')
    assert.equal(instances(graph, 'watercolor', 'global_wc_state')[0].texture, 'global_wc_state_chain_1')
    assertSize(pipeline, 'global_rd_state_chain_1', 256)
})

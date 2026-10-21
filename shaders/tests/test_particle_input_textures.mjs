#!/usr/bin/env node
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compileGraph, registerEffect, registerOp, registerStarterOps, mergeIntoEnums, stdEnums } from '../src/index.js'

mergeIntoEnums(stdEnums)

async function load(namespace, name, starter = false) {
    const effect = (await import(`../effects/${namespace}/${name}/definition.js`)).default
    for (const key of [effect.func, `${namespace}.${effect.func}`, `${namespace}/${name}`]) registerEffect(key, effect)
    const choices = {}
    const args = Object.entries(effect.globals || {}).map(([key, spec]) => {
        const enumPath = spec.choices ? `${namespace}.${effect.func}.${key}` : spec.enum || spec.enumPath
        if (spec.choices) choices[key] = Object.fromEntries(Object.entries(spec.choices)
            .filter(([choice]) => !choice.endsWith(':'))
            .map(([choice, value]) => [choice, { type: 'Number', value }]))
        return { name: key, type: spec.type === 'vec4' ? 'color' : spec.type, default: spec.default,
            enum: enumPath, enumPath, min: spec.min, max: spec.max, uniform: spec.uniform,
            choices: spec.choices }
    })
    registerOp(`${namespace}.${effect.func}`, { name: effect.func, args })
    if (starter) registerStarterOps([`${namespace}.${effect.func}`])
    mergeIntoEnums({ [namespace]: { [effect.func]: choices } })
}

await load('synth', 'solid', true)
await load('render', 'pointsEmit')
for (const name of ['heightGrid', 'flow', 'hydraulic', 'dla', 'physarum', 'life',
    'flock', 'physical', 'attractor', 'buddhabrot', 'lenia']) {
    await load('points', name)
}

function agentPass(effect, params = '') {
    const prefix = params ? 'solid(color: #ff0000).write(o1)\n' : ''
    const dsl = `search synth, render, points\n${prefix}solid(color: #00ff00).pointsEmit().${effect}(${params}).write(o0)\nrender(o0)`
    const graph = compileGraph(dsl)
    const agentProgram = effect === 'lenia' ? '_agentField' : '_agent'
    const agent = graph.passes.find(pass => pass.effectFunc === effect && pass.program.endsWith(agentProgram))
    assert.ok(agent, `${effect}: agent pass exists`)
    return { graph, agent }
}

test('heightGrid uses the chained input for both omitted surfaces', () => {
    const { agent } = agentPass('heightGrid')
    assert.equal(agent.inputs.heightTex, 'node_1_out')
    assert.equal(agent.inputs.diffuseTex, 'node_1_out')
})

test('heightGrid resolves each optional surface independently', () => {
    const heightOnly = agentPass('heightGrid', 'heightTex: read(o1)').agent
    assert.equal(heightOnly.inputs.heightTex, 'global_o1')
    assert.equal(heightOnly.inputs.diffuseTex, 'node_3_out')
    const diffuseOnly = agentPass('heightGrid', 'diffuseTex: read(o1)').agent
    assert.equal(diffuseOnly.inputs.heightTex, 'node_3_out')
    assert.equal(diffuseOnly.inputs.diffuseTex, 'global_o1')
})

for (const [effect, surface] of [
    ['flow', 'heightTex'],
    ['hydraulic', 'heightTex'],
    ['dla', 'heightTex'],
    ['physarum', 'heightTex']
]) {
    test(`${effect} defaults its movement field to the chained input`, () => {
        const { agent } = agentPass(effect)
        assert.equal(agent.inputs.inputTex, 'node_1_out')
        assert.equal(agent.uniforms.fieldActive, 0)
    })
    test(`${effect} takes an independent ${surface} surface without changing the 2D chain`, () => {
        const { graph, agent } = agentPass(effect, `${surface}: read(o1)`)
        assert.equal(agent.inputs.inputTex, 'node_3_out')
        assert.equal(agent.inputs[surface], 'global_o1')
        assert.equal(agent.uniforms.fieldActive, 1)
        const passthrough = graph.passes.find(pass => pass.effectFunc === effect &&
            pass.program.endsWith('_passthrough') && pass.outputs.fragColor?.startsWith('node_'))
        assert.equal(passthrough.inputs.inputTex, 'node_3_out')
    })
    test(`${effect} none preserves its original movement field`, () => {
        const { agent } = agentPass(effect, `${surface}: none`)
        assert.equal(agent.inputs.inputTex, 'node_3_out')
        assert.equal(agent.uniforms.fieldActive, 0)
    })
}

for (const effect of ['life']) {
    test(`${effect} defaults particle color to the chained input`, () => {
        const { agent } = agentPass(effect)
        assert.equal(agent.inputs.inputTex, 'node_1_out')
        assert.equal(agent.uniforms.diffuseActive, 0)
    })
    test(`${effect} takes an independent diffuse surface`, () => {
        const { agent } = agentPass(effect, 'diffuseTex: read(o1)')
        assert.equal(agent.inputs.inputTex, 'node_3_out')
        assert.equal(agent.inputs.diffuseTex, 'global_o1')
        assert.equal(agent.uniforms.diffuseActive, 1)
    })
}

for (const effect of ['flow', 'hydraulic', 'dla', 'physarum', 'life',
    'flock', 'physical', 'attractor', 'buddhabrot', 'lenia']) {
    test(`${effect} keeps its existing color when diffuse is omitted or none`, () => {
        const omitted = agentPass(effect).agent
        const none = agentPass(effect, 'diffuseTex: none').agent
        assert.equal(omitted.uniforms.diffuseActive, 0)
        assert.equal(none.uniforms.diffuseActive, 0)
    })
    test(`${effect} accepts an independent diffuse surface`, () => {
        const { agent } = agentPass(effect, 'diffuseTex: read(o1)')
        assert.equal(agent.inputs.diffuseTex, 'global_o1')
        assert.equal(agent.uniforms.diffuseActive, 1)
    })
}

test('pointsEmit defaults particle color to the chained input', () => {
    const graph = compileGraph('search synth, render\nsolid(color: #00ff00).pointsEmit().write(o0)\nrender(o0)')
    const init = graph.passes.find(pass => pass.effectFunc === 'pointsEmit' && pass.program.endsWith('_init'))
    assert.equal(init.inputs.inputTex, 'node_0_out')
})

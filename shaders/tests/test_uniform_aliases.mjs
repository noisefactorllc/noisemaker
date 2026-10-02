#!/usr/bin/env node

// A pass can feed a renamed shader uniform from a global
// (pointsEmit: `uniforms: { layoutMode: "layout" }`). A live parameter change
// has to reach that shader uniform the way a recompile does.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { CanvasRenderer } from '../src/renderer/canvas.js'
import { compile, registerEffect, registerOp, registerStarterOps, mergeIntoEnums, stdEnums } from '../src/index.js'
import { expand } from '../src/runtime/expander.js'
import { ProgramState } from '../../demo/shaders/lib/program-state.js'

mergeIntoEnums(stdEnums)

async function load(namespace, name, { starter = false } = {}) {
    const instance = (await import(`../effects/${namespace}/${name}/definition.js`)).default
    registerEffect(instance.func, instance)
    registerEffect(`${namespace}.${instance.func}`, instance)
    registerEffect(`${namespace}/${name}`, instance)
    const choices = {}
    const args = Object.entries(instance.globals || {}).map(([key, spec]) => {
        let enumPath = spec.enum || spec.enumPath
        if (spec.choices && !enumPath) {
            enumPath = `${namespace}.${instance.func}.${key}`
            choices[key] = Object.fromEntries(Object.entries(spec.choices)
                .filter(([n]) => !n.endsWith(':'))
                .map(([n, v]) => [n, { type: 'Number', value: v }]))
        }
        return { name: key, type: spec.type === 'vec4' ? 'color' : spec.type, default: spec.default,
            enum: enumPath, enumPath, min: spec.min, max: spec.max, uniform: spec.uniform, choices: spec.choices }
    })
    registerOp(`${namespace}.${instance.func}`, { name: instance.func, args })
    if (starter) registerStarterOps([`${namespace}.${instance.func}`])
    mergeIntoEnums({ [namespace]: { [instance.func]: choices } })
}

await load('synth', 'noise', { starter: true })
await load('render', 'pointsEmit')
await load('render', 'pointsRender')

const DSL = 'search points, synth, render\nnoise().pointsEmit().pointsRender().write(o0)\nrender(o0)'

function build() {
    const graph = expand(compile(DSL))
    const renderer = Object.create(CanvasRenderer.prototype)
    renderer._pipeline = { graph, broadcastChainScopedParam() {} }
    renderer._currentDsl = DSL
    const init = graph.passes.find(p => p.effectKey === 'render.pointsEmit' && 'layoutMode' in (p.uniforms || {}))
    return { renderer, graph, init }
}

describe('pass-level uniform aliases', () => {
    test('the expander records the renamed uniform on the pass', () => {
        const { init } = build()
        assert.ok(init, 'pointsEmit init pass with layoutMode')
        assert.deepEqual(init.uniformAliases, { layoutMode: 'layout' })
        assert.equal(init.uniforms.layoutMode, 0)
    })

    test('applyStepParameterValues writes the aliased shader uniform', () => {
        const { renderer, init } = build()
        renderer.applyStepParameterValues({ step_1: { layout: 3 } })
        assert.equal(init.uniforms.layout, 3)
        assert.equal(init.uniforms.layoutMode, 3)
    })

    test('applyParameterValues writes the aliased uniform on its own effect only', () => {
        const { renderer, graph, init } = build()
        const other = graph.passes.find(p => p.effectKey === 'render.pointsRender')
        other.uniformAliases = { otherLayout: 'layout' }
        other.uniforms.otherLayout = 0
        const effect = { instance: init && { func: 'pointsEmit', globals: { layout: { type: 'int', uniform: 'layout' } } } }
        renderer._uniformBindings = new Map()
        renderer.applyParameterValues(effect, { layout: 2 })
        assert.equal(init.uniforms.layoutMode, 2)
        assert.equal(other.uniforms.otherLayout, 0)
    })

    test('a ProgramState change writes the aliased shader uniform', () => {
        const { renderer, init } = build()
        const state = new ProgramState({ renderer })
        state.fromDsl(DSL)
        state.setValue('step_1', 'layout', 4)
        assert.equal(init.uniforms.layoutMode, 4)
    })
})

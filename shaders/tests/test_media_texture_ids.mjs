#!/usr/bin/env node
//
// Media texture ids: the documented id 'imageTex' binds nothing.
//
// Issue #308: docs/shaders/integration.rst ("Media Inputs") showed
// renderer.updateTextureFromSource('imageTex', img). No pass ever binds a
// bare 'imageTex' — the expander names each media step's texture
// '<externalTexture>_step_N', where N is the step's node index in the
// compiled program and every step counts (a trailing .write() is its own
// node). Hosts that bind the documented id upload into a texture nothing
// samples, so the media effect renders black.
//
// Fix, 1.x-safe (no step renumbering, no id renames): the docs now show the
// per-step id and imageSize, and an additive renderer.getMediaSteps() lists
// each media step's texture id so hosts do not reproduce the numbering.
//
// Run: node shaders/tests/test_media_texture_ids.mjs

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { CanvasRenderer } from '../src/renderer/canvas.js'
import { compileGraph, registerEffect, registerOp, registerStarterOps, mergeIntoEnums, stdEnums } from '../src/index.js'

mergeIntoEnums(stdEnums)

async function load(namespace, name, { starter = false } = {}) {
    const exported = (await import(`../effects/${namespace}/${name}/definition.js`)).default
    // Class-based definitions are instantiated, as CanvasRenderer.loadEffectDefinition does.
    const instance = typeof exported === 'function' ? new exported() : exported
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

await load('synth', 'media', { starter: true })
await load('synth', 'solid', { starter: true })

function compile(dsl) {
    const graph = compileGraph(dsl)
    // A renderer without a backend still exposes graph-derived queries.
    const renderer = Object.create(CanvasRenderer.prototype)
    renderer._pipeline = { graph }
    return { graph, renderer }
}

describe('media texture ids (issue #308)', () => {
    test('the documented example program never binds bare imageTex', () => {
        const { graph } = compile('search synth\nmedia()\n  .write(o0)\n\nrender(o0)')
        for (const pass of graph.passes) {
            for (const tex of Object.values(pass.inputs || {})) {
                assert.notEqual(tex, 'imageTex',
                    `pass ${pass.id} binds the documented-but-dead id 'imageTex'`)
            }
        }
    })

    test('the media pass binds imageTex_step_0 and getMediaSteps reports it', () => {
        const { graph, renderer } = compile('search synth\nmedia()\n  .write(o0)\n\nrender(o0)')
        const mediaPass = graph.passes.find(p => p.effectKey === 'synth.media')
        assert.ok(mediaPass, 'media pass present')
        assert.equal(mediaPass.inputs.imageTex, 'imageTex_step_0')
        assert.deepEqual(graph.mediaSteps, [
            { textureId: 'imageTex_step_0', uniform: 'imageTex', stepIndex: 0, effect: 'synth.media' }
        ])
        assert.deepEqual(renderer.getMediaSteps(), graph.mediaSteps)
    })

    test('a second chain numbers its media step by node index, write() counts', () => {
        const { graph, renderer } = compile(
            'search synth\nmedia()\n  .write(o0)\n\nmedia()\n  .write(o1)\n\nrender(o0)')
        assert.deepEqual(graph.mediaSteps, [
            { textureId: 'imageTex_step_0', uniform: 'imageTex', stepIndex: 0, effect: 'synth.media' },
            { textureId: 'imageTex_step_2', uniform: 'imageTex', stepIndex: 2, effect: 'synth.media' }
        ])
        // stepIndex keys the host's applyStepParameterValues imageSize write.
        assert.equal(renderer.getMediaSteps()[1].stepIndex, 2)
    })

    test('programs without media steps report none', () => {
        const { renderer } = compile('search synth\nsolid()\n  .write(o0)\n\nrender(o0)')
        assert.deepEqual(renderer.getMediaSteps(), [])
    })

    test('getMediaSteps is safe without a pipeline', () => {
        const renderer = Object.create(CanvasRenderer.prototype)
        renderer._pipeline = null
        assert.deepEqual(renderer.getMediaSteps(), [])
    })
})
#!/usr/bin/env node
//
// The AI development contract (llms-full.txt) drifts silently: it has no
// generator, so a runtime change that adds a public CompiledGraph field or a
// renderer API leaves the contract stale until a ledger pass notices (the
// 2026-10-04 pass found exactly that: mediaSteps/getMediaSteps were shipped
// undocumented, and the oscKind noise2d statement sat under a stale source
// pin). This guard pins the graph-shape statements to live source so the next
// drift turns the JS suite red instead of waiting for an audit.
//
// Run: node shaders/tests/test_contract_graph_shape.mjs

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { CanvasRenderer } from '../src/renderer/canvas.js'
import { compileGraph, registerEffect, registerOp, registerStarterOps, mergeIntoEnums, stdEnums } from '../src/index.js'

mergeIntoEnums(stdEnums)

async function load(namespace, name, { starter = false } = {}) {
    const exported = (await import(`../effects/${namespace}/${name}/definition.js`)).default
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

await load('synth', 'solid', { starter: true })
await load('synth', 'media', { starter: true })

const contract = readFileSync(fileURLToPath(new URL('../../llms-full.txt', import.meta.url)), 'utf8')

function documentedCompiledGraphFields() {
    const start = contract.indexOf('type CompiledGraph = {')
    assert.notEqual(start, -1, 'llms-full.txt no longer documents the CompiledGraph type block')
    const end = contract.indexOf('\n}', start)
    assert.notEqual(end, -1, 'llms-full.txt CompiledGraph type block is unterminated')
    const block = contract.slice(start, end)
    return [...block.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1])
}

describe('AI development contract tracks the compiled graph shape', () => {
    test('every CompiledGraph own key is documented, and only those', () => {
        const graph = compileGraph('search synth\nsolid().write(o0)\n\nrender(o0)')
        const real = Object.keys(graph).sort()
        const documented = documentedCompiledGraphFields().sort()
        assert.deepEqual(real, documented,
            'llms-full.txt CompiledGraph type block diverged from compileGraph() output')
    })

    test('the documented mediaSteps entry shape matches graph.mediaSteps', () => {
        const graph = compileGraph('search synth\nmedia()\n  .write(o0)\n\nrender(o0)')
        assert.ok(graph.mediaSteps.length >= 1, 'the media program recorded no mediaSteps')
        const start = contract.indexOf('type CompiledGraph = {')
        const end = contract.indexOf('\n}', start)
        const block = contract.slice(start, end)
        const mediaLine = block.split('\n').find((line) => line.includes('mediaSteps'))
        assert.ok(mediaLine, 'CompiledGraph block does not document mediaSteps')
        const generic = mediaLine.match(/Array<\{([^}]*)\}>/)
        assert.ok(generic, 'documented mediaSteps is not an Array<{...}> of typed entries')
        const documentedKeys = generic[1].split(',')
            .map((part) => part.trim().split(':')[0].trim())
            .filter(Boolean)
        const realKeys = Object.keys(graph.mediaSteps[0]).sort()
        assert.deepEqual(realKeys, documentedKeys.sort(),
            'llms-full.txt mediaSteps entry shape diverged from graph.mediaSteps entries')
    })

    test('CanvasRenderer.getMediaSteps exists and is documented', () => {
        assert.equal(typeof CanvasRenderer.prototype.getMediaSteps, 'function')
        assert.ok(contract.includes('getMediaSteps'),
            'llms-full.txt does not document CanvasRenderer.getMediaSteps()')
    })
})

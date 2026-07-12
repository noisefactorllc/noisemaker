#!/usr/bin/env node
import assert from 'node:assert/strict'

import Lighting from '../effects/filter/lighting/definition.js'
import { registerOp } from '../src/lang/ops.js'
import { registerStarterOps } from '../src/lang/validator.js'
import { compileGraph } from '../src/runtime/compiler.js'
import { registerEffect } from '../src/runtime/registry.js'

registerOp('synth.solid', {
    name: 'solid',
    args: []
})

registerOp('synth.wave', {
    name: 'wave',
    args: []
})

registerOp('filter.lighting', {
    name: 'lighting',
    args: Object.entries(Lighting.globals).map(([name, def]) => ({
        name,
        type: def.type,
        default: def.default
    }))
})

registerStarterOps(['synth.solid', 'synth.wave'])

registerEffect('synth.solid', {
    name: 'Solid',
    namespace: 'synth',
    func: 'solid',
    passes: [
        {
            name: 'main',
            type: 'render',
            program: 'solid',
            inputs: {},
            outputs: { color: 'outputTex' }
        }
    ]
})

registerEffect('synth.wave', {
    name: 'Wave',
    namespace: 'synth',
    func: 'wave',
    passes: [
        {
            name: 'main',
            type: 'render',
            program: 'wave',
            inputs: {},
            outputs: { color: 'outputTex' }
        }
    ]
})

registerEffect('filter.lighting', Lighting)

const tests = []

function test(name, fn) {
    tests.push({ name, fn })
}

function lightingPass(graph) {
    const pass = graph.passes.find((candidate) => candidate.effectKey === 'filter.lighting')
    assert.ok(pass, 'compiled graph should include a lighting pass')
    return pass
}

test('lighting defaults heightMap to the current input texture', () => {
    const graph = compileGraph('search synth, filter\nsolid().lighting().write(o0)')
    const pass = lightingPass(graph)

    assert.equal(pass.inputs.inputTex, 'node_0_out')
    assert.equal(pass.inputs.heightMap, 'node_0_out')
    assert.equal('heightMap' in pass.uniforms, false)
})

test('lighting can sample normals from an explicit heightMap surface', () => {
    const graph = compileGraph('search synth, filter\nsolid().write(o0)\nwave().lighting(heightMap: read(o0)).write(o1)')
    const pass = lightingPass(graph)

    assert.equal(pass.inputs.inputTex, 'node_2_out')
    assert.equal(pass.inputs.heightMap, 'global_o0')
    assert.equal('heightMap' in pass.uniforms, false)
})

test('lighting keeps positional normalStrength backwards compatible', () => {
    const graph = compileGraph('search synth, filter\nsolid().lighting(2).write(o0)')
    const pass = lightingPass(graph)

    assert.equal(pass.uniforms.normalStrength, 2)
    assert.equal(pass.inputs.heightMap, 'node_0_out')
    assert.equal('heightMap' in pass.uniforms, false)
})

let passed = 0
let failed = 0

for (const { name, fn } of tests) {
    try {
        fn()
        console.log(`PASS: ${name}`)
        passed++
    } catch (error) {
        console.error(`FAIL: ${name}`)
        console.error(error)
        failed++
    }
}

console.log(`\n${passed} passed, ${failed} failed`)

if (failed > 0) {
    process.exit(1)
}

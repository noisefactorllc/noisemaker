// An effect declared as a configuration object, `new Effect({...})`, hands on
// the same textures as the same declaration written as a class with fields.
// The expander reads outputTex, outputXyz, outputVel and outputRgba to bind
// the next effect in the chain.
import assert from 'node:assert/strict'
import test from 'node:test'
import { lex } from '../src/lang/lexer.js'
import { parse } from '../src/lang/parser.js'
import { validate, registerStarterOps } from '../src/lang/validator.js'
import { registerOp } from '../src/lang/ops.js'
import { registerEffect } from '../src/runtime/registry.js'
import { expand } from '../src/runtime/expander.js'
import { Effect } from '../src/runtime/effect.js'
import attractor from '../effects/points/attractor/definition.js'

// For each field: the consumer's pass input that reads it.
const FIELDS = {
    outputTex: { uniform: 'src', reads: 'inputTex' },
    outputXyz: { uniform: 'xyzTex', reads: 'inputXyz' },
    outputVel: { uniform: 'velTex', reads: 'inputVel' },
    outputRgba: { uniform: 'rgbaTex', reads: 'inputRgba' }
}

function producerConfig(name, field) {
    return {
        name,
        func: name,
        textures: { stateTex: { width: 8, height: 8, format: 'rgba16f' } },
        passes: [{ name: 'main', program: 'state', outputs: { color: 'stateTex' } }],
        [field]: 'stateTex'
    }
}

const consumers = new Set()
function register(name, effect, { starter = false } = {}) {
    registerOp(`user.${name}`, { name, args: [] })
    if (starter) registerStarterOps([`user.${name}`])
    registerEffect(`user.${name}`, effect)
}

function consumerFor(field) {
    const name = `${field}Reader`
    if (!consumers.has(name)) {
        const { uniform, reads } = FIELDS[field]
        register(name, new Effect({
            name, func: name,
            passes: [{ name: 'main', program: 'reader', inputs: { src: 'inputTex', [uniform]: reads }, outputs: { color: 'outputTex' } }]
        }))
        consumers.add(name)
    }
    return name
}

function consumerBinding(producer, field) {
    const consumer = consumerFor(field)
    const result = validate(parse(lex(`search user\n${producer}().${consumer}().write(o0)\nrender(o0)`)))
    const errors = result.diagnostics.filter(d => d.severity === 'error')
    assert.deepEqual(errors, [], `${producer}: ${JSON.stringify(errors)}`)
    const { passes } = expand(result)
    const pass = passes.find(p => p.effectKey === `user.${consumer}`)
    assert.ok(pass, `${consumer} has a pass`)
    return pass.inputs[FIELDS[field].uniform]
}

for (const field of Object.keys(FIELDS)) {
    test(`new Effect({...}) carries ${field}, and hands it on as the class form does`, () => {
        const viaConfig = `${field}ViaConfig`
        const viaClass = `${field}ViaClass`
        const config = new Effect(producerConfig(viaConfig, field))
        assert.equal(config[field], 'stateTex', `new Effect(config).${field}`)
        register(viaConfig, config, { starter: true })
        class Producer extends Effect {}
        const instance = new Producer(producerConfig(viaClass, field))
        instance[field] = 'stateTex'
        register(viaClass, instance, { starter: true })
        const classBinding = consumerBinding(viaClass, field)
        assert.equal(classBinding, 'node_0_stateTex', `the class form hands on its state texture through ${field}`)
        assert.equal(consumerBinding(viaConfig, field), classBinding)
    })
}

test('points/attractor, made with new Effect({...}), carries outputXyz, outputVel and outputRgba', () => {
    assert.equal(attractor.outputXyz, 'global_xyz')
    assert.equal(attractor.outputVel, 'global_vel')
    assert.equal(attractor.outputRgba, 'global_rgba')
})

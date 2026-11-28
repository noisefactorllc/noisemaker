#!/usr/bin/env node

// A parameter's own choice names win over the DSL's state values. The
// unparser writes choices by bare name, so `geometry: seed` and `channel: a`
// have to compile back to the choice, not to the `seed` or `a` state value.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import sacredGeometry from '../effects/synth/sacredGeometry/definition.js'
import noise from '../effects/synth/noise/definition.js'
import channel from '../effects/filter/channel/definition.js'
import { compile, unparse } from '../src/lang/index.js'
import { lex } from '../src/lang/lexer.js'
import { registerOp } from '../src/lang/ops.js'
import { registerStarterOps } from '../src/lang/validator.js'
import { registerEffect } from '../src/runtime/registry.js'
import { stdEnums } from '../src/lang/std_enums.js'

function register(namespace, effect) {
    registerEffect(effect.func, effect)
    registerEffect(`${namespace}.${effect.func}`, effect)
    registerOp(`${namespace}.${effect.func}`, {
        name: effect.func,
        // Mirror CanvasRenderer.registerEffectWithRuntime's arg mapping.
        args: Object.entries(effect.globals).map(([name, spec]) => ({
            name,
            type: spec.type,
            default: spec.default,
            enum: spec.enum || spec.enumPath,
            enumPath: spec.enum || spec.enumPath,
            min: spec.min,
            max: spec.max,
            uniform: spec.uniform,
            choices: spec.choices
        }))
    })
}

register('synth', sacredGeometry)
register('synth', noise)
register('filter', channel)
registerStarterOps(['sacredGeometry', 'synth.sacredGeometry', 'noise', 'synth.noise'])

const stepArgs = (compiled, op) => compiled.plans
    .flatMap(plan => plan.chain)
    .find(step => step.op === op).args

const channelA = stdEnums.channel.a.value ?? stdEnums.channel.a

describe('choice names that shadow state values', () => {
    test('an inline choice named `seed` selects the choice', () => {
        const compiled = compile('search synth\nsacredGeometry(geometry: seed).write(o0)\nrender(o0)')
        assert.equal(stepArgs(compiled, 'synth.sacredGeometry').geometry, sacredGeometry.globals.geometry.choices.seed)
    })

    test('an enum member named `a` selects the member', () => {
        const compiled = compile('search synth, filter\nsacredGeometry().channel(channel: a).write(o0)\nrender(o0)')
        assert.equal(stepArgs(compiled, 'filter.channel').channel, channelA)
    })

    test('the unparsed program compiles back to the same choices', () => {
        const source = 'search synth, filter\nsacredGeometry(geometry: seed).channel(channel: a).write(o0)\nrender(o0)'
        const again = compile(unparse(compile(source), {}, {}))
        assert.equal(stepArgs(again, 'synth.sacredGeometry').geometry, sacredGeometry.globals.geometry.choices.seed)
        assert.equal(stepArgs(again, 'filter.channel').channel, channelA)
    })

    test('a state value still binds a parameter that has no such choice', () => {
        const compiled = compile('search synth\nsacredGeometry(scale: seed).write(o0)\nrender(o0)')
        assert.equal(typeof stepArgs(compiled, 'synth.sacredGeometry').scale?.fn, 'function')
    })
})

describe('identifier names inherited by the keyword table', () => {
    for (const name of ['toString', 'valueOf', 'constructor', 'hasOwnProperty', '__proto__']) {
        test(`${name} lexes as an identifier`, () => {
            assert.equal(lex(name)[0].type, 'IDENT')
        })

        test(`${name} can bind an effect argument`, () => {
            const compiled = compile(`search synth\nlet ${name} = 2\nnoise(scaleX: ${name}).write(o0)\nrender(o0)`)
            assert.deepEqual(compiled.diagnostics, [])
            assert.deepEqual(stepArgs(compiled, 'synth.noise').scaleX, { _varRef: name, value: 2 })
        })
    }

    test('a prototype-property name lexes as a member segment', () => {
        assert.deepEqual(lex('oscKind.toString').map(token => token.type), ['IDENT', 'DOT', 'IDENT', 'EOF'])
    })

    test('an unknown prototype-property member reaches condition validation', () => {
        const compiled = compile('search synth\nnoise().write(o0)\nif (oscKind.toString) { noise().write(o1) }\nrender(o0)')
        assert.deepEqual(compiled.diagnostics.map(({ code, message }) => ({ code, message })), [
            { code: 'S001', message: "Unknown enum path: 'oscKind.toString'" }
        ])
    })

    test('reserved words still lex as keywords', () => {
        const source = 'let render write write3d true false if elif else break continue return search subchain'
        assert.deepEqual(lex(source).map(token => token.type), [
            'LET', 'RENDER', 'WRITE', 'WRITE3D', 'TRUE', 'FALSE', 'IF', 'ELIF',
            'ELSE', 'BREAK', 'CONTINUE', 'RETURN', 'SEARCH', 'SUBCHAIN', 'EOF'
        ])
    })
})

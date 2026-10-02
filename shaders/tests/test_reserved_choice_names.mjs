#!/usr/bin/env node

// A parameter's own choice names win over the DSL's state values. The
// unparser writes choices by bare name, so `geometry: seed` and `channel: a`
// have to compile back to the choice, not to the `seed` or `a` state value.

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import sacredGeometry from '../effects/synth/sacredGeometry/definition.js'
import channel from '../effects/filter/channel/definition.js'
import { compile, unparse } from '../src/lang/index.js'
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
register('filter', channel)
registerStarterOps(['sacredGeometry', 'synth.sacredGeometry'])

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

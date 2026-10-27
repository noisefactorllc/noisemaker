import assert from 'node:assert/strict'
import { registerEffect } from '../src/runtime/registry.js'
import { expand } from '../src/runtime/expander.js'

registerEffect('passConstants', {
    globals: {
        layer: { type: 'int', default: 7, uniform: 'layer' },
        amount: { type: 'float', default: 0.5, uniform: 'amount' }
    },
    passes: [0, 1].map(layer => ({
        program: 'deposit',
        uniforms: { layer, strength: 'amount' },
        outputs: { fragColor: 'outputTex' }
    }))
})

const { passes, errors } = expand({
    plans: [{ chain: [{ op: 'passConstants', args: { amount: 0.25 }, from: null, temp: 0 }], out: 'o0' }],
    diagnostics: [],
    render: 'o0'
})
assert.deepEqual(errors, [])
assert.deepEqual(passes.map(pass => pass.uniforms.layer), [0, 1],
    'explicit pass constants must distinguish draws sharing one shader program')
assert.deepEqual(passes.map(pass => pass.uniforms.strength), [0.25, 0.25],
    'effect-global references must retain the resolved argument value')
console.log('PASS: pass constants and effect-global uniform references remain distinct')

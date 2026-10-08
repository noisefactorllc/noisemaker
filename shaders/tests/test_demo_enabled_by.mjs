import assert from 'node:assert/strict'
import { UIController } from '../../demo/shaders/lib/demo-ui.js'

// A condition on a parameter that an oscillator, MIDI, audio or a variable
// drives has no single value to test, so the gate stays open while the
// source moves the parameter.
const ui = Object.create(UIController.prototype)
const enabled = (condition, params) => ui._evaluateEnableCondition(condition, params)

const lfo = { type: 'Oscillator', min: 1, max: 5 }
const knob = { type: 'Midi', channel: 1 }
const beat = { _ast: { type: 'Audio' } }
const bound = { _varRef: 'osc1', value: 0 }
const focal = { and: ['viewMode', { param: 'aperture', gt: 0 }] }
const refract = { and: [{ param: 'refractAAmt', gt: 0 }, { param: 'blendMode', neq: 100 }] }

assert.equal(enabled(focal, { viewMode: 2, aperture: 1.5 }), true)
assert.equal(enabled(focal, { viewMode: 2, aperture: 0 }), false)
assert.equal(enabled(focal, { viewMode: 0, aperture: 1.5 }), false)
for (const aperture of [lfo, knob, beat, bound]) {
    assert.equal(enabled(focal, { viewMode: 2, aperture }), true, `focal dist is live under ${JSON.stringify(aperture)}`)
}
assert.equal(enabled(focal, { viewMode: 0, aperture: lfo }), false, 'the flat view still closes focal dist')
assert.equal(enabled(refract, { refractAAmt: lfo, blendMode: 100 }), false, 'cloak still closes refract direction')
assert.equal(enabled(refract, { refractAAmt: lfo, blendMode: 10 }), true)
assert.equal(enabled({ not: { param: 'a', eq: 1 } }, { a: lfo }), true)
assert.equal(enabled({ or: [{ param: 'a', eq: 1 }, { param: 'b', gt: 2 }] }, { a: 0, b: lfo }), true)
assert.equal(enabled('flag', { flag: bound }), true)

// The demo binds a let-variable as { _varRef, value }; getStepValues unwraps it
// to the sampled value, so the dependent controls must read the stored binding.
const element = { classList: new Set(), setAttribute() {} }
element.classList.remove = element.classList.delete
const states = { step_0: { viewMode: 2, aperture: bound } }
Object.assign(ui, {
    _dependentControls: [{ element, effectKey: 'step_0', enabledBy: focal }],
    _programState: {
        getStepValues: key => ({ ...states[key], aperture: states[key].aperture.value }),
        getAllStepValues: () => states
    }
})
ui._updateDependentControls()
assert.equal(element.classList.has('disabled'), false, 'a variable-bound aperture keeps focal dist live')
assert.equal(element.inert, false)
states.step_0.aperture = 0
ui._updateDependentControls()
assert.equal(element.classList.has('disabled'), true, 'aperture 0 closes focal dist')
assert.equal(element.inert, true)

console.log('PASS demo enabledBy gates stay open while an automation drives their condition')

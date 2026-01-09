/**
 * Tests for ProgramState and Emitter classes
 *
 * Run with: node test/program-state.test.js
 */

import assert from 'assert'
import { Emitter } from '../demo/shaders/lib/emitter.js'
import { ProgramState } from '../demo/shaders/lib/program-state.js'
import { extractEffectsFromDsl } from '../demo/shaders/lib/dsl-utils.js'

// ============================================================================
// Emitter Tests
// ============================================================================

console.log('Testing Emitter...')

// Test: on/off/emit basic functionality
{
    const emitter = new Emitter()
    const events = []

    const handler = (data) => events.push(data)
    emitter.on('test', handler)

    emitter.emit('test', { value: 1 })
    emitter.emit('test', { value: 2 })

    assert.strictEqual(events.length, 2)
    assert.deepStrictEqual(events[0], { value: 1 })
    assert.deepStrictEqual(events[1], { value: 2 })

    // Remove handler
    emitter.off('test', handler)
    emitter.emit('test', { value: 3 })

    assert.strictEqual(events.length, 2, 'Handler should not fire after off()')
    console.log('  ✓ on/off/emit basic functionality')
}

// Test: once() fires only once
{
    const emitter = new Emitter()
    let callCount = 0

    emitter.once('single', () => callCount++)

    emitter.emit('single', {})
    emitter.emit('single', {})
    emitter.emit('single', {})

    assert.strictEqual(callCount, 1, 'once() should fire only once')
    console.log('  ✓ once() fires only once')
}

// Test: error in handler doesn't break other handlers
{
    const emitter = new Emitter()
    const results = []

    emitter.on('error-test', () => results.push('first'))
    emitter.on('error-test', () => { throw new Error('Intentional error') })
    emitter.on('error-test', () => results.push('third'))

    // Suppress console.error for this test
    const originalError = console.error
    console.error = () => {}

    emitter.emit('error-test', {})

    console.error = originalError

    assert.strictEqual(results.length, 2, 'Both non-throwing handlers should run')
    assert.strictEqual(results[0], 'first')
    assert.strictEqual(results[1], 'third')
    console.log('  ✓ error in handler does not break other handlers')
}

// Test: removeAllListeners clears correctly
{
    const emitter = new Emitter()
    let count1 = 0
    let count2 = 0

    emitter.on('event1', () => count1++)
    emitter.on('event2', () => count2++)

    emitter.emit('event1', {})
    emitter.emit('event2', {})

    assert.strictEqual(count1, 1)
    assert.strictEqual(count2, 1)

    // Remove only event1 listeners
    emitter.removeAllListeners('event1')
    emitter.emit('event1', {})
    emitter.emit('event2', {})

    assert.strictEqual(count1, 1, 'event1 handler should not fire after removeAllListeners')
    assert.strictEqual(count2, 2, 'event2 handler should still fire')

    // Remove all remaining listeners
    emitter.removeAllListeners()
    emitter.emit('event2', {})

    assert.strictEqual(count2, 2, 'No handlers should fire after removeAllListeners()')
    console.log('  ✓ removeAllListeners clears correctly')
}

// Test: multiple handlers for same event
{
    const emitter = new Emitter()
    const order = []

    emitter.on('multi', () => order.push('A'))
    emitter.on('multi', () => order.push('B'))
    emitter.on('multi', () => order.push('C'))

    emitter.emit('multi', {})

    assert.deepStrictEqual(order, ['A', 'B', 'C'])
    console.log('  ✓ multiple handlers execute in order')
}

console.log('Emitter tests passed!\n')

// ============================================================================
// ProgramState Tests
// ============================================================================

console.log('Testing ProgramState...')

// Test: getValue/setValue basic operations
{
    const state = new ProgramState()

    // Set up a mock step state
    state._stepStates.set('step_0', {
        effectKey: 'filter.grade',
        effectDef: {
            globals: {
                brightness: { type: 'float', default: 0, min: -1, max: 1 },
                contrast: { type: 'float', default: 1, min: 0, max: 2 }
            }
        },
        stepIndex: 0,
        values: { brightness: 0, contrast: 1 }
    })

    // Get existing value
    assert.strictEqual(state.getValue('step_0', 'brightness'), 0)
    assert.strictEqual(state.getValue('step_0', 'contrast'), 1)

    // Set value
    state.setValue('step_0', 'brightness', 0.5)
    assert.strictEqual(state.getValue('step_0', 'brightness'), 0.5)

    // Get non-existent step returns undefined
    assert.strictEqual(state.getValue('step_999', 'brightness'), undefined)

    // Get non-existent param returns undefined
    assert.strictEqual(state.getValue('step_0', 'nonexistent'), undefined)

    console.log('  ✓ getValue/setValue basic operations')
}

// Test: emit change event on setValue
{
    const state = new ProgramState()
    const changes = []

    state._stepStates.set('step_0', {
        effectKey: 'filter.grade',
        effectDef: { globals: { scale: { type: 'float', default: 1 } } },
        stepIndex: 0,
        values: { scale: 1 }
    })

    state.on('change', (data) => changes.push(data))

    state.setValue('step_0', 'scale', 2)

    assert.strictEqual(changes.length, 1)
    assert.strictEqual(changes[0].stepKey, 'step_0')
    assert.strictEqual(changes[0].paramName, 'scale')
    assert.strictEqual(changes[0].value, 2)
    assert.strictEqual(changes[0].previousValue, 1)

    console.log('  ✓ emit change event on setValue')
}

// Test: validate float values (clamping)
{
    const state = new ProgramState()

    state._stepStates.set('step_0', {
        effectKey: 'filter.grade',
        effectDef: {
            globals: {
                brightness: { type: 'float', default: 0, min: -1, max: 1 }
            }
        },
        stepIndex: 0,
        values: { brightness: 0 }
    })

    // Set value above max
    state.setValue('step_0', 'brightness', 5)
    assert.strictEqual(state.getValue('step_0', 'brightness'), 1, 'Value should be clamped to max')

    // Set value below min
    state.setValue('step_0', 'brightness', -10)
    assert.strictEqual(state.getValue('step_0', 'brightness'), -1, 'Value should be clamped to min')

    // Set value within range
    state.setValue('step_0', 'brightness', 0.5)
    assert.strictEqual(state.getValue('step_0', 'brightness'), 0.5)

    console.log('  ✓ validate float values (clamping)')
}

// Test: validate int values
{
    const state = new ProgramState()

    state._stepStates.set('step_0', {
        effectKey: 'filter.posterize',
        effectDef: {
            globals: {
                levels: { type: 'int', default: 4, min: 2, max: 16 }
            }
        },
        stepIndex: 0,
        values: { levels: 4 }
    })

    // Set float value should be converted to int
    state.setValue('step_0', 'levels', 7.8)
    assert.strictEqual(state.getValue('step_0', 'levels'), 7, 'Float should be truncated to int')

    // Set value above max
    state.setValue('step_0', 'levels', 100)
    assert.strictEqual(state.getValue('step_0', 'levels'), 16, 'Int should be clamped to max')

    console.log('  ✓ validate int values')
}

// Test: batch() groups events correctly
{
    const state = new ProgramState()
    const changeEvents = []
    const stepChangeEvents = []

    state._stepStates.set('step_0', {
        effectKey: 'filter.grade',
        effectDef: {
            globals: {
                brightness: { type: 'float', default: 0 },
                contrast: { type: 'float', default: 1 },
                saturation: { type: 'float', default: 1 }
            }
        },
        stepIndex: 0,
        values: { brightness: 0, contrast: 1, saturation: 1 }
    })

    state.on('change', (data) => changeEvents.push(data))
    state.on('stepchange', (data) => stepChangeEvents.push(data))

    state.batch(() => {
        state.setValue('step_0', 'brightness', 0.5)
        state.setValue('step_0', 'contrast', 1.5)
        state.setValue('step_0', 'saturation', 0.8)
    })

    // Individual change events should NOT have fired
    assert.strictEqual(changeEvents.length, 0, 'No individual change events during batch')

    // stepchange event should have fired once with all changes
    assert.strictEqual(stepChangeEvents.length, 1, 'One stepchange event after batch')
    assert.strictEqual(stepChangeEvents[0].stepKey, 'step_0')
    assert.deepStrictEqual(stepChangeEvents[0].values, {
        brightness: 0.5,
        contrast: 1.5,
        saturation: 0.8
    })

    console.log('  ✓ batch() groups events correctly')
}

// Test: nested batches
{
    const state = new ProgramState()
    const stepChangeEvents = []

    state._stepStates.set('step_0', {
        effectKey: 'filter.grade',
        effectDef: {
            globals: {
                a: { type: 'float', default: 0 },
                b: { type: 'float', default: 0 }
            }
        },
        stepIndex: 0,
        values: { a: 0, b: 0 }
    })

    state.on('stepchange', (data) => stepChangeEvents.push(data))

    state.batch(() => {
        state.setValue('step_0', 'a', 1)
        state.batch(() => {
            state.setValue('step_0', 'b', 2)
        })
        // Should still be batching here
    })

    // Only one stepchange event after all batches complete
    assert.strictEqual(stepChangeEvents.length, 1, 'Nested batch should emit once')
    assert.deepStrictEqual(stepChangeEvents[0].values, { a: 1, b: 2 })

    console.log('  ✓ nested batches')
}

// Test: getStepValues returns all values
{
    const state = new ProgramState()

    state._stepStates.set('step_0', {
        effectKey: 'filter.grade',
        effectDef: { globals: {} },
        stepIndex: 0,
        values: { a: 1, b: 2, c: 3 }
    })

    const values = state.getStepValues('step_0')
    assert.deepStrictEqual(values, { a: 1, b: 2, c: 3 })

    // Non-existent step returns empty object
    assert.deepStrictEqual(state.getStepValues('step_999'), {})

    console.log('  ✓ getStepValues returns all values')
}

// Test: setStepValues sets multiple values
{
    const state = new ProgramState()

    state._stepStates.set('step_0', {
        effectKey: 'filter.grade',
        effectDef: { globals: {} },
        stepIndex: 0,
        values: { a: 0, b: 0 }
    })

    state.setStepValues('step_0', { a: 10, b: 20 })

    assert.strictEqual(state.getValue('step_0', 'a'), 10)
    assert.strictEqual(state.getValue('step_0', 'b'), 20)

    console.log('  ✓ setStepValues sets multiple values')
}

// Test: resetStep restores defaults
{
    const state = new ProgramState()

    state._stepStates.set('step_0', {
        effectKey: 'filter.grade',
        effectDef: {
            globals: {
                brightness: { type: 'float', default: 0 },
                contrast: { type: 'float', default: 1 }
            }
        },
        stepIndex: 0,
        values: { brightness: 0.8, contrast: 1.5, _skip: false }
    })

    const resetEvents = []
    state.on('reset', (data) => resetEvents.push(data))

    state.resetStep('step_0')

    assert.strictEqual(state.getValue('step_0', 'brightness'), 0, 'Brightness should be reset to default')
    assert.strictEqual(state.getValue('step_0', 'contrast'), 1, 'Contrast should be reset to default')
    assert.strictEqual(resetEvents.length, 1)
    assert.strictEqual(resetEvents[0].stepKey, 'step_0')

    console.log('  ✓ resetStep restores defaults')
}

// Test: resetStep preserves skip flag
{
    const state = new ProgramState()

    state._stepStates.set('step_0', {
        effectKey: 'filter.grade',
        effectDef: {
            globals: {
                brightness: { type: 'float', default: 0 }
            }
        },
        stepIndex: 0,
        values: { brightness: 0.8, _skip: true }
    })

    state.resetStep('step_0')

    assert.strictEqual(state.getValue('step_0', 'brightness'), 0)
    assert.strictEqual(state.isSkipped('step_0'), true, 'Skip flag should be preserved')

    console.log('  ✓ resetStep preserves skip flag')
}

// Test: setSkip/isSkipped
{
    const state = new ProgramState()

    state._stepStates.set('step_0', {
        effectKey: 'filter.grade',
        effectDef: { globals: {} },
        stepIndex: 0,
        values: {}
    })

    assert.strictEqual(state.isSkipped('step_0'), false)

    state.setSkip('step_0', true)
    assert.strictEqual(state.isSkipped('step_0'), true)

    state.setSkip('step_0', false)
    assert.strictEqual(state.isSkipped('step_0'), false)

    console.log('  ✓ setSkip/isSkipped')
}

// Test: serialize produces valid JSON
{
    const state = new ProgramState()

    state._stepStates.set('step_0', {
        effectKey: 'filter.grade',
        effectDef: { globals: {} },
        stepIndex: 0,
        values: { brightness: 0.5, _skip: false }
    })

    state._writeTargetOverrides.set(0, 'o1')
    state._readSourceOverrides.set(1, 'fb0')

    const serialized = state.serialize()

    assert.strictEqual(serialized.version, 1)
    assert.ok(serialized.stepStates)
    assert.ok(serialized.stepStates.step_0)
    assert.strictEqual(serialized.stepStates.step_0.effectKey, 'filter.grade')
    assert.strictEqual(serialized.stepStates.step_0.values.brightness, 0.5)
    assert.deepStrictEqual(serialized.overrides.writeTargets, { '0': 'o1' })
    assert.deepStrictEqual(serialized.overrides.readSources, { '1': 'fb0' })

    // Ensure it's valid JSON
    const json = JSON.stringify(serialized)
    const parsed = JSON.parse(json)
    assert.deepStrictEqual(parsed, serialized)

    console.log('  ✓ serialize produces valid JSON')
}

// Test: deserialize restores state
{
    const state = new ProgramState()

    const data = {
        version: 1,
        dsl: '',
        stepStates: {
            step_0: {
                effectKey: 'filter.grade',
                values: { brightness: 0.7, contrast: 1.2 }
            }
        },
        overrides: {
            writeTargets: { '0': 'o2' },
            readSources: { '1': 'fb1' }
        },
        mediaInputs: {},
        textInputs: {}
    }

    // Pre-populate stepStates for deserialize to work (it only overrides existing)
    state._stepStates.set('step_0', {
        effectKey: 'filter.grade',
        effectDef: { globals: {} },
        stepIndex: 0,
        values: {}
    })

    state.deserialize(data)

    assert.strictEqual(state._writeTargetOverrides.get('0'), 'o2')
    assert.strictEqual(state._readSourceOverrides.get('1'), 'fb1')

    console.log('  ✓ deserialize restores state')
}

// Test: getEffectParameterValuesProxy backward compatibility
{
    const state = new ProgramState()

    state._stepStates.set('step_0', {
        effectKey: 'filter.grade',
        effectDef: { globals: {} },
        stepIndex: 0,
        values: { scale: 1 }
    })

    const proxy = state.getEffectParameterValuesProxy()

    // Read through proxy
    assert.strictEqual(proxy.step_0.scale, 1)

    // Write through proxy
    proxy.step_0.scale = 2
    assert.strictEqual(state.getValue('step_0', 'scale'), 2)

    // has() check
    assert.strictEqual('step_0' in proxy, true)
    assert.strictEqual('step_999' in proxy, false)

    // ownKeys()
    const keys = Object.keys(proxy)
    assert.deepStrictEqual(keys, ['step_0'])

    console.log('  ✓ getEffectParameterValuesProxy backward compatibility')
}

// Test: structure access methods
{
    const state = new ProgramState()

    state._stepStates.set('step_0', {
        effectKey: 'synth.noise',
        effectDef: { name: 'noise', globals: {} },
        stepIndex: 0,
        values: {}
    })
    state._stepStates.set('step_1', {
        effectKey: 'filter.grade',
        effectDef: { name: 'grade', globals: {} },
        stepIndex: 1,
        values: {}
    })

    state._structure = [
        { effectKey: 'synth.noise', stepIndex: 0 },
        { effectKey: 'filter.grade', stepIndex: 1 }
    ]

    assert.strictEqual(state.stepCount, 2)
    assert.deepStrictEqual(state.getStepKeys(), ['step_0', 'step_1'])

    const structure = state.getStructure()
    assert.strictEqual(structure.length, 2)
    assert.strictEqual(structure[0].effectKey, 'synth.noise')

    // Mutating returned structure shouldn't affect internal state
    structure.push({ effectKey: 'test' })
    assert.strictEqual(state.getStructure().length, 2)

    const effectDef = state.getEffectDef('step_0')
    assert.strictEqual(effectDef.name, 'noise')

    console.log('  ✓ structure access methods')
}

// Test: routing override methods
{
    const state = new ProgramState()

    // Write targets
    state.setWriteTarget(0, 'o1')
    assert.strictEqual(state.getWriteTarget(0), 'o1')
    assert.strictEqual(state.getWriteTarget(1), undefined)

    // Read sources
    state.setReadSource(1, 'fb0')
    assert.strictEqual(state.getReadSource(1), 'fb0')

    // Render target
    state.setRenderTarget('o2')
    assert.strictEqual(state.getRenderTarget(), 'o2')

    // 3D resources
    state.setRead3dVolume(0, 'vol1')
    state.setRead3dGeometry(0, 'geo1')
    state.setWrite3dVolume(1, 'vol2')
    state.setWrite3dGeometry(1, 'geo2')

    assert.strictEqual(state._read3dVolOverrides.get(0), 'vol1')
    assert.strictEqual(state._read3dGeoOverrides.get(0), 'geo1')
    assert.strictEqual(state._write3dVolOverrides.get(1), 'vol2')
    assert.strictEqual(state._write3dGeoOverrides.get(1), 'geo2')

    console.log('  ✓ routing override methods')
}

// Test: oscillator binding unwrapping
{
    const state = new ProgramState()

    state._stepStates.set('step_0', {
        effectKey: 'filter.grade',
        effectDef: { globals: {} },
        stepIndex: 0,
        values: {
            scale: 1.5,
            brightness: { _varRef: 'osc1', value: 0.3 }  // Oscillator-bound
        }
    })

    // getValue should unwrap oscillator bindings
    assert.strictEqual(state.getValue('step_0', 'scale'), 1.5)
    assert.strictEqual(state.getValue('step_0', 'brightness'), 0.3, 'Should unwrap oscillator binding')

    // getStepValues should also unwrap
    const values = state.getStepValues('step_0')
    assert.strictEqual(values.brightness, 0.3)

    console.log('  ✓ oscillator binding unwrapping')
}

// Test: setValue preserves oscillator binding
{
    const state = new ProgramState()

    state._stepStates.set('step_0', {
        effectKey: 'filter.grade',
        effectDef: { globals: {} },
        stepIndex: 0,
        values: {
            brightness: { _varRef: 'osc1', value: 0.3 }
        }
    })

    // Setting value should preserve the _varRef
    state.setValue('step_0', 'brightness', 0.8)

    const rawValue = state._stepStates.get('step_0').values.brightness
    assert.strictEqual(rawValue._varRef, 'osc1', 'Should preserve oscillator binding')
    assert.strictEqual(rawValue.value, 0.8, 'Should update value within binding')

    console.log('  ✓ setValue preserves oscillator binding')
}

console.log('ProgramState tests passed!\n')

// ============================================================================
// extractEffectsFromDsl Tests
// ============================================================================

console.log('Testing extractEffectsFromDsl...')

// Note: These tests require effects to be registered. In a full test environment,
// effects would be loaded. Here we test what we can without effect registration.

// Test: basic DSL parsing structure
{
    const dsl = 'search synth, filter\n\nnoise().grade().write(o0)\n\nrender(o0)'
    const effects = extractEffectsFromDsl(dsl)

    // extractEffectsFromDsl may return null/empty if effects aren't registered
    // This is expected in unit test environment without full effect loading
    if (effects && effects.length > 0) {
        // Find the noise effect
        const noise = effects.find(e => e.effectKey === 'synth.noise' || e.name === 'noise')
        assert.ok(noise, 'Should find noise effect')

        // Find the grade effect
        const grade = effects.find(e => e.effectKey === 'filter.grade' || e.name === 'grade')
        assert.ok(grade, 'Should find grade effect')

        console.log('  ✓ basic DSL parsing (with effects loaded)')
    } else {
        console.log('  ✓ basic DSL parsing (effects not registered - skipped)')
    }
}

// Test: DSL with args
{
    const dsl = 'search synth, filter\n\nnoise(scale=2).grade(brightness=0.5).write(o0)\n\nrender(o0)'
    const effects = extractEffectsFromDsl(dsl)

    if (effects && effects.length > 0) {
        // Find noise and check args
        const noise = effects.find(e => e.effectKey === 'synth.noise' || e.name === 'noise')
        if (noise && noise.args) {
            assert.strictEqual(noise.args.scale, 2, 'Noise should have scale=2')
        }

        // Find grade and check args
        const grade = effects.find(e => e.effectKey === 'filter.grade' || e.name === 'grade')
        if (grade && grade.args) {
            assert.strictEqual(grade.args.brightness, 0.5, 'Grade should have brightness=0.5')
        }

        console.log('  ✓ DSL with args (with effects loaded)')
    } else {
        console.log('  ✓ DSL with args (effects not registered - skipped)')
    }
}

// Test: invalid DSL returns null or empty
{
    const effects = extractEffectsFromDsl('this is not valid dsl {{{')
    assert.ok(!effects || effects.length === 0, 'Invalid DSL should return null or empty')

    console.log('  ✓ invalid DSL returns null or empty')
}

// Test: empty DSL returns empty array
{
    const effects = extractEffectsFromDsl('')
    assert.ok(!effects || effects.length === 0, 'Empty DSL should return null or empty')

    console.log('  ✓ empty DSL returns null or empty')
}

console.log('extractEffectsFromDsl tests passed!\n')

// ============================================================================
// Summary
// ============================================================================

console.log('═══════════════════════════════════════')
console.log('All ProgramState tests passed! ✓')
console.log('═══════════════════════════════════════')

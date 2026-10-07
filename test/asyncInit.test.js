import assert from 'assert'
import { Effect } from '../shaders/src/runtime/effect.js'
import { Pipeline } from '../shaders/src/runtime/pipeline.js'
import { registerEffect, unregisterEffect } from '../shaders/src/runtime/registry.js'

// Base class asyncInit must return a Promise (not undefined)
{
    const effect = new Effect()
    const result = effect.asyncInit({})
    assert.ok(result instanceof Promise, 'base asyncInit must return a Promise')
    await result
}

// Config-based asyncInit must return the handler's Promise
{
    let called = false
    const effect = new Effect({
        asyncInit: async (context) => {
            called = true
            assert.ok(context.width === 100)
            assert.ok(context.height === 100)
        }
    })

    const context = {
        updateTexture: () => {},
        width: 100,
        height: 100,
        params: {},
        isCancelled: () => false
    }

    const result = effect.asyncInit(context)
    assert.ok(result instanceof Promise, 'config asyncInit must return a Promise')
    await result
    assert.ok(called, 'config asyncInit handler must be invoked')
}

// Subclass asyncInit returns a Promise
{
    let called = false
    class TestEffect extends Effect {
        async asyncInit() {
            called = true
        }
    }

    const effect = new TestEffect()
    const result = effect.asyncInit({})
    assert.ok(result instanceof Promise, 'subclass asyncInit must return a Promise')
    await result
    assert.ok(called, 'subclass asyncInit handler must be invoked')
}

// Config asyncInit that throws should propagate via the returned Promise
{
    const effect = new Effect({
        asyncInit: async () => {
            throw new Error('test error')
        }
    })

    const result = effect.asyncInit({})
    assert.ok(result instanceof Promise, 'throwing asyncInit must still return a Promise')
    await assert.rejects(result, /test error/)
}

console.log('asyncInit tests passed')

// Pipeline.whenAsyncInitsSettled() resolves only after every started asyncInit
// (including a scheduled debounced regeneration) has settled, so a capture can
// wait for an async CPU overlay instead of counting frames.
{
    const pipeline = new Pipeline({ passes: [], textures: new Map() }, { updateTextureFromSource: () => {} })
    const order = []
    let release
    const effectDef = new Effect({
        asyncInit: async (context) => {
            await new Promise(resolve => { release = resolve })
            context.updateTexture('overlayTex', {})
            order.push('drawn')
        }
    })

    pipeline._startAsyncInit('node_0', effectDef)
    const settled = pipeline.whenAsyncInitsSettled().then(() => order.push('settled'))
    await new Promise(resolve => setTimeout(resolve, 10))
    assert.deepStrictEqual(order, [], 'must not settle while asyncInit is in flight')
    release()
    await settled
    assert.deepStrictEqual(order, ['drawn', 'settled'])
    assert.strictEqual(pipeline._asyncInitPromises.size, 0, 'settled inits are forgotten')

    // A debounced regeneration that is scheduled but not started yet counts.
    pipeline._startAsyncInit('node_0', effectDef, { debounce: true })
    const debounced = pipeline.whenAsyncInitsSettled().then(() => order.push('settled again'))
    await new Promise(resolve => setTimeout(resolve, 350))
    release()
    await debounced
    assert.deepStrictEqual(order, ['drawn', 'settled', 'drawn', 'settled again'])

    // A failing asyncInit is logged, not rethrown.
    const originalError = console.error
    console.error = () => {}
    try {
        pipeline._startAsyncInit('node_1', new Effect({ asyncInit: async () => { throw new Error('boom') } }))
        await pipeline.whenAsyncInitsSettled()
    } finally {
        console.error = originalError
    }
}

// Pipeline.setUniform re-runs an asyncInit overlay when one of its params
// changes, as the UI parameter paths do, and leaves other effects alone.
{
    const drawn = []
    const overlay = new Effect({
        globals: {
            density: { type: 'float', default: 0.5, uniform: 'density' },
            alpha: { type: 'float', default: 1, uniform: 'alpha' }
        },
        asyncInit: async ({ params }) => { drawn.push(params.density) }
    })
    registerEffect('test/overlay', overlay)
    try {
        const pass = { nodeId: 'node_3', effectKey: 'test/overlay', uniforms: { density: 0.5, alpha: 1 } }
        const other = { nodeId: 'node_4', effectKey: 'test/missing', uniforms: { density: 0.5 } }
        const pipeline = new Pipeline({ passes: [pass, other], textures: new Map() }, { updateTextureFromSource: () => {} })
        pipeline.globalUniforms = {}
        pipeline.setUniform('density', 0.9)
        await pipeline.whenAsyncInitsSettled()
        assert.deepStrictEqual(drawn, [0.9], 'a changed overlay param must regenerate the overlay once')
        pipeline.setUniform('density', 0.9)
        await pipeline.whenAsyncInitsSettled()
        assert.deepStrictEqual(drawn, [0.9], 'an unchanged value must not regenerate')
    } finally {
        unregisterEffect('test/overlay')
    }
}

// The cache holds the values each overlay was drawn from: setting the drawn
// value again does not redraw (fibers clears its overlay first, so a needless
// redraw flashes), while setting a value that differs from the drawn one
// redraws even when it equals the stale global uniform.
{
    const drawn = []
    const overlay = new Effect({
        globals: {
            density: { type: 'float', default: 0.5, uniform: 'density' },
            alpha: { type: 'float', default: 1, uniform: 'alpha' }
        },
        asyncInit: async ({ params }) => { drawn.push(params.density) }
    })
    registerEffect('test/overlay2', overlay)
    try {
        const pass = { nodeId: 'node_5', effectKey: 'test/overlay2', uniforms: { density: 0.5, alpha: 1 } }
        const pipeline = new Pipeline({ passes: [pass], textures: new Map() }, { updateTextureFromSource: () => {} })
        pipeline.globalUniforms = { density: 0.5, alpha: 1 }
        pipeline.initAsyncEffects()
        await pipeline.whenAsyncInitsSettled()
        assert.deepStrictEqual(drawn, [0.5])
        pipeline.setUniform('density', 0.5)
        await pipeline.whenAsyncInitsSettled()
        assert.deepStrictEqual(drawn, [0.5], 'setting the drawn value must not redraw')
        // The UI path redraws this node at 0.8; the global stays 0.5.
        pipeline.checkAsyncRegen('node_5', 'test/overlay2', { density: 0.8, alpha: 1 })
        await pipeline.whenAsyncInitsSettled()
        assert.deepStrictEqual(drawn, [0.5, 0.8])
        pipeline.setUniform('density', 0.5)
        await pipeline.whenAsyncInitsSettled()
        assert.deepStrictEqual(drawn, [0.5, 0.8, 0.5], 'a value that differs from the drawn one must redraw')
    } finally {
        unregisterEffect('test/overlay2')
    }
}

// An automated param reaches asyncInit as its default, not as a config object.
{
    let received
    const overlay = new Effect({
        globals: { density: { type: 'float', default: 0.5, uniform: 'density' } },
        asyncInit: async ({ params }) => { received = params.density }
    })
    const pipeline = new Pipeline({ passes: [], textures: new Map() }, { updateTextureFromSource: () => {} })
    pipeline._startAsyncInit('node_6', overlay, { params: { density: { type: 'Oscillator', speed: 1 } } })
    await pipeline.whenAsyncInitsSettled()
    assert.strictEqual(received, 0.5)
}

console.log('setUniform asyncInit regeneration tests passed')

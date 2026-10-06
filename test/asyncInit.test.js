import assert from 'assert'
import { Effect } from '../shaders/src/runtime/effect.js'
import { Pipeline } from '../shaders/src/runtime/pipeline.js'

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

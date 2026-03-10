import assert from 'assert'
import { Effect } from '../shaders/src/runtime/effect.js'

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

import assert from 'node:assert/strict'
import test from 'node:test'
import { WebGL2Backend } from '../src/runtime/backends/webgl2.js'
import { WebGPUBackend } from '../src/runtime/backends/webgpu.js'

for (const [name, expected] of Object.entries({
    SRC_COLOR: 'src', DST_COLOR: 'dst',
    ONE_MINUS_SRC_COLOR: 'one-minus-src', ONE_MINUS_DST_COLOR: 'one-minus-dst'
})) {
    test(`WebGPU maps ${name} in either blend-factor slot`, () => {
        for (const blend of [[name, 'ZERO'], ['ZERO', name]]) {
            const state = WebGPUBackend.prototype.resolveBlendState(blend)
            for (const component of ['color', 'alpha']) {
                assert.deepEqual(state[component], {
                    srcFactor: blend[0] === name ? expected : 'zero',
                    dstFactor: blend[1] === name ? expected : 'zero', operation: 'add'
                })
            }
        }
    })
}

test('WebGPU retains canonical factors, alpha factors and default blending', () => {
    const resolve = blend => WebGPUBackend.prototype.resolveBlendState(blend)
    assert.equal(resolve(undefined), undefined)
    assert.deepEqual(resolve(['SRC_ALPHA', 'ONE_MINUS_SRC_ALPHA']).color,
        { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' })
    assert.deepEqual(resolve(['src', 'one-minus-dst']).color,
        { srcFactor: 'src', dstFactor: 'one-minus-dst', operation: 'add' })
    assert.deepEqual(resolve(true).color,
        { srcFactor: 'one', dstFactor: 'one', operation: 'add' })
})

test('WebGL2 preserves the zero constant for both accepted spellings and numeric input', () => {
    const backend = { gl: { ZERO: 0, ONE: 1, SRC_ALPHA: 0x302 } }
    const resolve = factor => WebGL2Backend.prototype.resolveBlendFactor.call(backend, factor)
    assert.equal(resolve('ZERO'), 0)
    assert.equal(resolve('zero'), 0)
    assert.equal(resolve(0), 0)
    assert.equal(resolve('ONE'), 1)
    assert.equal(resolve('SRC_ALPHA'), 0x302)
    assert.equal(resolve('unknown'), 1)
})

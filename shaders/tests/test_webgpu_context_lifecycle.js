import assert from 'node:assert/strict'
import test from 'node:test'
import { WebGPUBackend } from '../src/runtime/backends/webgpu.js'

function fixture() {
    const device = { queue: {}, addEventListener() {} }
    const context = {
        configuration: { device },
        getConfiguration() { return this.configuration },
        unconfigure() { this.configuration = null; this.unconfigureCount++ },
        unconfigureCount: 0
    }
    return { backend: new WebGPUBackend(device, context), context, device }
}

test('disposing an old WebGPU backend preserves a replacement canvas configuration', () => {
    const { backend, context } = fixture()
    const replacementDevice = { queue: {} }
    context.configuration = { device: replacementDevice }
    let released = false
    backend.activeUniformBuffers.push({ destroy() { released = true } })
    backend.destroy()
    assert.equal(context.getConfiguration().device, replacementDevice)
    assert.equal(context.unconfigureCount, 0)
    assert.equal(released, true, 'old GPU resources must still be released')
    assert.equal(backend.context, null)
})

test('disposing the configured WebGPU backend releases its canvas', () => {
    const { backend, context } = fixture()
    backend.destroy()
    assert.equal(context.getConfiguration(), null)
    assert.equal(context.unconfigureCount, 1)
})

test('disposing an already unconfigured WebGPU backend is safe', () => {
    const { backend, context } = fixture()
    context.configuration = null
    backend.destroy()
    assert.equal(context.getConfiguration(), null)
})

test('WebGPU contexts without configuration inspection retain their cleanup behavior', () => {
    const { backend, context } = fixture()
    context.getConfiguration = undefined
    backend.destroy()
    assert.equal(context.unconfigureCount, 1)
})

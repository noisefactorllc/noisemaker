import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())
try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.goto(baseUrl)
    const result = await page.evaluate(async baseUrl => {
        const { WebGPUBackend } = await import(`${baseUrl}/shaders/src/runtime/backends/webgpu.js`)
        const adapter = await navigator.gpu.requestAdapter()
        const device = await adapter.requestDevice()
        const backend = new WebGPUBackend(device, null)
        const binding = { name: 'output_buffer' }
        const small = backend.createStorageBuffer(binding, {}, { screenWidth: 64, screenHeight: 64 })
        const large = backend.createStorageBuffer(binding, {}, { screenWidth: 160, screenHeight: 128 })
        const sizes = { small: small.size, large: large.size }
        if (large.size < 160 * 128 * 16) {
            backend.destroy()
            device.destroy()
            return sizes
        }

        // Write and read the last pixel of the enlarged real GPU allocation.
        const module = device.createShaderModule({ code: `
            @group(0) @binding(0) var<storage, read_write> pixels: array<f32>;
            @compute @workgroup_size(1)
            fn main() { pixels[${(160 * 128 - 1) * 4}u] = 0.75; }
        ` })
        const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } })
        const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: { buffer: large } }] })
        const readback = device.createBuffer({ size: 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
        const command = device.createCommandEncoder()
        const compute = command.beginComputePass()
        compute.setPipeline(pipeline)
        compute.setBindGroup(0, group)
        compute.dispatchWorkgroups(1)
        compute.end()
        command.copyBufferToBuffer(large, (160 * 128 - 1) * 16, readback, 0, 4)
        device.queue.submit([command.finish()])
        await readback.mapAsync(GPUMapMode.READ)
        sizes.lastPixel = new Float32Array(readback.getMappedRange())[0]
        readback.unmap()
        readback.destroy()
        sizes.reusedForSmaller = backend.createStorageBuffer(binding, {},
            { screenWidth: 64, screenHeight: 64 }) === large
        backend.destroy()
        device.destroy()
        return sizes
    }, baseUrl)
    assert.equal(result.small, 64 * 64 * 16)
    assert.ok(result.large >= 160 * 128 * 16, 'enlarged output buffer must fit every pixel')
    assert.equal(result.lastPixel, 0.75)
    assert.equal(result.reusedForSmaller, true)
    assert.deepEqual(errors, [])
    console.log('PASS WebGPU storage buffer growth: 64×64 to 160×128 and smaller reuse')
} finally {
    await browser.close()
    await releaseServer()
}

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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
    const results = await page.evaluate(async baseUrl => {
        const { WebGPUBackend } = await import(`${baseUrl}/shaders/src/runtime/backends/webgpu.js`)
        const adapter = await navigator.gpu.requestAdapter()
        if (!adapter) throw new Error('WebGPU adapter required for storage-volume regression')
        const device = await adapter.requestDevice()
        const backend = new WebGPUBackend(device, null)
        const definition = {
            name: 'Storage 3D Probe', namespace: 'user', func: 'storage3dProbe',
            textures3d: { volume: { width: 8, height: 8, depth: 8, format: 'rgba8unorm' } },
            passes: [{ name: 'fill', type: 'compute', program: 'fill',
                workgroups: [2, 2, 2], storageTextures: { volumeOut: 'node_0_volume' } }]
        }
        const source = `
            @group(0) @binding(0) var volumeOut: texture_storage_3d<rgba8unorm, write>;
            @compute @workgroup_size(4, 4, 4)
            fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
                if (any(gid >= vec3<u32>(8u, 8u, 8u))) { return; }
                textureStore(volumeOut, vec3<i32>(gid),
                    vec4<f32>(f32(gid.x) / 7.0, f32(gid.y) / 7.0, f32(gid.z) / 7.0, 1.0));
            }
        `
        const program = await backend.compileComputeProgram('fill', source, {})
        const multiSource = `
            @group(0) @binding(0) var volumeOut: texture_storage_3d<rgba8unorm, write>;
            @group(0) @binding(1) var otherOut: texture_storage_3d<rgba8unorm, write>;
            fn writeVolume(gid: vec3<u32>) {
                textureStore(volumeOut, vec3<i32>(gid),
                    vec4<f32>(f32(gid.x) / 7.0, f32(gid.y) / 7.0, f32(gid.z) / 7.0, 1.0));
            }
            fn nested(gid: vec3<u32>) { writeVolume(gid); }
            @compute @workgroup_size(4, 4, 4)
            fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
                if (any(gid >= vec3<u32>(8u, 8u, 8u))) { return; }
                nested(gid); /* otherOut belongs to another entry */
            }
            @compute @workgroup_size(4, 4, 4)
            fn other(@builtin(global_invocation_id) gid: vec3<u32>) {
                if (any(gid >= vec3<u32>(8u, 8u, 8u))) { return; }
                textureStore(otherOut, vec3<i32>(gid),
                    vec4<f32>(f32(gid.x) / 7.0, f32(gid.y) / 7.0, f32(gid.z) / 7.0, 1.0));
            }
        `
        const multi = await backend.compileComputeProgram('multi', multiSource, {})
        const memberSource = multiSource.replace(
            'fn writeVolume(gid: vec3<u32>) {',
            'struct Marker { otherOut: u32, }\nfn writeVolume(gid: vec3<u32>) { let marker = Marker(1u); if (marker.otherOut != 1u) { return; }'
        )
        const member = await backend.compileComputeProgram('multi-member', memberSource, {})
        const localSource = multiSource.replace(
            'fn nested(gid: vec3<u32>) { writeVolume(gid); }',
            'fn nested(gid: vec3<u32>) { let otherOut = 1u; if (otherOut == 1u) { writeVolume(gid); } }'
        )
        const local = await backend.compileComputeProgram('multi-local', localSource, {})
        const parameterSource = multiSource.replace(
            'fn writeVolume(gid: vec3<u32>) {',
            'fn writeVolume(gid: vec3<u32>, otherOut: u32) { if (otherOut != 1u) { return; }'
        ).replace('writeVolume(gid);', 'writeVolume(gid, 1u);')
        const parameter = await backend.compileComputeProgram('multi-parameter', parameterSource, {})
        const loopSource = multiSource.replace(
            'fn writeVolume(gid: vec3<u32>) {',
            'fn writeVolume(gid: vec3<u32>) { for (var volumeOut = 0u; volumeOut < 1u; volumeOut = volumeOut + 1u) {}'
        )
        const loop = await backend.compileComputeProgram('multi-loop', loopSource, {})
        const initializerSource = multiSource.replace(
            'fn writeVolume(gid: vec3<u32>) {',
            'fn writeVolume(gid: vec3<u32>) { let otherOut = textureDimensions(otherOut); if (otherOut.x != 8u) { return; }'
        )
        const initializer = await backend.compileComputeProgram('multi-initializer', initializerSource, {})
        if ([memberSource, localSource, parameterSource, loopSource, initializerSource].some(source => source === multiSource)) {
            throw new Error('storage-volume regression variant was not constructed')
        }
        const results = []
        for (const variant of [
            { label: 'implicit', program }, { label: 'explicit', program, entryPoint: 'main' },
            { label: 'multi-helper', program: multi, entryPoint: 'main' },
            { label: 'multi-other', program: multi, entryPoint: 'other' },
            { label: 'multi-member', program: member, entryPoint: 'main' },
            { label: 'multi-local', program: local, entryPoint: 'main' },
            { label: 'multi-parameter', program: parameter, entryPoint: 'main' },
            { label: 'multi-loop', program: loop, entryPoint: 'main' },
            { label: 'multi-initializer', program: initializer, entryPoint: 'main' }
        ]) {
            const texture = device.createTexture({ size: [8, 8, 8], dimension: '3d',
                format: 'rgba8unorm', usage: GPUTextureUsage.STORAGE_BINDING |
                    GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING })
            backend.textures.set('node_0_volume', { handle: texture, view: texture.createView() })
            const otherTexture = variant.label === 'multi-initializer'
                ? device.createTexture({ size: [8, 8, 8], dimension: '3d', format: 'rgba8unorm',
                    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING }) : null
            if (otherTexture) backend.textures.set('node_0_other', { handle: otherTexture, view: otherTexture.createView() })
            const pass = { ...definition.passes[0], storageTextures: { volumeOut: 'node_0_volume',
                otherOut: otherTexture ? 'node_0_other' : 'node_0_volume' },
                ...(variant.entryPoint ? { entryPoint: variant.entryPoint } : {}) }
            const pipeline = backend.getComputePipeline(variant.program, pass.entryPoint)
            device.pushErrorScope('validation')
            const group = backend.createBindGroup(pass, variant.program, { globalUniforms: {} }, pipeline)
            const encoder = device.createCommandEncoder()
            const compute = encoder.beginComputePass()
            compute.setPipeline(pipeline)
            compute.setBindGroup(0, group)
            compute.dispatchWorkgroups(...pass.workgroups)
            compute.end()
            const rowBytes = 256, imageBytes = rowBytes * 8
            const readback = device.createBuffer({ size: imageBytes * 8,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
            encoder.copyTextureToBuffer({ texture },
                { buffer: readback, bytesPerRow: rowBytes, rowsPerImage: 8 }, [8, 8, 8])
            device.queue.submit([encoder.finish()])
            await readback.mapAsync(GPUMapMode.READ)
            const bytes = new Uint8Array(readback.getMappedRange())
            const voxels = []
            for (let z = 0; z < 8; z++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
                const offset = z * imageBytes + y * rowBytes + x * 4
                voxels.push(...bytes.subarray(offset, offset + 4))
            }
            readback.unmap()
            readback.destroy()
            texture.destroy()
            otherTexture?.destroy()
            results.push({ label: variant.label, voxels, validation: (await device.popErrorScope())?.message ?? null })
        }
        backend.destroy()
        device.destroy()
        return results
    }, baseUrl)
    assert.equal(results.length, 9)
    for (const { label, voxels, validation } of results) {
        assert.equal(validation, null, `${label} entry point validation`)
        assert.equal(voxels.length, 8 * 8 * 8 * 4)
        for (let z = 0; z < 8; z++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
            const offset = ((z * 8 + y) * 8 + x) * 4
            for (const [channel, position] of [x, y, z].entries()) {
                assert.ok(Math.abs(voxels[offset + channel] - Math.round(position * 255 / 7)) <= 1,
                    `${label} voxel ${x},${y},${z} channel ${channel}`)
            }
            assert.equal(voxels[offset + 3], 255)
        }
    }
    for (const result of results) {
        assert.deepEqual(result.voxels, results[0].voxels)
        console.log(`VOLUME-SHA256 ${result.label} ${createHash('sha256').update(Uint8Array.from(result.voxels)).digest('hex')}`)
    }
    assert.deepEqual(errors, [])
    console.log('PASS WebGPU explicit and implicit storage-3D entry points: all 512 voxels')
} finally {
    await browser.close()
    await releaseServer()
}

import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
process.env.SHADE_VIEWER_ROOT = root
process.env.SHADE_VIEWER_PATH = '/demo/shaders/'
process.env.SHADE_EFFECTS_DIR = resolve(root, 'shaders/effects')
process.env.SHADE_GLOBALS_PREFIX = '__noisemaker'
process.env.SHADE_HEADLESS = '1'

const { BrowserSession } = await import('../../vendor/shade-mcp/harness/index.js')
const session = new BrowserSession({ backend: 'webgpu' })
await session.setup()
try {
    await session.setBackend('webgpu')
    const page = session.page
    await page.evaluate(() => {
        const editor = document.getElementById('dsl-editor')
        editor.value = 'search synth\nsolid(color: [0.2, 0.6, 0.9]).write(o0)\nrender(o0)'
        editor.dispatchEvent(new Event('input', { bubbles: true }))
        document.getElementById('dsl-run-btn').click()
    })
    await page.waitForFunction(() => {
        const status = document.getElementById('status')?.textContent || ''
        if (/error|failed/i.test(status)) throw new Error(status)
        return window.__noisemakerRenderingPipeline?.backend?.device && /compiled/i.test(status)
    }, null, { timeout: 120000 })

    const cases = await page.evaluate(async () => {
        const pipeline = window.__noisemakerRenderingPipeline
        const backend = window.__noisemakerRenderingPipeline.backend
        const device = backend.device
        const results = []
        device.pushErrorScope('validation')
        for (const [width, height] of [[5, 3], [1, 7]]) {
            const id = `__mip_parity_${width}_${height}`
            backend.createTexture(id, { width, height, format: 'rgba8unorm', mipmaps: true,
                usage: ['render', 'sample', 'copySrc', 'copyDst'] })
            const pixels = new Uint8Array(width * height * 4)
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                const offset = (y * width + x) * 4
                pixels[offset] = x * 41
                pixels[offset + 1] = y * 31
                pixels[offset + 2] = (x * 17 + y * 29) % 256
                pixels[offset + 3] = 255
            }
            const texture = backend.textures.get(id)
            device.queue.writeTexture({ texture: texture.handle }, pixels,
                { bytesPerRow: width * 4, rowsPerImage: height }, [width, height, 1])
            backend.generateMipmaps([id])
            await device.queue.onSubmittedWorkDone()
            const levels = []
            for (let level = 0; level < texture.mipLevels; level++) {
                const w = Math.max(1, width >> level)
                const h = Math.max(1, height >> level)
                const stride = Math.ceil(w * 4 / 256) * 256
                const buffer = device.createBuffer({ size: stride * h,
                    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
                const encoder = device.createCommandEncoder()
                encoder.copyTextureToBuffer({ texture: texture.handle, mipLevel: level },
                    { buffer, bytesPerRow: stride, rowsPerImage: h }, [w, h, 1])
                device.queue.submit([encoder.finish()])
                await buffer.mapAsync(GPUMapMode.READ)
                const mapped = new Uint8Array(buffer.getMappedRange())
                const bytes = new Uint8Array(w * h * 4)
                for (let y = 0; y < h; y++) {
                    bytes.set(mapped.subarray(y * stride, y * stride + w * 4), y * w * 4)
                }
                buffer.unmap()
                buffer.destroy()
                levels.push({ width: w, height: h, bytes: Array.from(bytes) })
            }
            backend.destroyTexture(id)
            results.push({ width, height, levels })
        }
        const sourceWidth = 8, sourceHeight = 6, targetWidth = 13, targetHeight = 9
        const sourceId = '__scale_source', targetId = '__scale_target'
        backend.createTexture(sourceId, { width: sourceWidth, height: sourceHeight,
            format: 'rgba8unorm', usage: ['render', 'sample', 'copySrc', 'copyDst'] })
        backend.createTexture(targetId, { width: targetWidth, height: targetHeight,
            format: 'rgba8unorm', usage: ['render', 'sample', 'copySrc', 'copyDst'] })
        const sourceBytes = new Uint8Array(sourceWidth * sourceHeight * 4)
        for (let y = 0; y < sourceHeight; y++) for (let x = 0; x < sourceWidth; x++) {
            const offset = (y * sourceWidth + x) * 4
            sourceBytes[offset] = x * 29
            sourceBytes[offset + 1] = y * 39
            sourceBytes[offset + 2] = (x + y) % 2 ? 31 : 207
            sourceBytes[offset + 3] = 255
        }
        device.queue.writeTexture({ texture: backend.textures.get(sourceId).handle }, sourceBytes,
            { bytesPerRow: sourceWidth * 4, rowsPerImage: sourceHeight },
            [sourceWidth, sourceHeight, 1])
        backend.copyTexture(sourceId, targetId)
        await device.queue.onSubmittedWorkDone()
        const stride = Math.ceil(targetWidth * 4 / 256) * 256
        const buffer = device.createBuffer({ size: stride * targetHeight,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
        const encoder = device.createCommandEncoder()
        encoder.copyTextureToBuffer({ texture: backend.textures.get(targetId).handle },
            { buffer, bytesPerRow: stride, rowsPerImage: targetHeight },
            [targetWidth, targetHeight, 1])
        device.queue.submit([encoder.finish()])
        await buffer.mapAsync(GPUMapMode.READ)
        const mapped = new Uint8Array(buffer.getMappedRange())
        const scaled = new Uint8Array(targetWidth * targetHeight * 4)
        for (let y = 0; y < targetHeight; y++) {
            scaled.set(mapped.subarray(y * stride, y * stride + targetWidth * 4), y * targetWidth * 4)
        }
        buffer.unmap()
        buffer.destroy()
        backend.destroyTexture(sourceId)
        backend.destroyTexture(targetId)
        const persistentId = '__persistent_mip_resize'
        const persistentWidth = 5, persistentHeight = 3
        const resizedWidth = 7, resizedHeight = 5
        const persistentUsage = ['render', 'sample', 'copySrc', 'copyDst']
        backend.createTexture(persistentId, { width: persistentWidth, height: persistentHeight,
            format: 'rgba8unorm', mipmaps: true, persistent: true, usage: persistentUsage })
        const persistentSource = new Uint8Array(persistentWidth * persistentHeight * 4)
        for (let y = 0; y < persistentHeight; y++) for (let x = 0; x < persistentWidth; x++) {
            const offset = (y * persistentWidth + x) * 4
            persistentSource[offset] = x * 43
            persistentSource[offset + 1] = y * 67
            persistentSource[offset + 2] = 19
            persistentSource[offset + 3] = 255
        }
        device.queue.writeTexture({ texture: backend.textures.get(persistentId).handle }, persistentSource,
            { bytesPerRow: persistentWidth * 4, rowsPerImage: persistentHeight },
            [persistentWidth, persistentHeight, 1])
        backend.generateMipmaps([persistentId])
        pipeline.recreateTexturePreserving(persistentId, { width: resizedWidth, height: resizedHeight,
            format: 'rgba8unorm', mipmaps: true, persistent: true, usage: persistentUsage })
        await device.queue.onSubmittedWorkDone()
        const persistentStride = 256
        const persistentReadback = device.createBuffer({ size: persistentStride * resizedHeight,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
        const persistentEncoder = device.createCommandEncoder()
        persistentEncoder.copyTextureToBuffer({ texture: backend.textures.get(persistentId).handle },
            { buffer: persistentReadback, bytesPerRow: persistentStride, rowsPerImage: resizedHeight },
            [resizedWidth, resizedHeight, 1])
        device.queue.submit([persistentEncoder.finish()])
        await persistentReadback.mapAsync(GPUMapMode.READ)
        const persistentMapped = new Uint8Array(persistentReadback.getMappedRange())
        const persistentResized = new Uint8Array(resizedWidth * resizedHeight * 4)
        for (let y = 0; y < resizedHeight; y++) {
            persistentResized.set(persistentMapped.subarray(y * persistentStride,
                y * persistentStride + resizedWidth * 4), y * resizedWidth * 4)
        }
        persistentReadback.unmap()
        persistentReadback.destroy()
        backend.destroyTexture(persistentId)
        const error = await device.popErrorScope()
        return { results, scaled: Array.from(scaled),
            persistentResized: Array.from(persistentResized), error: error?.message || null }
    })
    assert.equal(cases.error, null)
    for (const { levels } of cases.results) {
        for (let level = 1; level < levels.length; level++) {
            const source = levels[level - 1]
            const target = levels[level]
            for (let y = 0; y < target.height; y++) for (let x = 0; x < target.width; x++) {
                const sourceX = Math.min(source.width - 1,
                    Math.floor((x + 0.5) * source.width / target.width))
                const sourceY = Math.min(source.height - 1,
                    Math.floor((y + 0.5) * source.height / target.height))
                const expected = source.bytes.slice((sourceY * source.width + sourceX) * 4,
                    (sourceY * source.width + sourceX + 1) * 4)
                const actual = target.bytes.slice((y * target.width + x) * 4,
                    (y * target.width + x + 1) * 4)
                assert.deepEqual(actual, expected,
                    `mip ${level} pixel (${x}, ${y}) from ${source.width}x${source.height}`)
            }
        }
    }
    for (let y = 0; y < 9; y++) for (let x = 0; x < 13; x++) {
        const sourceX = Math.min(7, Math.floor((x + 0.5) * 8 / 13))
        const sourceY = Math.min(5, Math.floor((y + 0.5) * 6 / 9))
        const actual = cases.scaled.slice((y * 13 + x) * 4, (y * 13 + x + 1) * 4)
        assert.deepEqual(actual, [sourceX * 29, sourceY * 39,
            (sourceX + sourceY) % 2 ? 31 : 207, 255],
        `scaled pixel (${x}, ${y})`)
    }
    for (let y = 0; y < 5; y++) for (let x = 0; x < 7; x++) {
        const sourceX = Math.min(4, Math.floor((x + 0.5) * 5 / 7))
        const sourceY = Math.min(2, Math.floor((y + 0.5) * 3 / 5))
        const actual = cases.persistentResized.slice((y * 7 + x) * 4, (y * 7 + x + 1) * 4)
        assert.deepEqual(actual, [sourceX * 43, sourceY * 67, 19, 255],
            `persistent mipmapped resize pixel (${x}, ${y})`)
    }
    console.log('PASS: WebGPU odd-size mip levels and persistent mipmapped resize use center-nearest pixels')
} finally {
    await session.teardown()
}

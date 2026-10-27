import { test, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

test('borrowed VideoFrame uploads preserve pixels and outlive caller release', async ({ page }, testInfo) => {
    const webgpu = testInfo.project.name.includes('webgpu')
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text())
    })
    await page.route('**/__video-frame-upload__', route => route.fulfill({
        contentType: 'text/html', body: '<!doctype html><link rel="icon" href="data:,"><canvas></canvas>'
    }))
    await page.goto('/__video-frame-upload__')
    const result = await page.evaluate(async webgpu => {
        if (typeof VideoFrame !== 'function') throw new Error('A real VideoFrame implementation is required')
        const canvas = document.querySelector('canvas')
        let backend, device, gl, context
        if (webgpu) {
            const { WebGPUBackend } = await import('/shaders/src/runtime/backends/webgpu.js')
            const adapter = await navigator.gpu?.requestAdapter()
            if (!adapter) throw new Error('A real WebGPU adapter is required')
            device = await adapter.requestDevice()
            context = canvas.getContext('webgpu')
            context.configure({ device, format: navigator.gpu.getPreferredCanvasFormat(),
                alphaMode: 'premultiplied', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC })
            backend = new WebGPUBackend(device, context)
        } else {
            const { WebGL2Backend } = await import('/shaders/src/runtime/backends/webgl2.js')
            gl = canvas.getContext('webgl2', { antialias: false })
            if (!gl) throw new Error('A real WebGL2 context is required')
            backend = new WebGL2Backend(gl, canvas)
        }
        await backend.init()

        // Hand-authored 3x2 source, with asymmetric rows, columns and alpha.
        const palette = [[255, 0, 0, 255], [0, 255, 0, 170], [0, 0, 255, 85],
            [0, 255, 255, 255], [255, 0, 255, 170], [255, 255, 0, 85]]
        const source = new Uint8Array(palette.flat())
        const definitions = [
            { name: 'plain', init: {}, width: 3, height: 2, pixels: [0, 1, 2, 3, 4, 5] },
            { name: 'crop', init: { visibleRect: { x: 1, y: 0, width: 2, height: 2 } },
                width: 2, height: 2, pixels: [1, 2, 4, 5] },
            { name: 'rotate90', init: { rotation: 90 }, width: 2, height: 3, pixels: [3, 0, 4, 1, 5, 2] },
            { name: 'rotate180', init: { rotation: 180 }, width: 3, height: 2, pixels: [5, 4, 3, 2, 1, 0] },
            { name: 'rotate270', init: { rotation: 270 }, width: 2, height: 3, pixels: [2, 5, 1, 4, 0, 3] },
            { name: 'mirror', init: { flip: true }, width: 3, height: 2, pixels: [2, 1, 0, 5, 4, 3] },
            { name: 'odd', init: {}, width: 5, height: 3 },
            { name: '1080p', init: {}, width: 1920, height: 1080 },
            { name: 'display-size', init: { displayWidth: 16, displayHeight: 9 },
                width: 16, height: 9, color: [17, 68, 136, 255] },
        ]
        const rows = []
        const validationErrors = []
        const read = async (id, width, height) => {
            const out = new Uint8Array(width * height * 4)
            if (gl) {
                const framebuffer = gl.createFramebuffer()
                try {
                    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
                    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D,
                        backend.textures.get(id).handle, 0)
                    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
                        throw new Error('Uploaded texture is not framebuffer complete')
                    }
                    // Return texture rows in increasing texture-coordinate order.
                    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, out)
                    const error = gl.getError()
                    if (error !== gl.NO_ERROR) throw new Error(`Readback GL error ${error}`)
                } finally {
                    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
                    gl.deleteFramebuffer(framebuffer)
                }
                return out
            }
            canvas.width = width
            canvas.height = height
            backend.present(id)
            const bytesPerRow = Math.ceil(width * 4 / 256) * 256
            const buffer = device.createBuffer({ size: bytesPerRow * height,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
            try {
                const encoder = device.createCommandEncoder()
                encoder.copyTextureToBuffer({ texture: context.getCurrentTexture() },
                    { buffer, bytesPerRow, rowsPerImage: height }, { width, height })
                device.queue.submit([encoder.finish()])
                await buffer.mapAsync(GPUMapMode.READ)
                const mapped = new Uint8Array(buffer.getMappedRange())
                // The existing presentation blit reverses texture rows. Undo
                // that presentation transform to inspect the uploaded texture.
                for (let y = 0; y < height; y++) {
                    out.set(mapped.subarray((height - 1 - y) * bytesPerRow,
                        (height - 1 - y) * bytesPerRow + width * 4), y * width * 4)
                }
                if (navigator.gpu.getPreferredCanvasFormat() === 'bgra8unorm') {
                    for (let i = 0; i < out.length; i += 4) {
                        const b = out[i]; out[i] = out[i + 2]; out[i + 2] = b
                    }
                }
            } finally {
                buffer.unmap()
                buffer.destroy()
            }
            return out
        }
        const difference = (a, b) => {
            if (a.length !== b.length) return Math.max(a.length, b.length)
            let count = 0
            for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) count++
            return count
        }
        try {
            for (const definition of definitions) {
                for (const flipY of [undefined, false, true]) {
                    const { width, height, name, init } = definition
                    let data = source
                    let expected = definition.pixels && new Uint8Array(definition.pixels.flatMap(i => palette[i]))
                    if (definition.color) {
                        data = new Uint8Array(Array(6).fill(definition.color).flat())
                        expected = new Uint8Array(Array(width * height).fill(definition.color).flat())
                    } else if (!expected) {
                        data = new Uint8Array(width * height * 4)
                        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                            data.set([(x % 8) * 17, (y % 8) * 17, ((x + y) % 8) * 17, 255], (y * width + x) * 4)
                        }
                        expected = data.slice()
                    }
                    if (flipY !== false) {
                        const reversed = new Uint8Array(expected.length)
                        for (let y = 0; y < height; y++) reversed.set(expected.subarray(y * width * 4,
                            (y + 1) * width * 4), (height - 1 - y) * width * 4)
                        expected = reversed
                    }
                    const smallSource = definition.pixels || definition.color
                    const frame = new VideoFrame(data, { format: 'RGBA', codedWidth: smallSource ? 3 : width,
                        codedHeight: smallSource ? 2 : height, timestamp: rows.length, ...init })
                    const row = { name, flipY: flipY ?? 'default', expectedWidth: width, expectedHeight: height,
                        sourceWidth: frame.displayWidth, sourceHeight: frame.displayHeight,
                        expectedRejection: !webgpu && name === 'display-size' }
                    device?.pushErrorScope('validation')
                    try {
                        const previous = row.expectedRejection && backend.textures.get('frame')
                        const previousPixels = previous && await read('frame', previous.width, previous.height)
                        const upload = backend.updateTextureFromSource('frame', frame, flipY === undefined ? {} : { flipY })
                        row.width = upload.width
                        row.height = upload.height
                        row.thenable = typeof upload.then === 'function'
                        row.callerFrameStillLive = frame.codedWidth > 0
                        // Resource lifetime: every GPU read below occurs after
                        // closing the caller's only frame handle.
                        if (frame.codedWidth > 0) frame.close()
                        if (row.expectedRejection) {
                            row.rejectionPreservedTexture = backend.textures.get('frame').handle === previous.handle &&
                                difference(await read('frame', previous.width, previous.height), previousPixels) === 0
                        } else if (upload.width === width && upload.height === height) {
                            const actual = await read('frame', width, height)
                            row.channelMismatches = difference(actual, expected)
                            const poisoned = expected.slice(); poisoned[0] ^= 1
                            row.oneChannelMutationRejected = difference(actual, poisoned) !== 0
                            const handle = backend.textures.get('frame').handle
                            row.closedUpload = backend.updateTextureFromSource('frame', frame, { flipY: !flipY })
                            row.closedUploadPreservedTexture = backend.textures.get('frame').handle === handle &&
                                difference(await read('frame', width, height), actual) === 0
                        }
                    } catch (error) {
                        row.error = error.message
                    } finally {
                        frame.close()
                        if (device) {
                            const error = await device.popErrorScope()
                            if (error) validationErrors.push(`${name}/${flipY}: ${error.message}`)
                        }
                    }
                    rows.push(row)
                }
            }
        } finally {
            backend.destroy()
            device?.destroy()
            canvas.remove()
        }
        return { rows, validationErrors, userAgent: navigator.userAgent, backend: webgpu ? 'WebGPU' : 'WebGL2' }
    }, webgpu)
    result.browserVersion = page.context().browser()?.version() ?? null
    const resultPath = testInfo.outputPath('video-frame-upload-results.json')
    await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n')
    await testInfo.attach('video-frame-upload-results', { contentType: 'application/json', path: resultPath })
    for (const row of result.rows) {
        expect.soft(row.error, `${row.name}/${row.flipY}: unexpected failure`).toBeUndefined()
        expect.soft(row.thenable, `${row.name}/${row.flipY}: synchronous result`).toBe(false)
        expect.soft(row.callerFrameStillLive, `${row.name}/${row.flipY}: borrowed ownership`).toBe(true)
        if (row.expectedRejection) {
            // Native WebGL uploads the rotated visible rectangle without
            // display-size scaling. Refuse that unsupported source before
            // changing the existing texture or claiming display dimensions.
            expect.soft([row.width, row.height], `${row.name}/${row.flipY}: unsupported scaling`).toEqual([0, 0])
            expect.soft(row.rejectionPreservedTexture, `${row.name}/${row.flipY}: retained pixels`).toBe(true)
            continue
        }
        expect.soft([row.width, row.height], `${row.name}/${row.flipY}: uploaded size`).toEqual([row.expectedWidth, row.expectedHeight])
        expect.soft(row.channelMismatches, `${row.name}/${row.flipY}: exact RGBA`).toBe(0)
        expect.soft(row.oneChannelMutationRejected, `${row.name}/${row.flipY}: negative control`).toBe(true)
        expect.soft(row.closedUpload, `${row.name}/${row.flipY}: closed frame rejection`).toEqual({ width: 0, height: 0 })
        expect.soft(row.closedUploadPreservedTexture, `${row.name}/${row.flipY}: retained pixels`).toBe(true)
    }
    expect(result.validationErrors).toEqual([])
    expect(errors).toEqual([])
})

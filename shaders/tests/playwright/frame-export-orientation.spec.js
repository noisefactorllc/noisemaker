import { test, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

test('WebGPU frame export matches canvas presentation, including padded rows and alpha', async ({ page, browser }) => {
    test.skip(!test.info().project.name.includes('webgpu'), 'Requires the WebGPU project')
    const consoleErrors = []
    page.on('pageerror', error => consoleErrors.push(error.message))
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await page.route('**/__frame-export-orientation__', route => route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><link rel="icon" href="data:,"><canvas></canvas>'
    }))
    await page.goto('/__frame-export-orientation__')
    const result = await page.evaluate(async () => {
        const { WebGPUBackend } = await import('/shaders/src/runtime/backends/webgpu.js')
        if (!navigator.gpu) throw new Error('This functional test requires real WebGPU')
        const adapter = await navigator.gpu.requestAdapter()
        if (!adapter) throw new Error('A WebGPU adapter is required; this test must not skip')
        const device = await adapter.requestDevice()
        const canvas = document.querySelector('canvas')
        const context = canvas.getContext('webgpu')
        if (!context) throw new Error('A WebGPU canvas context is required')
        const errors = []
        const onError = event => errors.push(event.error.message)
        device.addEventListener('uncapturederror', onError)
        let destroying = false
        device.lost.then(info => {
            if (!destroying) errors.push(`Unexpected device loss: ${info.message}`)
        })
        const cases = []
        let cleanupComplete = false
        try {
            for (const width of [5, 64]) {
                const height = 5
                for (const alphaMode of ['straight', 'opaque', 'premultiplied']) {
                    canvas.width = width
                    canvas.height = height
                    const format = navigator.gpu.getPreferredCanvasFormat()
                    context.configure({ device, format, alphaMode: 'premultiplied',
                        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC })
                    const backend = new WebGPUBackend(device, context)
                    let queue
                    let readback
                    device.pushErrorScope('validation')
                    try {
                        await backend.init()
                        const canonical = new Uint8Array(width * height * 4)
                        for (let y = 0; y < height; y++) {
                            for (let x = 0; x < width; x++) {
                                const i = (y * width + x) * 4
                                canonical.set([(x % 4) * 17, (y + 1) * 17,
                                    ((x + y * 2) % 6) * 17, [85, 170, 255][(x + y) % 3]], i)
                            }
                        }
                        // Internal surfaces use the existing canvas presentation convention.
                        // Author a top-first reference independently, then lay out its rows
                        // in that convention. Neither readback path shares this CPU buffer.
                        const textureBytes = new Uint8Array(canonical.length)
                        for (let y = 0; y < height; y++) {
                            textureBytes.set(canonical.subarray(y * width * 4, (y + 1) * width * 4),
                                (height - 1 - y) * width * 4)
                        }
                        const texture = backend.createTexture('orientation', {
                            width, height, format: 'rgba8'
                        })
                        device.queue.writeTexture({ texture }, textureBytes,
                            { bytesPerRow: width * 4 }, { width, height })
                        queue = backend.createFrameExportQueue({ slots: 3,
                            onError: error => errors.push(error.message) })
                        queue.configure({ width, height, format: 'rgba8unorm',
                            colorSpace: 'srgb', alphaMode, fps: 60 })
                        const bytesPerRow = Math.ceil(width * 4 / 256) * 256
                        readback = device.createBuffer({ size: bytesPerRow * height,
                            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
                        backend.present('orientation')
                        // Capture the actual current canvas texture in this same JS task.
                        // No map, timer, browser yield, screenshot or 2D canvas precedes it.
                        const copy = device.createCommandEncoder()
                        copy.copyTextureToBuffer({ texture: context.getCurrentTexture() },
                            { buffer: readback, bytesPerRow, rowsPerImage: height }, { width, height })
                        device.queue.submit([copy.finish()])
                        const frames = []
                        const accept = (frame, timestamp) => frames.push({
                            width: frame.width, height: frame.height, rowStride: frame.rowStride,
                            timestamp, data: Array.from(frame.data)
                        })
                        const admissions = [0, 1, 2, 3].map(timestamp =>
                            queue.enqueue('orientation', timestamp, accept))
                        const synchronousCallbacks = frames.length
                        await readback.mapAsync(GPUMapMode.READ)
                        const mapped = new Uint8Array(readback.getMappedRange())
                        const presented = new Uint8Array(canonical.length)
                        for (let y = 0; y < height; y++) {
                            presented.set(mapped.subarray(y * bytesPerRow, y * bytesPerRow + width * 4),
                                y * width * 4)
                        }
                        if (format === 'bgra8unorm') {
                            for (let i = 0; i < presented.length; i += 4) {
                                const blue = presented[i]
                                presented[i] = presented[i + 2]
                                presented[i + 2] = blue
                            }
                        } else if (format !== 'rgba8unorm') {
                            throw new Error(`Unexpected canvas format ${format}`)
                        }
                        readback.unmap()
                        const drain = async count => {
                            const deadline = performance.now() + 3000
                            while (frames.length < count && performance.now() < deadline) {
                                queue.poll()
                                if (frames.length < count) await new Promise(resolve => setTimeout(resolve, 1))
                            }
                            if (frames.length !== count) throw new Error('Export maps did not complete')
                        }
                        await drain(3)
                        const reusable = queue.available && queue.enqueue('orientation', 4, accept)
                        await drain(4)
                        const expected = Uint8Array.from(presented)
                        for (let i = 0; i < expected.length; i += 4) {
                            if (alphaMode === 'opaque') expected[i + 3] = 255
                            if (alphaMode === 'premultiplied') {
                                for (let channel = 0; channel < 3; channel++) {
                                    expected[i + channel] = Math.round(expected[i + channel] * expected[i + 3] / 255)
                                }
                            }
                        }
                        // Closing a pending fifth map must release all three owned slots;
                        // its completion must not deliver another borrowed frame callback.
                        const pendingAtClose = queue.enqueue('orientation', 5, accept)
                        queue.close()
                        await device.queue.onSubmittedWorkDone()
                        await new Promise(resolve => setTimeout(resolve, 0))
                        queue.poll()
                        const validation = await device.popErrorScope()
                        if (validation) errors.push(validation.message)
                        cases.push({ width, height, alphaMode, canvasFormat: format, bytesPerRow,
                            canonical: Array.from(canonical), textureBytes: Array.from(textureBytes),
                            presented: Array.from(presented), expected: Array.from(expected), frames,
                            admissions, synchronousCallbacks, reusable, pendingAtClose,
                            closedUnavailable: !queue.available, callbacksAfterClose: frames.length,
                            stats: { ...queue.stats } })
                    } finally {
                        queue?.close()
                        readback?.unmap()
                        readback?.destroy()
                        backend.destroy()
                    }
                }
            }
        } finally {
            context.unconfigure()
            device.removeEventListener('uncapturederror', onError)
            destroying = true
            device.destroy()
            canvas.remove()
            cleanupComplete = true
        }
        return { cases, errors, cleanupComplete, userAgent: navigator.userAgent,
            adapterInfo: { vendor: adapter.info.vendor, architecture: adapter.info.architecture,
                device: adapter.info.device, description: adapter.info.description } }
    })
    // Keep actual bytes even when the orientation assertion below fails.
    const evidencePath = test.info().outputPath('frame-export-orientation.json')
    await writeFile(evidencePath, JSON.stringify({ ...result, consoleErrors,
        browserVersion: browser.version() }, null, 2))
    await test.info().attach('frame-export-orientation.json', {
        path: evidencePath, contentType: 'application/json'
    })
    expect(consoleErrors).toEqual([])
    expect(result.errors).toEqual([])
    expect(result.cleanupComplete).toBe(true)
    expect(result.cases).toHaveLength(6)
    for (const item of result.cases) {
        const label = `${item.width}x${item.height} ${item.alphaMode}`
        expect(item.presented, `${label}: independently read canvas is canonical RGBA`).toEqual(item.canonical)
        expect(item.admissions).toEqual([true, true, true, false])
        expect(item.synchronousCallbacks).toBe(0)
        expect(item.reusable).toBe(true)
        expect(item.pendingAtClose).toBe(true)
        expect(item.closedUnavailable).toBe(true)
        expect(item.callbacksAfterClose).toBe(4)
        expect(item.stats).toEqual({ accepted: 5, dropped: 2, completed: 4, failed: 0 })
        expect(item.frames.map(frame => frame.timestamp)).toEqual([0, 1, 2, 4])
        for (const frame of item.frames) {
            expect([frame.width, frame.height, frame.rowStride]).toEqual([item.width, item.height, item.width * 4])
            expect(frame.data, `${label}: exported bytes equal presented pixels with requested alpha`).toEqual(item.expected)
        }
    }
})

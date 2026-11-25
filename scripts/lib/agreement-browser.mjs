import assert from 'node:assert/strict'
import { PNG } from 'pngjs'
import { isReadbackPerformanceWarning } from './shader-parity-attestation.mjs'

export const agreementSize = 96

export async function withPageDeadline(page, operation, timeoutMs = 60_000) {
    let timer
    let expired = false
    try {
        return await Promise.race([
            operation(),
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    expired = true
                    reject(new Error('Browser operation exceeded its deadline'))
                }, timeoutMs)
            }),
        ])
    } finally {
        clearTimeout(timer)
        if (expired) await page.close()
    }
}

export async function createAgreementPage(browser, baseUrl, backend) {
    const page = await browser.newPage({ viewport: { width: agreementSize, height: agreementSize }, deviceScaleFactor: 1 })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
        if (isReadbackPerformanceWarning(message.type(), message.text())) return
        if (['warning', 'error'].includes(message.type())) errors.push(message.text())
    })
    page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`) })
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseUrl).origin ? route.continue() : route.abort())
    try {
        await page.goto(`${baseUrl}/shaders/tests/blank.html`)
        await page.setContent(`<style>body{margin:0;background:#000}canvas{display:block}</style><canvas width="${agreementSize}" height="${agreementSize}"></canvas>`)
        await withPageDeadline(page, () => page.evaluate(async ({ baseUrl, backend, size }) => {
            const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/index.js`)
            window.agreementErrors = []
            if (navigator.gpu) {
                const request = navigator.gpu.requestAdapter.bind(navigator.gpu)
                navigator.gpu.requestAdapter = async (...args) => {
                    const adapter = await request(...args)
                    if (adapter) {
                        const info = adapter.info
                        window.agreementGpu = Object.fromEntries(['vendor', 'architecture', 'device', 'description', 'isFallbackAdapter'].map(key => [key, info[key]]))
                    }
                    return adapter
                }
            }
            window.agreementRenderer = new CanvasRenderer({ canvas: document.querySelector('canvas'), width: size, height: size,
                basePath: `${baseUrl}/shaders`, preferWebGPU: backend === 'webgpu',
                onError: error => window.agreementErrors.push(error.message || String(error)) })
            const manifest = await agreementRenderer.loadManifest()
            await agreementRenderer.loadEffects(Object.keys(manifest))
            window.agreementImage = new Image()
            agreementImage.src = `${baseUrl}/demo/shaders/img/testcard.png`
            await agreementImage.decode()
        }, { baseUrl, backend, size: agreementSize }))
        assert.deepEqual(errors, [], `${backend} setup errors`)
    } catch (error) {
        await page.close()
        throw error
    }
    return {
        page,
        async render(dsl, effectId) {
            errors.length = 0
            const gpu = await withPageDeadline(page, () => page.evaluate(async ({ dsl, effectId, backend, baseUrl }) => {
                const r = window.agreementRenderer
                const { ProgramState } = await import(`${baseUrl}/demo/shaders/lib/program-state.js`)
                const { UIController } = await import(`${baseUrl}/demo/shaders/lib/demo-ui.js`)
                agreementErrors.length = 0
                await r.dispose()
                const audio = r.setAudioState()
                audio.waveform.set(Float32Array.from({ length: 128 }, (_, i) => i / 127))
                audio.spectrum.set(Float32Array.from({ length: 128 }, (_, i) => (127 - i) / 127))
                const midi = r.setMidiState()
                midi.channels[1].noteOn(48, 110, { time: 0, order: 1 })
                midi.channels[3].noteOn(67, 75, { time: 0, order: 2 })
                await r.compile(dsl)
                r.stop()
                const actual = r.pipeline.backend.getName().toLowerCase()
                if (actual !== backend) throw new Error(`Requested ${backend}, executed ${actual}`)
                if (!r.pipeline.graph.passes.some(pass => pass.effectKey === effectId.replace('/', '.'))) throw new Error(`Target did not execute: ${effectId}`)
                const gl = r.pipeline.backend.gl
                let gpu = window.agreementGpu
                if (gl) {
                    const debug = gl.getExtension('WEBGL_debug_renderer_info')
                    gpu = { renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER), vendor: gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR) }
                }
                r.render(0)
                const uploaded = new Set()
                for (const pass of r.pipeline.graph.passes) {
                    if (uploaded.has(pass.stepIndex)) continue
                    uploaded.add(pass.stepIndex)
                    const effect = r.loadedEffects.get(pass.effectKey?.replace('.', '/'))?.instance
                    if (effect?.externalTexture === 'textTex') {
                        const state = new ProgramState()
                        state.fromDsl(dsl)
                        const params = state.getStepValues(`step_${pass.stepIndex}`)
                        const ui = Object.create(UIController.prototype)
                        ui._renderer = r
                        ui._programState = state
                        ui._textInputs = new Map([[pass.stepIndex, {
                            ...params, textContent: params.text, canvas: document.createElement('canvas'),
                            textureId: `textTex_step_${pass.stepIndex}`,
                        }]])
                        ui._renderTextToCanvas(pass.stepIndex)
                        r.applyStepParameterValues({ [`step_${pass.stepIndex}`]: { textSize: state.getStepValues(`step_${pass.stepIndex}`).textSize } })
                    } else if (effect?.externalTexture) {
                        const id = pass.inputs?.[effect.externalTexture] ?? `${effect.externalTexture}_step_${pass.stepIndex}`
                        const upload = r.updateTextureFromSource(id, agreementImage, { flipY: false })
                        if (!upload?.width) throw new Error(`Input upload failed: ${id}`)
                        r.applyStepParameterValues({ [`step_${pass.stepIndex}`]: { imageSize: [upload.width, upload.height] } })
                    }
                    if (effect?.externalMesh) {
                        const source = Object.values(effect.builtinMeshes || {})[0]
                        if (!source) throw new Error(`No standard mesh for ${pass.effectKey}`)
                        const loaded = await r.loadOBJFromURL(`${baseUrl}/${source}`, effect.externalMesh)
                        if (!loaded.success || !loaded.vertexCount) throw new Error(`Mesh upload failed: ${pass.effectKey}`)
                    }
                }
                await r.pipeline.whenAsyncInitsSettled()
                r.render(0)
                await r.pipeline.whenAsyncInitsSettled()
                r.render(0)
                await r.pipeline.backend.device?.queue.onSubmittedWorkDone()
                if (agreementErrors.length) throw new Error(agreementErrors.join('\n'))
                return gpu
            }, { dsl, effectId, backend, baseUrl }))
            const frame = PNG.sync.read(await page.locator('canvas').screenshot())
            assert.equal(frame.width, agreementSize, 'presented width')
            assert.equal(frame.height, agreementSize, 'presented height')
            assert.deepEqual(errors, [], `${backend} render errors`)
            return { frame, gpu }
        },
        close: () => page.close(),
    }
}

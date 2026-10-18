#!/usr/bin/env node
/*
 * Regression test: a WebGL context loss must not permanently disable
 * single-frame rendering across backend switches.
 *
 * Before the fix, the webglcontextlost handler set _isContextLost = true and
 * stopped the render loop. switchBackend() then replaced the canvas element,
 * so the webglcontextrestored event that clears the flag could never fire.
 * Result: CanvasRenderer.render(t) — the path exports use — silently no-ops
 * forever on every backend (the rAF loop is unguarded, so the live view still
 * works), and only a page reload recovers. Downstream symptom: exports come
 * out black after switching to WGSL, and stay black after switching back.
 *
 * The fix: resetCanvas() clears _isContextLost (the lost context belonged to
 * the discarded canvas), and compile() restarts the loop when the stop came
 * from a context loss.
 *
 * The documented-options checks build a CanvasRenderer with only the options
 * that docs/shaders/integration.rst lists:
 *
 * - A rejected compile() keeps the previous program, so a context loss and
 *   restore after it must rebuild that program, without an onError call.
 * - switchBackend() in both directions, then compile(), must render on the
 *   new backend. A canvas keeps the context type it got first, so the
 *   renderer must present on a fresh canvas in the old canvas's place.
 *
 * Usage: node shaders/tests/test_context_loss_backend_switch.mjs
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../..')
const EFFECTS_DIR = path.join(PROJECT_ROOT, 'shaders', 'effects')

process.env.SHADE_EFFECTS_DIR = EFFECTS_DIR
process.env.SHADE_PROJECT_ROOT = PROJECT_ROOT
process.env.SHADE_GLOBALS_PREFIX = '__noisemaker'

import { acquireServer } from '../../vendor/shade-mcp/harness/index.js'

const RENDER_SETTLE_MS = 1500

async function sampleCanvas(page) {
    // toBlob → ImageBitmap → 2D readback works for both WebGL2 and WebGPU
    // canvases (drawImage from a WebGPU canvas reads back blank).
    return page.evaluate(async () => {
        const canvas = document.querySelector('canvas')
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
        if (!blob) return { max: 0, error: 'toBlob returned null' }
        const bitmap = await createImageBitmap(blob)
        const copy = document.createElement('canvas')
        copy.width = bitmap.width
        copy.height = bitmap.height
        const ctx = copy.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(bitmap, 0, 0)
        bitmap.close()
        const data = ctx.getImageData(0, 0, copy.width, copy.height).data
        let max = 0
        for (let i = 0; i < data.length; i += 4 * 7) {
            const m = Math.max(data[i], data[i + 1], data[i + 2])
            if (m > max) max = m
        }
        return { max }
    })
}

async function rendererState(page) {
    return page.evaluate(() => {
        const r = window.__noisemakerCanvasRenderer
        return {
            isContextLost: r._isContextLost,
            isRunning: r._isRunning,
            hasPipeline: !!r._pipeline,
            backend: r.backend,
        }
    })
}

async function switchAndRecompile(page, backend) {
    await page.evaluate(async (target) => {
        const r = window.__noisemakerCanvasRenderer
        await r.switchBackend(target)
        await r.compile(r._currentDsl)
    }, backend)
}

async function singleShotRender(page) {
    // What export loops do: stop the loop, render one frame at a fixed time.
    await page.evaluate(async () => {
        const r = window.__noisemakerCanvasRenderer
        r.stop()
        r.render(0.25)
        await new Promise(resolve => requestAnimationFrame(resolve))
        const queue = r._pipeline?.backend?.device?.queue
        if (queue?.onSubmittedWorkDone) await queue.onSubmittedWorkDone()
    })
}

const PROGRAM = 'search synth\nnoise().write(o0)\nrender(o0)'
const REJECTED_PROGRAM = 'search synth\nnoise(notAParam: 1).write(o0)\nrender(o0)'

/**
 * Open a page with a renderer built from the documented options only:
 * canvas, width, height, basePath, preferWebGPU and callbacks. The canvas sits
 * in a plain wrapper element, and the renderer gets no canvasContainer.
 */
async function openDocumentedRenderer(browser, baseUrl, { preferWebGPU }) {
    const page = await browser.newPage({ viewport: { width: 512, height: 512 } })
    page.setDefaultTimeout(20000)
    const pageErrors = []
    page.on('pageerror', err => pageErrors.push(`pageerror: ${err.message}`))
    // WebGPU needs a secure context, so the page takes the server's origin
    // before its content is replaced.
    await page.goto(`${baseUrl}/shaders/effects/manifest.json`)
    await page.setContent('<!doctype html><meta charset="utf-8"><div id="wrap"><canvas id="c"></canvas></div>')
    await page.evaluate(async ({ baseUrl, preferWebGPU }) => {
        const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/index.js`)
        const errors = []
        let onRestored = null
        const renderer = new CanvasRenderer({
            canvas: document.getElementById('c'),
            width: 256,
            height: 256,
            basePath: `${baseUrl}/shaders`,
            preferWebGPU,
            onError: (err) => errors.push(err?.code || err?.message || String(err)),
            onContextRestored: () => onRestored?.()
        })
        await renderer.loadManifest()
        await renderer.loadEffect('synth/noise')
        window.__doc = {
            renderer,
            errors,
            nextRestore: () => new Promise((resolve) => { onRestored = resolve })
        }
    }, { baseUrl, preferWebGPU })
    return { page, pageErrors }
}

/** Render one frame at a fixed time and read back the presented canvas. */
async function documentedFrame(page) {
    return page.evaluate(async () => {
        const r = window.__doc.renderer
        const wasRunning = r.isRunning
        r.stop()
        r.render(0.25)
        await new Promise(resolve => requestAnimationFrame(resolve))
        const queue = r.pipeline?.backend?.device?.queue
        if (queue?.onSubmittedWorkDone) await queue.onSubmittedWorkDone()
        const canvas = r.canvas
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
        let max = 0
        if (blob) {
            const bitmap = await createImageBitmap(blob)
            const copy = document.createElement('canvas')
            copy.width = bitmap.width
            copy.height = bitmap.height
            const ctx = copy.getContext('2d', { willReadFrequently: true })
            ctx.drawImage(bitmap, 0, 0)
            bitmap.close()
            const data = ctx.getImageData(0, 0, copy.width, copy.height).data
            for (let i = 0; i < data.length; i += 4 * 7) {
                max = Math.max(max, data[i], data[i + 1], data[i + 2])
            }
        }
        if (wasRunning) r.start()
        return {
            max,
            backendName: r.pipeline?.backend?.getName?.() || null,
            backendGetter: r.backend,
            hasPipeline: !!r.pipeline,
            isRunning: r.isRunning,
            canvasInDocument: canvas.isConnected,
            webgpuContextIsNull: r.pipeline?.backend?.getName?.() === 'WebGPU'
                ? r.pipeline.backend.context == null
                : null
        }
    })
}

async function rejectedCompileRestoreChecks(browser, baseUrl, check) {
    const { page, pageErrors } = await openDocumentedRenderer(browser, baseUrl, { preferWebGPU: false })
    try {
        const accepted = await page.evaluate(async (program) => {
            const r = window.__doc.renderer
            await r.compile(program)
            r.start()
            return r.pipeline.backend.getName()
        }, PROGRAM)
        check(accepted === 'WebGL2', `documented renderer starts on WebGL2 (backend=${accepted})`)

        const rejected = await page.evaluate(async ({ program, rejectedProgram }) => {
            const r = window.__doc.renderer
            let code = null
            try {
                await r.compile(rejectedProgram)
            } catch (err) {
                code = err?.code || err?.message || String(err)
            }
            return { code, currentDslIsAccepted: r.currentDsl === program }
        }, { program: PROGRAM, rejectedProgram: REJECTED_PROGRAM })
        check(rejected.code === 'ERR_COMPILATION_FAILED', `the unknown argument rejects the compile (code=${rejected.code})`)
        check(rejected.currentDslIsAccepted, 'currentDsl keeps the accepted program after the rejected compile')

        const beforeLoss = await documentedFrame(page)
        check(beforeLoss.max > 16, `the accepted program still renders before the loss (max=${beforeLoss.max})`)

        const restore = await page.evaluate(async () => {
            const doc = window.__doc
            const r = doc.renderer
            const errorsBefore = doc.errors.length
            const ext = r.pipeline.backend.gl.getExtension('WEBGL_lose_context')
            const restored = doc.nextRestore()
            ext.loseContext()
            await new Promise(resolve => setTimeout(resolve, 300))
            const lost = r.isContextLost
            ext.restoreContext()
            await restored
            const framesBefore = r.frameCount
            await new Promise(resolve => setTimeout(resolve, 500))
            return {
                lost,
                restoreErrors: doc.errors.slice(errorsBefore),
                framesAdvanced: r.frameCount - framesBefore
            }
        })
        check(restore.lost === true, 'WEBGL_lose_context loses the context (precondition)')
        check(restore.restoreErrors.length === 0, `the restore calls onError zero times (${JSON.stringify(restore.restoreErrors)})`)
        check(restore.framesAdvanced > 0, `the render loop runs after the restore (frames=${restore.framesAdvanced})`)

        const afterRestore = await documentedFrame(page)
        check(afterRestore.hasPipeline && afterRestore.backendName === 'WebGL2',
            `the pipeline is rebuilt on WebGL2 after the restore (backend=${afterRestore.backendName})`)
        check(afterRestore.max > 16, `the restored canvas is not black (max=${afterRestore.max})`)
        const currentDslIsAccepted = await page.evaluate((program) => window.__doc.renderer.currentDsl === program, PROGRAM)
        check(currentDslIsAccepted, 'currentDsl is the accepted program after the restore')
        check(pageErrors.length === 0, `no page errors (${pageErrors.join('; ')})`)
    } finally {
        await page.close()
    }
}

const BACKEND_NAMES = { glsl: 'WebGL2', wgsl: 'WebGPU' }

async function documentedBackendSwitchChecks(browser, baseUrl, check, { from, to }) {
    const label = `${BACKEND_NAMES[from]} to ${BACKEND_NAMES[to]}`
    const { page, pageErrors } = await openDocumentedRenderer(browser, baseUrl, { preferWebGPU: from === 'wgsl' })
    try {
        await page.evaluate(async (program) => {
            const r = window.__doc.renderer
            await r.compile(program)
            window.__doc.firstCanvas = r.canvas
        }, PROGRAM)
        const before = await documentedFrame(page)
        check(before.backendName === BACKEND_NAMES[from] && before.max > 16,
            `${label}: the first backend renders (backend=${before.backendName}, max=${before.max})`)

        const switched = await page.evaluate(async ({ program, to }) => {
            const doc = window.__doc
            const r = doc.renderer
            const errorsBefore = doc.errors.length
            let error = null
            try {
                await r.switchBackend(to)
                await r.compile(program)
            } catch (err) {
                error = err?.message || err?.code || String(err)
            }
            return {
                error,
                errors: doc.errors.slice(errorsBefore),
                canvasReplaced: r.canvas !== doc.firstCanvas,
                oldCanvasDetached: !doc.firstCanvas.isConnected,
                newCanvasParent: r.canvas.parentElement?.id || null,
                newCanvasId: r.canvas.id
            }
        }, { program: PROGRAM, to })
        check(switched.error === null, `${label}: switchBackend() and compile() resolve (error=${switched.error})`)
        check(switched.errors.length === 0, `${label}: onError is not called (${JSON.stringify(switched.errors)})`)
        check(switched.canvasReplaced && switched.oldCanvasDetached &&
            switched.newCanvasParent === 'wrap' && switched.newCanvasId === 'c',
            `${label}: a fresh canvas takes the old canvas's place (${JSON.stringify(switched)})`)

        const after = await documentedFrame(page)
        check(after.backendGetter === to && after.backendName === BACKEND_NAMES[to],
            `${label}: the pipeline backend is ${BACKEND_NAMES[to]} (getter=${after.backendGetter}, backend=${after.backendName})`)
        if (to === 'wgsl') {
            check(after.webgpuContextIsNull === false, `${label}: the WebGPU backend has a canvas context`)
        }
        check(after.canvasInDocument, `${label}: the presented canvas is in the document`)
        check(after.max > 16, `${label}: the presented canvas is not black (max=${after.max})`)
        check(pageErrors.length === 0, `${label}: no page errors (${pageErrors.join('; ')})`)
    } finally {
        await page.close()
    }
}

async function main() {
    const baseUrl = await acquireServer(undefined, PROJECT_ROOT, EFFECTS_DIR)
    const args = [
        '--disable-gpu-sandbox',
        '--enable-unsafe-webgpu',
        '--enable-features=Vulkan',
        '--enable-webgpu-developer-features',
        process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=vulkan',
    ]
    const browser = await chromium.launch({ headless: true, args })
    const context = await browser.newContext({ viewport: { width: 512, height: 512 } })
    const page = await context.newPage()
    page.setDefaultTimeout(20000)

    const errors = []
    page.on('pageerror', err => errors.push(`pageerror: ${err.message}`))

    let failed = false
    const check = (cond, label) => {
        console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`)
        if (!cond) failed = true
    }

    try {
        console.log('-- documented options: rejected compile, then context loss and restore')
        await rejectedCompileRestoreChecks(browser, baseUrl, check)

        console.log('-- demo: context loss across backend switches')
        await page.goto(`${baseUrl}/demo/shaders/?effect=synth/noise`, { waitUntil: 'domcontentloaded' })
        await page.waitForFunction(() => window.__noisemakerRenderingPipeline != null, { polling: 50 })
        await page.waitForTimeout(RENDER_SETTLE_MS)

        const gpu = await page.evaluate(async () => {
            if (!navigator.gpu) return false
            return !!(await navigator.gpu.requestAdapter().catch(() => null))
        })
        check(gpu, 'a WebGPU adapter is available; the backend-switch checks need one')
        if (!gpu) return

        const baseline = await sampleCanvas(page)
        check(baseline.max > 16, `baseline glsl render is non-black (max=${baseline.max})`)

        // Simulate the context loss firing while the handler is attached —
        // exactly what happens on synchronous loseContext() dispatch or a
        // GPU-pressure eviction just before/during a backend switch.
        await page.evaluate(() => {
            document.querySelector('canvas')
                .dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
        })
        const lost = await rendererState(page)
        check(lost.isContextLost === true, 'context-loss handler engaged (precondition)')

        await switchAndRecompile(page, 'wgsl')
        await page.waitForTimeout(RENDER_SETTLE_MS)
        const wgslState = await rendererState(page)
        check(wgslState.isContextLost === false, 'switch to wgsl clears context-loss state')
        check(wgslState.isRunning === true, 'render loop resumes after wgsl recompile')

        await singleShotRender(page)
        const wgslSample = await sampleCanvas(page)
        check(wgslSample.max > 16, `single-shot wgsl render is non-black (max=${wgslSample.max})`)
        await page.evaluate(() => window.__noisemakerCanvasRenderer.start())

        await switchAndRecompile(page, 'glsl')
        await page.waitForTimeout(RENDER_SETTLE_MS)
        const glslState = await rendererState(page)
        check(glslState.isContextLost === false, 'switch back to glsl keeps context-loss state clear')
        check(glslState.isRunning === true, 'render loop runs after switching back')

        await singleShotRender(page)
        const glslSample = await sampleCanvas(page)
        check(glslSample.max > 16, `single-shot glsl render is non-black after round-trip (max=${glslSample.max})`)

        console.log('-- documented options: switchBackend() without canvasContainer')
        await documentedBackendSwitchChecks(browser, baseUrl, check, { from: 'glsl', to: 'wgsl' })
        await documentedBackendSwitchChecks(browser, baseUrl, check, { from: 'wgsl', to: 'glsl' })
    } finally {
        await browser.close()
    }

    if (errors.length) {
        console.log('\nPage errors:')
        for (const e of errors) console.log(`  ${e}`)
    }

    if (failed) process.exit(1)
    console.log('\nAll context-loss backend-switch checks passed')
    process.exit(0)
}

main().catch(err => {
    console.error(err)
    process.exit(2)
})

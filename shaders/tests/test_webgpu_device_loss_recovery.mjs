#!/usr/bin/env node
/*
 * A lost WebGPU device must not stop the renderer for good.
 *
 * A GPU process exit or a driver reset loses the page's WebGPU devices, and
 * nothing restores them: the device's lost promise resolves and no event
 * reaches the canvas. The renderer kept its loop running on the dead device,
 * the canvas froze on its last frame and every read of it (toBlob,
 * readPixels) came back empty, so hosts that export the canvas wrote black
 * frames until the page was reloaded.
 *
 * The renderer now treats a lost device like a WebGL context that the browser
 * does not restore: it rebuilds the program on a fresh canvas in the old
 * canvas's place, resumes the loop and calls onContextRestored so hosts read
 * `canvas` again. A device lost after the renderer moved to another pipeline
 * changes nothing.
 *
 * GPUDevice.destroy() loses the device. CDP's Browser.crashGpuProcess is a
 * real GPU process exit.
 *
 * Usage: node shaders/tests/test_webgpu_device_loss_recovery.mjs
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const effects = path.join(root, 'shaders/effects')
process.env.SHADE_EFFECTS_DIR = effects
process.env.SHADE_PROJECT_ROOT = root
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')

// Recovery must finish within this bound after the loss (the renderer waits a
// few seconds before it rebuilds).
const RECOVERY_BOUND_MS = 15000
const PROGRAMS = [
    'search synth\nnoise(seed: 1).write(o0)\nrender(o0)',
    'search synth\ngradient(seed: 3).write(o0)\nrender(o0)',
]

const base = await acquireServer(undefined, root, effects)
const browser = await chromium.launch(shaderTestBrowserOptions())
let failed = false
function check(condition, label) {
    console.log(`${condition ? 'PASS' : 'FAIL'}: ${label}`)
    if (!condition) failed = true
}

/** A page with a WebGPU renderer running a program on a canvas inside a wrapper element. */
async function openRenderer(target = browser) {
    const page = await target.newPage({ viewport: { width: 320, height: 240 } })
    const pageErrors = []
    page.on('pageerror', (err) => pageErrors.push(err.message))
    await page.goto(`${base}/shaders/effects/manifest.json`)
    await page.setContent('<!doctype html><meta charset="utf-8"><div id="wrap"><canvas id="c"></canvas></div>')
    const opened = await page.evaluate(async ({ base, programs }) => {
        const { CanvasRenderer } = await import(`${base}/shaders/src/index.js`)
        const doc = { errors: [], lost: 0, restored: 0, programs }
        doc.renderer = new CanvasRenderer({
            canvas: document.getElementById('c'),
            width: 64,
            height: 64,
            basePath: `${base}/shaders`,
            preferWebGPU: true,
            onError: (err) => doc.errors.push(err?.message || err?.code || String(err)),
            onContextLost: () => { doc.lost++ },
            onContextRestored: () => { doc.restored++ },
        })
        await doc.renderer.loadManifest()
        await doc.renderer.loadEffects(['synth/noise', 'synth/gradient'])
        doc.waitFor = async (predicate, timeoutMs) => {
            const started = performance.now()
            while (!predicate()) {
                if (performance.now() - started > timeoutMs) return false
                await new Promise((resolve) => setTimeout(resolve, 50))
            }
            return true
        }
        // A WebGPU canvas reads back through toBlob(), not drawImage().
        doc.frame = async () => {
            const blob = await new Promise((resolve) => doc.renderer.canvas.toBlob(resolve, 'image/png'))
            if (!blob) return 0
            const bitmap = await createImageBitmap(blob)
            const copy = document.createElement('canvas')
            copy.width = bitmap.width
            copy.height = bitmap.height
            const context = copy.getContext('2d', { willReadFrequently: true })
            context.drawImage(bitmap, 0, 0)
            bitmap.close()
            const data = context.getImageData(0, 0, copy.width, copy.height).data
            let max = 0
            for (let i = 0; i < data.length; i += 4) max = Math.max(max, data[i], data[i + 1], data[i + 2])
            return max
        }
        doc.state = () => {
            const r = doc.renderer
            return {
                running: r.isRunning,
                lost: r.isContextLost,
                backend: r.pipeline?.backend?.getName?.() ?? null,
                canvasInWrap: r.canvas.parentElement?.id === 'wrap',
                canvasId: r.canvas.id,
            }
        }
        window.__doc = doc
        await doc.renderer.compile(programs[0])
        doc.renderer.start()
        await doc.waitFor(() => doc.renderer.frameCount >= 10, 5000)
        window.__first = doc.renderer.canvas
        return { state: doc.state(), max: await doc.frame() }
    }, { base, programs: PROGRAMS })
    return { page, pageErrors, opened }
}

/** Wait for the rebuild after a loss and describe the renderer then. */
function recovery(page) {
    return page.evaluate(async (bound) => {
        const doc = window.__doc
        const r = doc.renderer
        const lostAt = performance.now()
        const recovered = await doc.waitFor(() => doc.restored === 1 && r.isRunning && r.frameCount >= 10, bound)
        return {
            recovered,
            ms: Math.round(performance.now() - lostAt),
            replaced: r.canvas !== window.__first && !window.__first.isConnected,
            max: await doc.frame(),
            state: doc.state(),
            lost: doc.lost,
            restored: doc.restored,
            errors: doc.errors,
        }
    }, RECOVERY_BOUND_MS)
}

function checkRecovered(opened, result, pageErrors) {
    check(opened.state.backend === 'WebGPU' && opened.max > 16,
        `the program renders on WebGPU before the loss (${JSON.stringify(opened)})`)
    check(result.lost === 1, `onContextLost is called once (${result.lost})`)
    check(result.recovered, `the program is rebuilt and running after the loss (${JSON.stringify(result.state)})`)
    check(result.ms < RECOVERY_BOUND_MS, `recovery finishes within ${RECOVERY_BOUND_MS} ms (${result.ms} ms)`)
    check(result.state.backend === 'WebGPU', `it stays on WebGPU (${result.state.backend})`)
    check(result.replaced && result.state.canvasInWrap, `it presents on a fresh canvas in the old one's place (${JSON.stringify(result.state)})`)
    check(result.max > 16, `the fresh canvas reads back its frames (max=${result.max})`)
    check(result.restored === 1, `onContextRestored is called once (${result.restored})`)
    check(result.errors.length === 0, `onError is not called (${JSON.stringify(result.errors)})`)
    check(pageErrors.length === 0, `no page errors (${pageErrors.join('; ')})`)
}

async function destroyedDevice() {
    console.log('-- a destroyed device is rebuilt on a fresh canvas')
    const { page, pageErrors, opened } = await openRenderer()
    try {
        await page.evaluate(() => window.__doc.renderer.pipeline.backend.device.destroy())
        checkRecovered(opened, await recovery(page), pageErrors)
    } finally {
        await page.close()
    }
}

async function retiredDevice() {
    console.log('-- a device lost after the renderer moved to another pipeline changes nothing')
    const { page, pageErrors, opened } = await openRenderer()
    try {
        const result = await page.evaluate(async () => {
            const doc = window.__doc
            const r = doc.renderer
            const retired = r.pipeline.backend.device
            await r.switchBackend('glsl')
            await r.compile(doc.programs[1])
            r.start()
            await doc.waitFor(() => r.frameCount >= 10, 5000)
            const canvas = r.canvas
            retired.destroy()
            await retired.lost
            // Observe beyond the renderer's recovery delay.
            await new Promise((resolve) => setTimeout(resolve, 3500))
            return { sameCanvas: r.canvas === canvas, state: doc.state(), lost: doc.lost, restored: doc.restored, errors: doc.errors }
        })
        check(opened.state.backend === 'WebGPU', `the first program runs on WebGPU (${opened.state.backend})`)
        check(result.sameCanvas && result.state.running && result.state.backend?.startsWith('WebGL'),
            `the WebGL2 renderer keeps running on its canvas (${JSON.stringify(result.state)})`)
        check(result.lost === 0 && result.restored === 0, `no loss or restore is reported (lost=${result.lost}, restored=${result.restored})`)
        check(result.errors.length === 0, `onError is not called (${JSON.stringify(result.errors)})`)
        check(pageErrors.length === 0, `no page errors (${pageErrors.join('; ')})`)
    } finally {
        await page.close()
    }
}

async function realGpuProcessExit() {
    console.log('-- a real GPU process exit loses the device, and the program is rebuilt')
    // A GPU process exit loses every GPU context in the browser, so this
    // case gets its own.
    const own = await chromium.launch(shaderTestBrowserOptions())
    try {
        const { page, pageErrors, opened } = await openRenderer(own)
        const cdp = await own.newBrowserCDPSession()
        await cdp.send('Browser.crashGpuProcess')
        checkRecovered(opened, await recovery(page), pageErrors)
    } finally {
        await own.close()
    }
}

try {
    await destroyedDevice()
    await retiredDevice()
    await realGpuProcessExit()
} finally {
    await browser.close()
    releaseServer()
}

if (failed) process.exit(1)
console.log('\nA lost WebGPU device recovers on a fresh canvas')

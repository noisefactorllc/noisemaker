#!/usr/bin/env node
/*
 * A lost WebGL context that the browser never restores must not stop the
 * renderer for good.
 *
 * When a program's build stalls the GPU process past the browser's watchdog,
 * the GPU process exits and every WebGL context on the page is lost. Chrome
 * restores the contexts once; the restore rebuilt the same program, which
 * stalled the new GPU process too. After that second exit Chrome blocks the
 * page from WebGL for a while ("Web page caused context loss and was blocked")
 * and never restores the lost contexts, so the renderer stayed stopped and
 * every later compile ran on the dead context ("Unknown compile error").
 *
 * Even a restored canvas does not recover: after a GPU process exit the
 * browser shows it, but reading it as an image (drawImage, texture uploads,
 * toBlob) returns nothing, so hosts that composite or export the canvas stay
 * black.
 *
 * The renderer now:
 * - rebuilds the program on a fresh canvas in the old canvas's place, after a
 *   restore event or when none comes, resuming the loop and calling
 *   onContextRestored;
 * - recovers onto a fresh canvas when compile() is called on a lost context,
 *   instead of compiling on the dead one;
 * - waits while the browser refuses new WebGL contexts, within a bound;
 * - does not rebuild a program whose context was lost while it drew its first
 *   frame, because rebuilding a program that stalls the GPU stalls it again.
 *
 * WEBGL_lose_context.loseContext() without restoreContext() is a lost context
 * that the browser does not restore. CDP's Browser.crashGpuProcess is a real
 * GPU process exit.
 *
 * Usage: node shaders/tests/test_context_loss_recovery.mjs
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

// Recovery must finish within this bound after the loss (it waits a few
// seconds for a restore event first).
const RECOVERY_BOUND_MS = 15000
const PROGRAMS = [
    'search synth\nnoise(seed: 1).write(o0)\nrender(o0)',
    'search synth\ngradient(seed: 3).write(o0)\nrender(o0)',
    'search synth\nperlin(seed: 2).write(o0)\nrender(o0)',
    'search synth\ncell(seed: 4).write(o0)\nrender(o0)',
]

const base = await acquireServer(undefined, root, effects)
const browser = await chromium.launch(shaderTestBrowserOptions())
let failed = false
function check(condition, label) {
    console.log(`${condition ? 'PASS' : 'FAIL'}: ${label}`)
    if (!condition) failed = true
}

/** A page with a WebGL2 renderer on a canvas inside a wrapper element. */
async function openRenderer(target = browser) {
    const page = await target.newPage({ viewport: { width: 320, height: 240 } })
    const pageErrors = []
    const warnings = []
    page.on('pageerror', (err) => pageErrors.push(err.message))
    page.on('console', (message) => { if (message.type() === 'warning') warnings.push(message.text()) })
    await page.goto(`${base}/shaders/effects/manifest.json`)
    await page.setContent('<!doctype html><meta charset="utf-8"><div id="wrap"><canvas id="c"></canvas></div>')
    await page.evaluate(async ({ base, programs }) => {
        const { CanvasRenderer } = await import(`${base}/shaders/src/index.js`)
        const doc = { errors: [], restored: 0 }
        doc.renderer = new CanvasRenderer({
            canvas: document.getElementById('c'),
            width: 64,
            height: 64,
            basePath: `${base}/shaders`,
            preferWebGPU: false,
            onError: (err) => doc.errors.push(err?.message || err?.code || String(err)),
            onContextRestored: () => { doc.restored++ },
        })
        await doc.renderer.loadManifest()
        await doc.renderer.loadEffects(['synth/noise', 'synth/gradient', 'synth/perlin', 'synth/cell'])
        doc.waitFor = async (predicate, timeoutMs) => {
            const started = performance.now()
            while (!predicate()) {
                if (performance.now() - started > timeoutMs) return false
                await new Promise((resolve) => setTimeout(resolve, 50))
            }
            return true
        }
        doc.frame = async () => {
            const r = doc.renderer
            const canvas = r.canvas
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
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
        doc.programs = programs
        window.__doc = doc
    }, { base, programs: PROGRAMS })
    return { page, pageErrors, warnings }
}

async function lostWithoutRestore() {
    console.log('-- lost without a restore event: rebuilt on a fresh canvas')
    const { page, pageErrors } = await openRenderer()
    try {
        const result = await page.evaluate(async (bound) => {
            const doc = window.__doc
            const r = doc.renderer
            await r.compile(doc.programs[0])
            r.start()
            await doc.waitFor(() => r.frameCount >= 10, 5000)
            const first = r.canvas
            r.pipeline.backend.gl.getExtension('WEBGL_lose_context').loseContext()
            await doc.waitFor(() => r.isContextLost, 2000)
            const lostAt = performance.now()
            const recovered = await doc.waitFor(() => r.isRunning && r.canvas !== first && r.frameCount >= 10, bound)
            return {
                recovered,
                ms: Math.round(performance.now() - lostAt),
                firstDetached: !first.isConnected,
                state: doc.state(),
                max: await doc.frame(),
                restored: doc.restored,
                errors: doc.errors,
            }
        }, RECOVERY_BOUND_MS)
        check(result.recovered, `the loop runs again on a fresh canvas within ${RECOVERY_BOUND_MS} ms (${result.ms} ms)`)
        check(result.firstDetached && result.state.canvasInWrap && result.state.canvasId === 'c',
            `the fresh canvas takes the lost canvas's place (${JSON.stringify(result.state)})`)
        check(result.state.backend === 'WebGL2' && !result.state.lost, 'the rebuilt pipeline runs on WebGL2')
        check(result.max > 16, `the fresh canvas is not black (max=${result.max})`)
        check(result.restored === 1, `onContextRestored is called once (${result.restored})`)
        check(result.errors.length === 0, `onError is not called (${JSON.stringify(result.errors)})`)
        check(pageErrors.length === 0, `no page errors (${pageErrors.join('; ')})`)
    } finally {
        await page.close()
    }
}

async function compileAfterLoss() {
    console.log('-- compile() on a lost context: no compile on the dead context')
    const { page, pageErrors } = await openRenderer()
    try {
        const result = await page.evaluate(async (bound) => {
            const doc = window.__doc
            const r = doc.renderer
            await r.compile(doc.programs[0])
            r.start()
            await doc.waitFor(() => r.frameCount >= 10, 5000)
            const first = r.canvas
            r.pipeline.backend.gl.getExtension('WEBGL_lose_context').loseContext()
            await doc.waitFor(() => r.isContextLost, 2000)
            const lostAt = performance.now()
            // A host loads programs one after another, as visualize's decks do.
            const loads = []
            for (const program of [...doc.programs.slice(1), doc.programs[0]]) {
                try {
                    await r.compile(program)
                    await doc.waitFor(() => r.frameCount >= 2, 2000)
                    loads.push({ ok: true, running: r.isRunning, max: await doc.frame() })
                } catch (err) {
                    loads.push({ ok: false, error: err?.message || err?.code || JSON.stringify(err) })
                }
            }
            return {
                ms: Math.round(performance.now() - lostAt),
                replaced: r.canvas !== first && !first.isConnected,
                loads,
                state: doc.state(),
                restored: doc.restored,
                errors: doc.errors,
            }
        }, RECOVERY_BOUND_MS)
        check(result.loads.every((load) => load.ok && load.running && load.max > 16),
            `every load after the loss compiles, runs and renders (${JSON.stringify(result.loads)})`)
        check(result.ms < RECOVERY_BOUND_MS, `the loads finish within ${RECOVERY_BOUND_MS} ms of the loss (${result.ms} ms)`)
        check(result.replaced && result.state.canvasInWrap, `the renderer presents on a fresh canvas in the old one's place (${JSON.stringify(result.state)})`)
        check(result.restored === 1, `onContextRestored is called once (${result.restored})`)
        check(result.errors.length === 0, `onError is not called (${JSON.stringify(result.errors)})`)
        check(pageErrors.length === 0, `no page errors (${pageErrors.join('; ')})`)
    } finally {
        await page.close()
    }
}

async function lostBeforeSecondFrame() {
    console.log('-- a program whose context is lost while it draws its first frame is not rebuilt')
    const { page, pageErrors, warnings } = await openRenderer()
    try {
        const restored = await page.evaluate(async () => {
            const doc = window.__doc
            const r = doc.renderer
            await r.compile(doc.programs[0])
            r.start()
            // Lose the context before the loop draws a frame, as a program
            // whose build stalls the GPU process does.
            const ext = r.pipeline.backend.gl.getExtension('WEBGL_lose_context')
            ext.loseContext()
            await doc.waitFor(() => r.isContextLost, 2000)
            const framesAtLoss = r.frameCount
            ext.restoreContext()
            await doc.waitFor(() => doc.restored === 1, 5000)
            await new Promise((resolve) => setTimeout(resolve, 500))
            return { framesAtLoss, restored: doc.restored, pipeline: !!r.pipeline, running: r.isRunning }
        })
        check(restored.framesAtLoss < 2 && restored.restored === 1,
            `the context was restored after a loss before the second frame (frames=${restored.framesAtLoss})`)
        check(!restored.pipeline && !restored.running,
            `the restore does not rebuild that program (${JSON.stringify(restored)})`)
        check(warnings.some((text) => text.includes('while it drew its first frame')), 'a console warning names the reason')

        const unrestored = await page.evaluate(async () => {
            const doc = window.__doc
            const r = doc.renderer
            await r.compile(doc.programs[0])
            r.start()
            const canvas = r.canvas
            r.pipeline.backend.gl.getExtension('WEBGL_lose_context').loseContext()
            await doc.waitFor(() => r.isContextLost, 2000)
            const framesAtLoss = r.frameCount
            // Longer than the renderer waits for a restore event.
            await new Promise((resolve) => setTimeout(resolve, 5000))
            return { framesAtLoss, sameCanvas: r.canvas === canvas, running: r.isRunning, lost: r.isContextLost }
        })
        check(unrestored.framesAtLoss < 2 && unrestored.sameCanvas && unrestored.lost && !unrestored.running,
            `without a restore event it is not rebuilt either (${JSON.stringify(unrestored)})`)

        const next = await page.evaluate(async (bound) => {
            const doc = window.__doc
            const r = doc.renderer
            const started = performance.now()
            await r.compile(doc.programs[1])
            const ran = await doc.waitFor(() => r.isRunning && r.frameCount >= 10, bound)
            return { ran, ms: Math.round(performance.now() - started), max: await doc.frame(), state: doc.state(), errors: doc.errors }
        }, RECOVERY_BOUND_MS)
        check(next.ran && next.max > 16 && next.state.backend === 'WebGL2' && next.state.canvasInWrap,
            `the next compile builds and runs on a fresh canvas (${next.ms} ms, max=${next.max})`)
        check(next.errors.length === 0, `onError is not called (${JSON.stringify(next.errors)})`)
        check(pageErrors.length === 0, `no page errors (${pageErrors.join('; ')})`)
    } finally {
        await page.close()
    }
}

async function blockedContextCreation() {
    console.log('-- the browser refuses new WebGL contexts for a while after the loss')
    const { page, pageErrors } = await openRenderer()
    try {
        const result = await page.evaluate(async (bound) => {
            const doc = window.__doc
            const r = doc.renderer
            await r.compile(doc.programs[0])
            r.start()
            await doc.waitFor(() => r.frameCount >= 10, 5000)
            r.pipeline.backend.gl.getExtension('WEBGL_lose_context').loseContext()
            await doc.waitFor(() => r.isContextLost, 2000)
            // As Chrome does after GPU process exits it blames on the page:
            // getContext() returns null until the block expires.
            const getContext = HTMLCanvasElement.prototype.getContext
            let refused = 0
            const blockedUntil = performance.now() + 6000
            HTMLCanvasElement.prototype.getContext = function (type, attributes) {
                if (type === 'webgl2' && performance.now() < blockedUntil) {
                    refused++
                    return null
                }
                return getContext.call(this, type, attributes)
            }
            const started = performance.now()
            let error = null
            try {
                await r.compile(doc.programs[1])
            } catch (err) {
                error = err?.message || JSON.stringify(err)
            }
            const ran = await doc.waitFor(() => r.isRunning && r.frameCount >= 10, bound)
            HTMLCanvasElement.prototype.getContext = getContext
            return {
                error,
                refused,
                ran,
                afterBlock: performance.now() >= blockedUntil,
                ms: Math.round(performance.now() - started),
                max: await doc.frame(),
                errors: doc.errors,
            }
        }, RECOVERY_BOUND_MS)
        check(result.refused > 0, `context creation was refused during the block (${result.refused} times)`)
        check(result.error === null && result.ran && result.afterBlock,
            `compile() waits out the block, then builds and runs (${result.ms} ms, error=${result.error})`)
        check(result.max > 16, `the canvas is not black after the block (max=${result.max})`)
        check(result.errors.length === 0, `onError is not called (${JSON.stringify(result.errors)})`)
        check(pageErrors.length === 0, `no page errors (${pageErrors.join('; ')})`)
    } finally {
        await page.close()
    }
}

async function realGpuProcessExit() {
    console.log('-- a real GPU process exit: the restored output can be read as an image')
    // The GPU process belongs to the whole browser, so this case has its own.
    const own = await chromium.launch(shaderTestBrowserOptions())
    try {
        const { page, pageErrors } = await openRenderer(own)
        const first = await page.evaluate(async () => {
            const doc = window.__doc
            const r = doc.renderer
            await r.compile(doc.programs[0])
            r.start()
            await doc.waitFor(() => r.frameCount >= 10, 5000)
            window.__first = r.canvas
            return { max: await doc.frame() }
        })
        const cdp = await own.newBrowserCDPSession()
        await cdp.send('Browser.crashGpuProcess')
        const result = await page.evaluate(async (bound) => {
            const doc = window.__doc
            const r = doc.renderer
            const recovered = await doc.waitFor(() => doc.restored === 1 && r.isRunning && r.frameCount >= 10, bound)
            const image = document.createElement('canvas')
            image.width = image.height = 8
            const context = image.getContext('2d', { willReadFrequently: true })
            context.drawImage(r.canvas, 0, 0, 8, 8)
            const data = context.getImageData(0, 0, 8, 8).data
            let drawn = 0
            for (let i = 0; i < data.length; i += 4) drawn = Math.max(drawn, data[i], data[i + 1], data[i + 2])
            return { recovered, replaced: r.canvas !== window.__first && !window.__first.isConnected, drawn, max: await doc.frame(), state: doc.state(), errors: doc.errors }
        }, RECOVERY_BOUND_MS)
        check(first.max > 16, `the program renders before the exit (max=${first.max})`)
        check(result.recovered, 'the program is rebuilt and running after the restore')
        check(result.replaced && result.state.canvasInWrap, `it presents on a fresh canvas in the old one's place (${JSON.stringify(result.state)})`)
        check(result.drawn > 16 && result.max > 16, `drawImage and toBlob read the frames (drawImage max=${result.drawn}, toBlob max=${result.max})`)
        check(result.errors.length === 0, `onError is not called (${JSON.stringify(result.errors)})`)
        check(pageErrors.length === 0, `no page errors (${pageErrors.join('; ')})`)
    } finally {
        await own.close()
    }
}

try {
    await lostWithoutRestore()
    await compileAfterLoss()
    await lostBeforeSecondFrame()
    await blockedContextCreation()
    await realGpuProcessExit()
} finally {
    await browser.close()
    releaseServer()
}

if (failed) process.exit(1)
console.log('\nA lost WebGL context recovers without a restore event')

#!/usr/bin/env node
// Overlay canvases for the asyncInit CPU effects (filter/fibers, scratches,
// strayHair) must rasterize identically whatever 2D canvas backend the host
// provides. Chromium draws accelerated 2D canvases with Skia Graphite on
// Metal and Skia Ganesh on GL; those backends rasterize the same stroke list
// to different pixels, so the overlay (and everything blended with it)
// depended on the host. The effects now request a software canvas via
// getContext('2d', { willReadFrequently: true }).
//
// This test runs the real effect asyncInit twice: once with accelerated 2D
// canvases forced off, once with an accelerated (Ganesh GL over ANGLE
// SwiftShader) canvas, and requires byte-identical overlay pixels. Before
// the fix the accelerated run diverges; after the fix both backends produce
// the identical software-rasterized overlay.
//
// Refs #313.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const effectsDir = path.join(repoRoot, 'shaders', 'effects')

process.env.SHADE_EFFECTS_DIR = effectsDir
process.env.SHADE_PROJECT_ROOT = repoRoot

const { acquireServer, releaseServer } = await import(path.join(repoRoot, 'vendor/shade-mcp/harness/index.js'))

const width = 256
const height = 256

const EFFECTS = [
    { module: 'filter/fibers/definition.js', name: 'fibers' },
    { module: 'filter/scratches/definition.js', name: 'scratches' },
    { module: 'filter/strayHair/definition.js', name: 'strayHair' },
]

// Forces the software 2D canvas rasterizer.
const softwareArgs = ['--disable-accelerated-2d-canvas', '--disable-gpu-sandbox']
// Accelerated 2D canvas: Skia Ganesh on GL (ANGLE over SwiftShader here).
const acceleratedArgs = [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-webgpu',
    '--disable-gpu-sandbox',
]

async function runOverlayCapture(browser, baseUrl, { effectModule, probeAccelerated }) {
    const page = await browser.newPage({ viewport: { width, height } })
    page.setDefaultTimeout(30000)
    const consoleMessages = []
    page.on('console', (message) => {
        if (['error', 'warning'].includes(message.type())) {
            consoleMessages.push(`[${message.type()}] ${message.text()}`)
        }
    })
    page.on('pageerror', (error) => consoleMessages.push(`[pageerror] ${error.message}`))

    await page.setContent(`<!doctype html><html><body></body></html>`, { waitUntil: 'load' })

    const capture = await page.evaluate(async ({ baseUrl, effectModule, width, height }) => {
        const mod = await import(`${baseUrl}/shaders/effects/${effectModule}`)
        const effect = mod.default

        const toBase64 = (data) => {
            let binary = ''
            const chunk = 0x8000
            for (let i = 0; i < data.length; i += chunk) {
                binary += String.fromCharCode.apply(null, data.subarray(i, i + chunk))
            }
            return btoa(binary)
        }

        // Canary: with an accelerated canvas, Ganesh rasterizes an AA stroke
        // differently from the software rasterizer; software canvases are
        // byte-identical. This proves which rasterizer the browser actually
        // used for plain (default) contexts in this launch.
        function canaryStroke(ctx) {
            ctx.lineCap = 'round'
            ctx.lineWidth = 3.37
            ctx.strokeStyle = 'rgba(30, 200, 90, 0.5)'
            ctx.beginPath()
            ctx.moveTo(10.31, 12.77)
            ctx.lineTo(44.19, 41.53)
            ctx.stroke()
        }
        function canaryDiff() {
            const a = document.createElement('canvas')
            a.width = 64
            a.height = 64
            canaryStroke(a.getContext('2d'))
            const b = document.createElement('canvas')
            b.width = 64
            b.height = 64
            canaryStroke(b.getContext('2d', { willReadFrequently: true }))
            const da = a.getContext('2d').getImageData(0, 0, 64, 64).data
            const db = b.getContext('2d').getImageData(0, 0, 64, 64).data
            let diff = 0
            for (let i = 0; i < da.length; i++) {
                if (da[i] !== db[i]) diff++
            }
            return diff
        }
        const canary = canaryDiff()

        // Run the real effect asyncInit and capture the finished overlay.
        let latestCanvas = null
        const result = await new Promise((resolve, reject) => {
            let latest = null
            effect.asyncInit({
                updateTexture: (name, canvas) => {
                    if (name === 'overlayTex') latest = canvas
                },
                width,
                height,
                params: { seed: 1, density: 0.5, alpha: 0.5 },
                isCancelled: () => false,
            }).then(() => {
                if (!latest) {
                    reject(new Error('asyncInit never uploaded overlayTex'))
                    return
                }
                latestCanvas = latest
                const ctx = latest.getContext('2d')
                const attrs = ctx.getContextAttributes ? ctx.getContextAttributes() : {}
                resolve({
                    willReadFrequently: attrs.willReadFrequently === true,
                    data: toBase64(ctx.getImageData(0, 0, width, height).data),
                })
            }, reject)
        })

        // Post-asyncInit stability: a late GPU flush must not change pixels.
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const afterFrames = toBase64(latestCanvas.getContext('2d').getImageData(0, 0, width, height).data)
        return { canary, ...result, stable: afterFrames === result.data }
    }, { baseUrl, effectModule, width, height }).catch((error) => {
        throw new Error(`capture failed for ${effectModule}: ${error.message}`)
    })

    if (probeAccelerated) {
        assert.ok(capture.canary > 0,
            `accelerated 2D canvas is unavailable (canary diff=${capture.canary}); ` +
            'the accelerated-vs-software comparison is vacuous in this environment')
    } else {
        assert.equal(capture.canary, 0,
            `software 2D canvas expected (canary diff=${capture.canary})`)
    }
    assert.equal(capture.stable, true,
        `${effectModule}: overlay pixels changed after asyncInit without new draws`)
    await page.close()
    return { capture, consoleMessages }
}

async function main() {
    const baseUrl = await acquireServer(undefined, repoRoot, effectsDir)

    const softwareBrowser = await chromium.launch({ headless: true, args: softwareArgs })
    const acceleratedBrowser = await chromium.launch({ headless: true, args: acceleratedArgs })

    try {
        for (const { module: effectModule, name } of EFFECTS) {
            const software = await runOverlayCapture(softwareBrowser, baseUrl,
                { effectModule, probeAccelerated: false })
            const accelerated = await runOverlayCapture(acceleratedBrowser, baseUrl,
                { effectModule, probeAccelerated: true })

            assert.equal(software.capture.willReadFrequently, true,
                `${name}: overlay canvas must opt into the software rasterizer (willReadFrequently)`)
            assert.equal(accelerated.capture.willReadFrequently, true,
                `${name}: overlay canvas must opt into the software rasterizer even on an accelerated host`)

            assert.equal(
                software.capture.data,
                accelerated.capture.data,
                `${name}: overlay pixels differ between software and accelerated 2D canvas backends`)

            // Stroke-list determinism: two software runs are byte-identical.
            const repeat = await runOverlayCapture(softwareBrowser, baseUrl,
                { effectModule, probeAccelerated: false })
            assert.equal(repeat.capture.data, software.capture.data,
                `${name}: overlay pixels are not deterministic for the same seed`)

            assert.deepEqual(software.consoleMessages, [],
                `${name} console output (software launch):\n${software.consoleMessages.join('\n')}`)
            assert.deepEqual(accelerated.consoleMessages, [],
                `${name} console output (accelerated launch):\n${accelerated.consoleMessages.join('\n')}`)

            console.log(`PASS ${name}: overlay identical across software and accelerated 2D canvas backends`)
        }
        console.log('PASS test_overlay_host_independence')
    } finally {
        await softwareBrowser.close()
        await acceleratedBrowser.close()
        await releaseServer()
    }
}

await main()

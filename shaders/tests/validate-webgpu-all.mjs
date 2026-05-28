#!/usr/bin/env node
/*
 * Compile-and-render validate every effect on WebGPU.
 * Uses the same effect-select / status-div polling approach the test-harness
 * uses, but reads back canvas pixels via a 2D scratch canvas (works on
 * WebGPU canvases). Catches WGSL compile errors AND blank renders.
 */

import fs from 'fs'
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

function listEffects() {
    const ids = []
    for (const ns of fs.readdirSync(EFFECTS_DIR, { withFileTypes: true })) {
        if (!ns.isDirectory()) continue
        const nsPath = path.join(EFFECTS_DIR, ns.name)
        for (const eff of fs.readdirSync(nsPath, { withFileTypes: true })) {
            if (!eff.isDirectory()) continue
            if (fs.existsSync(path.join(nsPath, eff.name, 'definition.js'))) {
                ids.push(`${ns.name}/${eff.name}`)
            }
        }
    }
    return ids.sort()
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
    const context = await browser.newContext({ viewport: { width: 256, height: 256 } })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)

    const consoleCapture = []
    page.on('console', msg => {
        const t = msg.text()
        consoleCapture.push({ type: msg.type(), text: t })
    })
    page.on('pageerror', err => consoleCapture.push({ type: 'pageerror', text: err.message }))

    await page.goto(`${baseUrl}/demo/shaders/?effect=synth/noise`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() =>
        !!window.__noisemakerCanvasRenderer && !!document.getElementById('effect-select'),
        null, { timeout: 15000 })

    // Switch to webgpu/wgsl backend (renderer uses 'wgsl' as the label, not 'webgpu')
    await page.evaluate(async () => {
        const r = window.__noisemakerCanvasRenderer
        if (r?.switchBackend) await r.switchBackend('wgsl')
    })
    await page.waitForTimeout(500)
    const actualBackend = await page.evaluate(() => window.__noisemakerCurrentBackend?.() || 'unknown')
    if (actualBackend !== 'wgsl') {
        console.error(`FAILED to switch to wgsl backend (still on ${actualBackend})`)
        process.exit(2)
    }
    console.log(`Backend confirmed: ${actualBackend}`)

    const effects = listEffects()
    console.log(`Validating compile + render for ${effects.length} effects on WebGPU...`)
    const t0 = Date.now()

    async function validateOne(id) {
        consoleCapture.length = 0
        const compileResult = await page.evaluate((effectId) => {
            return new Promise(resolve => {
                const select = document.getElementById('effect-select')
                if (!select) { resolve({ status: 'error', err: 'no effect-select' }); return }
                const statusEl = document.getElementById('status')
                // Force status to "loading" so the poll waits for a real change.
                if (statusEl) statusEl.textContent = 'loading...'
                select.value = effectId
                select.dispatchEvent(new Event('change'))
                const start = Date.now()
                const poll = () => {
                    const raw = statusEl?.textContent || ''
                    const text = raw.toLowerCase()
                    // Real failures use specific prefixes — substring 'error' matches the
                    // effect name 'scanlineError' which is a false positive.
                    if (text.startsWith('shader error') ||
                        text.startsWith('compilation error') ||
                        text.includes(' failed') ||
                        text.startsWith('error') ||
                        text.startsWith('failed')) {
                        resolve({ status: 'error', message: raw })
                        return
                    }
                    if (text.startsWith('compiled') ||
                        text.startsWith('pipeline ') ||
                        text.startsWith('loaded') ||
                        text.includes('successfully')) {
                        resolve({ status: 'ok', message: raw })
                        return
                    }
                    if (Date.now() - start > 3000) {
                        resolve({ status: 'timeout', message: raw })
                        return
                    }
                    setTimeout(poll, 30)
                }
                poll()
            })
        }, id)

        // Wait an extra RAF for first render
        await page.evaluate(() =>
            new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))

        // Read canvas pixels by Playwright screenshot of the canvas element
        // (the canvas-2D drawImage path produces solid colors for WebGPU canvases
        // in headless Chromium — the IOSurface device mismatch the validator console
        // captures. Screenshot grabs what Chromium actually composites.)
        let readback = { ok: false }
        if (compileResult.status === 'ok') {
            try {
                const handle = await page.evaluateHandle(() =>
                    window.__noisemakerGetCanvas?.() || window.__noisemakerCanvasRenderer?.canvas)
                const el = handle.asElement()
                if (!el) { readback = { ok: false, err: 'no canvas handle' } }
                else {
                    const buf = await el.screenshot({ type: 'png' })
                    // Decode PNG via sharp would be ideal, but parse a few pixels by reading
                    // the IDAT chunk is overkill. Use the page to decode it.
                    readback = await page.evaluate(async (b64) => {
                        const img = new Image()
                        img.src = 'data:image/png;base64,' + b64
                        await img.decode()
                        const w = img.naturalWidth, h = img.naturalHeight
                        if (!w || !h) return { ok: false, err: 'screenshot 0x0' }
                        const scratch = document.createElement('canvas')
                        scratch.width = w; scratch.height = h
                        const ctx = scratch.getContext('2d')
                        ctx.drawImage(img, 0, 0)
                        const data = ctx.getImageData(0, 0, w, h).data
                        const step = Math.max(1, Math.floor((w * h) / 4096))
                        let nonZero = 0, nonTransparent = 0
                        const distinct = new Set()
                        let samples = 0
                        for (let i = 0; i < data.length; i += step * 4) {
                            samples++
                            if (data[i] | data[i+1] | data[i+2]) nonZero++
                            if (data[i+3]) nonTransparent++
                            distinct.add(((data[i] << 16) | (data[i+1] << 8) | data[i+2]) >>> 0)
                        }
                        return {
                            ok: true,
                            nonZeroFrac: nonZero / samples,
                            nonTransparentFrac: nonTransparent / samples,
                            distinct: distinct.size,
                        }
                    }, buf.toString('base64'))
                }
                await handle.dispose()
            } catch (e) { readback = { ok: false, err: 'screenshot: ' + e.message } }
        }

        const errors = consoleCapture.slice()
        const wgslErr = errors.some(e =>
            e.text.includes('compilation failed') ||
            e.text.includes('reserved keyword') ||
            (e.text.includes('uncaptured') && e.text.includes('WebGPU')))
        const renderFailed = compileResult.status === 'ok' &&
            readback.ok &&
            readback.nonZeroFrac < 0.001 && readback.nonTransparentFrac < 0.001
        const failed = compileResult.status !== 'ok' || wgslErr || renderFailed || !!readback.err
        return { id, compileResult, readback, errors, failed }
    }

    const results = []
    for (const id of effects) {
        let result = await validateOne(id)
        // IOSurface device-mismatch is a swapchain race between rapid backend/effect
        // switches — not a WGSL/runtime bug. Retry once after a short pause; if the
        // canvas-texture view stabilizes the effect passes on the retry. Real WGSL
        // bugs persist across retries.
        if (result.failed) {
            const onlyIosurface = result.errors.length > 0 &&
                result.errors.every(e =>
                    e.text.includes('IOSurface') ||
                    e.text.includes('Invalid CommandBuffer'))
            if (onlyIosurface || result.readback.err) {
                await page.waitForTimeout(300)
                result = await validateOne(id)
            }
        }
        results.push(result)
    }

    const t1 = Date.now()
    const failed = results.filter(r => r.failed)
    console.log(`\n${results.length - failed.length} / ${results.length} effects validated in ${((t1-t0)/1000).toFixed(1)}s`)
    if (failed.length) {
        console.log('\nFAILED:')
        for (const f of failed) {
            const why = []
            if (f.compileResult.status !== 'ok') why.push(`compile=${f.compileResult.status}: ${(f.compileResult.message || '').slice(0, 200)}`)
            if (f.readback.err) why.push(`readback err: ${f.readback.err}`)
            if (f.readback.ok && f.readback.nonZeroFrac < 0.001) why.push(`blank (distinct=${f.readback.distinct})`)
            const wgsl = f.errors.find(e =>
                e.text.includes('compilation failed') ||
                e.text.includes('reserved keyword') ||
                e.text.includes('uncaptured'))
            if (wgsl) why.push(`console: ${wgsl.text.slice(0, 200)}`)
            console.log(`  ${f.id}  — ${why.join(' | ')}`)
        }
    }

    await browser.close()
    process.exit(failed.length ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(2) })

// repro-noise-hang.mjs
// Reproduces and times the synth/noise compile hang in real Chrome on Windows.
// This is a debugging tool for the issue tracked in HANDOFF-shader-compile.md.
//
// Usage (from noisemaker repo root, with `npm run dev` already running on :8001):
//   node shaders/tests/repro-noise-hang.mjs                  # both backends, fresh user data dir
//   node shaders/tests/repro-noise-hang.mjs --backend glsl   # one backend
//   node shaders/tests/repro-noise-hang.mjs --warm           # reuse user data dir between runs
//
// Requires Chrome at C:\Program Files\Google\Chrome\Application\chrome.exe.

import { chromium } from 'playwright'
import { mkdtempSync, rmSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const VIEWER_BASE = 'http://127.0.0.1:8001/demo/shaders/'
const EFFECT = 'synth.noise'
const PIPELINE_READY_TIMEOUT_MS = 90_000

const args = process.argv.slice(2)
const onlyBackend = args.includes('--backend') ? args[args.indexOf('--backend') + 1] : null
const warm = args.includes('--warm')
// --variants forces test of all numerically-distinct noise types via runtime DSL injection.
// Lets us validate the per-variant recompile path AND that each variant compiles fast.
const testVariants = args.includes('--variants')
const NOISE_VARIANT_VALUES = [0, 1, 2, 3, 4, 5, 6, 10, 11]

const WARM_DIR = join(tmpdir(), 'noisemaker-repro-warm')
if (warm && !existsSync(WARM_DIR)) mkdirSync(WARM_DIR, { recursive: true })

async function runOnce(backend, label) {
    const userDataDir = warm ? WARM_DIR : mkdtempSync(join(tmpdir(), 'noisemaker-repro-'))
    const url = `${VIEWER_BASE}?backend=${backend}&effect=${EFFECT}`
    console.log(`\n=== ${label} | backend=${backend} | warm=${warm} ===`)
    console.log(`url=${url}`)
    console.log(`userDataDir=${userDataDir}`)

    const ctx = await chromium.launchPersistentContext(userDataDir, {
        executablePath: CHROME_PATH,
        headless: false,
        viewport: { width: 1280, height: 900 },
        args: [
            '--enable-unsafe-webgpu',
            '--use-angle=d3d11',
            '--enable-gpu-rasterization',
            '--ignore-gpu-blocklist',
        ],
    })

    const page = ctx.pages()[0] || (await ctx.newPage())

    const compileLines = []
    const errors = []

    page.on('console', msg => {
        const text = msg.text()
        if (text.startsWith('[compile-')) {
            compileLines.push(text)
            console.log(`  CONSOLE: ${text}`)
        } else if (msg.type() === 'error') {
            errors.push(text)
            console.log(`  CONSOLE-ERR: ${text}`)
        }
    })
    page.on('pageerror', err => {
        errors.push(err.message)
        console.log(`  PAGEERR: ${err.message}`)
    })
    page.on('crash', () => {
        console.log(`  *** PAGE CRASHED ***`)
    })

    const t0 = Date.now()
    const timings = []

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        timings.push({ phase: 'dom-loaded', ms: Date.now() - t0 })

        await page.waitForFunction(() => typeof window.__noisemakerCanvasRenderer !== 'undefined', { timeout: 30_000 })
        timings.push({ phase: 'renderer-global-present', ms: Date.now() - t0 })

        await page.waitForFunction(
            () => window.__noisemakerRenderingPipeline !== null && window.__noisemakerRenderingPipeline !== undefined,
            { timeout: PIPELINE_READY_TIMEOUT_MS, polling: 50 }
        )
        timings.push({ phase: 'pipeline-ready', ms: Date.now() - t0 })
    } catch (e) {
        timings.push({ phase: 'TIMEOUT-OR-ERROR', ms: Date.now() - t0, error: e.message })
    }

    // If --variants, switch through every distinct NOISE_TYPE via the renderer.compile()
    // path (the same path the dropdown handler will use). Each variant should compile
    // independently and produce its own [compile-glsl ...__NOISE_TYPE_<n>] line.
    if (testVariants) {
        for (const t of NOISE_VARIANT_VALUES) {
            const variantStart = Date.now()
            try {
                await page.evaluate(async (type) => {
                    const dsl = `search synth, render\n\nnoise(type: ${type}).write(o0)\nrender(o0)`
                    await window.__noisemakerCanvasRenderer.compile(dsl)
                }, t)
                console.log(`  variant type=${t}: ${Date.now() - variantStart}ms wall`)
            } catch (e) {
                console.log(`  variant type=${t}: FAILED in ${Date.now() - variantStart}ms — ${e.message}`)
            }
        }
    }

    // Capture GL_RENDERER for ground truth (so we know we hit ANGLE→D3D, not SwiftShader)
    const gpuInfo = await page.evaluate(() => {
        try {
            const backend = typeof window.__noisemakerCurrentBackend === 'function' ? window.__noisemakerCurrentBackend() : null
            const canvas = document.getElementById('canvas')
            const gl = canvas?.getContext('webgl2')
            if (gl) {
                const ext = gl.getExtension('WEBGL_debug_renderer_info')
                return {
                    backend,
                    glRenderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
                    glVendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
                    glVersion: gl.getParameter(gl.VERSION),
                }
            }
            return { backend, glRenderer: 'unknown (no webgl2 ctx — likely wgpu mode)' }
        } catch (e) {
            return { error: e.message }
        }
    })

    console.log(`  gpuInfo: ${JSON.stringify(gpuInfo)}`)
    console.log(`  timings: ${timings.map(t => `${t.phase}=${t.ms}ms`).join(' ')}`)
    console.log(`  compileLines (${compileLines.length}):`)
    for (const line of compileLines) console.log(`    ${line}`)
    if (errors.length) console.log(`  errors (${errors.length}):`, errors)

    await ctx.close()

    if (!warm) {
        try { rmSync(userDataDir, { recursive: true, force: true }) } catch {}
    }

    return { backend, timings, compileLines, errors, gpuInfo }
}

async function main() {
    const backends = onlyBackend ? [onlyBackend] : ['glsl', 'wgsl']
    const results = []

    for (const backend of backends) {
        const r = await runOnce(backend, `RUN ${backend}`)
        results.push(r)
    }

    console.log('\n=== SUMMARY ===')
    for (const r of results) {
        const ready = r.timings.find(t => t.phase === 'pipeline-ready')
        const timeout = r.timings.find(t => t.phase === 'TIMEOUT-OR-ERROR')
        const status = ready ? `ready=${ready.ms}ms` : (timeout ? `TIMEOUT@${timeout.ms}ms (${timeout.error})` : 'unknown')
        console.log(`${r.backend}: ${status} compileLines=${r.compileLines.length} errors=${r.errors.length}`)
        const slowest = [...r.compileLines]
            .map(l => ({ line: l, total: parseFloat((l.match(/total=([\d.]+)/) || [])[1] || 0) }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 3)
        for (const s of slowest) console.log(`  ${s.total}ms: ${s.line}`)
    }
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})

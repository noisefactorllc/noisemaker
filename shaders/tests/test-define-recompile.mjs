// test-define-recompile.mjs
//
// One-shot integration test: load synth/noise in the demo viewer, change the
// `type` dropdown (a `define: NOISE_TYPE` global), and verify that a new
// program with a `__NOISE_TYPE_<value>` cache key suffix gets compiled.
//
// This is the regression check for the program-state recompileNeeded wiring —
// without it, mutating a compile-time-define-flagged global only writes a
// runtime uniform (which the shader doesn't read), and the new variant is
// never built.
//
// Usage (with `npm run dev` running on :8001):
//   node shaders/tests/test-define-recompile.mjs
//   node shaders/tests/test-define-recompile.mjs --backend wgsl

import { chromium } from 'playwright'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const VIEWER_BASE = 'http://127.0.0.1:8001/demo/shaders/'
const NAV_TIMEOUT_MS = 20_000
const PIPELINE_TIMEOUT_MS = 30_000

function arg(name, def = null) {
    const i = process.argv.indexOf(`--${name}`)
    if (i < 0) return def
    return process.argv[i + 1] ?? true
}

const backend = arg('backend', 'glsl')

async function main() {
    const userDataDir = mkdtempSync(join(tmpdir(), 'noisemaker-define-recompile-'))
    console.log(`backend=${backend}  userDataDir=${userDataDir}`)

    const ctx = await chromium.launchPersistentContext(userDataDir, {
        executablePath: CHROME_PATH,
        headless: false,
        viewport: { width: 1280, height: 900 },
        args: [
            '--enable-unsafe-webgpu',
            '--use-angle=d3d11',
            '--ignore-gpu-blocklist',
        ],
    })

    const page = ctx.pages()[0] || (await ctx.newPage())

    const compileLines = []
    const errors = []
    page.on('console', msg => {
        const text = msg.text()
        if (text.startsWith('[compile-')) compileLines.push(text)
        else if (msg.type() === 'error') errors.push(text)
    })
    page.on('pageerror', err => errors.push(`pageerror: ${err.message}`))

    const url = `${VIEWER_BASE}?backend=${backend}&effect=${encodeURIComponent('synth.noise')}`
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS })
    await page.waitForFunction(
        () => window.__noisemakerRenderingPipeline != null,
        { timeout: PIPELINE_TIMEOUT_MS, polling: 50 }
    )

    // Wait for the noise type dropdown to appear and check its initial value.
    // The noise effect's `type` global has default=10 (simplex), so the
    // initial program key should contain `__NOISE_TYPE_10`.
    const initialCompiles = compileLines.length
    const sawInitial = compileLines.some(l => l.includes('__NOISE_TYPE_10'))
    console.log(`initial compiles=${initialCompiles}  sawInitialNoiseType10=${sawInitial}`)

    // Change the noise type via the ProgramState test hook. Going through the
    // state layer (rather than the custom-element dropdown) tests exactly the
    // wiring we care about: setValue on a `define:`-flagged param should
    // trigger a recompile.
    const beforeChange = compileLines.length
    await page.evaluate(() => {
        const ps = window.__noisemakerProgramState
        if (!ps) throw new Error('window.__noisemakerProgramState not set')
        // Pick a value different from the default 10. constant=0 in the choices.
        ps.setValue('step_0', 'type', 0)
    })

    // Give the recompile a chance to run.
    await page.waitForTimeout(2000)

    const newCompiles = compileLines.slice(beforeChange)
    const sawNewVariant = newCompiles.some(l => l.includes('__NOISE_TYPE_0'))
    console.log(`compiles after change=${newCompiles.length}`)
    for (const l of newCompiles) console.log(`  ${l}`)
    console.log(`sawNewVariant(__NOISE_TYPE_0)=${sawNewVariant}`)

    if (errors.length > 0) {
        console.log(`\nERRORS:`)
        for (const e of errors) console.log(`  ${e}`)
    }

    let failed = false
    if (!sawNewVariant) {
        console.log('\nFAIL: noise type change did not trigger a recompile of the new variant')
        failed = true
    }

    // Negative case: changing a regular runtime uniform must NOT trigger a
    // recompile. We pick `freq`, which is a normal float uniform with no
    // `define:` flag. After bumping it, no new compile lines should appear.
    const beforeRuntimeChange = compileLines.length
    await page.evaluate(() => {
        const ps = window.__noisemakerProgramState
        ps.setValue('step_0', 'freq', 7)
    })
    await page.waitForTimeout(1000)
    const newAfterRuntime = compileLines.slice(beforeRuntimeChange)
    if (newAfterRuntime.length > 0) {
        console.log(`\nFAIL: runtime uniform change triggered ${newAfterRuntime.length} unexpected compile(s):`)
        for (const l of newAfterRuntime) console.log(`  ${l}`)
        failed = true
    }

    await ctx.close()
    rmSync(userDataDir, { recursive: true, force: true })

    if (failed) process.exit(1)
    console.log('\nPASS: noise type change recompiled new __NOISE_TYPE_0 variant')
    console.log('PASS: regular runtime uniform change did not trigger any recompile')
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})

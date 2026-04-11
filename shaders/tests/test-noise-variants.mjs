// Smoke test: walk every define-flagged param on classicNoisedeck/noise
// through every legal value via the ProgramState test hook and verify each
// recompile produces a valid program (no link/compile errors).
//
// Coverage model: parameters are walked sequentially (additive), not
// Cartesian-product. Each setValue swaps one knob against the cumulative
// state, so a typo in any single `#elif MACRO == N` branch is caught by the
// pass over that param's value list. Cross-variant interactions (e.g.
// COLOR_MODE=4 × LOOP_OFFSET=210) are not exercised — add those manually if
// a regression appears that needs full-matrix coverage.
import { chromium } from 'playwright'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME_PATH = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`
const VIEWER_BASE = 'http://127.0.0.1:8001/demo/shaders/'

const variants = [
    // colorMode: all 6 values
    { param: 'colorMode', values: [0, 1, 2, 3, 4, 6] },
    // refractMode: all 3 values
    { param: 'refractMode', values: [0, 1, 2] },
    // loopOffset: all 17 #elif branches in offset()
    { param: 'loopOffset', values: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 200, 210, 300, 400, 410] },
    // metric: all 6 values
    { param: 'metric', values: [0, 1, 2, 3, 4, 5] },
    // type: all 9 noise variants
    { param: 'type', values: [0, 1, 2, 3, 4, 5, 6, 10, 11] },
]

async function main() {
    const userDataDir = mkdtempSync(join(tmpdir(), 'noisemaker-variants-'))
    const ctx = await chromium.launchPersistentContext(userDataDir, {
        executablePath: CHROME_PATH,
        headless: false,
        viewport: { width: 1280, height: 900 },
        args: ['--enable-unsafe-webgpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'],
    })
    const page = ctx.pages()[0] || (await ctx.newPage())

    const errors = []
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', err => errors.push(`pageerror: ${err.message}`))

    const url = `${VIEWER_BASE}?backend=glsl&effect=classicNoisedeck.noise`
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 })
    await page.waitForFunction(() => window.__noisemakerProgramState != null, { timeout: 25000 })
    await page.waitForFunction(() => window.__noisemakerRenderingPipeline != null, { timeout: 25000 })

    console.log('Initial load OK')

    let totalChecks = 0
    let failures = 0
    for (const { param, values } of variants) {
        for (const v of values) {
            const errorsBefore = errors.length
            await page.evaluate(({ p, val }) => {
                const ps = window.__noisemakerProgramState
                const stepKey = ps.getStepKeys()[0]
                ps.setValue(stepKey, p, val)
            }, { p: param, val: v })
            // Wait for any recompile + render tick
            await page.waitForTimeout(400)
            const newErrors = errors.slice(errorsBefore).filter(e => !/passive event/i.test(e))
            totalChecks++
            if (newErrors.length > 0) {
                failures++
                console.log(`FAIL ${param}=${v}: ${newErrors[0].slice(0, 200)}`)
            } else {
                console.log(`  ok  ${param}=${v}`)
            }
        }
    }

    console.log(`\n${totalChecks - failures}/${totalChecks} variants OK`)
    await ctx.close()
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch {}
    process.exit(failures > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })

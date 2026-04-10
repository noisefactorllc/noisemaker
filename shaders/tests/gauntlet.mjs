// gauntlet.mjs
// Times every effect's first-compile in real Chrome on Windows so we can find
// the next compile-hang hotspots after Knob 2. Same real-Chrome Playwright
// pattern as repro-noise-hang.mjs (channel='chrome', headless=false), but
// iterates over the entire effects manifest.
//
// Usage (from noisemaker repo root, with `npm run dev` running on :8001):
//   node shaders/tests/gauntlet.mjs                            # glsl, all effects
//   node shaders/tests/gauntlet.mjs --backend wgsl             # wgsl, all effects
//   node shaders/tests/gauntlet.mjs --backend both             # both backends
//   node shaders/tests/gauntlet.mjs --limit 20                 # first 20 effects only
//   node shaders/tests/gauntlet.mjs --filter classicNoisedeck  # only effects whose id contains the string
//   node shaders/tests/gauntlet.mjs --csv out.csv              # write per-program rows to CSV

import { chromium } from 'playwright'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')
const MANIFEST_PATH = join(REPO_ROOT, 'shaders', 'effects', 'manifest.json')

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const VIEWER_BASE = 'http://127.0.0.1:8001/demo/shaders/'
// Cap waits aggressively. We already know anything >25s is broken on Windows
// Chrome — we don't need precise timing past that, just a "yes it's broken" flag.
// Without these caps, a single hang-effect can chew up 90+ seconds.
const PIPELINE_TIMEOUT_MS = 25_000
const NAV_TIMEOUT_MS = 15_000
const RENDERER_GLOBAL_TIMEOUT_MS = 10_000
// Effects we know have unusual entry points / require multi-effect pipelines.
// The demo viewer's selectEffect handles this for us via buildDslSource, but a
// few categories require external resources (mesh files, midi, audio) that
// won't work in this offline gauntlet — skip them upfront.
const SKIP = new Set([
    'render/meshLoader', // needs an OBJ file
    'render/meshRender', // ditto
    'synth/media',       // needs camera/video input
    'synth/scope',       // needs audio input
    'synth/spectrum',    // needs audio input
    'synth/roll',        // needs midi input
])

function arg(name, def = null) {
    const i = process.argv.indexOf(`--${name}`)
    if (i < 0) return def
    return process.argv[i + 1] ?? true
}
function flag(name) {
    return process.argv.includes(`--${name}`)
}

const backendArg = arg('backend', 'glsl')
const limitArg = parseInt(arg('limit', '0'), 10)
const filterArg = arg('filter', null)
const csvPath = arg('csv', null)
const verbose = flag('verbose')

const backends = backendArg === 'both' ? ['glsl', 'wgsl'] : [backendArg]

function loadEffects() {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
    let ids = Object.keys(manifest).sort()
    if (filterArg) ids = ids.filter(id => id.includes(filterArg))
    ids = ids.filter(id => !SKIP.has(id))
    if (limitArg > 0) ids = ids.slice(0, limitArg)
    return ids
}

function urlForEffect(effectId, backend) {
    // Demo viewer expects '.' separator, not '/'
    const eff = effectId.replace('/', '.')
    return `${VIEWER_BASE}?backend=${backend}&effect=${encodeURIComponent(eff)}`
}

// Each compile line looks like:
//   [compile-glsl node_0_noise__NOISE_TYPE_10] vs=0.2 fs=2.0 link=0.0 status=147.1ms total=149.3ms src=17907b
//   [compile-wgsl-render node_0_noise] module=0.1ms info=27.3ms pipeline=0.0ms total=28.0ms src=18681b
//   [compile-wgsl-compute node_0_xxx] module=... info=... pipeline=... total=... src=...
function parseCompileLine(text) {
    const m = /^\[compile-(glsl|wgsl-render|wgsl-compute)\s+([^\]]+)\]\s+(.+)$/.exec(text)
    if (!m) return null
    const [, kind, programId, rest] = m
    const fields = {}
    for (const part of rest.split(/\s+/)) {
        const eq = part.indexOf('=')
        if (eq < 0) continue
        const key = part.slice(0, eq)
        let val = part.slice(eq + 1)
        if (val.endsWith('ms')) val = parseFloat(val.slice(0, -2))
        else if (val.endsWith('b')) val = parseInt(val.slice(0, -1), 10)
        else if (!Number.isNaN(parseFloat(val))) val = parseFloat(val)
        fields[key] = val
    }
    return { kind, programId, ...fields }
}

async function runGauntlet(backend, effects) {
    const userDataDir = mkdtempSync(join(tmpdir(), 'noisemaker-gauntlet-'))
    console.log(`\n=== gauntlet | backend=${backend} | effects=${effects.length} ===`)
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

    // Per-effect state. Mutate from inside the console listener.
    let currentEffect = null
    const collected = new Map() // effectId -> { compileLines: [], errors: [] }

    page.on('console', msg => {
        const text = msg.text()
        if (!currentEffect) return
        const slot = collected.get(currentEffect)
        if (!slot) return
        if (text.startsWith('[compile-')) {
            const parsed = parseCompileLine(text)
            slot.compileLines.push({ raw: text, parsed })
        } else if (msg.type() === 'error') {
            slot.errors.push(text)
        }
    })
    page.on('pageerror', err => {
        if (!currentEffect) return
        const slot = collected.get(currentEffect)
        if (slot) slot.errors.push(`pageerror: ${err.message}`)
    })
    page.on('crash', () => {
        console.log(`  *** PAGE CRASHED on ${currentEffect} ***`)
        if (currentEffect) {
            const slot = collected.get(currentEffect)
            if (slot) slot.crashed = true
        }
    })

    const results = []

    for (let i = 0; i < effects.length; i++) {
        const effectId = effects[i]
        currentEffect = effectId
        collected.set(effectId, { compileLines: [], errors: [], crashed: false })

        const url = urlForEffect(effectId, backend)
        const t0 = Date.now()
        let pipelineMs = null
        let timedOut = false
        let navError = null

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS })
            await page.waitForFunction(
                () => typeof window.__noisemakerCanvasRenderer !== 'undefined',
                { timeout: RENDERER_GLOBAL_TIMEOUT_MS }
            )
            await page.waitForFunction(
                () => window.__noisemakerRenderingPipeline !== null && window.__noisemakerRenderingPipeline !== undefined,
                { timeout: PIPELINE_TIMEOUT_MS, polling: 50 }
            )
            pipelineMs = Date.now() - t0
        } catch (e) {
            timedOut = e.message.includes('Timeout') || e.message.includes('exceeded')
            navError = e.message
            pipelineMs = Date.now() - t0
        }

        // If the pipeline timed out OR completed but no compile log arrived yet,
        // poll briefly for the [compile-...] line associated with the effect's
        // main program. Capped low so the gauntlet finishes in reasonable time;
        // for effects that exceed this we just report TIMEOUT (which already
        // tells us they're broken — precise time isn't needed for triage).
        const STRAGGLER_WAIT_MS = 5_000
        const stragglerStart = Date.now()
        while (Date.now() - stragglerStart < STRAGGLER_WAIT_MS) {
            const slot = collected.get(effectId)
            const hasMainProgram = slot.compileLines.some(l => l.parsed && !l.parsed.programId.includes('blit'))
            if (hasMainProgram) break
            try {
                await page.waitForTimeout(250)
            } catch {
                break // page died, give up
            }
        }
        // Final settle to flush any trailing compile messages
        try { await page.waitForTimeout(50) } catch {}

        const slot = collected.get(effectId)
        // Compute the worst per-program total compile cost across all compile lines
        // for this effect (filtering out the cheap blit compiles which are shared infra).
        const programTotals = slot.compileLines
            .filter(l => l.parsed && !l.parsed.programId.includes('blit'))
            .map(l => l.parsed.total ?? 0)
        const worstProgramMs = programTotals.length ? Math.max(...programTotals) : 0
        const sumProgramMs = programTotals.reduce((a, b) => a + b, 0)

        const status = slot.crashed
            ? 'CRASH'
            : timedOut ? 'TIMEOUT'
            : navError ? 'NAV_ERR'
            : 'ok'

        results.push({
            effectId,
            status,
            pipelineMs,
            worstProgramMs,
            sumProgramMs,
            programCount: programTotals.length,
            errorCount: slot.errors.length,
            compileLines: slot.compileLines.map(l => l.raw),
            errors: slot.errors,
            navError,
        })

        // One-line per-effect summary on stdout
        const flag = status !== 'ok' ? `[${status}] ` : ''
        const errMark = slot.errors.length ? ` errors=${slot.errors.length}` : ''
        const verboseLines = verbose && slot.compileLines.length
            ? '\n      ' + slot.compileLines.map(l => l.raw).join('\n      ')
            : ''
        console.log(`  ${String(i + 1).padStart(3)}/${effects.length}  ${flag}${effectId.padEnd(40)} pipeline=${pipelineMs}ms worst=${worstProgramMs.toFixed(0)}ms progs=${programTotals.length}${errMark}${verboseLines}`)
    }

    await ctx.close()
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch {}

    return results
}

function printHotspotReport(backend, results) {
    console.log(`\n=== HOTSPOTS (${backend}) — sorted by worst per-program compile time ===`)
    const sorted = [...results].sort((a, b) => b.worstProgramMs - a.worstProgramMs)
    const top = sorted.slice(0, 30)
    for (const r of top) {
        const flag = r.status !== 'ok' ? `[${r.status}] ` : ''
        const slowest = r.compileLines.find(l => parseCompileLine(l)?.total === r.worstProgramMs) || ''
        console.log(`  ${flag}${r.effectId.padEnd(40)} worst=${r.worstProgramMs.toFixed(0)}ms sum=${r.sumProgramMs.toFixed(0)}ms`)
        if (slowest) console.log(`    ${slowest}`)
    }

    // Highlight failures separately so they're not buried
    const failures = results.filter(r => r.status !== 'ok' || r.errorCount > 0)
    if (failures.length) {
        console.log(`\n=== FAILURES (${backend}) — ${failures.length} effects ===`)
        for (const f of failures) {
            console.log(`  [${f.status}] ${f.effectId} (errors=${f.errorCount})${f.navError ? ' ' + f.navError.split('\n')[0] : ''}`)
            if (f.errors.length) {
                for (const e of f.errors.slice(0, 3)) console.log(`    ${e}`)
            }
        }
    }

    // Summary stats
    const ok = results.filter(r => r.status === 'ok').length
    const slowOnes = results.filter(r => r.worstProgramMs > 1000)
    console.log(`\n=== SUMMARY (${backend}) ===`)
    console.log(`  total=${results.length} ok=${ok} failed=${results.length - ok}`)
    console.log(`  programs >1000ms=${slowOnes.length}, >500ms=${results.filter(r => r.worstProgramMs > 500).length}, >200ms=${results.filter(r => r.worstProgramMs > 200).length}`)
}

function writeCsv(path, results, backend) {
    const rows = ['backend,effect,status,pipeline_ms,worst_program_ms,sum_program_ms,program_count,error_count,compile_lines']
    for (const r of results) {
        const compileLinesEscaped = r.compileLines.join(' || ').replace(/"/g, '""')
        rows.push(`${backend},${r.effectId},${r.status},${r.pipelineMs},${r.worstProgramMs.toFixed(1)},${r.sumProgramMs.toFixed(1)},${r.programCount},${r.errorCount},"${compileLinesEscaped}"`)
    }
    writeFileSync(path, rows.join('\n') + '\n', { flag: 'a' })
}

async function main() {
    const effects = loadEffects()
    if (effects.length === 0) {
        console.error('No effects matched.')
        process.exit(1)
    }
    if (csvPath) {
        // Truncate header on first write
        writeFileSync(csvPath, '')
    }

    for (const backend of backends) {
        const results = await runGauntlet(backend, effects)
        printHotspotReport(backend, results)
        if (csvPath) writeCsv(csvPath, results, backend)
    }
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})

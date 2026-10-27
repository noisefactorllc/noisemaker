#!/usr/bin/env node
// Rendered contract for synth/remap on both GPU backends.
//
// Every case renders a real DSL program through CanvasRenderer in headless
// Chromium (WebGL2, then WebGPU) and reads the presented canvas back as PNG.
// The canvas is a premultiplied surface (`alphaMode: 'premultiplied'`, and the
// WebGL2 context's default `premultipliedAlpha: true`), so `toDataURL`
// un-premultiplies on readback: a pixel written as (0.25, 0, 0, 0.25) reads
// back as (255, 0, 0, 64). test_blend_mode_alpha.mjs and test_media_alpha.mjs
// assert the same straight-alpha readback, and this file matches their
// assertion style (per-channel LSB tolerance, exact GLSL/WGSL byte parity).
//
// Cases:
//   a. seam        adjacent zones on a shared edge never darken toward the
//                  background, at 256x256 and 1920x1080, with and without
//                  edge smoothing; canvas borders stay pure
//   b. alpha       source alpha and zone alpha composite over the background
//                  and over the zone below (premultiplied "under")
//   c. precedence  the last (highest-numbered) zone containing a pixel is on top
//   d. aspect      the feather is a pixel width on a non-square canvas, and it
//                  never erodes the polygon interior
//   e. orientation zone coordinates are top-left origin in the presented image
//   f. gating      zones beyond zoneCount and zones with no wired source do
//                  not render
//   g. alpha out   the background alpha reaches the presented surface
//   h. bounds      exact zoneN_bounds change nothing (feather dilation), and
//                  a tighter box proves the zone-level reject is live
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const effectsDir = path.join(repoRoot, 'shaders/effects')
process.env.SHADE_EFFECTS_DIR = effectsDir
process.env.SHADE_PROJECT_ROOT = repoRoot
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, repoRoot, effectsDir)
const browser = await chromium.launch(shaderTestBrowserOptions())

// ---------------------------------------------------------------------------
// DSL helpers. Zone vertices are normalized, (0,0) top-left, packed two per
// vec4 exactly as Noisedeck's canvas editor writes them.
// ---------------------------------------------------------------------------
const rect = (x0, y0, x1, y1) => ({ count: 4, verts: [[x0, y0, x1, y0], [x1, y1, x0, y1]] })
const FULL = rect(0, 0, 1, 1)

function dsl({ sources = [], zones = [], remap = {} }) {
    const lines = ['search synth', '']
    for (const s of sources) {
        const alpha = s.alpha === undefined ? '' : `, alpha: ${s.alpha}`
        lines.push(`solid(color: ${s.color}${alpha}).write(${s.surface})`)
    }
    const args = Object.entries(remap).map(([k, v]) => `${k}: ${v}`)
    zones.forEach((z, i) => {
        if (z.tex) args.push(`zone${i}_tex: read(${z.tex})`)
        if (z.alpha !== undefined) args.push(`zone${i}_alpha: ${z.alpha}`)
        if (z.bounds) args.push(`zone${i}_bounds: [${z.bounds.join(', ')}]`)
        if (z.shape) {
            args.push(`zone${i}_count: ${z.shape.count}`)
            z.shape.verts.forEach((v, p) => args.push(`zone${i}_v${p}: [${v.join(', ')}]`))
        }
    })
    lines.push(`remap(${args.join(', ')}).write(o0)`, 'render(o0)')
    return lines.join('\n')
}

const RED = { surface: 'o1', color: '#ff0000' }
const BLUE = { surface: 'o2', color: '#0000ff' }

// ---------------------------------------------------------------------------
// Browser harness: one page per (backend, canvas size).
// ---------------------------------------------------------------------------
async function install(preferWebGPU, width, height) {
    const page = await browser.newPage({ viewport: { width, height } })
    const errors = []
    await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }))
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.goto(`${baseUrl}/shaders/effects/manifest.json`)
    await page.setContent(`<canvas id="canvas" width="${width}" height="${height}"></canvas>
<script type="module">
import { CanvasRenderer } from '${baseUrl}/shaders/src/index.js';
const canvas = document.getElementById('canvas');
const renderer = new CanvasRenderer({canvas,width:${width},height:${height},basePath:'${baseUrl}/shaders',preferWebGPU:${preferWebGPU}});
await renderer.loadManifest();
await renderer.loadEffects(['synth/solid','synth/remap']);
window.renderDsl = async dsl => {
    // The backends throw plain {code, detail} objects for shader errors;
    // rethrow as Error so the detail survives page.evaluate.
    try { await renderer.compile(dsl); }
    catch (e) { throw new Error(e instanceof Error ? e.message : JSON.stringify(e)); }
    renderer.render(0); renderer.render(0);
    const queue = renderer.pipeline?.backend?.device?.queue;
    if (queue?.onSubmittedWorkDone) await queue.onSubmittedWorkDone();
    return {backend:renderer.pipeline.backend.getName(),png:canvas.toDataURL('image/png')};
};
</script>`)
    await page.waitForFunction(() => typeof window.renderDsl === 'function')
    return { page, errors }
}

const px = (png, x, y) => Array.from(png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4))
const isPure = ([r, g, b, a]) => a === 255 && g === 0 && ((r === 255 && b === 0) || (r === 0 && b === 255))

function closeTo(actual, expected, tolerance, label) {
    expected.forEach((value, i) => assert.ok(Math.abs(actual[i] - value) <= tolerance,
        `${label}: expected ${expected} (±${tolerance}), got ${actual}`))
}

// ---------------------------------------------------------------------------
// Cases. Each receives render(dsl) -> PNG for a page of the requested size.
// ---------------------------------------------------------------------------
const CASES = [
    {
        name: 'seam', width: 256, height: 256, run: seam,
    },
    {
        name: 'seam 1080p', width: 1920, height: 1080, run: seam,
    },
    { name: 'alpha', width: 64, height: 64, run: alpha },
    { name: 'precedence', width: 64, height: 64, run: precedence },
    { name: 'aspect', width: 512, height: 128, run: aspect },
    { name: 'orientation', width: 64, height: 64, run: orientation },
    { name: 'gating', width: 64, height: 64, run: gating },
    { name: 'output alpha', width: 64, height: 64, run: outputAlpha },
    { name: 'bounds', width: 64, height: 64, run: bounds },
]

async function seam(render, W, H) {
    const zones = [{ tex: 'o1', shape: rect(0, 0, 0.5, 1) }, { tex: 'o2', shape: rect(0.5, 0, 1, 1) }]
    for (const smoothEdge of [undefined, 0]) {
        const label = smoothEdge === undefined ? 'default smoothEdge' : `smoothEdge ${smoothEdge}`
        const remap = { zoneCount: 2, ...(smoothEdge === undefined ? {} : { smoothEdge }) }
        const png = await render(dsl({ sources: [RED, BLUE], zones, remap }))
        const y = Math.floor(H / 2)
        let prevR = 255, prevB = 0, impure = 0
        for (let x = 0; x < W; x++) {
            const [r, g, b, a] = px(png, x, y)
            assert.equal(g, 0, `${label}: G at (${x},${y})`)
            assert.equal(a, 255, `${label}: A at (${x},${y})`)
            assert.ok(r + b >= 250, `${label}: dark seam at (${x},${y}): ${[r, g, b]}`)
            assert.ok(r <= prevR, `${label}: R rises at x=${x} (${prevR} -> ${r})`)
            assert.ok(b >= prevB, `${label}: B falls at x=${x} (${prevB} -> ${b})`)
            if ((r > 0 && r < 255) || (b > 0 && b < 255)) impure++
            prevR = r
            prevB = b
        }
        assert.deepEqual(px(png, 0, y), [255, 0, 0, 255], `${label}: column 0 of the middle row must be pure red`)
        const top = px(png, Math.floor(W / 2), 0)
        assert.ok(isPure(top), `${label}: middle column of the top row must be pure, got ${top}`)
        if (smoothEdge === 0) assert.equal(impure, 0, `${label}: expected no impure pixel on the seam row`)
        console.log(`    ${label}: ${impure} blended pixel(s) on the seam row`)
    }
}

async function alpha(render, W, H) {
    const centre = png => px(png, W >> 1, H >> 1)
    const overRed = { zoneCount: 1, bgColor: '#ff0000', bgAlpha: 1 }
    const green = alpha => ({ surface: 'o1', color: '#00ff00', alpha })

    let png = await render(dsl({ sources: [green(0)], zones: [{ tex: 'o1', shape: FULL }], remap: overRed }))
    closeTo(centre(png), [255, 0, 0, 255], 1, 'transparent source over the background')

    png = await render(dsl({ sources: [green(0.5)], zones: [{ tex: 'o1', shape: FULL }], remap: overRed }))
    closeTo(centre(png), [128, 128, 0, 255], 2, 'half-alpha source over the background')

    png = await render(dsl({ sources: [green(1)], zones: [{ tex: 'o1', shape: FULL, alpha: 0.5 }], remap: overRed }))
    closeTo(centre(png), [128, 128, 0, 255], 2, 'zone alpha 0.5 over the background')

    png = await render(dsl({
        sources: [RED, BLUE],
        zones: [{ tex: 'o1', shape: FULL }, { tex: 'o2', shape: FULL, alpha: 0.5 }],
        remap: { zoneCount: 2 },
    }))
    closeTo(centre(png), [128, 0, 128, 255], 2, 'half-alpha top zone over an opaque zone')
}

async function precedence(render, W, H) {
    const inner = rect(0.25, 0.25, 0.75, 0.75)
    let png = await render(dsl({
        sources: [RED, BLUE],
        zones: [{ tex: 'o1', shape: FULL }, { tex: 'o2', shape: inner }],
        remap: { zoneCount: 2 },
    }))
    assert.deepEqual(px(png, W >> 1, H >> 1), [0, 0, 255, 255], 'centred zone 1 must cover full-canvas zone 0')
    assert.deepEqual(px(png, 0, 0), [255, 0, 0, 255], 'corner must show zone 0')

    png = await render(dsl({
        sources: [RED, BLUE],
        zones: [{ tex: 'o2', shape: inner }, { tex: 'o1', shape: FULL }],
        remap: { zoneCount: 2 },
    }))
    assert.deepEqual(px(png, W >> 1, H >> 1), [255, 0, 0, 255], 'full-canvas zone 1 must cover centred zone 0')
    assert.deepEqual(px(png, 0, 0), [255, 0, 0, 255], 'corner must show zone 1')
}

async function aspect(render, W, H) {
    const png = await render(dsl({
        sources: [RED],
        zones: [{ tex: 'o1', shape: rect(0.25, 0.25, 0.75, 0.75) }],
        remap: { zoneCount: 1, smoothEdge: 1 },
    }))
    const x0 = Math.ceil(W * 0.25), x1 = Math.floor(W * 0.75)   // pixel centres strictly inside
    const y0 = Math.ceil(H * 0.25), y1 = Math.floor(H * 0.75)
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const p = px(png, x, y)
            assert.deepEqual(p, [255, 0, 0, 255], `interior pixel (${x},${y}) eroded: ${p}`)
        }
    }
    const feather = (step) => {
        let n = 0
        for (let i = 0; i < 64; i++) {
            const r = step(i)[0]
            if (r === 0) break
            if (r < 250) n++
        }
        return n
    }
    const horizontal = feather(i => px(png, x1 + i, H >> 1))
    const vertical = feather(i => px(png, W >> 1, y1 + i))
    console.log(`    feather: ${horizontal} px horizontal, ${vertical} px vertical`)
    assert.ok(horizontal >= 2 && vertical >= 2, `smoothEdge 1 must feather outward on both axes (${horizontal}, ${vertical})`)
    assert.ok(Math.abs(horizontal - vertical) <= 1,
        `feather width must be isotropic in pixels: ${horizontal} px horizontal vs ${vertical} px vertical`)
}

async function orientation(render, W, H) {
    const png = await render(dsl({
        sources: [RED],
        zones: [{ tex: 'o1', shape: rect(0, 0, 0.5, 0.5) }],
        remap: { zoneCount: 1, smoothEdge: 0 },
    }))
    assert.deepEqual(px(png, W >> 2, H >> 2), [255, 0, 0, 255], 'top-left quadrant must be red')
    for (const [x, y] of [[3 * W >> 2, H >> 2], [W >> 2, 3 * H >> 2], [3 * W >> 2, 3 * H >> 2]]) {
        assert.deepEqual(px(png, x, y), [0, 0, 0, 255], `(${x},${y}) must be background`)
    }
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (px(png, x, y)[0] > 0) assert.ok(x < W / 2 && y < H / 2, `red outside the top-left quadrant at (${x},${y})`)
        }
    }
}

async function gating(render, W, H) {
    const bg = { bgColor: '#202020' }
    let png = await render(dsl({
        sources: [RED],
        zones: [{}, { tex: 'o1', shape: FULL }],
        remap: { zoneCount: 1, ...bg },
    }))
    assert.deepEqual(px(png, W >> 1, H >> 1), [32, 32, 32, 255], 'zone 1 must not render with zoneCount 1')

    png = await render(dsl({
        sources: [RED],
        zones: [{ shape: FULL }],
        remap: { zoneCount: 1, ...bg },
    }))
    assert.deepEqual(px(png, W >> 1, H >> 1), [32, 32, 32, 255], 'a zone with no wired source must not render')
}

async function outputAlpha(render, W, H) {
    const png = await render(dsl({ remap: { zoneCount: 0, bgColor: '#ff8040', bgAlpha: 0.25 } }))
    const p = px(png, W >> 1, H >> 1)
    assert.ok(Math.abs(p[3] - 64) <= 1, `background alpha 0.25 must present as 64, got ${p}`)
    // Straight-alpha readback of the premultiplied surface: the colour
    // returns intact and only the alpha channel carries the transparency.
    closeTo(p.slice(0, 3), [255, 128, 64], 2, 'background colour under alpha 0.25')
}

async function bounds(render, W, H) {
    // The polygon's exact bounding box must not change the image: the
    // shader dilates the box by the feather before rejecting.
    const shape = rect(0.25, 0.25, 0.75, 0.75)
    const remap = { zoneCount: 1, smoothEdge: 1 }
    const plain = await render(dsl({ sources: [RED], zones: [{ tex: 'o1', shape }], remap }))
    const bounded = await render(dsl({ sources: [RED], zones: [{ tex: 'o1', shape, bounds: [0.25, 0.25, 0.75, 0.75] }], remap }))
    assert.ok(px(plain, Math.floor(W * 0.75), H >> 1)[0] > 0, 'the feather must extend outside the rect')
    assert.deepEqual(bounded.data, plain.data, 'exact bounds must render byte-identically to no bounds')

    // A box tighter than the polygon skips the zone outside it: proof the
    // reject is live (hosts must therefore send the true bounding box).
    const clipped = await render(dsl({
        sources: [RED],
        zones: [{ tex: 'o1', shape: FULL, bounds: [0, 0, 0.5, 1] }],
        remap: { zoneCount: 1, smoothEdge: 0 },
    }))
    assert.deepEqual(px(clipped, W >> 2, H >> 1), [255, 0, 0, 255], 'inside the bounds the zone renders')
    assert.deepEqual(px(clipped, 3 * W >> 2, H >> 1), [0, 0, 0, 255], 'outside the bounds the zone is skipped')
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
const failures = []
const frames = { WebGL2: new Map(), WebGPU: new Map() }
try {
    for (const [preferWebGPU, backend] of [[false, 'WebGL2'], [true, 'WebGPU']]) {
        const pages = new Map()
        for (const c of CASES) {
            const key = `${c.width}x${c.height}`
            if (!pages.has(key)) pages.set(key, await install(preferWebGPU, c.width, c.height))
            const { page, errors } = pages.get(key)
            const captured = []
            const render = async source => {
                const result = await page.evaluate(d => window.renderDsl(d), source)
                assert.equal(result.backend, backend, 'Backend fallback must not masquerade as parity')
                const png = PNG.sync.read(Buffer.from(result.png.split(',')[1], 'base64'))
                captured.push(png.data)
                return png
            }
            try {
                await c.run(render, c.width, c.height)
                assert.deepEqual(errors, [], `${backend} browser errors`)
                console.log(`PASS ${backend.padEnd(7)} ${c.name}`)
            } catch (err) {
                failures.push(`${backend}/${c.name}`)
                console.log(`FAIL ${backend.padEnd(7)} ${c.name}: ${err.message}`)
            } finally {
                // Pages are reused across cases of the same size, so drain
                // unconditionally: a failed case must not leak its browser
                // errors into the next case's report.
                errors.splice(0)
            }
            frames[backend].set(c.name, captured)
        }
        for (const { page } of pages.values()) await page.close()
    }

    for (const c of CASES) {
        // A case that already failed is not parity evidence, even when both
        // backends failed it the same way: do not print a PASS line for it.
        if (failures.includes(`WebGL2/${c.name}`) || failures.includes(`WebGPU/${c.name}`)) {
            console.log(`SKIP parity  ${c.name}: the case failed on at least one backend`)
            continue
        }
        const a = frames.WebGL2.get(c.name), b = frames.WebGPU.get(c.name)
        if (!a || !b || a.length !== b.length || a.length === 0) continue
        let max = 0
        for (let i = 0; i < a.length; i++) {
            for (let j = 0; j < a[i].length; j++) max = Math.max(max, Math.abs(a[i][j] - b[i][j]))
        }
        console.log(`${max === 0 ? 'PASS' : 'FAIL'} parity  ${c.name}: GLSL/WGSL maxDiff=${max}`)
        if (max !== 0) failures.push(`parity/${c.name}`)
    }
} finally {
    await browser.close()
    await releaseServer()
}

if (failures.length) {
    console.error(`\n${failures.length} failure(s): ${failures.join(', ')}`)
    process.exit(1)
}
console.log(`\nsynth/remap: ${CASES.length} rendered cases on both backends; exact GLSL/WGSL parity`)

// The package viewer (demo/shaders/package.html) loads each revision of a
// package in a fresh realm and shows it only once it is accepted. These cases
// edit the starter effect through request interception, so the files on disk
// never change, and check what each revision leaves visible: a revision that
// a missing capability refuses, rapid edits, and a revision whose realm is
// still loading when a newer one arrives.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { fileFor, startPortableViewerServer, VIEWER_PATH } from '../../scripts/lib/portable-viewer-server.mjs'

const effectDir = fileFor('/effect/')
const DEFINITION = JSON.parse(readFileSync(join(effectDir, 'definition.json'), 'utf8'))
const SHADER = readFileSync(join(effectDir, 'glsl', 'gradientSweep.glsl'), 'utf8')
const GRADIENT = 'vec3 color = vec3(t, t * 0.6 + 0.2, 1.0 - t);'
assert.ok(SHADER.includes(GRADIENT), 'the starter shader has the line the edits replace')

// The starter's shader with a constant color in place of its gradient.
const solid = ([r, g, b]) => SHADER.replace(GRADIENT, `vec3 color = vec3(${r.toFixed(1)}, ${g.toFixed(1)}, ${b.toFixed(1)});`)

/**
 * A viewer page whose /effect/ definition and GLSL shader the test edits.
 * `edit({ definition, shader })` changes the files and their ETags, as an
 * author saving them would.
 */
async function openViewer(browser) {
    const page = await browser.newPage({ viewport: { width: 384, height: 384 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const state = { definition: DEFINITION, shader: SHADER, version: 1 }
    const serve = (route, body, type) => {
        const headers = { 'Content-Type': type, ETag: `"v${state.version}"` }
        route.fulfill({ status: 200, headers, body: route.request().method() === 'HEAD' ? '' : body })
    }
    await page.route('**/effect/definition.json', route => serve(route, JSON.stringify(state.definition), 'application/json'))
    await page.route('**/effect/glsl/gradientSweep.glsl', route => serve(route, state.shader, 'text/plain'))
    const edit = changes => {
        Object.assign(state, changes)
        state.version++
    }
    return { page, errors, edit }
}

async function waitForStatus(page, pattern, className) {
    await page.waitForFunction(([source, expected]) => {
        const el = document.getElementById('status')
        return el && el.className === expected && new RegExp(source).test(el.textContent)
    }, [pattern.source, className], { timeout: 30000 })
}

// The center pixel of the visible realm's output, rendered at time 0.
async function centerPixel(page) {
    return page.evaluate(async () => {
        const renderer = window.__portableCanvasRenderer
        renderer.stop()
        renderer.render(0)
        const pipeline = renderer.pipeline
        const frame = await pipeline.backend.readPixels(pipeline.surfaces.get('o0').read)
        const index = (Math.floor(frame.height / 2) * frame.width + Math.floor(frame.width / 2)) * 4
        return Array.from(frame.data.slice(index, index + 3))
    })
}

// Wait until the visible realm renders `rgb` at its center, the status says
// Loaded, and the page shows no other realm.
async function waitForPixel(page, rgb) {
    const deadline = Date.now() + 30000
    for (;;) {
        const ready = await page.evaluate(() => document.getElementById('status').className === 'success' &&
            Boolean(window.__portableCanvasRenderer?.pipeline))
        if (ready && JSON.stringify(await centerPixel(page)) === JSON.stringify(rgb)) return
        if (Date.now() > deadline) throw new Error(`the visible realm never rendered ${JSON.stringify(rgb)}`)
        await new Promise(resolve => setTimeout(resolve, 500))
    }
}

const realms = page => page.evaluate(() => document.querySelectorAll('iframe.portable-realm').length)
const generation = page => page.evaluate(() => window.__portablePipelineGeneration)

let browser
let server
let origin
test.before(async () => {
    ({ server, origin } = await startPortableViewerServer())
    browser = await chromium.launch({ headless: true })
})
test.after(async () => {
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
})

test('a revision refused for a missing capability leaves the last good realm in place', async () => {
    const { page, errors, edit } = await openViewer(browser)
    await page.goto(`${origin}${VIEWER_PATH}?package=/effect/`)
    await waitForStatus(page, /^Loaded: user\.gradientSweep/, 'success')
    const before = { generation: await generation(page), pixel: await centerPixel(page) }
    await page.evaluate(() => { document.querySelector('iframe.portable-realm.active').dataset.marked = 'before' })
    edit({
        definition: {
            format: 'noisemaker-portable-effect', version: 2,
            name: DEFINITION.name, func: DEFINITION.func, starter: true, globals: DEFINITION.globals,
            defaultProgram: DEFINITION.defaultProgram,
            passes: { main: { program: 'gradientSweep', inputs: {}, outputs: { color: 'outputTex' } } },
            capabilities: [{ id: 'example/absent', version: 1, bindings: {} }],
        },
    })
    await waitForStatus(page, /example\/absent/, 'error')
    assert.equal(await generation(page), before.generation, 'no other realm was accepted')
    assert.equal(await realms(page), 1, 'the refused realm is disposed')
    assert.equal(await page.evaluate(() => document.querySelector('iframe.portable-realm.active')?.dataset.marked), 'before',
        'the visible realm is the one shown before the refused revision')
    assert.deepEqual(await centerPixel(page), before.pixel, 'and it still renders the last good revision')
    assert.deepEqual(errors, [])
    await page.close()
})

test('rapid edits end with the last one shown, and leave no other realm', async () => {
    const { page, errors, edit } = await openViewer(browser)
    await page.goto(`${origin}${VIEWER_PATH}?package=/effect/`)
    await waitForStatus(page, /^Loaded: user\.gradientSweep/, 'success')
    for (const color of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
        edit({ shader: solid(color) })
        await new Promise(resolve => setTimeout(resolve, 400))
    }
    await waitForPixel(page, [0, 0, 255])
    // Let the poll run with no further edit: nothing else is loaded.
    const settled = await generation(page)
    await new Promise(resolve => setTimeout(resolve, 2500))
    assert.equal(await generation(page), settled, 'no revision loads after the last edit')
    assert.deepEqual(await centerPixel(page), [0, 0, 255], 'the last edit is the one shown')
    assert.equal(await realms(page), 1, 'only the visible realm is left')
    assert.deepEqual(errors, [])
    await page.close()
})

test('a revision still loading when a newer one arrives never replaces it', async () => {
    const { page, errors, edit } = await openViewer(browser)
    await page.goto(`${origin}${VIEWER_PATH}?package=/effect/`)
    await waitForStatus(page, /^Loaded: user\.gradientSweep/, 'success')
    const start = await generation(page)
    // Hold back the realm page of the next revision, so that revision is
    // still loading when the one after it arrives.
    let held = false
    let releaseHeld
    await page.route('**/demo/shaders/index.html?package=1*', async route => {
        if (!held) {
            held = true
            await new Promise(resolve => { releaseHeld = resolve })
        }
        await route.continue().catch(() => {})
    })
    edit({ shader: solid([1, 0, 0]) })
    await page.waitForFunction(() => document.querySelectorAll('iframe.portable-realm').length === 2, null, { timeout: 15000 })
    edit({ shader: solid([0, 1, 0]) })
    await waitForPixel(page, [0, 255, 0])
    assert.equal(await generation(page), start + 1, 'only the newer revision was accepted')
    // Let the held realm page through: the superseded revision must not show.
    releaseHeld?.()
    await new Promise(resolve => setTimeout(resolve, 3000))
    assert.equal(await generation(page), start + 1, 'the superseded revision is never accepted')
    assert.deepEqual(await centerPixel(page), [0, 255, 0], 'the newer revision stays visible')
    assert.equal(await realms(page), 1, 'the superseded realm is disposed')
    assert.deepEqual(errors, [])
    await page.close()
})

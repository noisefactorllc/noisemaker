// The package viewer (demo/shaders/package.html) loads each revision of a
// package in a fresh realm and shows it only once it is accepted. These cases
// edit the starter effect through request interception, so the files on disk
// never change, and check what each revision leaves visible: a revision that
// a missing capability refuses, rapid edits, a revision whose realm is still
// loading or compiling when a newer one arrives, a realm that does not start
// or never reports, and an edit made while a revision compiles.
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
    // A definition given as a string is served as it is, so it can be broken JSON.
    const state = { definition: DEFINITION, shader: SHADER, version: 1, definitionGets: 0, holdDefinitionGet: null }
    const serve = (route, body, type) => {
        const headers = { 'Content-Type': type, ETag: `"v${state.version}"` }
        route.fulfill({ status: 200, headers, body: route.request().method() === 'HEAD' ? '' : body })
    }
    await page.route('**/effect/definition.json', async route => {
        if (route.request().method() === 'GET') {
            state.definitionGets++
            if (state.holdDefinitionGet) await state.holdDefinitionGet
        }
        serve(route, typeof state.definition === 'string' ? state.definition : JSON.stringify(state.definition), 'application/json')
    })
    await page.route('**/effect/glsl/gradientSweep.glsl', route => serve(route, state.shader, 'text/plain'))
    const edit = changes => {
        Object.assign(state, changes)
        state.version++
    }
    return { page, errors, edit, state }
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

// A program that also runs a built-in effect, whose definition a test can hold
// back so that a realm is compiling when something else happens.
const WITH_ADJUST = { ...DEFINITION, defaultProgram: 'search user, filter\ngradientSweep(speed: 1.0).adjust()\n  .write(o0)\n\nrender(o0)' }

// Hold back the realms' next request for filter/adjust's definition.
async function holdAdjust(page) {
    let held = false
    let release
    const holding = new Promise(resolve => { release = resolve })
    let reached
    const reachedHold = new Promise(resolve => { reached = resolve })
    await page.route('**/shaders/effects/filter/adjust/definition.js', async route => {
        if (!held) {
            held = true
            reached()
            await holding
        }
        await route.continue().catch(() => {})
    })
    return { reachedHold, release: () => release() }
}

const realmOf = async page => (await page.$('iframe.portable-realm.active')).contentFrame()

test('a revision held while it compiles never replaces a newer one', async () => {
    const { page, errors, edit } = await openViewer(browser)
    await page.goto(`${origin}${VIEWER_PATH}?package=/effect/`)
    await waitForStatus(page, /^Loaded: user\.gradientSweep/, 'success')
    const start = await generation(page)
    const hold = await holdAdjust(page)
    // This revision's realm has received its files and is compiling when the
    // next revision arrives.
    edit({ definition: WITH_ADJUST, shader: solid([1, 0, 0]) })
    await hold.reachedHold
    edit({ definition: DEFINITION, shader: solid([0, 1, 0]) })
    await waitForPixel(page, [0, 255, 0])
    assert.equal(await generation(page), start + 1, 'only the newer revision was accepted')
    hold.release()
    await new Promise(resolve => setTimeout(resolve, 3000))
    assert.equal(await generation(page), start + 1, 'the held revision is never accepted')
    assert.deepEqual(await centerPixel(page), [0, 255, 0], 'the newer revision stays visible')
    assert.equal(await realms(page), 1, 'the held realm is disposed')
    assert.deepEqual(errors, [])
    await page.close()
})

test('an edit made while a revision compiles reaches the realm that replaces it', async () => {
    const { page, errors, edit } = await openViewer(browser)
    await page.goto(`${origin}${VIEWER_PATH}?package=/effect/`)
    await waitForStatus(page, /^Loaded: user\.gradientSweep/, 'success')
    const start = await generation(page)
    const hold = await holdAdjust(page)
    edit({ definition: WITH_ADJUST })
    await hold.reachedHold
    // Edit the parameter in the visible realm while the next one compiles.
    const visible = await realmOf(page)
    await visible.locator('.shader-effect[data-effect-name="gradientSweep"] .control-group[data-param-key="speed"] slider-value')
        .evaluate(slider => {
            slider.value = 3.3
            slider.dispatchEvent(new Event('input', { bubbles: true }))
        })
    hold.release()
    await page.waitForFunction(expected => window.__portablePipelineGeneration === expected, start + 1, { timeout: 30000 })
    const speed = await (await realmOf(page)).evaluate(() => {
        const state = window.__portableRealm.ui.programState
        const step = state.getStructure().find(entry => entry.effectKey === 'user.gradientSweep')
        return state.getValue(`step_${step.stepIndex}`, 'speed')
    })
    assert.equal(speed, 3.3, 'the new realm shows the edit made while it compiled')
    assert.deepEqual(errors, [])
    await page.close()
})

test('a realm whose demo does not start is refused at once, and the viewer stays usable', async () => {
    const { page, errors, edit } = await openViewer(browser)
    await page.goto(`${origin}${VIEWER_PATH}?package=/effect/`)
    await waitForStatus(page, /^Loaded: user\.gradientSweep/, 'success')
    const start = await generation(page)
    let failManifest = true
    await page.route('**/shaders/effects/manifest.json', route =>
        (failManifest ? route.fulfill({ status: 500, body: '' }) : route.continue()))
    edit({ shader: solid([1, 0, 0]) })
    await waitForStatus(page, /did not start/, 'error')
    assert.equal(await generation(page), start, 'the realm that did not start is not shown')
    assert.equal(await realms(page), 1, 'and it is disposed')
    failManifest = false
    const selected = await page.evaluate(() => window.__portableSelectEffect('effect', { url: '/effect/' }))
    assert.deepEqual(selected, { ok: true }, 'a later harness call loads the package')
    assert.deepEqual(await centerPixel(page), [255, 0, 0])
    assert.deepEqual(errors, [])
    await page.close()
})

test('a realm that never reports is refused after the viewer\'s timeout, and the viewer stays usable', { timeout: 120000 }, async () => {
    const { page, edit } = await openViewer(browser)
    await page.goto(`${origin}${VIEWER_PATH}?package=/effect/`)
    await waitForStatus(page, /^Loaded: user\.gradientSweep/, 'success')
    const start = await generation(page)
    // The realm's own module cannot load, so its start-up never runs.
    let block = true
    await page.route('**/demo/shaders/lib/portable-realm.js', route => (block ? route.abort() : route.continue()))
    await page.route('**/demo/shaders/index.html?package=1*', async route => {
        if (!block) return route.continue()
        const response = await route.fetch()
        const body = (await response.text()).replace('<script type="module">', '<script type="module">\nthrow new Error("held");\n')
        await route.fulfill({ response, body })
    })
    edit({ shader: solid([1, 0, 0]) })
    await page.waitForFunction(() => /did not start or report/.test(document.getElementById('status').textContent),
        null, { timeout: 90000 })
    assert.equal(await page.evaluate(() => document.getElementById('status').className), 'error')
    assert.equal(await generation(page), start, 'the realm that never reported is not shown')
    assert.equal(await realms(page), 1, 'and it is disposed')
    block = false
    const selected = await page.evaluate(() => window.__portableSelectEffect('effect', { url: '/effect/' }))
    assert.deepEqual(selected, { ok: true }, 'a later harness call loads the package')
    await page.close()
})

test('a revision that succeeds after a newer one has started is never shown', async () => {
    const { page, errors, edit, state } = await openViewer(browser)
    await page.goto(`${origin}${VIEWER_PATH}?package=/effect/`)
    await waitForStatus(page, /^Loaded: user\.gradientSweep/, 'success')
    const start = await generation(page)
    const hold = await holdAdjust(page)
    edit({ definition: WITH_ADJUST, shader: solid([1, 0, 0]) })
    await hold.reachedHold
    // Let the poll settle on this revision's files, then start a newer one
    // whose read is held, so the older one finishes while the newer one runs.
    await new Promise(resolve => setTimeout(resolve, 2500))
    let releaseRead
    state.holdDefinitionGet = new Promise(resolve => { releaseRead = resolve })
    const readsBefore = state.definitionGets
    edit({ definition: DEFINITION, shader: solid([0, 1, 0]) })
    for (let wait = 0; state.definitionGets === readsBefore && wait < 100; wait++) {
        await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(state.definitionGets > readsBefore, 'the newer revision has started reading')
    hold.release()
    await new Promise(resolve => setTimeout(resolve, 3000))
    assert.equal(await generation(page), start, 'the older revision finished but is not shown')
    assert.equal(await realms(page), 1, 'and its realm is disposed')
    state.holdDefinitionGet = null
    releaseRead()
    await waitForPixel(page, [0, 255, 0])
    assert.equal(await generation(page), start + 1, 'the newer revision is shown')
    assert.deepEqual(errors, [])
    await page.close()
})

test('a package that cannot be read is watched until it is fixed, without reloading while broken', async () => {
    // A package broken on the first load recovers once it is fixed.
    const first = await openViewer(browser)
    first.state.definition = '{'
    await first.page.goto(`${origin}${VIEWER_PATH}?package=/effect/`)
    await waitForStatus(first.page, /definition\.json is not JSON/, 'error')
    first.edit({ definition: DEFINITION })
    await waitForStatus(first.page, /^Loaded: user\.gradientSweep/, 'success')
    await first.page.close()

    // A package broken after a good load is read again only once it changes.
    const { page, edit, state } = await openViewer(browser)
    await page.goto(`${origin}${VIEWER_PATH}?package=/effect/`)
    await waitForStatus(page, /^Loaded: user\.gradientSweep/, 'success')
    edit({ definition: '{' })
    await waitForStatus(page, /definition\.json is not JSON/, 'error')
    await new Promise(resolve => setTimeout(resolve, 1500))
    const reads = state.definitionGets
    await new Promise(resolve => setTimeout(resolve, 4000))
    assert.equal(state.definitionGets, reads, 'no reload while the file stays broken')
    edit({ definition: DEFINITION, shader: solid([0, 0, 1]) })
    await waitForPixel(page, [0, 0, 255])
    await page.close()
})

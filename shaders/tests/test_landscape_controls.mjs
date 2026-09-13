import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'
import landscape from '../effects/render/renderLandscape3d/definition.js'
import heightmap from '../effects/synth3d/heightmap3d/definition.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const artifacts = process.env.LANDSCAPE_CONTROL_ARTIFACTS
if (artifacts) fs.mkdirSync(artifacts, { recursive: true })
const results = []
const failures = []
const perspectiveKeys = ['rotateX', 'rotateY', 'rotateZ', 'posX', 'posY', 'posZ', 'fieldOfView']
const sharedKeys = ['zoom', 'panX', 'panY', 'ambient', 'diffuseIntensity', 'specularIntensity', 'bgAlpha', 'bgColor', 'lightDirection']
assert.deepEqual(Object.keys(landscape.globals).filter(key => landscape.globals[key].ui?.control !== false).sort(),
    [...sharedKeys, ...perspectiveKeys, 'viewMode'].sort(), 'every renderer control must have an audit case')
assert.deepEqual(Object.keys(heightmap.globals).sort(), ['heightTex', 'tex', 'volumeSize', 'heightScale', 'baseHeight'].sort())

function program(mode, renderArgs = {}, heightArgs = {}, auxiliary = false) {
    const h = { heightTex: 'noise(scaleX: 90, scaleY: 90, colorMode: mono, speed: 0)',
        tex: 'gradient(type: fourCorners, color1: #006e94, color2: #24e4ff, color3: #bcff46, color4: #efffff)', ...heightArgs }
    const r = { panY: -0.18, viewMode: mode, ...renderArgs }
    const args = values => Object.entries(values).map(([key, value]) => `${key}: ${Array.isArray(value) ? `vec3(${value.join(', ')})` : value}`).join(', ')
    return `search synth, synth3d, render\n${auxiliary ? 'solid(color: #ffffff).write(o1)\nsolid(color: #ff00ff).write(o2)\n' : ''}heightmap3d(${args(h)}).renderLandscape3d(${args(r)}).write(o0)\nrender(o0)`
}

process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())
try {
    for (const backend of ['webgl2', 'webgpu']) {
        const editor = await browser.newPage({ viewport: { width: 1280, height: 900 } })
        editor.setDefaultTimeout(5000)
        // Select the audit resolution before initialization submits its first
        // frame. Resizing after compilation leaves display-sized GPU work queued.
        await editor.addInitScript(() => {
            Object.defineProperty(window, '__noisemakerCanvasRenderer', {
                configurable: true,
                set(renderer) {
                    renderer.resize(256, 256)
                    Object.defineProperty(window, '__noisemakerCanvasRenderer', {
                        configurable: true, writable: true, value: renderer
                    })
                }
            })
        })
        const reference = await browser.newPage()
        const errors = []
        for (const page of [editor, reference]) {
            page.on('pageerror', e => errors.push(e.message))
            page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
        }
        // Navigate directly to an empty same-origin fixture. Loading the home
        // page and then replacing its DOM leaves its asynchronous header renderer
        // alive, competing with this audit for the software GPU.
        const referenceUrl = `${baseUrl}/__landscape-audit-reference`
        await reference.route(referenceUrl, route => route.fulfill({
            contentType: 'text/html', body: '<canvas width="256" height="256"></canvas>'
        }))
        await reference.goto(referenceUrl)
        await reference.evaluate(async ({ baseUrl, backend }) => {
            const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/index.js`)
            window.auditRenderer = new CanvasRenderer({ canvas: document.querySelector('canvas'), width: 256, height: 256,
                basePath: `${baseUrl}/shaders`, preferWebGPU: backend === 'webgpu' })
            await auditRenderer.loadManifest()
            await auditRenderer.loadEffects(['synth/noise', 'synth/gradient', 'synth/solid', 'synth3d/heightmap3d', 'render/renderLandscape3d'])
        }, { baseUrl, backend })
        // Initialize with a simple program before loading the audited landscape.
        // Otherwise the demo compiles and renders it at its display resolution
        // before the test can select the 256x256 audit resolution.
        await editor.goto(`${baseUrl}/demo/shaders/?backend=${backend === 'webgl2' ? 'glsl' : 'wgsl'}&effect=filter.adjust`)
        await editor.waitForFunction(() => {
            const r = window.__noisemakerCanvasRenderer
            return r?.pipeline && !r._compileQueue && r._frameCount > 0
        }, null, { polling: 100, timeout: 60000 })
        await editor.evaluate(async () => {
            const r = window.__noisemakerCanvasRenderer
            await r._compileQueue
            r.stop(); r.resize(256, 256)
        })
        await editor.bringToFront()
        const rendererPanel = editor.locator('[data-effect-name="renderLandscape3d"]')
        const heightPanel = editor.locator('[data-effect-name="heightmap3d"]')
        const check = async (mode, key, action) => {
            try {
                await action()
                results.push({ backend, mode, key, status: 'pass' })
                console.log(`PASS ${backend} ${mode} ${key}`)
            } catch (error) {
                results.push({ backend, mode, key, status: 'fail', error: error.message })
                failures.push(`${backend} ${mode} ${key}: ${error.message}`)
                console.error(`FAIL ${backend} ${mode} ${key}: ${error.stack}`)
                const state = await editor.evaluate(() => {
                    const r = window.__noisemakerCanvasRenderer
                    return { currentDsl: r?.currentDsl, backend: r?.backend,
                        expectedDsl: window.auditExpectedDsl,
                        running: r?._isRunning, frameCount: r?._frameCount,
                        compiling: r?.pipeline?.isCompiling, queued: Boolean(r?._compileQueue),
                        sameGraph: r?.pipeline?.graph === window.auditPreviousGraph }
                }).catch(e => ({ unavailable: e.message }))
                console.error(JSON.stringify({ state, browserErrors: errors }))
                // A timed-out compile may still own the renderer. Do not queue
                // later cases behind it and turn one failure into a backlog.
                throw error
            }
        }
        const readFrame = async (page, name) => {
            const frame = await page.evaluate(async () => {
                const r = window.auditRenderer || window.__noisemakerCanvasRenderer
                await r._compileQueue
                r.stop(); r.resize(256, 256); r.render(0); r.render(0)
                const frame = await r.pipeline.backend.readPixels(r.pipeline.surfaces.get('o0').read)
                let bytes = ''
                for (let i = 0; i < frame.data.length; i += 16384) bytes += String.fromCharCode(...frame.data.subarray(i, i + 16384))
                return { data: btoa(bytes), width: frame.width, height: frame.height, backend: r.pipeline.backend.getName().toLowerCase(),
                    presentation: [...r.pipeline.sinkManager.stats.values()] }
            })
            assert.equal(frame.backend, backend)
            for (const sink of frame.presentation) assert.equal(sink.failed, 0, 'every frame must reach the displayed canvas')
            assert.deepEqual([frame.width, frame.height], [256, 256])
            const data = Buffer.from(frame.data, 'base64')
            if (artifacts && name) {
                const png = new PNG({ width: frame.width, height: frame.height }); png.data = data
                fs.writeFileSync(path.join(artifacts, `${backend}-${name}.png`), PNG.sync.write(png))
            }
            return data
        }
        const start = async dsl => {
            for (const dialog of await editor.locator('dialog[open]').all()) await dialog.getByRole('button', { name: 'close', exact: true }).click()
            if (!await editor.getByRole('textbox').count()) await editor.getByRole('button', { name: 'Edit DSL program', exact: true }).click()
            await editor.getByRole('textbox').fill(dsl)
            await editor.evaluate(dsl => {
                const r = window.__noisemakerCanvasRenderer
                r.stop()
                window.auditPreviousGraph = r.pipeline?.graph
                window.auditExpectedDsl = dsl
            }, dsl)
            await editor.getByRole('button', { name: 'run', exact: true }).click()
            await editor.waitForFunction(dsl => {
                const r = window.__noisemakerCanvasRenderer
                return r?.currentDsl === dsl && r.pipeline && !r.pipeline.isCompiling && r.pipeline.graph !== window.auditPreviousGraph
            }, dsl, { polling: 100, timeout: 60000 })
            await editor.getByRole('button', { name: 'Edit DSL program', exact: true }).click()
            if (await editor.getByText('view…', { exact: true }).isVisible()) await editor.getByText('view…', { exact: true }).click()
            return readFrame(editor)
        }
        const expected = async dsl => {
            await reference.evaluate(async dsl => { await auditRenderer.compile(dsl); auditRenderer.stop() }, dsl)
            return readFrame(reference)
        }
        const scalar = async (panel, key, value) => {
            const group = panel.locator(`[data-param-key="${key}"]`)
            assert.equal(await group.evaluate(el => el.classList.contains('disabled') || el.inert), false, 'control must be enabled')
            const display = group.locator('.value-display')
            await display.fill(String(value)); await display.press('Enter')
            return Number(await display.textContent())
        }
        const dropdown = async (panel, key, choice) => {
            await panel.locator(`[data-param-key="${key}"]`).getByRole('button').click()
            await editor.getByRole('option', { name: choice, exact: true }).click()
        }
        const compare = async (dsl, name) => {
            const live = await readFrame(editor, name)
            const compiled = await expected(dsl)
            if (!live.equals(compiled) && artifacts) {
                const details = await editor.evaluate(() => ({ dsl: window.__noisemakerCanvasRenderer.currentDsl,
                    values: window.__noisemakerProgramState.getAllStepValues() }))
                fs.writeFileSync(path.join(artifacts, `${backend}-${name}-failure.json`), JSON.stringify({ expectedDsl: dsl, ...details }, null, 2))
                const png = new PNG({ width: 256, height: 256 }); png.data = compiled
                fs.writeFileSync(path.join(artifacts, `${backend}-${name}-expected.png`), PNG.sync.write(png))
            }
            assert.ok(live.equals(compiled), 'live control output must exactly match its explicit DSL value')
            return live
        }
        for (const mode of ['ortho', 'perspective']) {
            await check(mode, 'hidden-controls', async () => {
                await start(program(mode))
                for (const key of ['threshold', 'densitySource', 'viewScale', 'volumeSize'])
                    assert.equal(await rendererPanel.locator(`[data-param-key="${key}"]`).count(), 0)
            })
            for (const key of [...sharedKeys.filter(k => !['bgColor', 'lightDirection'].includes(k)), ...perspectiveKeys]) {
                await check(mode, key, async () => {
                    const setup = key === 'specularIntensity' ? { ambient: 0, diffuseIntensity: 0,
                        lightDirection: mode === 'ortho' ? [-0.57735, 0.57735, -0.57735] : [0, 0, 1], rotateX: 0 } : {}
                    const before = await start(program(mode, setup))
                    const group = rendererPanel.locator(`[data-param-key="${key}"]`)
                    if (mode === 'ortho' && perspectiveKeys.includes(key)) {
                        assert.equal(await group.evaluate(el => el.classList.contains('disabled')), true)
                        for (const element of await group.locator('input, [contenteditable]').all()) {
                            await element.focus()
                            assert.equal(await element.evaluate(el => document.activeElement === el), false,
                                'non-applicable controls must not accept keyboard focus')
                        }
                        for (const value of [landscape.globals[key].min, landscape.globals[key].max])
                            assert.ok((await expected(program(mode, { [key]: value }))).equals(before), 'non-applicable parameter must not change the render')
                        return
                    }
                    const spec = landscape.globals[key]
                    for (const value of [spec.min, spec.max]) {
                        const actual = await scalar(rendererPanel, key, value)
                        assert.ok(actual >= spec.min && actual <= spec.max, 'the control must respect its declared range')
                        assert.ok(Math.abs(actual - value) <= (spec.step || 0.01), 'input rounding must be bounded by one slider step')
                        await compare(program(mode, { ...setup, [key]: actual }), `${mode}-${key}-${value}`)
                    }
                    const representative = { zoom: 1.2, panX: 0.1, panY: -0.05, ambient: 0.1, diffuseIntensity: 0.2,
                        specularIntensity: 1, bgAlpha: 0.4, rotateX: 0.7, rotateY: 0.5, rotateZ: 0.2,
                        posX: 10, posY: 10, posZ: -20, fieldOfView: 90 }[key]
                    await scalar(rendererPanel, key, representative)
                    const after = await compare(program(mode, { ...setup, [key]: representative }), `${mode}-${key}-representative`)
                    assert.equal(after.equals(before), false, 'an applicable control must affect the rendered result')
                    const slider = group.locator('input[type="range"]')
                    await slider.focus()
                    await slider.press(representative === spec.max ? 'ArrowLeft' : 'ArrowRight')
                    const stepped = Number(await group.locator('.value-display').textContent())
                    assert.notEqual(stepped, representative, 'the slider must respond to keyboard input')
                    await compare(program(mode, { ...setup, [key]: stepped }), `${mode}-${key}-keyboard`)
                    const box = await slider.boundingBox()
                    await slider.click({ position: { x: stepped < (spec.min + spec.max) / 2 ? box.width - 5 : 5, y: box.height / 2 } })
                    const clicked = Number(await group.locator('.value-display').textContent())
                    assert.notEqual(clicked, stepped, `the slider must respond to pointer input: stayed at ${stepped}, box ${JSON.stringify(box)}`)
                    await compare(program(mode, { ...setup, [key]: clicked }), `${mode}-${key}-pointer`)
                })
            }
            await check(mode, 'lightDirection', async () => {
                const before = await start(program(mode))
                await rendererPanel.locator('[data-param-key="lightDirection"]').getByRole('button').click()
                const dialog = editor.getByRole('dialog', { name: '3D Vector picker' })
                for (const value of [[0.6, 0.85, 0.6], [-0.4, 0.2, 0.6], [-0.4, 0.85, -0.6], [0, 0, 0]]) {
                    for (let i = 0; i < 3; i++) {
                        await dialog.getByRole('textbox').nth(i).fill(String(value[i]))
                        await dialog.getByRole('textbox').nth(i).press('Enter')
                    }
                    const after = await compare(program(mode, { lightDirection: value }), `${mode}-light-${value.join('-')}`)
                    assert.equal(after.equals(before), false)
                }
                await dialog.getByRole('button', { name: 'close', exact: true }).click()
            })
            await check(mode, 'bgColor', async () => {
                const before = await start(program(mode))
                await rendererPanel.locator('[data-param-key="bgColor"]').getByRole('button').click()
                const dialog = editor.getByRole('dialog', { name: 'Color picker' })
                assert.equal(await dialog.getByRole('slider', { name: 'Alpha', exact: true }).isVisible(), false,
                    'RGB colors must not expose an ignored alpha control')
                for (const color of ['#000000', '#ff0000', '#00ff00', '#0000ff', '#ffffff']) {
                    await dialog.getByRole('textbox', { name: 'Hex color value' }).fill(color)
                    await dialog.getByRole('textbox', { name: 'Hex color value' }).press('Enter')
                    const after = await compare(program(mode, { bgColor: color }), `${mode}-background-${color.slice(1)}`)
                    assert.equal(after.equals(before), false)
                }
                await dialog.getByRole('button', { name: 'close', exact: true }).click()
            })
            await check(mode, 'bgAlpha.presentation', async () => {
                await start(program(mode, { bgColor: '#ff0000' }, { heightTex: 'none' }))
                const canvas = editor.locator('#canvas')
                await canvas.evaluate(el => { el.style.background = '#00ff00' })
                for (const alpha of [0, 0.5, 1]) {
                    await scalar(rendererPanel, 'bgAlpha', alpha)
                    const raw = await compare(program(mode, { bgColor: '#ff0000', bgAlpha: alpha }, { heightTex: 'none' }), `${mode}-opacity-${alpha}`)
                    assert.deepEqual([...raw.subarray(0, 4)], [Math.round(alpha * 255), 0, 0, Math.round(alpha * 255)],
                        'background must follow the native premultiplied RGBA contract')
                    // WebGPU canvas textures expire after presentation. Capture the running
                    // demo, as displayed to a user, rather than an idle swap-chain texture.
                    const frameCount = await editor.evaluate(() => {
                        const r = window.__noisemakerCanvasRenderer
                        r.start()
                        return r._frameCount
                    })
                    await editor.waitForFunction(before => window.__noisemakerCanvasRenderer._frameCount >= before + 2, frameCount)
                    const screenshot = await canvas.screenshot()
                    await editor.evaluate(() => window.__noisemakerCanvasRenderer.stop())
                    if (artifacts) fs.writeFileSync(path.join(artifacts, `${backend}-${mode}-opacity-${alpha}-display.png`), screenshot)
                    const displayed = PNG.sync.read(screenshot)
                    const offset = (5 * displayed.width + 5) * 4
                    const expected = [Math.round(alpha * 255), Math.round((1 - alpha) * 255), 0, 255]
                    for (let channel = 0; channel < 4; channel++) assert.ok(Math.abs(displayed.data[offset + channel] - expected[channel]) <= 1,
                        `canvas opacity ${alpha} channel ${channel}: ${displayed.data[offset + channel]} must match ${expected[channel]}`)
                }
                await canvas.evaluate(el => { el.style.background = '' })
            })
            await check(mode, 'viewMode', async () => {
                const original = await start(program(mode))
                const other = mode === 'ortho' ? 'perspective' : 'ortho'
                await dropdown(rendererPanel, 'viewMode', other)
                await editor.waitForFunction(mode => !window.__noisemakerCanvasRenderer.pipeline.isCompiling && window.__noisemakerCanvasRenderer.pipeline.graph.passes.some(p =>
                    p.effectFunc === 'renderLandscape3d' && p.program.endsWith(`__VIEW_MODE_${mode}`)), other === 'ortho' ? 1 : 2)
                await compare(program(other), `${mode}-switched`)
                await dropdown(rendererPanel, 'viewMode', mode)
                await editor.waitForFunction(mode => !window.__noisemakerCanvasRenderer.pipeline.isCompiling && window.__noisemakerCanvasRenderer.pipeline.graph.passes.some(p =>
                    p.effectFunc === 'renderLandscape3d' && p.program.endsWith(`__VIEW_MODE_${mode}`)), mode === 'ortho' ? 1 : 2)
                assert.ok((await compare(program(mode), `${mode}-restored`)).equals(original))
            })
            await check(mode, 'viewMode.rapid-switching', async () => {
                const original = await start(program(mode))
                const other = mode === 'ortho' ? 'perspective' : 'ortho'
                for (const choice of [other, mode, other, mode]) await dropdown(rendererPanel, 'viewMode', choice)
                await editor.waitForFunction(mode => {
                    const r = window.__noisemakerCanvasRenderer
                    return !r._compileQueue && !r.pipeline.isCompiling && r.pipeline.graph.passes.some(p =>
                        p.effectFunc === 'renderLandscape3d' && p.program.endsWith(`__VIEW_MODE_${mode}`))
                }, mode === 'ortho' ? 1 : 2)
                assert.ok((await compare(program(mode), `${mode}-rapid-restored`)).equals(original))
            })
            for (const key of ['heightScale', 'baseHeight', 'volumeSize', 'heightTex', 'tex']) {
                await check(mode, `heightmap.${key}`, async () => {
                    const original = await start(program(mode, {}, {}, true))
                    if (key === 'heightTex' || key === 'tex') {
                        assert.match(await heightPanel.locator(`[data-param-key="${key}"]`).textContent(), /inline/,
                            'inline sources must not be mislabeled as none')
                        for (const choice of ['o1', 'o2', 'none']) {
                            await dropdown(heightPanel, key, choice)
                            await editor.waitForFunction(() => !window.__noisemakerCanvasRenderer.pipeline.isCompiling)
                            const value = choice === 'none' ? 'none' : `read(${choice})`
                            assert.equal((await compare(program(mode, {}, { [key]: value }, true), `${mode}-${key}-${choice}`)).equals(original), false)
                            // Producer removal must also rebind downstream uniform controls.
                            if (await editor.getByText('view…', { exact: true }).isVisible()) await editor.getByText('view…', { exact: true }).click()
                            await scalar(rendererPanel, 'zoom', 1.2)
                            await compare(program(mode, { zoom: 1.2 }, { [key]: value }, true), `${mode}-${key}-${choice}-zoom`)
                            await scalar(rendererPanel, 'zoom', 1)
                        }
                    } else {
                        for (const value of key === 'volumeSize' ? ['x16', 'x32', 'x64', 'x128'] : [0, 0.6, 1]) {
                            if (key === 'volumeSize') await dropdown(heightPanel, key, value)
                            else await scalar(heightPanel, key, value)
                            await compare(program(mode, {}, { [key]: value }, true), `${mode}-${key}-${value}`)
                        }
                        if (key !== 'volumeSize') {
                            const group = heightPanel.locator(`[data-param-key="${key}"]`)
                            const slider = group.locator('input[type="range"]')
                            await slider.focus(); await slider.press('ArrowLeft')
                            const stepped = Number(await group.locator('.value-display').textContent())
                            assert.ok(stepped < 1, 'heightmap slider must accept keyboard edits')
                            await compare(program(mode, {}, { [key]: stepped }, true), `${mode}-${key}-keyboard`)
                            const box = await slider.boundingBox()
                            await slider.click({ position: { x: 5, y: box.height / 2 } })
                            const clicked = Number(await group.locator('.value-display').textContent())
                            assert.notEqual(clicked, stepped, 'heightmap slider must accept pointer edits')
                            await compare(program(mode, {}, { [key]: clicked }, true), `${mode}-${key}-pointer`)
                        }
                    }
                })
            }
        }
        assert.deepEqual(errors, [], `${backend}: browser errors`)
        await editor.close(); await reference.close()
    }
} finally {
    if (artifacts) fs.writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify(results, null, 2))
    await browser.close(); await releaseServer()
}
assert.equal(failures.length, 0, failures.join('\n'))
console.log(`PASS ${results.length} parameter/mode/backend audit cases`)

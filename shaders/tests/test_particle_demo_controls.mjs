import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const artifacts = process.env.PARTICLE_ACCEPTANCE_ARTIFACTS
if (artifacts) fs.mkdirSync(artifacts, { recursive: true })
process.env.SHADE_PROJECT_ROOT = root; process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(0, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())
const results = []
try {
    for (const [backend, tab] of [['webgl2', 'glsl'], ['webgpu', 'wgsl']]) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
        page.setDefaultTimeout(15000)
        const errors = []
        page.on('pageerror', e => errors.push(e.message))
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
        await page.goto(`${baseUrl}/demo/shaders/?effect=points.heightGrid&backend=${tab}`)
        await page.waitForFunction(() => window.__noisemakerCanvasRenderer?.pipeline?.graph?.passes.some(p => p.effectFunc === 'heightGrid') &&
            document.querySelector('[data-param-key="viewMode"]'), null, { timeout: 60000 })
        await page.locator('#pause-play-btn').click()
        await page.evaluate(() => { __noisemakerSetPausedTime(0); __noisemakerCanvasRenderer.resize(256, 256); __noisemakerCanvasRenderer.render(0) })
        const actualBackend = await page.evaluate(() => __noisemakerCanvasRenderer.pipeline.backend.getName().toLowerCase())
        assert.equal(actualBackend, backend, 'the actual requested backend must be active')
        const picker = page.locator('#effect-select')
        assert.equal(await picker.locator('[data-value="points/heightGrid"]').count(), 1)
        assert.equal(await picker.locator('[data-value="points/heightmap"]').count(), 0)
        const group = key => page.locator(`[data-param-key="${key}"]`).last()
        async function reveal(key) {
            const meta = await group(key).evaluate(el => ({
                step: el.closest('.shader-effect').dataset.stepIndex,
                category: el.closest('.category-group').dataset.category,
                folded: el.closest('.shader-effect').classList.contains('collapsed'),
                categoryFolded: el.closest('.category-group').classList.contains('collapsed')
            }))
            const panel = page.locator(`.shader-effect[data-step-index="${meta.step}"]`)
            if (meta.folded) await panel.locator('.effect-title').click()
            if (meta.categoryFolded) await panel.locator(`.category-tag-bar .hf-tag[data-category="${meta.category}"]`).click()
        }
        async function choose(key, label, expected) {
            await reveal(key)
            const control = group(key)
            await control.locator('.select-trigger').click()
            await control.getByRole('option', { name: label, exact: true }).click()
            await page.waitForFunction(({ key, expected }) => {
                const r = __noisemakerCanvasRenderer
                return r.pipeline.graph.passes.filter(p => ['pointsRender', 'pointsBillboardRender', 'pointsEmit'].includes(p.effectFunc))
                    .some(p => p.uniforms?.[key] === expected)
            }, { key, expected })
        }
        async function slider(key, value) {
            await reveal(key)
            const display = group(key).locator('.value-display')
            await display.fill(String(value))
            await display.press('Enter')
            await page.waitForFunction(({ key, value }) => {
                const r = __noisemakerCanvasRenderer
                return r.pipeline.graph.passes.some(p => ['pointsRender', 'pointsBillboardRender'].includes(p.effectFunc) &&
                    Math.abs(p.uniforms?.[key] - value) < 0.0001)
            }, { key, value })
        }
        async function frame(name) {
            const raw = await page.evaluate(async () => {
                const r = __noisemakerCanvasRenderer
                r.render(0)
                await r.pipeline.backend.device?.queue.onSubmittedWorkDone()
                if (r.pipeline.backend.gl && (r.pipeline.backend.gl.isContextLost() || r.pipeline.backend.gl.getError() !== 0)) throw new Error('WebGL error')
                const output = await r.pipeline.backend.readPixels(r.pipeline.surfaces.get('o0').read)
                return { width: output.width, height: output.height, data: Array.from(output.data) }
            })
            const output = new PNG({ width: raw.width, height: raw.height })
            output.data = Buffer.from(raw.data)
            const png = PNG.sync.write(output)
            if (artifacts) fs.writeFileSync(path.join(artifacts, `${backend}-ui-${name}.png`), png)
            console.log(`${backend} UI frame ${name}`)
            return PNG.sync.read(png).data
        }
        for (const renderer of ['pointsBillboardRender', 'pointsRender']) {
            if (renderer === 'pointsRender') {
                await picker.locator('.es-trigger').click()
                await picker.locator('[data-value="render/pointsRender"]').click()
                await page.waitForFunction(() => __noisemakerCanvasRenderer?.pipeline?.graph?.passes.some(p => p.effectFunc === 'pointsRender') &&
                    !__noisemakerCanvasRenderer.pipeline.graph.passes.some(p => p.effectFunc === 'pointsBillboardRender'), null, { timeout: 60000 })
                // The default pointsRender demo includes stateful physical(), so
                // use the public DSL editor to create a deterministic camera fixture.
                await page.locator('#pipeline-code-btn').click()
                const editor = page.locator('#dsl-editor').locator('textarea, [contenteditable="true"]').first()
                await editor.fill(`search synth, points, render
perlin(seed: 17).write(o1)
solid(color: #ffffff).pointsEmit(stateSize: x64)
  .heightGrid(heightTex: read(o1), diffuseTex: read(o1), gridScale: 80, heightScale: 18)
  .pointsRender(viewMode: perspective, rotateX: 0.55, intensity: 0, inputIntensity: 0).write(o0)
render(o0)`)
                await page.locator('#dsl-run-btn').click()
                await page.waitForFunction(() => __noisemakerCanvasRenderer.pipeline.graph.passes.some(p => p.effectFunc === 'heightGrid') &&
                    !__noisemakerCanvasRenderer.pipeline.graph.passes.some(p => p.effectFunc === 'physical'))
                await page.evaluate(() => { __noisemakerSetPaused(true); __noisemakerSetPausedTime(0); __noisemakerCanvasRenderer.resize(256, 256) })
            }
            await choose('stateSize', 'x64', 64)
            await slider('intensity', 0); await slider('inputIntensity', 0)
            if (renderer === 'pointsBillboardRender') await slider('aperture', 0)
            await choose('viewMode', 'perspective', 2)
            const initial = await frame(`${renderer}-perspective`)
            if (artifacts) await page.screenshot({ path: path.join(artifacts, `${backend}-${renderer}-actual-demo.png`) })
            assert.ok(initial.some((v, i) => i % 4 < 3 && v > 0), 'demo fixture must be visible')
            for (const [key, value] of [['rotateX', 0.9], ['rotateY', 0.5], ['rotateZ', 0.4], ['posX', 8], ['posY', 4], ['posZ', -20], ['viewScale', 1.4], ['fieldOfView', 100]]) {
                const before = await frame(`${renderer}-${key}-before`)
                const old = await page.evaluate(key => __noisemakerCanvasRenderer.pipeline.graph.passes.find(p => ['pointsRender', 'pointsBillboardRender'].includes(p.effectFunc)).uniforms[key], key)
                await slider(key, value)
                const after = await frame(`${renderer}-${key}`)
                assert.ok(!after.equals(before), `${backend} ${renderer}: actual ${key} control must change pixels`)
                await slider(key, old)
                assert.ok((await frame(`${renderer}-${key}-restored`)).equals(before), `${key}: restored control must restore pixels`)
            }
            for (let cycle = 0; cycle < 2; cycle++) {
                await choose('viewMode', 'flat', 0); await frame(`${renderer}-flat-${cycle}`)
                await choose('viewMode', 'ortho', 1); await frame(`${renderer}-ortho-${cycle}`)
                await choose('viewMode', 'perspective', 2)
                assert.ok((await frame(`${renderer}-perspective-${cycle}`)).equals(initial), 'returning to perspective must restore demo pixels')
            }
            if (renderer === 'pointsBillboardRender') {
                await choose('blendMode', 'alpha', 1); await frame('billboard-alpha')
                await choose('blendMode', 'additive', 0)
                assert.ok((await frame('billboard-additive-restored')).equals(initial), 'additive return pixels')
                await slider('aperture', 12); await slider('focalDistance', 200)
                assert.ok(!(await frame('billboard-focus')).equals(initial), 'focus changes pixels')
                await slider('aperture', 0)
                assert.ok((await frame('billboard-focus-off')).equals(initial), 'focus off restores pixels')
            }
        }
        assert.deepEqual(errors, [], `${backend}: actual demo controls must produce no console/page errors`)
        results.push({ backend, status: 'pass', interface: 'actual dropdown clicks and editable slider inputs' })
        console.log(`PASS ${backend}: actual demo camera/view/blend/focus controls and heightGrid picker name`)
        await page.close()
    }
} finally {
    if (artifacts) fs.writeFileSync(path.join(artifacts, 'ui-results.json'), JSON.stringify(results, null, 2))
    await browser.close(); await releaseServer()
}

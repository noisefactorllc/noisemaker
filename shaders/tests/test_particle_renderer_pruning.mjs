import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

// Missing mode conditions must show up as real GPU work. A runtime camera
// uniform must not survive in the specialized deposit programs. Mode changes
// must select an already compiled variant, including animated choices.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(0, root, process.env.SHADE_EFFECTS_DIR)
const failures = [], captures = new Map()
let browser
try {
    for (const backend of ['webgl2', 'webgpu']) {
        // Give each backend its own browser. On the software Vulkan driver a
        // WebGPU device slows by orders of magnitude after WebGL2 has run in
        // the same GPU process.
        browser = await chromium.launch(shaderTestBrowserOptions())
        const page = await browser.newPage()
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
        await page.goto(baseUrl)
        await page.setContent('<canvas width="64" height="64"></canvas>')
        await page.evaluate(async ({ baseUrl, backend }) => {
            const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/renderer/canvas.js`)
            window.r = new CanvasRenderer({ canvas: document.querySelector('canvas'), width: 64, height: 64,
                basePath: `${baseUrl}/shaders`, preferWebGPU: backend === 'webgpu' })
            await r.loadManifest()
            await r.loadEffects(['synth/solid', 'render/pointsEmit', 'render/pointsRender', 'render/pointsBillboardRender'])
        }, { baseUrl, backend })
        const dsl = (renderer, view = 'flat') => `search synth, render
solid(color: #804020).pointsEmit(stateSize: x64, layout: center, resetState: true)
  .${renderer}(viewMode: ${view}, density: 1, intensity: 0, inputIntensity: 0${renderer === 'pointsBillboardRender'
    ? ', tex: solid(color: #ffffff), shapeMode: square, pointSize: 8, depositOpacity: 20, focalDistance: 1' : ', matteOpacity: 0'}).write(o0)
render(o0)`
        async function check(name, renderer, source, values, view, count, time = 0, blend = 0) {
            // Report each case's duration: software GPU cost varies by case.
            const started = Date.now(), phases = {}
            try { await audit(name, renderer, source, values, view, count, time, blend, phases) } finally {
                console.log(`${backend} ${name}: ${Date.now() - started}ms ${JSON.stringify(phases)}`)
            }
        }
        async function audit(name, renderer, source, values, view, count, time, blend, phases) {
            const result = await page.evaluate(async ({ renderer, source, values, time }) => {
                // Keep the canvas out of compositing while GPU work is in flight. On
                // the software Vulkan driver, compositing a WebGPU canvas during a
                // recompile stalls WebGPU callbacks until a 30 second timeout.
                document.querySelector('canvas').style.visibility = 'hidden'
                const phases = {}, mark = (phase, since) => { phases[phase] = Math.round(performance.now() - since); return performance.now() }
                let since = performance.now()
                if (source) {
                    // Compile each program on a fresh canvas and renderer. On the CI
                    // software Vulkan driver an in-place WebGPU recompile stalls every
                    // later GPU callback for tens of seconds. Parameter changes below
                    // still exercise live variant selection on one pipeline.
                    const canvas = document.createElement('canvas')
                    canvas.width = 64; canvas.height = 64
                    document.querySelector('canvas').replaceWith(canvas)
                    window.r = new r.constructor({ canvas, width: 64, height: 64, basePath: r._basePath ?? r.basePath, preferWebGPU: r._preferWebGPU })
                    await r.loadManifest()
                    await r.loadEffects(['synth/solid', 'render/pointsEmit', 'render/pointsRender', 'render/pointsBillboardRender'])
                    await r.compile(source); r.stop(); since = mark('compile', since)
                }
                const p = r.pipeline, b = p.backend
                const step = p.graph.passes.find(pass => pass.effectFunc === renderer).stepIndex
                if (values) r.applyStepParameterValues({ [`step_${step}`]: values })
                const executed = [], execute = b.executePass
                const programsBefore = [...b.programs.values()]
                b.executePass = function(pass, state) {
                    if (p.graph.passes.find(original => original.id === pass.id)?.effectFunc === renderer) {
                        const program = this.programs.get(pass.program)
                        executed.push({ draw: pass.drawMode, defines: p.graph.programs[pass.program].defines,
                            uniforms: program.uniforms ? Object.keys(program.uniforms) : program.packedUniformLayout?.layout.map(f => f.name) || [] })
                    }
                    return execute.call(this, pass, state)
                }
                try { r.render(time) } finally { b.executePass = execute }
                since = mark('render', since)
                await b.device?.queue.onSubmittedWorkDone()
                since = mark('gpu', since)
                const pixels = await b.readPixels(p.surfaces.get('o0').read)
                mark('readback', since)
                return { phases, backend: b.getName().toLowerCase(), executed, pixels: Array.from(pixels.data),
                    cached: programsBefore.length === b.programs.size && programsBefore.every(program => [...b.programs.values()].includes(program)) }
            }, { renderer, source, values, time })
            Object.assign(phases, result.phases)
            assert.equal(result.backend, backend)
            assert.ok(result.cached, 'live mode changes must reuse compiled programs')
            if (result.executed.length !== count) failures.push(`${backend} ${name}: expected ${count} passes, got ${result.executed.length}`)
            const draws = result.executed.filter(pass => pass.draw)
            const defocused = renderer === 'pointsBillboardRender' && blend === 0 && count > 4
            if (draws.length !== (defocused ? 2 : 1)) failures.push(`${backend} ${name}: wrong draw count ${draws.length}`)
            if (renderer === 'pointsBillboardRender' && JSON.stringify(draws.map(draw => draw.defines?.BLUR_LAYER)) !== JSON.stringify(defocused ? [1, 0] : [0])) {
                failures.push(`${backend} ${name}: wrong defocus layer selection`)
            }
            for (const draw of draws) {
                if (draw.defines?.VIEW_MODE !== view || draw.uniforms.includes('viewMode')) failures.push(`${backend} ${name}: projection is not specialized (${JSON.stringify(draw.defines)})`)
                if (renderer === 'pointsBillboardRender' && (draw.defines?.BLEND_MODE !== blend || draw.uniforms.includes('blendMode') || draw.uniforms.includes('blurLayer'))) {
                    failures.push(`${backend} ${name}: blend/layer is not specialized`)
                }
                if (backend === 'webgl2') {
                    const inactive = view === 0 ? ['rotateX', 'rotateY', 'rotateZ', 'viewScale', 'posX', 'posY', 'posZ', 'fieldOfView', 'aperture', 'focalDistance', 'spriteMeanTex']
                        : view === 1 ? ['fieldOfView', ...(renderer === 'pointsRender' ? ['posZ'] : [])] : []
                    if (view === 0 || blend === 0) inactive.push('orderTex')
                    for (const uniform of inactive) if (draw.uniforms.includes(uniform)) failures.push(`${backend} ${name}: inactive ${uniform} survives`)
                }
            }
            assert.ok(result.pixels.some(value => value > 0), `${name}: fixture must render`)
            await page.evaluate(() => { document.querySelector('canvas').style.visibility = 'visible' })
            const captureStarted = Date.now()
            const displayed = PNG.sync.read(await page.locator('canvas').screenshot({ omitBackground: true })).data
            phases.capture = Date.now() - captureStarted
            // Compare each channel's visible premultiplied contribution. Capture
            // unpremultiplies translucent defocus fringes, which magnifies
            // sub-LSB float16 blending differences between GPU drivers.
            const pixels = Buffer.from(displayed.map((value, i) => i % 4 === 3 ? value : Math.round(value * displayed[i - i % 4 + 3] / 255)))
            if (backend === 'webgl2') captures.set(name, pixels)
            else if (renderer === 'pointsBillboardRender' && count > 4) {
                // Defocus accumulates many float16 blends. As in the heightmap
                // defocus fixtures, allow only isolated one-LSB rounding.
                const other = captures.get(name)
                let changed = 0, maximum = 0
                for (let i = 0; i < pixels.length; i++) {
                    const d = Math.abs(pixels[i] - other[i])
                    if (d) { changed++; maximum = Math.max(maximum, d) }
                }
                assert.ok(changed <= 4 && maximum <= 1, `${name}: backend pixels differ in ${changed} channels by up to ${maximum}`)
            } else assert.deepEqual(pixels, captures.get(name), `${name}: exact backend pixels`)
        }
        for (const renderer of ['pointsRender', 'pointsBillboardRender']) {
            await check(`${renderer}-flat`, renderer, dsl(renderer), null, 0, 4)
            await check(`${renderer}-ortho`, renderer, null, { viewMode: 1 }, 1, 4)
            await check(`${renderer}-perspective`, renderer, null, { viewMode: 2 }, 2, 4)
            await check(`${renderer}-flat-again`, renderer, null, { viewMode: 0 }, 0, 4)
            await check(`${renderer}-animated-flat`, renderer, dsl(renderer, 'osc(type: oscKind.square)'), null, 0, 4, 0.25)
            await check(`${renderer}-animated-perspective`, renderer, null, null, 2, 4, 0.75)
            for (const [fraction, selected] of [[0.1, 0], [0.4, 1], [0.6, 1], [0.9, 2]]) {
                await check(`${renderer}-fraction-${fraction}`, renderer, dsl(renderer, `osc(min: ${fraction}, max: ${fraction})`), null, selected, 4)
            }
        }
        const bb = 'pointsBillboardRender'
        await check('bb-alpha-flat', bb, dsl(bb), { blendMode: 1 }, 0, 4, 0, 1)
        await check('bb-alpha-ortho', bb, null, { viewMode: 1 }, 1, 27, 0, 1)
        await check('bb-alpha-perspective', bb, null, { viewMode: 2 }, 2, 27, 0, 1)
        await check('bb-alpha-focus', bb, null, { aperture: 20 }, 2, 28, 0, 1)
        await check('bb-alpha-texture-focus', bb, null, { shapeMode: 0 }, 2, 29, 0, 1)
        await check('bb-additive-texture-focus', bb, null, { blendMode: 0 }, 2, 8)
        await check('bb-additive-focus', bb, null, { shapeMode: 3 }, 2, 7)
        await check('bb-aperture-off', bb, null, { aperture: 0 }, 2, 4)
        await check('bb-flat-focus-off', bb, null, { aperture: 20, viewMode: 0 }, 0, 4)
        await check('bb-focus-on-again', bb, null, { viewMode: 1 }, 1, 7)
        const animatedFocus = dsl(bb, 'perspective').replace('focalDistance: 1', 'focalDistance: 1, aperture: osc(type: oscKind.square)')
        await check('bb-animated-focus-off', bb, animatedFocus, null, 2, 4, 0.25)
        await check('bb-animated-focus-on', bb, null, null, 2, 7, 0.75)
        const animatedShape = dsl(bb, 'perspective').replace('shapeMode: square', 'shapeMode: osc(type: oscKind.square), aperture: 20')
        await check('bb-animated-texture', bb, animatedShape, null, 2, 8, 0.25)
        await check('bb-animated-procedural', bb, null, null, 2, 7, 0.75)
        for (const [fraction, count] of [[0.04, 8], [0.1, 7], [0.9, 7]]) {
            const fractionalShape = dsl(bb, 'perspective').replace('shapeMode: square', `shapeMode: osc(min: ${fraction}, max: ${fraction}), aperture: 20`)
            await check(`bb-fractional-shape-${fraction}`, bb, fractionalShape, null, 2, count)
        }
        assert.deepEqual(errors, [], `${backend}: no browser or GPU errors`)
        await browser.close(); browser = null
        console.log(`Checked ${backend}: mode specialization, pass pruning, live switching, and automation`)
    }
    assert.deepEqual(failures, [])
    console.log('PASS: particle renderer inactive branches and exact backend pixels')
} finally {
    await browser?.close()
    await releaseServer()
}

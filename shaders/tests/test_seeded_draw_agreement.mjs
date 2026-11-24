// One program and seed give the same draws on WebGL2, WebGPU and the
// software-rendering mode. Draws resolve when the program compiles, so each
// backend is read from the uniforms of its compiled pipeline, and all three
// must equal the draws a compile outside the browser gives.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'
import { CanvasRenderer, compile, registerStarterOps } from '../src/index.js'
import { mergeIntoEnums } from '../src/lang/enums.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const effects = path.join(root, 'shaders', 'effects')
process.env.SHADE_EFFECTS_DIR = effects
process.env.SHADE_PROJECT_ROOT = root
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')

const DSL = `search synth, filter
seed 3150442103

let size = randInt(2, 6) * 10

part edgePass {
    .edge(amount: rand(1, 3))
}

noise(scaleX: size, scaleY: rand(1, 10), octaves: pick(1, 2, 3), ridges: chance(0.5))
  .use(edgePass)
  .write(o0)

render(o0)`

const PARAMS = { 'synth.noise': ['scaleX', 'scaleY', 'octaves', 'ridges', 'seed'], 'filter.edge': ['amount'] }

// The draws outside the browser.
const local = new CanvasRenderer()
for (const [namespace, name, file] of [['synth', 'Noise', 'synth/noise'], ['filter', 'Edge', 'filter/edge']]) {
    const instance = (await import(`../effects/${file}/definition.js`)).default
    const choices = local.registerEffectWithRuntime({ namespace, name, instance })
    if (choices && Object.keys(choices).length > 0) await mergeIntoEnums(choices)
}
registerStarterOps(['synth.noise'])
const expected = {}
for (const step of compile(DSL).plans[0].chain) {
    for (const param of PARAMS[step.op] || []) {
        const v = step.args[param]
        expected[`${step.op}.${param}`] = typeof v === 'boolean' ? Number(v) : (v?.value ?? v)
    }
}

const base = await acquireServer(undefined, root, effects)
const browser = await chromium.launch(shaderTestBrowserOptions())

async function drawsOn(mode, preferWebGPU) {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`${base}/shaders/effects/manifest.json`)
    await page.setContent(String.raw`<canvas id="canvas" width="32" height="32"></canvas>
<script type="module">
import { CanvasRenderer } from '${base}/shaders/src/index.js';
const renderer = new CanvasRenderer({canvas:document.getElementById('canvas'),width:32,height:32,
  basePath:'${base}/shaders',preferWebGPU:${preferWebGPU},softwareRendering:${JSON.stringify(mode)}});
await renderer.loadManifest();
await renderer.loadEffects(['synth/noise', 'filter/edge']);
await renderer.compile(${JSON.stringify(DSL)});
renderer.stop();
const params = ${JSON.stringify(PARAMS)};
const draws = {};
for (const pass of renderer.pipeline.graph.passes) {
  for (const param of params[pass.effectKey] || []) {
    const u = pass.uniforms?.[param];
    if (u !== undefined && draws[pass.effectKey + '.' + param] === undefined) draws[pass.effectKey + '.' + param] = typeof u === 'boolean' ? Number(u) : u;
  }
}
window.result = { backend: renderer.pipeline.backend.getName(), software: renderer.softwareRendering.active, draws };
</script>`)
    await page.waitForFunction(() => window.result !== undefined, null, { timeout: 60000 })
    const result = await page.evaluate(() => window.result)
    await page.close()
    assert.deepEqual(errors, [], `${mode} ${preferWebGPU}: ${errors.join('\n')}`)
    return result
}

try {
    const runs = {
        webgl2: await drawsOn('off', false),
        webgpu: await drawsOn('off', true),
        software: await drawsOn('on', false)
    }
    assert.match(runs.webgl2.backend, /webgl2/i)
    assert.match(runs.webgpu.backend, /webgpu/i)
    assert.equal(runs.software.software, true)
    for (const [name, run] of Object.entries(runs)) {
        for (const [key, value] of Object.entries(expected)) {
            assert.equal(run.draws[key], value, `${name} ${key}`)
        }
    }
    console.log(JSON.stringify({ expected, backends: Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, v.backend])) }))
    console.log('PASS one program and seed give the same draws on WebGL2, WebGPU and software rendering')
} finally {
    await browser.close()
    await releaseServer()
}

#!/usr/bin/env node
/**
 * A declared sampler with no pass input reads transparent black on both backends.
 *
 * Both backends state the rule for a texture they cannot find: bind a
 * transparent black texture. WebGPU applied it to every texture binding of the
 * shader. WebGL2 bound only the samplers listed in pass.inputs, so a declared
 * sampler outside that list kept unit 0 and sampled the first input instead.
 * cellularAutomata3d and reactionDiffusion3d reach that state when `source` is
 * written read3d(vol0, geo0): seedTex is left out of pass.inputs, and at
 * weight 100 WebGL2 blended the state with itself while WebGPU blended it with
 * black.
 *
 * The fixture filter declares extraTex and lists no input for it. Its output
 * is input * 0.5 + extraTex(0, 0) + 0.25, so a frame that equals
 * input * 0.5 + 0.25 shows that extraTex read transparent black. The two
 * synth3d effects then run with an unbound and a bound seedTex.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const effects = path.join(root, 'shaders/effects')
process.env.SHADE_EFFECTS_DIR = effects
process.env.SHADE_PROJECT_ROOT = root
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')

const SIZE = 128
const fixtureGlsl = `
#ifdef GL_ES
precision highp float;
#endif
uniform sampler2D inputTex;
uniform sampler2D extraTex;
out vec4 fragColor;
void main() {
    vec4 a = texelFetch(inputTex, ivec2(gl_FragCoord.xy), 0);
    vec4 b = texelFetch(extraTex, ivec2(0), 0);
    fragColor = vec4(a.rgb * 0.5 + b.rgb + vec3(0.25), 1.0);
}`
const fixtureWgsl = `
@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var extraTex: texture_2d<f32>;
@fragment fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let a = textureLoad(inputTex, vec2<i32>(pos.xy), 0);
    let b = textureLoad(extraTex, vec2<i32>(0, 0), 0);
    return vec4<f32>(a.rgb * 0.5 + b.rgb + vec3<f32>(0.25), 1.0);
}`

const SOLID = [0x80, 0x40, 0x20]
const fixtureDsl = `search synth, filter
solid(color: #804020).unboundSamplerFixture().write(o0)
render(o0)`
const volumeDsl = (effect, source) => `search synth3d, render
noise3d(volumeSize: x32).write3d(vol0, geo0)
${effect}(volumeSize: x32, source: ${source}, weight: 100).render3d().write(o0)
render(o0)`
const CASES = [
    ['fixture', fixtureDsl, 2],
    ['cellularAutomata3d unbound seedTex', volumeDsl('cellularAutomata3d', 'read3d(vol0, geo0)'), 3],
    ['cellularAutomata3d bound seedTex', volumeDsl('cellularAutomata3d', 'vol0'), 3],
    ['reactionDiffusion3d unbound seedTex', volumeDsl('reactionDiffusion3d', 'read3d(vol0, geo0)'), 3],
    ['reactionDiffusion3d bound seedTex', volumeDsl('reactionDiffusion3d', 'vol0'), 3],
]

const base = await acquireServer(undefined, root, effects)
const browser = await chromium.launch(shaderTestBrowserOptions())
const frames = {}
try {
    for (const gpu of [false, true]) {
        const backend = gpu ? 'WebGPU' : 'WebGL2'
        const page = await browser.newPage()
        const messages = []
        page.on('console', (m) => { if (['warning', 'error'].includes(m.type())) messages.push(m.text()) })
        page.on('pageerror', (e) => messages.push(e.message))
        await page.goto(`${base}/shaders/effects/manifest.json`)
        await page.setContent(String.raw`<canvas id="canvas" width="${SIZE}" height="${SIZE}"></canvas>
<script type="module">
import { CanvasRenderer } from '${base}/shaders/src/index.js';
import { Effect } from '${base}/shaders/src/runtime/effect.js';
const fixture = new Effect({ name:'Unbound Sampler Fixture', namespace:'filter', func:'unboundSamplerFixture', tags:['util'], globals:{},
  passes:[{name:'render',program:'fixture',inputs:{inputTex:'inputTex'},outputs:{fragColor:'outputTex'}}] });
fixture.shaders = { fixture: { glsl:${JSON.stringify(fixtureGlsl)}, wgsl:${JSON.stringify(fixtureWgsl)} } };
const renderer = new CanvasRenderer({canvas:document.getElementById('canvas'),width:${SIZE},height:${SIZE},basePath:'${base}/shaders',preferWebGPU:${gpu}});
await renderer.loadManifest();
renderer.registerEffectsFromBundle({namespace:'filter',effects:{unboundSamplerFixture:fixture}});
await renderer.loadEffects(['synth/solid','synth3d/noise3d','synth3d/cellularAutomata3d','synth3d/reactionDiffusion3d','render/render3d']);
window.capture = async (dsl, frames) => {
    await renderer.compile(dsl);
    renderer.stop();
    for (let i = 0; i < frames; i++) renderer.render(0);
    await renderer.pipeline.backend.device?.queue?.onSubmittedWorkDone();
    return {backend:renderer.pipeline.backend.getName(), png:renderer.canvas.toDataURL()};
};
</script>`)
        await page.waitForFunction(() => typeof window.capture === 'function')
        messages.length = 0
        frames[backend] = []
        for (const [name, dsl, count] of CASES) {
            const result = await page.evaluate(([d, n]) => window.capture(d, n), [dsl, count])
            assert.equal(result.backend, backend, `${name}: backend`)
            frames[backend].push(PNG.sync.read(Buffer.from(result.png.split(',')[1], 'base64')))
        }
        assert.deepEqual(messages, [], `${backend} console output:\n${messages.join('\n')}`)

        const fixture = frames[backend][0]
        const expected = SOLID.map((v) => Math.round((v / 255 * 0.5 + 0.25) * 255))
        let off = 0
        for (let i = 0; i < fixture.data.length; i += 4) {
            if (expected.some((v, k) => Math.abs(fixture.data[i + k] - v) > 1)) off++
        }
        assert.equal(off, 0, `${backend}: the unbound extraTex did not read transparent black on ${off} of ${SIZE * SIZE} pixels (expected rgb ${expected}, first pixel ${[...fixture.data.subarray(0, 3)]})`)
        console.log(`${backend}: unbound extraTex read transparent black on all ${SIZE * SIZE} pixels (rgb ${[...fixture.data.subarray(0, 3)]})`)
        await page.close()
    }
    CASES.forEach(([name], i) => {
        const a = frames.WebGL2[i].data, b = frames.WebGPU[i].data
        let n = 0, max = 0
        for (let p = 0; p < a.length; p += 4) {
            let d = 0
            for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(a[p + k] - b[p + k]))
            if (d) n++
            max = Math.max(max, d)
        }
        assert.equal(n, 0, `WebGL2 and WebGPU differ for ${name}: ${n} of ${SIZE * SIZE} pixels, max ${max}`)
        console.log(`${name}: WebGL2 and WebGPU frames identical`)
    })
    console.log('Unbound sampler parity: a declared sampler with no input reads transparent black on both backends')
} finally {
    await browser.close()
    await releaseServer()
}

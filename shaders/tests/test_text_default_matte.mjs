#!/usr/bin/env node
/**
 * filter/text at its default parameters on both backends.
 *
 * The shader states its contract: "Input passes through where no text AND no
 * matte". At the defaults matteOpacity is 0, so no matte covers the input. The
 * definition once gave matteColor the hex string "#000000" while every other
 * color default is an array. compile() kept the string in pass.uniforms, the
 * WebGL2 vec3 setter turned it into NaN, and NaN * 0 is NaN, so WebGL2 drew
 * the whole frame black, text included, while WebGPU showed the input.
 *
 * Two cases run on each backend, with the backend asserted:
 * 1. media().text() with no text canvas equals media() alone.
 * 2. With a host text canvas uploaded, the input shows wherever that canvas is
 *    transparent and the text shows where it is opaque.
 * The two backends must then give the same frames.
 */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
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
// Opaque white bars on a transparent canvas stand in for rendered text, so
// the expected text pixels do not depend on the host's fonts.
const TEXT_BARS = [[16, 20, 40, 12], [72, 90, 36, 20]]
const inBar = (x, y) => TEXT_BARS.some(([bx, by, bw, bh]) => x >= bx && x < bx + bw && y >= by && y < by + bh)
const sha = (png) => crypto.createHash('sha256').update(png.data).digest('hex')

const base = await acquireServer(undefined, root, effects)
const browser = await chromium.launch(shaderTestBrowserOptions())
const frames = {}
try {
    for (const gpu of [false, true]) {
        const page = await browser.newPage()
        await page.goto(`${base}/shaders/effects/manifest.json`)
        await page.setContent(String.raw`<canvas id="canvas" width="${SIZE}" height="${SIZE}"></canvas>
<script type="module">
import { CanvasRenderer } from '${base}/shaders/src/index.js';
const S = ${SIZE};
const renderer = new CanvasRenderer({canvas:document.getElementById('canvas'),width:S,height:S,basePath:'${base}/shaders',preferWebGPU:${gpu}});
await renderer.loadManifest(); await renderer.loadEffects(['synth/media','filter/text']);
// An opaque image that differs left to right and top to bottom.
const image = document.createElement('canvas'); image.width = S; image.height = S;
const pixels = new ImageData(S, S);
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) pixels.data.set([x * 2, y * 2, x < S / 2 ? 200 : 40, 255], (y * S + x) * 4);
image.getContext('2d').putImageData(pixels, 0, 0);
const text = document.createElement('canvas'); text.width = S; text.height = S;
const context = text.getContext('2d'); context.fillStyle = '#ffffff';
for (const [x, y, w, h] of ${JSON.stringify(TEXT_BARS)}) context.fillRect(x, y, w, h);
window.capture = async (withText, withHostText) => {
    await renderer.compile('search synth, filter\nmedia(imageSize: [' + S + ', ' + S + '])' + (withText ? '.text()' : '') + '.write(o0)\nrender(o0)');
    renderer.stop();
    const media = renderer.pipeline.graph.passes.find(p => p.effectFunc === 'media');
    renderer.updateTextureFromSource('imageTex_step_' + media.stepIndex, image, {flipY:false});
    if (withHostText) {
        const overlay = renderer.pipeline.graph.passes.find(p => p.effectFunc === 'text');
        renderer.updateTextureFromSource('textTex_step_' + overlay.stepIndex, text, {flipY:true});
    }
    renderer.render(0); renderer.render(0);
    await renderer.pipeline.backend.device?.queue?.onSubmittedWorkDone();
    return {backend:renderer.pipeline.backend.getName(), png:renderer.canvas.toDataURL()};
};
</script>`)
        await page.waitForFunction(() => typeof window.capture === 'function')
        const backend = gpu ? 'WebGPU' : 'WebGL2'
        const shot = async (withText, withHostText) => {
            const result = await page.evaluate(([a, b]) => window.capture(a, b), [withText, withHostText])
            assert.equal(result.backend, backend)
            return PNG.sync.read(Buffer.from(result.png.split(',')[1], 'base64'))
        }
        const input = await shot(false, false)
        const plain = await shot(true, false)
        const overlaid = await shot(true, true)

        const changed = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i += 4) if (a.data.subarray(i, i + 4).compare(b.data.subarray(i, i + 4))) n++; return n }
        assert.equal(changed(plain, input), 0,
            `${backend}: text() at the defaults with no text canvas changed ${changed(plain, input)} of ${SIZE * SIZE} pixels of the input (input ${sha(input).slice(0, 12)}, text() ${sha(plain).slice(0, 12)})`)

        let around = 0, aroundSame = 0, bars = 0, barsWhite = 0
        for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
            const i = (y * SIZE + x) * 4
            if (inBar(x, y)) { bars++; if (overlaid.data[i] === 255 && overlaid.data[i + 1] === 255 && overlaid.data[i + 2] === 255) barsWhite++ }
            else { around++; if (!overlaid.data.subarray(i, i + 4).compare(input.data.subarray(i, i + 4))) aroundSame++ }
        }
        assert.equal(aroundSame, around, `${backend}: the input shows on ${aroundSame} of ${around} pixels around the host text`)
        assert.equal(barsWhite, bars, `${backend}: the text shows on ${barsWhite} of ${bars} text pixels`)
        console.log(`${backend}: input ${sha(input)}, text() ${sha(plain)}, text() with host text ${sha(overlaid)}; input kept on ${aroundSame}/${around} pixels around the text, text on ${barsWhite}/${bars}`)
        frames[backend] = [plain, overlaid]
        await page.close()
    }
    for (const [i, name] of ['text()', 'text() with host text'].entries()) {
        assert.ok(frames.WebGL2[i].data.equals(frames.WebGPU[i].data), `WebGL2 and WebGPU differ for ${name}`)
    }
    console.log('filter/text defaults: input passes through on both backends, with and without host text; WebGL2 and WebGPU frames identical')
} finally {
    await browser.close()
    await releaseServer()
}

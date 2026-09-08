#!/usr/bin/env node
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
const base = await acquireServer(undefined, root, effects)
const browser = await chromium.launch(shaderTestBrowserOptions())
const captures = []
try {
    for (const gpu of [false, true]) {
        const page = await browser.newPage()
        await page.goto(`${base}/shaders/effects/manifest.json`)
        await page.setContent(String.raw`<canvas id="canvas" width="16" height="16"></canvas>
<script type="module">
import { CanvasRenderer } from '${base}/shaders/src/index.js';
const renderer = new CanvasRenderer({canvas:document.getElementById('canvas'),width:16,height:16,basePath:'${base}/shaders',preferWebGPU:${gpu}});
await renderer.loadManifest(); await renderer.loadEffects(['synth/media','synth/solid','mixer/blendMode']);
window.capture = async (edge, blend) => {
    await renderer.compile(blend ? 'search synth, mixer\nsolid(color: #000000, alpha: 0).write(o0)\nmedia(imageSize: [16,16], bgAlpha: 0).write(o1)\nread(o0).blendMode(tex:read(o1), mode:mix, mix:0).write(o2)\nrender(o2)' : 'search synth\nmedia(imageSize: [16,16], bgAlpha: 0).write(o0)\nrender(o0)');
    const source = document.createElement('canvas'); source.width = 8; source.height = 8;
    const context = source.getContext('2d');
    const pixels = new ImageData(8,8);
    for (let y=0; y<8; y++) for(let x=0; x<8; x++) pixels.data.set(edge ? (x<4 ? [255,0,0,255] : [0,0,255,0]) : [128,64,32,128],(y*8+x)*4);
    context.putImageData(pixels,0,0);
    const pass = renderer.pipeline.graph.passes.find(p=>p.effectFunc==='media');
    renderer.updateTextureFromSource('imageTex_step_'+pass.stepIndex, source, {flipY:false});
    renderer.render(0); renderer.render(0);
    await renderer.pipeline.backend.device?.queue?.onSubmittedWorkDone();
    return {backend:renderer.pipeline.backend.getName(), png:renderer.canvas.toDataURL()};
};
</script>`)
        await page.waitForFunction(() => typeof window.capture === 'function')
        const results = []
        for (const [edge, blend] of [[false, false], [false, true], [true, false]]) {
            const result = await page.evaluate(([edge, blend]) => window.capture(edge, blend), [edge, blend])
            assert.equal(result.backend, gpu ? 'WebGPU' : 'WebGL2')
            const png = PNG.sync.read(Buffer.from(result.png.split(',')[1], 'base64'))
            const at = x => [...png.data.subarray((8*16+x)*4, (8*16+x)*4+4)]
            const close = (actual, expected) => expected.forEach((value, i) => assert.ok(Math.abs(actual[i]-value)<=1, `${actual} != ${expected}`))
            if (edge) { close(at(7), [255,0,0,191]); close(at(8), [255,0,0,64]) }
            else close(at(8), [128,64,32,blend ? 64 : 128])
            results.push(png.data)
        }
        captures.push(results)
        await page.close()
    }
    captures[0].forEach((bytes, i) => assert.deepEqual(bytes, captures[1][i], 'GLSL/WGSL pixels differ'))
    console.log('Media fractional alpha, blended opacity, and transparent-edge filtering: 3 cases on both backends; exact pixel parity')
} finally {
    await browser.close()
    await releaseServer()
}

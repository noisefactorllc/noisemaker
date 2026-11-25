#!/usr/bin/env node
// A media element with an `_id:` keeps its uploaded texture across an edit
// that inserts a step before it, on each backend, with no second upload. A
// control without an `_id:` loses its binding to the same edit. An upload
// also moves with renderer.moveState(): from a step-numbered id to the key of
// an element that gains an `_id:`, and from one key to another for a rename.
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

const args = process.argv.slice(2)
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--backend' && ['webgl2', 'webgpu'].includes(args[1])),
    'usage: test_media_id_survives.mjs [--backend webgl2|webgpu]')
const requested = args.length ? [args[1]] : ['webgl2', 'webgpu']

const FILL = [200, 100, 50, 255]
// Each move uploads its own fill, so a readback shows that this upload moved.
const MOVED = [40, 160, 220, 255]
const RENAMED = [230, 210, 30, 255]
const program = body => `search synth\n${body}\nrender(o0)`
const MEDIA = (id = '') => `media(${id ? `_id: "${id}", ` : ''}imageSize: [16, 16])`
const INSERTED = media => program(`solid(color: #00ff00).write(o1)\n${media}.write(o0)`)

const base = await acquireServer(undefined, root, effects)
const browser = await chromium.launch(shaderTestBrowserOptions())
try {
    for (const backend of requested) {
        const expectedName = backend === 'webgpu' ? 'WebGPU' : 'WebGL2'
        const page = await browser.newPage({ viewport: { width: 16, height: 16 } })
        const pageErrors = []
        page.on('pageerror', error => pageErrors.push(error.message))
        // about:blank has no trustworthy origin and silently denies WebGPU.
        await page.goto(`${base}/shaders/effects/manifest.json`)
        await page.setContent(String.raw`<canvas id="canvas" width="16" height="16"></canvas>
<script type="module">
import { CanvasRenderer } from '${base}/shaders/src/index.js';
const renderer = new CanvasRenderer({canvas:document.getElementById('canvas'),width:16,height:16,basePath:'${base}/shaders',preferWebGPU:${backend === 'webgpu'}});
await renderer.loadManifest(); await renderer.loadEffects(['synth/media','synth/solid']);
renderer.stop();
window.compileDsl = async (dsl) => { await renderer.compile(dsl); return renderer.pipeline.backend.getName(); };
window.keyOf = (id, name) => renderer.keyOf(id, name);
window.moveState = (from, to) => renderer.moveState(from, to);
window.mediaId = () => renderer.getMediaSteps()[0]?.textureId ?? null;
window.upload = (id, fill) => {
    const source = document.createElement('canvas'); source.width = 8; source.height = 8;
    const context = source.getContext('2d');
    context.fillStyle = 'rgba(' + fill.slice(0, 3).join(',') + ',1)'; context.fillRect(0, 0, 8, 8);
    renderer.updateTextureFromSource(id, source, {flipY:false});
};
window.draw = async () => {
    renderer.render(0); renderer.render(0);
    await renderer.pipeline.backend.device?.queue?.onSubmittedWorkDone();
};
window.ready = true;
</script>`)
        await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 })
        const compile = async dsl => assert.equal(await page.evaluate(source => window.compileDsl(source), dsl), expectedName)
        const centre = async () => {
            await page.evaluate(() => window.draw())
            const png = PNG.sync.read(await page.locator('canvas').screenshot({ omitBackground: true }))
            const i = (8 * png.width + 8) * 4
            return [...png.data.subarray(i, i + 4)]
        }
        const isFill = (pixel, fill = FILL) => pixel.every((value, channel) => Math.abs(value - fill[channel]) <= 2)

        // Kept across an inserted step, with no second upload.
        await compile(program(`${MEDIA('photo')}.write(o0)`))
        const key = await page.evaluate(() => window.keyOf('photo', 'imageTex'))
        assert.equal(await page.evaluate(() => window.mediaId()), key, `${expectedName}: the media step binds the element key`)
        await page.evaluate(([id, fill]) => window.upload(id, fill), [key, FILL])
        assert.ok(isFill(await centre()), `${expectedName}: the upload is drawn`)
        await compile(INSERTED(MEDIA('photo')))
        assert.equal(await page.evaluate(() => window.keyOf('photo', 'imageTex')), key, `${expectedName}: the key does not change`)
        const kept = await centre()
        assert.ok(isFill(kept), `${expectedName}: the upload stays bound across the edit, got ${kept}`)

        // The control: without an _id:, the same edit renumbers the step and the upload no longer binds.
        await compile(program(`${MEDIA()}.write(o0)`))
        await page.evaluate(([id, fill]) => window.upload(id, fill), ['imageTex_step_0', FILL])
        assert.ok(isFill(await centre()), `${expectedName}: the control's upload is drawn`)
        await compile(INSERTED(MEDIA()))
        assert.notEqual(await page.evaluate(() => window.mediaId()), 'imageTex_step_0')
        assert.ok(!isFill(await centre()), `${expectedName}: without _id: the edit unbinds the upload`)

        // An element that gains an _id: takes its upload with moveState().
        await compile(program(`${MEDIA()}.write(o0)`))
        await page.evaluate(([id, fill]) => window.upload(id, fill), ['imageTex_step_0', MOVED])
        await compile(program(`${MEDIA('photo')}.write(o0)`))
        assert.ok(!isFill(await centre(), MOVED), `${expectedName}: the key does not show the step's upload before the move`)
        assert.equal(await page.evaluate(([from, to]) => window.moveState(from, to), ['imageTex_step_0', key]), true,
            `${expectedName}: moveState() moves the upload to the new key`)
        assert.ok(isFill(await centre(), MOVED), `${expectedName}: the moved upload is drawn under the key`)

        // A rename, from one key to another.
        const lake = await (async () => { await compile(program(`${MEDIA('lake')}.write(o0)`)); return page.evaluate(() => window.keyOf('lake', 'imageTex')) })()
        assert.equal(await page.evaluate(([from, to]) => window.moveState(from, to), [key, lake]), true,
            `${expectedName}: moveState() moves the upload for a rename`)
        assert.ok(isFill(await centre(), MOVED), `${expectedName}: the renamed element draws the moved upload`)
        await page.evaluate(([id, fill]) => window.upload(id, fill), [lake, RENAMED])
        assert.ok(isFill(await centre(), RENAMED), `${expectedName}: a later upload to the renamed key is drawn`)

        assert.deepEqual(pageErrors, [], `${expectedName}: page errors`)
        console.log(`${expectedName}: ${key} kept its upload across an inserted step, and moveState() moved uploads to it and on to ${lake}`)
        await page.close()
    }
    console.log(`PASS test_media_id_survives (${requested.join(', ')})`)
} finally {
    await browser.close()
    await releaseServer()
}

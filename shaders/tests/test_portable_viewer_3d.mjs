// Relocated from Portable (https://github.com/noisefactorllc/portable,
// test-3d.mjs at 6f211e44a0f2eb4baff1b9ae68893fa3b3554085), MIT License,
// Copyright (c) 2026 Noise Factor. It drives the package viewer in the demo,
// demo/shaders/package.html. Each check keeps its meaning. What the demo does
// differently from Portable's viewer is mapped:
//   - Portable's panel controls are the package step's controls in the visible
//     realm: #params input[type="range"] and input[data-param="<name>"] are
//     .shader-effect[data-effect-name="<func>"] .control-group[data-param-key="<name>"] slider-value,
//     and #params select is that step's select-dropdown;
//   - the WebGPU radio (input[value="wgsl"]) is window.__portableSetBackend('wgsl'),
//     the step that radio ran;
//   - the Reload button (#reload-btn) is window.__portableSelectEffect of the
//     same package, which loads it again;
//   - the canvas is the visible realm's #canvas, captured without the viewer's
//     #status and the demo's compile notices drawn over it (captureCanvas), as
//     Portable's capture hid its panel, and the frame's dimensions
//     are read from the frame, as the demo sizes its canvas to its layout;
//   - "registers no effect" is that no realm is left once the package is
//     refused, as each revision registers in its own realm;
//   - the diagnostic output on a failed load no longer imports a released build;
//   - screenshots are written to the system's temporary directory;
//   - the browser launches as every Noisemaker browser test does, through
//     shaderTestBrowserOptions(), in place of Portable's Chrome channel,
//     SwiftShader arguments and Xvfb mode.
// The server keeps Portable's /effect/ and /examples/<name>/ URLs
// (scripts/lib/portable-viewer-server.mjs).
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureCanvas, fileFor, VIEWER_PATH } from '../../scripts/lib/portable-viewer-server.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { chromium } from 'playwright';
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs';

// Catches lost texture sizes, ignored defaultProgram, missing 3D outputs,
// incorrect starter registration, and backend-specific shader/render failures.
const deadline = setTimeout(() => { console.error('3D viewer test timed out'); process.exit(1); }, 120000);
const example = new URL('../portable/examples/portable-block-3d/', import.meta.url);
const def = JSON.parse(await readFile(new URL('definition.json', example), 'utf8'));
const glsl = await readFile(new URL('glsl/fill.glsl', example), 'utf8');
const wgsl = await readFile(new URL('wgsl/fill.wgsl', example), 'utf8');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.glsl': 'text/plain', '.wgsl': 'text/plain' };
const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://test.invalid').pathname;
    try {
        if (path === '/effect/definition.json') {
            res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(def));
        }
        if (path === '/effect/glsl/fill.glsl' || path === '/effect/wgsl/fill.wgsl') {
            res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end(path.endsWith('.glsl') ? glsl : wgsl);
        }
        const filename = fileFor(path.endsWith('/') ? path + 'index.html' : path);
        if (!filename) throw new Error('Invalid path');
        res.writeHead(200, { 'Content-Type': mime[extname(filename)] || 'application/octet-stream' });
        res.end(await readFile(filename));
    } catch { res.writeHead(404); res.end(); }
});
let browser;
try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    // Noisemaker's browser tests launch Playwright's Chromium, headless, with
    // both GPU backends.
    browser = await chromium.launch(shaderTestBrowserOptions());
    // The visible realm of a viewer page.
    const realmOf = async viewer => (await viewer.$('iframe.portable-realm.active')).contentFrame();
    const page = await browser.newPage({ viewport: { width: 384, height: 384 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) errors.push(msg.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}${VIEWER_PATH}?package=/effect/`);
    await page.waitForFunction(() => ['success', 'error'].includes(document.querySelector('#status').className));
    if (await page.locator('#status').getAttribute('class') === 'error') {
        console.log(await page.evaluate(async () => ({
            manifest: Object.keys(window.__portableCanvasRenderer?.manifest || {}).slice(0, 10),
            loaded: [...(window.__portableCanvasRenderer?.loadedEffects?.keys() || [])],
            program: window.__portableCanvasRenderer?.currentDsl
        })));
        console.log(errors);
    }
    assert.equal(await page.locator('#status').getAttribute('class'), 'success', await page.locator('#status').textContent());
    const inspect = async () => {
        const state = await page.evaluate(async () => {
        const renderer = window.__portableCanvasRenderer;
        renderer.stop(); await renderer.render(0);
        const p = renderer.pipeline;
        const textures = [...p.backend.textures.entries()].map(([id,t]) => ({ id, width: t.width, height: t.height }));
        const passes = p.graph.passes.map(pass => ({ program: pass.program, inputs: pass.inputs, outputs: pass.outputs }));
        const volumeId = textures.find(t => /volume$/.test(t.id)).id;
        const volume = await p.backend.readPixels(volumeId);
        const geometry = await p.backend.readPixels(textures.find(t => /geometry$/.test(t.id)).id);
        const frame = await p.backend.readPixels(p.surfaces.get('o0').read);
        return { textures, passes, backend: window.__portableCurrentBackend(), frameWidth: frame.width, frameHeight: frame.height,
            volume: Array.from(volume.data), geometry: Array.from(geometry.data), frame: Array.from(frame.data) };
        });
        // Capture the compositor output. Reading a WebGPU canvas with drawImage
        // can return a discarded swap buffer on Linux even while it displays.
        const png = await captureCanvas(await realmOf(page));
        state.displayed = await page.evaluate(async encoded => {
            const blob = await (await fetch(`data:image/png;base64,${encoded}`)).blob();
            const bitmap = await createImageBitmap(blob);
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const context = canvas.getContext('2d');
            context.drawImage(bitmap, 0, 0);
            bitmap.close();
            return Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data);
        }, png.toString('base64'));
        return state;
    };
    let state = await inspect();
    assert.equal(await (await realmOf(page)).locator('.shader-effect[data-effect-name="portableBlock3d"] .control-group[data-param-key="volumeSize"] slider-value').evaluate(slider => String(slider.value)), '16', 'controls reflect the program rather than overwriting its volume size');
    assert(state.textures.some(t => /volume$/.test(t.id) && t.width === 16 && t.height === 256), JSON.stringify(state.textures.slice(-5)));
    assert(state.passes.some(p => Object.keys(p.inputs).includes('volumeCache')), 'defaultProgram must run the volume renderer');
    assert.equal(state.backend, 'glsl');
    assert.equal(state.volume.filter((v, i) => i % 4 === 0 && v === 255).length, 512, '8 cubed occupied voxels');
    assert.equal(state.geometry.filter((v, i) => i % 4 === 3 && v === 255).length, 512, 'geometry density survives MRT');
    assert(state.frame.some((v, i) => i % 4 === 0 && v > 60), 'rendered pixels contain the solid block');
    const webgl = state;
    await (await realmOf(page)).locator('#canvas').screenshot({ path: join(tmpdir(), 'portable-volume-webgl.png') });
    console.log('PASS WebGL2: portable 3D atlas reaches built-in voxel renderer');
    await page.evaluate(() => { window.__portableSetBackend('wgsl'); });
    await page.waitForFunction(() => window.__portableCurrentBackend?.() === 'wgsl' && document.querySelector('#status').className === 'success');
    state = await inspect();
    assert(state.textures.some(t => /volume$/.test(t.id) && t.width === 16 && t.height === 256), JSON.stringify(state));
    assert.equal(state.backend, 'wgsl');
    // Atlas rows are voxel addresses, not screen UVs. GLSL readback reverses
    // rows for images; undo that conversion to compare logical voxel samples.
    const reverseRows = (data, width, height) => Array.from({ length: height }, (_, y) =>
        data.slice((height - y - 1) * width * 4, (height - y) * width * 4)).flat();
    assert.deepEqual(state.volume, reverseRows(webgl.volume, 16, 256), 'voxel samples match across backends');
    assert.deepEqual(state.geometry, reverseRows(webgl.geometry, 16, 256), 'geometry samples match across backends');
    let differences = 0;
    for (let i = 0; i < state.frame.length; i++) if (state.frame[i] !== webgl.frame[i]) differences++;
    console.log('Frame channel differences:', differences);
    const reversedFrame = reverseRows(state.frame, state.frameWidth, state.frameHeight);
    assert.deepEqual(reversedFrame, webgl.frame, 'render targets agree in their native presentation orientation');
    await (await realmOf(page)).locator('#canvas').screenshot({ path: join(tmpdir(), 'portable-volume-webgpu.png') });
    console.log('Displayed differences:', state.displayed.filter((v,i) => v !== webgl.displayed[i]).length);
    assert(state.displayed.some((v,i) => i % 4 === 0 && v > 60), 'displayed canvas contains colored voxel pixels');
    assert.deepEqual(state.displayed, webgl.displayed, 'displayed block pixels match across backends');
    assert.deepEqual(errors, []);
    console.log('PASS WebGPU: portable 3D atlas reaches built-in voxel renderer');

    const single = await browser.newPage({ viewport: { width: 384, height: 384 } });
    let language = 'wgsl';
    await single.route('**/examples/portableBlock3d/*/fill.*', route =>
        route.request().url().endsWith(`.${language}`) ? route.continue() : route.fulfill({ status: 404, body: '' }));
    await single.goto(`http://127.0.0.1:${server.address().port}${VIEWER_PATH}?package=/examples/portableBlock3d/`);
    await single.waitForFunction(() => ['success', 'error'].includes(document.querySelector('#status').className));
    assert.equal(await single.locator('#status').getAttribute('class'), 'success', await single.locator('#status').textContent());
    assert.equal(await single.evaluate(() => window.__portableCurrentBackend()), 'wgsl', 'WGSL-only package starts with a WebGPU context');
    language = 'glsl';
    await single.evaluate(() => { window.__portableSelectEffect('portableBlock3d', { url: '/examples/portableBlock3d/' }); });
    await single.waitForFunction(() => window.__portableCurrentBackend?.() === 'glsl' && document.querySelector('#status').className === 'success');
    await single.close();
    console.log('PASS single-language startup and backend reconciliation after package reload');

    // Noisemaker retired parameter aliases. The otherwise valid block package
    // must fail to load, before registration, once it declares the field.
    const retired = await browser.newPage({ viewport: { width: 384, height: 384 } });
    retired.on('pageerror', e => errors.push(e.message));
    let retiredAliases;
    await retired.route('**/examples/portableBlock3d/definition.json', route =>
        route.fulfill({ json: { ...def, paramAliases: retiredAliases } }));
    for (retiredAliases of [{ legacySize: 'volumeSize' }, {}, null]) {
        await retired.goto(`http://127.0.0.1:${server.address().port}${VIEWER_PATH}?package=/examples/portableBlock3d/`);
        await retired.waitForFunction(() => ['success', 'error'].includes(document.querySelector('#status').className));
        const label = `paramAliases ${JSON.stringify(retiredAliases)}`;
        assert.equal(await retired.locator('#status').getAttribute('class'), 'error', `${label} is rejected`);
        assert.equal(await retired.locator('#status').textContent(),
            'paramAliases is retired: use the canonical parameter names in the program', `${label} names the canonical-name fix`);
        assert.equal(await retired.evaluate(() => document.querySelectorAll('iframe.portable-realm').length), 0, `${label} registers no effect`);
        assert.equal(await retired.evaluate(() => window.__portableCanvasRenderer?.pipeline ?? null), null, `${label} compiles no program`);
    }
    await retired.close();
    console.log('PASS packages that declare retired paramAliases are rejected');

    // Editing a Portable parameter must not overwrite a same-named uniform
    // in a built-in effect. A threshold of 1 would hide every block voxel.
    const scoped = await browser.newPage({ viewport: { width: 384, height: 384 } });
    scoped.on('pageerror', e => errors.push(e.message));
    const scopedDef = { ...def,
        globals: { ...def.globals,
            cutoff: { type: 'float', default: 0.4, min: 0, max: 1, uniform: 'threshold' },
            mode: { type: 'int', default: 0, uniform: 'mode', choices: { 'soft tint': 0, 'strong tint': 1 } } },
        defaultProgram: 'search user, render\nportableBlock3d(volumeSize: 16, cutoff: 0.2, mode: strongTint).render3d(threshold: 0.7, filtering: 1, orbitSpeed: 0).write(o0)\nrender(o0)' };
    await scoped.route('**/examples/portableBlock3d/definition.json', route =>
        route.fulfill({ json: scopedDef }));
    await scoped.goto(`http://127.0.0.1:${server.address().port}${VIEWER_PATH}?package=/examples/portableBlock3d/`);
    await scoped.waitForFunction(() => ['success', 'error'].includes(document.querySelector('#status').className));
    assert.equal(await scoped.locator('#status').getAttribute('class'), 'success', await scoped.locator('#status').textContent());
    const scopedStep = '.shader-effect[data-effect-name="portableBlock3d"]';
    const scopedControl = async name => (await realmOf(scoped)).locator(`${scopedStep} .control-group[data-param-key="${name}"] slider-value`);
    assert.equal(await (await scopedControl('cutoff')).evaluate(slider => String(slider.value)), '0.2', 'the program value of a canonical parameter compiles to its control');
    assert.equal(await (await realmOf(scoped)).locator(`${scopedStep} .control-group[data-param-key="mode"] select-dropdown`).evaluate(select => String(select.value)), '1', 'sanitized choice names compile to their numeric value');
    const editScoped = async (name, value) => (await scopedControl(name)).evaluate((input, next) => {
        input.value = next;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
    await editScoped('cutoff', 1);
    await editScoped('volumeSize', 32);
    for (const backend of ['glsl', 'wgsl']) {
        if (backend === 'wgsl') {
            await scoped.evaluate(() => { window.__portableSetBackend('wgsl'); });
            await scoped.waitForFunction(() => window.__portableCurrentBackend?.() === 'wgsl' && document.querySelector('#status').className === 'success');
        }
        const controlled = await scoped.evaluate(async () => {
            const r = window.__portableCanvasRenderer;
            r.stop(); await r.render(0);
            const p = r.pipeline;
            const fill = p.graph.passes.find(pass => pass.effectKey === 'user.portableBlock3d');
            const render = p.graph.passes.find(pass => pass.inputs.volumeCache);
            const volume = p.backend.textures.get(fill.outputs.color);
            const frame = await p.backend.readPixels(p.surfaces.get('o0').read);
            return { cutoff: fill.uniforms.threshold, mode: fill.uniforms.mode, threshold: render.uniforms.threshold,
                generatorSize: fill.uniforms.volumeSize, rendererSize: render.uniforms.volumeSize,
                width: volume.width, height: volume.height,
                visible: frame.data.some((value, index) => index % 4 === 0 && value > 60) };
        });
        assert.equal(controlled.cutoff, 1, 'the edited parameter reaches its aliased Portable uniform');
        assert.equal(controlled.mode, 1, 'the compiled choice value survives backend switching');
        assert.equal(controlled.threshold, 0.7, 'the built-in renderer retains its own threshold');
        assert.equal(controlled.generatorSize, 32, 'the generator retains its edited volume size');
        assert.equal(controlled.rendererSize, 32, 'the renderer inherits the edited generator volume size');
        assert.equal(controlled.width, 32, 'editing volumeSize reallocates the volume width');
        assert.equal(controlled.height, 1024, 'editing volumeSize reallocates the volume atlas height');
        assert(controlled.visible, 'editing the Portable cutoff does not hide the rendered block');
        console.log(`PASS ${backend}: scoped Portable controls, volume resizing, and backend replay`);
    }
    await scoped.close();

    // A filter inherits the upstream atlas dimensions and forwards geometry
    // without declaring a sampler for metadata-only passthrough.
    const GEOMETRY_CONSUMER_DSL = 'search synth3d, user, render\nshape3d(volumeSize: 16).volumeColor3d().renderLandscape3d().write(o0)\nrender(o0)';
    await page.goto(`http://127.0.0.1:${server.address().port}${VIEWER_PATH}?package=/examples/volumeColor3d/`);
    await page.waitForFunction(() => ['success', 'error'].includes(document.querySelector('#status').className));
    assert.equal(await page.locator('#status').getAttribute('class'), 'success', await page.locator('#status').textContent());
    for (const backend of ['glsl', 'wgsl']) {
        if (backend === 'wgsl') {
            await page.evaluate(() => { window.__portableSetBackend('wgsl'); });
            await page.waitForFunction(() => window.__portableCurrentBackend?.() === 'wgsl' && document.querySelector('#status').className === 'success');
        }
        const filtered = await page.evaluate(async () => {
            const r = window.__portableCanvasRenderer;
            r.stop(); await r.render(0);
            const p = r.pipeline;
            const filter = p.graph.passes.find(pass => pass.inputs.volumeInput);
            const render = p.graph.passes.find(pass => pass.inputs.volumeCache);
            const input = await p.backend.readPixels(filter.inputs.volumeInput);
            const outputId = Object.values(filter.outputs)[0];
            const output = await p.backend.readPixels(outputId);
            const frame = await p.backend.readPixels(p.surfaces.get('o0').read);
            r.setUniform('amount', 0); await r.render(0);
            const passthrough = await p.backend.readPixels(outputId);
            return { width: output.width, height: output.height, input: Array.from(input.data),
                output: Array.from(output.data),
                frame: Array.from(frame.data), passthrough: Array.from(passthrough.data) };
        });
        // render3d declares no geometry input, so the geometry carried past the
        // filter is observed at a renderer that reads it: the same chain into
        // renderLandscape3d. The chain carries shape3d's geometry past an
        // effect that declares no geometry of its own; this checks that it
        // still reaches the consumer through the Portable filter. The original
        // program is compiled again after.
        const forwarded = await page.evaluate(async (dsl) => {
            const r = window.__portableCanvasRenderer;
            const original = r.currentDsl;
            // The viewer loads only the effects of its own program.
            await r.loadEffects(['render/renderLandscape3d']);
            let failure = null;
            try {
                await r.compile(dsl);
                r.stop(); await r.render(0);
                const p = r.pipeline;
                const consumer = p.graph.passes.find(pass => pass.inputs.analyticalGeo);
                const geometryId = consumer?.inputs.analyticalGeo;
                const geometry = geometryId && await p.backend.readPixels(geometryId);
                const filter = p.graph.passes.find(pass => pass.effectKey === 'user.volumeColor3d');
                return { geometryId, geometry: geometry && Array.from(geometry.data),
                    producers: p.graph.passes.filter(pass => pass !== consumer && Object.values(pass.outputs).includes(geometryId)).map(pass => pass.effectKey),
                    filterFeedsConsumer: !!filter && Object.values(filter.outputs).includes(consumer?.inputs.volumeCache) };
            } catch (error) {
                failure = error;
                throw error;
            } finally {
                // Restore the viewer's program; a failure to restore does not
                // hide the failure it follows.
                try {
                    await r.compile(original);
                    r.stop(); await r.render(0);
                } catch (error) {
                    if (!failure) throw error;
                }
            }
        }, GEOMETRY_CONSUMER_DSL);
        assert.equal(filtered.width, 16, 'filter inherits volume width');
        assert.equal(filtered.height, 256, 'filter inherits atlas height');
        assert(forwarded.geometry?.some((v,i) => i % 4 === 3 && v > 0), 'upstream analytical geometry reaches renderer');
        assert(forwarded.producers.length > 0, 'forwarded geometry is produced upstream');
        assert(forwarded.filterFeedsConsumer, 'the Portable filter sits between the geometry producer and its consumer');
        assert.deepEqual(filtered.output.filter((_,i) => i % 4 === 0 || i % 4 === 3),
            filtered.input.filter((_,i) => i % 4 === 0 || i % 4 === 3), 'filter preserves density and alpha');
        assert(filtered.output.some((v,i) => v !== filtered.input[i]), 'tint modifies voxel colors');
        assert.deepEqual(filtered.passthrough, filtered.input, 'amount zero preserves every voxel channel');
        assert(filtered.frame.some((v,i) => i % 4 === 0 && v > 60), 'filtered chain produces visible pixels');
        console.log(`PASS ${backend}: shape3d -> portable color filter -> render3d, inherited atlas and geometry passthrough`);
    }
    assert.deepEqual(errors, []);
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    clearTimeout(deadline);
}

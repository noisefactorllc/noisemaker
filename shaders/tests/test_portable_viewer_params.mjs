/**
 * Viewer Parameter-Controls Test
 *
 * Loads the viewer with a definition exercising every documented parameter
 * type (float, int, int-with-choices, boolean, color, vec2, vec3) and verifies
 * the viewer renders a control for each one without crashing.
 *
 * The shipped effect/definition.json only uses a single float param, so this
 * test injects a multi-type definition via request interception (the shipped
 * files are never modified) and reuses the existing gradientSweep shader so the
 * effect still compiles.
 */

// Relocated from Portable (https://github.com/noisefactorllc/portable,
// test-params.mjs at 6f211e44a0f2eb4baff1b9ae68893fa3b3554085), MIT License,
// Copyright (c) 2026 Noise Factor. It drives the package viewer in the demo,
// demo/shaders/package.html, whose parameter controls are the demo's own,
// in the visible realm. Each check keeps its meaning; its selectors name the
// demo's controls in place of Portable's panel:
//   #params                    -> #effect-controls-container
//   .param-group               -> .control-group[data-param-key]
//   input[type="checkbox"]     -> toggle-switch (readout: its aria-checked)
//   select                     -> select-dropdown (readout: .trigger-text)
//   input[type="range"]        -> slider-value, and one per component of a
//                                 vector2d-picker or vector3d-picker
//   input[type="range"][data-param="rotation"]
//                              -> .control-group[data-param-key="rotation"] slider-value
//   .param-value of a slider   -> its .value-display
//   input[type="color"]        -> input[type="color"], as before
// The server keeps Portable's /effect/ URL for the starter effect
// (scripts/lib/portable-viewer-server.mjs).
import { chromium } from 'playwright';
import { startPortableViewerServer, VIEWER_PATH } from '../../scripts/lib/portable-viewer-server.mjs';

// Fail the whole test if it takes longer than 30s
setTimeout(() => {
    console.error('Test timed out after 30 seconds');
    process.exit(1);
}, 30000).unref();

const MULTI_TYPE_DEF = {
    name: 'Param Types Test',
    func: 'gradientSweep',
    description: 'Exercises every documented parameter type',
    tags: ['color'],
    starter: true,
    globals: {
        // `rotation` deliberately maps to a different GLSL uniform name (`speed`,
        // which the gradientSweep shader declares) to exercise the documented
        // key≠uniform mapping — the viewer must drive the uniform, not the key.
        rotation:{ type: 'float',   default: 1.0, min: 0.0, max: 4.0, step: 0.1, uniform: 'speed' },
        octaves: { type: 'int',     default: 4,   min: 1,   max: 8 },
        mode:    { type: 'int',     default: 0,   choices: { normal: 0, add: 1, screen: 2 } },
        invert:  { type: 'boolean', default: true },
        tint:    { type: 'color',   default: [1.0, 0.5, 0.0] },
        offset:  { type: 'vec2',    default: [0.5, 0.25] },
        lightDir:{ type: 'vec3',    default: [1.0, 0.0, 0.0] }
    },
    passes: [
        { name: 'render', program: 'gradientSweep', inputs: {}, outputs: { color: 'outputTex' } }
    ]
};
const PARAM_COUNT = Object.keys(MULTI_TYPE_DEF.globals).length;

(async () => {
    const { server, port } = await startPortableViewerServer();
    console.log(`Server running at http://127.0.0.1:${port}/`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const errors = [];
    page.on('pageerror', (error) => {
        errors.push(error.message);
        console.error('Page error:', error.message);
    });

    page.on('console', (msg) => {
        const text = msg.text();
        if (msg.type() === 'error') {
            // WebGL INVALID_OPERATION is expected in headless software renderer
            if (/WebGL Error 3744[0-9]/.test(text)) return;
            // Browser-level 404s for optional resources (e.g. shaders manifest)
            if (/Failed to load resource/.test(text)) return;
            errors.push(text);
            console.error('Console error:', text);
        }
    });

    // Inject the multi-type definition in place of the shipped one.
    await page.route('**/effect/definition.json', (route) => {
        const method = route.request().method();
        const headers = { 'Content-Type': 'application/json', 'Last-Modified': 'Wed, 01 Jan 2025 00:00:00 GMT' };
        if (method === 'HEAD') {
            route.fulfill({ status: 200, headers, body: '' });
        } else {
            route.fulfill({ status: 200, headers, body: JSON.stringify(MULTI_TYPE_DEF) });
        }
    });

    console.log('Loading viewer with multi-type definition...');
    await page.goto(`http://127.0.0.1:${port}${VIEWER_PATH}?package=/effect/`, { waitUntil: 'networkidle' });

    // Wait for effect to compile (status resolves to success or error)
    await page.waitForFunction(() => {
        const el = document.getElementById('status');
        return el && (el.className === 'success' || el.className === 'error');
    }, { timeout: 15000 });

    const status = await page.evaluate(() => {
        const el = document.getElementById('status');
        return { text: el?.textContent || '', className: el?.className || '' };
    });
    console.log('Status:', status.text, `(${status.className})`);

    if (status.className === 'error') {
        errors.push(`Effect failed to load with multi-type params: ${status.text}`);
    }

    // Verify a control was rendered for every parameter, with the right kind
    // of control for each documented type. The controls are in the visible realm.
    const realm = await (await page.$('iframe.portable-realm.active')).contentFrame();
    const controls = await realm.evaluate(() => {
        const params = document.getElementById('effect-controls-container');
        return {
            groupCount: params.querySelectorAll('.control-group[data-param-key]').length,
            colorInputs: params.querySelectorAll('input[type="color"]').length,
            checkboxes: params.querySelectorAll('toggle-switch').length,
            selects: params.querySelectorAll('select-dropdown').length,
            sliders: params.querySelectorAll('slider-value').length
                + 2 * params.querySelectorAll('vector2d-picker').length
                + 3 * params.querySelectorAll('vector3d-picker').length
        };
    });
    console.log('Controls:', JSON.stringify(controls));

    if (controls.groupCount !== PARAM_COUNT) {
        errors.push(`Expected ${PARAM_COUNT} param controls, got ${controls.groupCount}`);
    }
    if (controls.colorInputs < 1) errors.push('Expected a color picker for the "tint" color param');
    if (controls.checkboxes < 1) errors.push('Expected a checkbox for the "invert" boolean param');
    if (controls.selects < 1) errors.push('Expected a dropdown for the "mode" int-with-choices param');
    // float + int + vec2(2) + vec3(3) = 7 sliders at minimum
    if (controls.sliders < 7) errors.push(`Expected >=7 sliders (float/int/vec components), got ${controls.sliders}`);

    // Exercise the live-update handlers: changing a control must run its handler
    // without throwing, update the readout, and reach the effect's shader pass.
    const readouts = await realm.evaluate(() => {
        const params = document.getElementById('effect-controls-container');
        const groups = [...params.querySelectorAll('.control-group[data-param-key]')];
        const findGroup = (sel) => groups.find(g => g.querySelector(sel));

        const colorGroup = findGroup('input[type="color"]');
        const colorInput = colorGroup.querySelector('input[type="color"]');
        colorInput.value = '#00ff00';
        colorInput.dispatchEvent(new Event('input', { bubbles: true }));

        const boolGroup = findGroup('toggle-switch');
        const checkbox = boolGroup.querySelector('toggle-switch');
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));

        const selGroup = findGroup('select-dropdown');
        const select = selGroup.querySelector('select-dropdown');
        select.value = '2';
        select.dispatchEvent(new Event('change', { bubbles: true }));

        // Drive the float param whose GLSL uniform name (`speed`) differs from
        // its key (`rotation`); the new value must land on the GLSL uniform.
        const rotationSlider = params.querySelector('.control-group[data-param-key="rotation"] slider-value');
        rotationSlider.value = 3.7;
        rotationSlider.dispatchEvent(new Event('input', { bubbles: true }));

        return {
            color: colorInput.value,
            bool: checkbox.querySelector('[role="switch"]').getAttribute('aria-checked'),
            select: select.querySelector('.trigger-text').textContent,
            rotationReadout: rotationSlider.querySelector('.value-display').textContent
        };
    });
    const passUniforms = await page.evaluate(() => window.__portableRenderingPipeline?.graph.passes
        .find(pass => pass.effectKey === 'user.gradientSweep')?.uniforms || {});
    const interaction = { ...readouts, uniformSpeed: passUniforms['speed'], uniformRotation: passUniforms['rotation'] };
    console.log('After interaction:', JSON.stringify(interaction));

    if (interaction.color !== '#00ff00') errors.push(`Color readout did not update (got "${interaction.color}")`);
    if (interaction.bool !== 'false') errors.push(`Boolean readout did not update (got "${interaction.bool}")`);
    if (interaction.select !== 'screen') errors.push(`Choice readout did not update (got "${interaction.select}")`);
    if (interaction.rotationReadout !== '3.70') errors.push(`Float readout did not update (got "${interaction.rotationReadout}")`);
    // The key≠uniform routing check: dragging "rotation" must drive uniform "speed".
    if (interaction.uniformSpeed !== 3.7) {
        errors.push(`Param "rotation" (uniform "speed") did not route to its GLSL uniform: pass.uniforms.speed = ${interaction.uniformSpeed} (expected 3.7); pass.uniforms.rotation = ${interaction.uniformRotation}`);
    }

    await browser.close();
    server.close();

    if (errors.length > 0) {
        console.error('\nFAILED:');
        errors.forEach(err => console.error('  -', err));
        process.exit(1);
    }

    console.log('\nAll parameter-control checks passed');
    process.exit(0);
})();

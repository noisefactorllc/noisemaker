// Relocated from Portable (https://github.com/noisefactorllc/portable,
// test-viewer.mjs at 6f211e44a0f2eb4baff1b9ae68893fa3b3554085), MIT License,
// Copyright (c) 2026 Noise Factor. It drives the package viewer in the demo,
// demo/shaders/package.html, through the same harness as Portable's viewer.
// Its assertions are unchanged. The server keeps Portable's /effect/ URL for
// the starter effect (scripts/lib/portable-viewer-server.mjs).
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileFor, startPortableViewerServer, VIEWER_PATH } from '../../scripts/lib/portable-viewer-server.mjs';

// Fail the whole test if it takes longer than 30s
setTimeout(() => {
    console.error('Test timed out after 30 seconds');
    process.exit(1);
}, 30000).unref();

const effectDir = fileFor('/effect/');

(async () => {
    const { server, port } = await startPortableViewerServer();
    console.log(`Server running at http://127.0.0.1:${port}/`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const errors = [];
    // Set while the test compiles a deliberately broken effect.
    let expectingCompileError = false;
    page.on('pageerror', (error) => {
        errors.push(error.message);
        console.error('Page error:', error.message);
    });

    page.on('console', (msg) => {
        const text = msg.text();
        if (msg.type() === 'error') {
            if (expectingCompileError) return;
            // WebGL INVALID_OPERATION is expected in headless software renderer
            if (/WebGL Error 3744[0-9]/.test(text)) return;
            // Browser-level 404s for optional resources (e.g. shaders manifest)
            if (/Failed to load resource/.test(text)) return;
            errors.push(text);
            console.error('Console error:', text);
        }
    });

    console.log('Loading viewer...');
    await page.goto(`http://127.0.0.1:${port}${VIEWER_PATH}?package=/effect/`, { waitUntil: 'networkidle' });

    // Wait for effect to compile (status resolves to success or error)
    await page.waitForFunction(() => {
        const el = document.getElementById('status');
        return el && (el.className === 'success' || el.className === 'error');
    }, { timeout: 15000 });

    // Verify GLSL effect compiled successfully
    const status = await page.evaluate(() => {
        const el = document.getElementById('status');
        return { text: el?.textContent || '', className: el?.className || '' };
    });
    console.log('Status:', status.text, `(${status.className})`);

    if (status.className === 'error') {
        errors.push(`GLSL compile failed: ${status.text}`);
    } else {
        console.log('OK: GLSL effect compiled');
    }

    // shade-mcp drives the viewer through these globals: the effect's id and
    // parameter specs, a compile generation, selection and backend switching.
    const definition = JSON.parse(readFileSync(join(effectDir, 'definition.json'), 'utf8'));
    const identity = await page.evaluate(() => ({
        effect: window.__portableCurrentEffect,
        generation: window.__portablePipelineGeneration,
    }));
    if (identity.effect?.id !== 'effect') errors.push(`__portableCurrentEffect id is ${identity.effect?.id}, not "effect"`);
    if (JSON.stringify(Object.keys(identity.effect?.instance?.globals || {})) !== JSON.stringify(Object.keys(definition.globals || {}))) {
        errors.push('__portableCurrentEffect does not carry the definition\'s parameter specs');
    }
    if (!(identity.generation >= 1)) errors.push(`__portablePipelineGeneration is ${identity.generation} after a compile`);

    const reselected = await page.evaluate(async () => {
        const before = window.__portablePipelineGeneration;
        const result = await window.__portableSelectEffect('effect', { url: '/effect/' });
        return { result, advanced: window.__portablePipelineGeneration > before };
    });
    if (!reselected.result?.ok || !reselected.advanced) errors.push(`__portableSelectEffect did not recompile: ${JSON.stringify(reselected)}`);

    const switched = await page.evaluate(async () => {
        const result = await window.__portableSetBackend('glsl');
        return { result, backend: window.__portableCurrentBackend() };
    });
    if (!switched.result?.ok || switched.backend !== 'glsl') errors.push(`__portableSetBackend('glsl') failed: ${JSON.stringify(switched)}`);

    // A broken copy of the effect, served from a URL the viewer has not
    // loaded: the selection resolves to the compile error itself.
    await page.route('**/broken-effect/**', (route) => {
        const relative = new URL(route.request().url()).pathname.replace(/^\/broken-effect\//, '');
        let body = readFileSync(join(effectDir, relative), 'utf8');
        if (relative.endsWith('.glsl')) body = body.replace('void main', 'undeclaredType broken;\nvoid main');
        route.fulfill({ status: 200, contentType: 'text/plain', body });
    });
    expectingCompileError = true;
    const broken = await page.evaluate(() => window.__portableSelectEffect('broken', { url: '/broken-effect/' }));
    expectingCompileError = false;
    if (typeof broken?.error !== 'string' || !broken.error) errors.push(`a broken effect did not report its compile error: ${JSON.stringify(broken)}`);
    else console.log('OK: a broken effect reports its compile error');
    if (await page.evaluate(() => window.__portableCurrentEffect.id) !== 'broken') errors.push('__portableCurrentEffect does not follow the selection');

    console.log('OK: harness globals');

    await browser.close();
    server.close();

    if (errors.length > 0) {
        console.error('\nFAILED:');
        errors.forEach(err => console.error('  -', err));
        process.exit(1);
    }

    console.log('\nAll viewer checks passed');
    process.exit(0);
})();

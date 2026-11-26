/**
 * Viewer Hot-Reload Test
 *
 * Verifies the viewer's hot-reload polling watches shader files, not just
 * definition.json, and that ETag-only dev servers (like `npx serve`) drive
 * reloads. The shader and definition responses are served with request
 * interception so the shipped files are never modified; the "edit" is a
 * simulated validator change plus an updated shader body.
 *
 * Checks:
 *  1. Loading succeeds and the poll is stable while nothing changes.
 *  2. A shader validator (ETag) change triggers "Shader changes detected,
 *     reloading..." and the effect compiles again.
 *  3. No reload loop: the status settles back to Loaded and stays there.
 */

// Relocated from Portable (https://github.com/noisefactorllc/portable,
// test-hotreload.mjs at 6f211e44a0f2eb4baff1b9ae68893fa3b3554085), MIT License,
// Copyright (c) 2026 Noise Factor. It drives the package viewer in the demo,
// demo/shaders/package.html. Its assertions are unchanged. The server keeps
// Portable's /effect/ URL for the starter effect
// (scripts/lib/portable-viewer-server.mjs).
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileFor, startPortableViewerServer, VIEWER_PATH } from '../../scripts/lib/portable-viewer-server.mjs';

// Fail the whole test if it takes longer than 60s
setTimeout(() => {
    console.error('Test timed out after 60 seconds');
    process.exit(1);
}, 60000).unref();

const effectDir = fileFor('/effect/');

(async () => {
    const { server, port } = await startPortableViewerServer();
    console.log(`Server running at http://127.0.0.1:${port}/`);
    const errors = [];
    let expectLoadError = false;
    let shaderEtag = '"glsl-v1"';
    let shaderBody = null;
    const shaderGets = [];

    try {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        page.on('pageerror', (error) => {
            errors.push(error.message);
            console.error('Page error:', error.message);
        });
        page.on('console', (msg) => {
            const text = msg.text();
            if (msg.type() === 'error') {
                if (/WebGL Error 3744[0-9]/.test(text)) return;
                if (/Failed to load resource/.test(text)) return;
                // The deliberate compile-error probe surfaces via the
                // renderer's GLSL diagnostics and the viewer's error path;
                // it is asserted via the status element instead.
                if (expectLoadError && /Effect load error|\[GLSL (compile error|source)\]/.test(text)) return;
                errors.push(text);
                console.error('Console error:', text);
            }
        });

        // Serve the shipped definition.json with a stable validator.
        const definition = JSON.parse(readFileSync(join(effectDir, 'definition.json'), 'utf8'));
        await page.route('**/effect/definition.json', (route) => {
            const headers = { 'Content-Type': 'application/json', 'ETag': '"definition-v1"' };
            if (route.request().method() === 'HEAD') {
                route.fulfill({ status: 200, headers, body: '' });
            } else {
                route.fulfill({ status: 200, headers, body: JSON.stringify(definition) });
            }
        });

        // Serve the GLSL shader with a controllable ETag. WGSL passes through
        // to the static server (validator null there, must stay stable).
        await page.route('**/effect/glsl/gradientSweep.glsl', (route) => {
            const headers = { 'Content-Type': 'text/plain', 'ETag': shaderEtag };
            if (route.request().method() === 'HEAD') {
                route.fulfill({ status: 200, headers, body: '' });
            } else {
                let body = shaderBody;
                if (body === null) {
                    body = readFileSync(join(effectDir, 'glsl', 'gradientSweep.glsl'), 'utf8');
                    shaderBody = body;
                }
                shaderGets.push({ etag: shaderEtag, body });
                route.fulfill({ status: 200, headers, body });
            }
        });

        console.log('Loading viewer...');
        await page.goto(`http://127.0.0.1:${port}${VIEWER_PATH}?package=/effect/`, { waitUntil: 'networkidle' });

        await page.waitForFunction(() => {
            const el = document.getElementById('status');
            return el && el.className === 'success';
        }, null, { timeout: 20000 });
        const initial = await page.textContent('#status');
        console.log('Initial:', initial);
        if (!/Loaded/.test(initial)) errors.push(`Initial status not Loaded: ${initial}`);

        // Let several poll ticks run with no changes: the poll must be stable
        // (rebasing + unchanged validator) and not reload.
        await page.waitForTimeout(2500);
        const settled = await page.textContent('#status');
        if (settled !== initial) errors.push(`Poll tick changed status without an edit: ${settled}`);
        console.log('Stable after 2.5s:', settled);

        // Record status transitions before changing the validator. The reload
        // notice can be replaced by Loaded before a polling assertion sees it.
        await page.evaluate(() => {
            const status = document.getElementById('status');
            window.__hotReloadStatuses = [];
            new MutationObserver(() => {
                window.__hotReloadStatuses.push({
                    text: status.textContent,
                    className: status.className
                });
            }).observe(status, { childList: true, characterData: true, attributes: true, subtree: true });
        });

        // Simulate a shader edit: bump the ETag the poll compares and change
        // the shader body semantically (a constant red instead of the
        // gradient). The reload must re-fetch and compile the new body.
        shaderEtag = '"glsl-v2"';
        shaderBody = shaderBody.replace(
            'vec3 color = vec3(t, t * 0.6 + 0.2, 1.0 - t);',
            'vec3 color = vec3(1.0, 0.0, 0.0);');
        if (!shaderBody.includes('vec3(1.0, 0.0, 0.0)')) {
            errors.push('Semantic shader edit did not apply (fixture mismatch)');
        }

        await page.waitForFunction(() => window.__hotReloadStatuses.some(
            event => /Shader changes detected, reloading/.test(event.text)
        ), null, { timeout: 8000 });
        console.log('Reload trigger observed in status history');

        // The reload must compile the NEW body and settle back to Loaded...
        await page.waitForFunction(() => {
            const events = window.__hotReloadStatuses;
            const trigger = events.findIndex(event => /Shader changes detected, reloading/.test(event.text));
            if (trigger < 0 || !events.slice(trigger + 1).some(
                event => event.className === 'success' && /Loaded/.test(event.text)
            )) return false;
            const el = document.getElementById('status');
            return el && el.className === 'success' && /Loaded/.test(el.textContent || '');
        }, null, { timeout: 30000 });
        if (!shaderGets.some(({ etag, body }) => etag === '"glsl-v2"' &&
            body.includes('vec3 color = vec3(1.0, 0.0, 0.0);'))) {
            errors.push('Reload did not fetch the edited GLSL body');
        }
        console.log('Reloaded:', await page.textContent('#status'));

        // ...and stay there (no reload loop).
        const after = await page.textContent('#status');
        await page.waitForTimeout(5000);
        const later = await page.textContent('#status');
        if (later !== after) errors.push(`Status changed after reload (reload loop?): ${later}`);

        // A broken shader body must surface as an error after a reload,
        // proving the poll re-fetches and compiles the edited source.
        shaderEtag = '"glsl-v3"';
        shaderBody = 'precision highp float;\nthis is not valid glsl';
        expectLoadError = true;
        await page.waitForFunction(() => {
            const el = document.getElementById('status');
            return el && el.className === 'error';
        }, null, { timeout: 12000 });
        console.log('Compile-error probe observed:', await page.textContent('#status'));

        // Restoring a valid shader body must recover to Loaded.
        shaderEtag = '"glsl-v4"';
        shaderBody = readFileSync(join(effectDir, 'glsl', 'gradientSweep.glsl'), 'utf8');
        await page.waitForFunction(() => {
            const el = document.getElementById('status');
            return el && el.className === 'success' && /Loaded/.test(el.textContent || '');
        }, null, { timeout: 30000 });
        expectLoadError = false;
        console.log('Recovered:', await page.textContent('#status'));

        await browser.close();
    } catch (err) {
        errors.push(err.message);
    } finally {
        server.close();
    }

    if (errors.length > 0) {
        console.error('\nFAILED:');
        errors.forEach(err => console.error('  -', err));
        process.exit(1);
    }

    console.log('\nAll hot-reload checks passed');
    process.exit(0);
})();

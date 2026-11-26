// Relocated from Portable (https://github.com/noisefactorllc/portable,
// test-workspace.mjs at 6f211e44a0f2eb4baff1b9ae68893fa3b3554085), MIT License,
// Copyright (c) 2026 Noise Factor. Its assertions are unchanged; its imports
// name the files' Noisemaker homes, and the browser case loads the engine
// from this checkout's source in place of a released build.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
    parseWorkspace, serializeWorkspace, packWorkspace, unpackWorkspace,
    importSingleEffect, exportEffect, replaceEffect,
} from '../portable/workspace.mjs';

const legacy = Object.fromEntries(['definition.json', 'glsl/gradientSweep.glsl',
    'wgsl/gradientSweep.wgsl', 'help.md'].map(path =>
    [path, readFileSync(new URL(`../portable/examples/gradient-sweep/${path}`, import.meta.url), 'utf8')]));
const load = () => JSON.parse(readFileSync(new URL('../portable/fixtures/two-effect-workspace.json', import.meta.url), 'utf8'));

// A real image, kept as bytes from file to packed workspace and back.
const image = new Uint8Array(readFileSync(new URL('../portable/fixtures/hero.jpg', import.meta.url)));
const withImages = (bytes = image) => {
    const workspace = load();
    workspace.assets['images/hero.jpg'] = { encoding: 'binary', data: bytes.slice() };
    workspace.effects[1].files['textures/hero.jpg'] = { encoding: 'binary', data: bytes.slice() };
    return workspace;
};

test('two chained effects and parameter values survive save/reload', () => {
    const source = load();
    const restored = parseWorkspace(serializeWorkspace(source));
    assert.deepEqual(restored, source);
    assert.match(restored.composition.dsl, /gradientSweep\(speed: 2\).*tintFilter\(amount: 0.4\)/s);
    assert.deepEqual(restored.composition.effectIds, ['gradient', 'tint']);
    restored.effects[0].files['help.md'].data = 'changed';
    assert.notEqual(source.effects[0].files['help.md'].data, 'changed');
});

test('a workspace with images packs and unpacks with the image bytes intact', () => {
    const source = withImages();
    const packed = packWorkspace(source);
    const restored = unpackWorkspace(packed);
    assert.deepEqual(restored, source);
    assert.ok(restored.assets['images/hero.jpg'].data instanceof Uint8Array);
    assert.deepEqual(restored.assets['images/hero.jpg'].data, image);
    assert.deepEqual(restored.effects[1].files['textures/hero.jpg'].data, image);
    assert.deepEqual(packWorkspace(restored), packed, 'equal input packs to equal bytes');
    // The image travels as raw bytes in the archive, never as text.
    const text = new TextDecoder('latin1').decode(packed);
    assert.ok(text.includes(new TextDecoder('latin1').decode(image)));
    assert.ok(!text.includes(Buffer.from(image).toString('base64').slice(0, 64)));
});

test('images are never text: JSON saving refuses them and base64 is not an encoding', () => {
    assert.throws(() => serializeWorkspace(withImages()), /packWorkspace/);
    const encoded = load();
    encoded.assets['palette.bin'] = { encoding: 'base64', data: 'AAECA/8=' };
    assert.throws(() => serializeWorkspace(encoded), /utf8 or binary/);
    assert.throws(() => parseWorkspace(JSON.stringify(encoded)), /utf8 or binary/);
    const stringified = withImages();
    stringified.assets['images/hero.jpg'].data = 'not bytes';
    assert.throws(() => packWorkspace(stringified), /Uint8Array/);
});

test('a damaged, padded or incomplete packed workspace fails closed', () => {
    const packed = packWorkspace(withImages());
    const flipped = packed.slice();
    flipped[200] ^= 0xff;
    assert.throws(() => unpackWorkspace(flipped));
    assert.throws(() => unpackWorkspace(packed.slice(0, packed.length - 10)));
    assert.throws(() => unpackWorkspace(new TextEncoder().encode(serializeWorkspace(load()))));
});

test('legacy single-effect import preserves every file and its default DSL', () => {
    const result = importSingleEffect(legacy, { workspaceId: 'legacy-project', effectId: 'gradient' });
    assert.equal(result.version, 1);
    assert.equal(result.revision, 0);
    assert.equal(result.composition.dsl, JSON.parse(legacy['definition.json']).defaultProgram);
    assert.deepEqual(exportEffect(result, 'gradient'), Object.fromEntries(
        Object.entries(legacy).map(([path, data]) => [path, { encoding: 'utf8', data }])));
    assert.deepEqual(parseWorkspace(serializeWorkspace(result)), result);
});

test('legacy import needs explicit DSL when the effect has no default program', () => {
    const files = { ...legacy, 'definition.json': JSON.stringify({ func: 'gradientSweep' }) };
    assert.throws(() => importSingleEffect(files, { workspaceId: 'p', effectId: 'e' }), /composition.dsl/);
    const result = importSingleEffect(files, {
        workspaceId: 'p', effectId: 'e', dsl: 'search user\ngradientSweep().write(o0)\nrender(o0)',
    });
    assert.match(result.composition.dsl, /gradientSweep/);
});

test('targeted replacement produces a candidate without mutating the other effect or original', () => {
    const original = load();
    const before = structuredClone(original);
    const files = structuredClone(original.effects[1].files);
    files['glsl/tintFilter.glsl'].data += '\n// edited candidate\n';
    const candidate = replaceEffect(original, 'tint', files, { expectedRevision: 0 });
    assert.equal(candidate.revision, 1);
    assert.deepEqual(original, before);
    assert.deepEqual(candidate.effects[0], before.effects[0]);
    assert.deepEqual(candidate.composition, before.composition);
    assert.deepEqual(candidate.assets, before.assets);
    files['glsl/tintFilter.glsl'].data = 'later caller mutation';
    assert.match(candidate.effects[1].files['glsl/tintFilter.glsl'].data, /edited candidate/);
});

test('stale edits and unknown targets fail without mutating the workspace', () => {
    const original = load();
    const before = structuredClone(original);
    assert.throws(() => replaceEffect(original, 'tint', original.effects[1].files,
        { expectedRevision: 1 }), /revision conflict/);
    assert.throws(() => replaceEffect(original, 'missing', original.effects[1].files,
        { expectedRevision: 0 }), /unknown effect/);
    assert.throws(() => exportEffect(original, 'missing'), /unknown effect/);
    assert.deepEqual(original, before);
});

test('replacement cannot silently rename a DSL function and strand composition references', () => {
    const original = load();
    const files = structuredClone(original.effects[1].files);
    const definition = JSON.parse(files['definition.json'].data);
    definition.func = 'renamed';
    files['definition.json'].data = JSON.stringify(definition);
    assert.throws(() => replaceEffect(original, 'tint', files, { expectedRevision: 0 }), /function identity/);
});

test('unknown versions and duplicate effect IDs or function names are rejected', () => {
    for (const mutate of [
        w => { w.version = 2; },
        w => { w.format = 'some-other-format'; },
        w => { w.effects[1].id = w.effects[0].id; },
        w => { w.effects[1].files = structuredClone(w.effects[0].files); },
    ]) {
        const workspace = load();
        mutate(workspace);
        assert.throws(() => serializeWorkspace(workspace));
    }
});

test('composition dependencies must reference unique existing effect IDs', () => {
    for (const ids of [['missing'], ['gradient', 'gradient']]) {
        const workspace = load();
        workspace.composition.effectIds = ids;
        assert.throws(() => serializeWorkspace(workspace), /effectIds/);
    }
});

test('file paths cannot escape their package or use ambiguous path segments', () => {
    for (const path of ['../secret', '/absolute', 'C:/secret', 'a/../secret',
        'a//b', 'a/./b', 'a\\b', '__proto__/x', 'a\u0000b']) {
        const workspace = load();
        workspace.effects[0].files[path] = { encoding: 'utf8', data: 'bad' };
        assert.throws(() => serializeWorkspace(workspace), /path/);
    }
});

test('malformed file payloads, definitions and missing shader files fail closed', () => {
    for (const mutate of [
        w => { w.effects[0].files['definition.json'].data = '{'; },
        w => { w.effects[0].files['definition.json'].encoding = 'base64'; },
        w => { delete w.effects[0].files['definition.json']; },
        w => { delete w.effects[0].files['glsl/gradientSweep.glsl']; delete w.effects[0].files['wgsl/gradientSweep.wgsl']; },
        w => { w.effects[0].files['help.md'].data = null; },
        w => { w.revision = -1; },
        w => { w.revision = Number.MAX_SAFE_INTEGER + 1; },
    ]) {
        const workspace = load();
        mutate(workspace);
        assert.throws(() => serializeWorkspace(workspace));
    }
});

test('exported binary effect files are detached from the workspace', () => {
    const source = withImages(new Uint8Array([0, 1, 2, 255]));
    const before = structuredClone(source);
    const exported = exportEffect(source, 'tint');
    exported['textures/hero.jpg'].data.fill(0);
    exported['definition.json'].data = '{}';
    delete exported['glsl/tintFilter.glsl'];
    assert.deepEqual(source, before);
});

test('replacement candidates detach both unchanged assets and supplied binary files', () => {
    const source = withImages(new Uint8Array([0, 1, 2, 255]));
    const before = structuredClone(source);
    const files = structuredClone(source.effects[1].files);
    const supplied = structuredClone(files);
    const candidate = replaceEffect(source, 'tint', files, { expectedRevision: 0 });
    candidate.assets['images/hero.jpg'].data.fill(0);
    candidate.effects[1].files['textures/hero.jpg'].data.fill(1);
    assert.deepEqual(source, before);
    assert.deepEqual(files, supplied);
});

test('the saved two-effect fixture renders identically after browser import and reload', { timeout: 30000 }, async () => {
    // The page imports the codec and the engine from this checkout's source tree.
    const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
    const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
    const server = createServer((req, res) => {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (pathname === '/') {
            res.setHeader('Content-Type', 'text/html');
            res.end('<!doctype html><body></body>');
            return;
        }
        const file = pathname.includes('..') ? null : repoRoot + pathname.slice(1);
        try {
            if (!file || !statSync(file).isFile()) throw new Error('not a file');
            res.setHeader('Content-Type', types[extname(file)] || 'text/plain');
            res.end(readFileSync(file));
        } catch {
            res.statusCode = 404;
            res.end('Not found');
        }
    });
    let browser;
    try {
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        const result = await page.evaluate(async json => {
            const codec = await import('/shaders/portable/workspace.mjs');
            const { CanvasRenderer, Effect, mergeIntoEnums, registerStarterOps } = await import(
                '/shaders/src/index.js');
            const workspace = codec.parseWorkspace(json);
            async function render(workspace) {
                const canvas = document.createElement('canvas');
                canvas.width = 64; canvas.height = 64;
                document.body.appendChild(canvas);
                const renderer = new CanvasRenderer({ canvas, width: 64, height: 64,
                    basePath: `${location.origin}/shaders`, preferWebGPU: false });
                try {
                    await renderer.loadManifest();
                    for (const effect of workspace.effects) {
                        const def = JSON.parse(effect.files['definition.json'].data);
                        const instance = new Effect({ ...def, namespace: 'user' });
                        instance.starter = def.starter;
                        instance.shaders = {};
                        for (const [path, file] of Object.entries(effect.files)) {
                            const match = path.match(/^(glsl|wgsl)\/(.+)\.(?:glsl|wgsl)$/);
                            if (match) (instance.shaders[match[2]] ??= {})[match[1]] = file.data;
                        }
                        await mergeIntoEnums(renderer.registerEffectWithRuntime({ namespace: 'user', name: def.func, instance }));
                        if (def.starter) registerStarterOps([`user.${def.func}`]);
                    }
                    await renderer.compile(workspace.composition.dsl);
                    renderer.stop();
                    renderer.render(0.25);
                    const pixels = await renderer.pipeline.backend.readPixels(renderer.pipeline.surfaces.get('o0').read);
                    return Array.from(pixels.data);
                } finally { await renderer.dispose(); canvas.remove(); }
            }
            const before = await render(workspace);
            const after = await render(codec.parseWorkspace(codec.serializeWorkspace(workspace)));
            const noTint = structuredClone(workspace);
            noTint.composition.dsl = noTint.composition.dsl.replace('amount: 0.4', 'amount: 0');
            return { before, after, noTint: await render(noTint) };
        }, serializeWorkspace(load()));
        assert.deepEqual(result.after, result.before, 'save/reload preserves exact rendered pixels');
        assert(result.before.some((v, i) => i % 4 < 3 && v > 0), 'fixture renders visible color');
        assert.notDeepEqual(result.noTint, result.before, 'the second authored effect contributes to the composition');
    } finally {
        try { await browser?.close(); }
        finally { await new Promise(resolve => server.close(resolve)); }
    }
});

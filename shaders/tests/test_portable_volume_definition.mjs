// Relocated from Portable (https://github.com/noisefactorllc/portable,
// test-volume-definition.mjs at 6f211e44a0f2eb4baff1b9ae68893fa3b3554085), MIT
// License, Copyright (c) 2026 Noise Factor. It runs scripts/validate-portable.mjs,
// which checks a package as the engine does. Every case below is a legacy
// package, which "takes the legacy path unchanged" (docs/shaders/effects.rst:1051-1052).
// So the cases that only Portable's stricter validator refused now expect 0,
// each marked LEGACY below; the other assertions are unchanged.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Volume and geometry outputs, texture dimensions and the retired paramAliases,
// as the validator reads them in a legacy package.
const dir = await mkdtemp(join(tmpdir(), 'portable-volume-validation-'));
const validator = fileURLToPath(new URL('../../scripts/validate-portable.mjs', import.meta.url));
try {
    await mkdir(join(dir, 'glsl'));
    await writeFile(join(dir, 'glsl', 'main.glsl'), 'void main() {}');
    const base = { name: 'Volume', func: 'volume', starter: true,
        textures: { atlas: { width: 16, height: 256, format: 'rgba16f' } },
        passes: [{ name: 'fill', program: 'main', inputs: {}, outputs: { color: 'atlas' } }],
        outputTex3d: 'atlas' };
    for (const [label, patch, expected, message] of [
        ['valid volume', {}, 0],
        ['legacy 2D null outputs', { outputTex3d: null, outputGeo: null }, 0],
        // LEGACY. A version 2 package refuses a name the effect does not
        // declare (GAP-084, https://github.com/noisefactorllc/noisemaker/issues/440),
        // checked after these rows.
        ['missing volume output', { outputTex3d: 'missing' }, 0],
        ['missing geometry output', { outputGeo: 'missing' }, 0],
        // LEGACY: the engine loads and registers it (effects.rst:1051-1052)
        ['non-string volume output', { outputTex3d: true }, 0],
        // LEGACY: the engine loads and registers it (effects.rst:1051-1052)
        ['invalid default program', { defaultProgram: {} }, 0],
        // LEGACY: the engine loads and registers it (effects.rst:1051-1052)
        ['invalid texture dimension', { textures: { atlas: { width: 0, height: 256 } } }, 0],
        ...['screen', 'auto', '100%', '6.25%', { scale: 0.5, clamp: { min: 8, max: 512 } }, { screenDivide: 'zoom', default: 2 }]
            .map(width => [`runtime texture dimension ${JSON.stringify(width)}`, { textures: { atlas: { width } } }, 0]),
        // LEGACY: the engine loads and registers it (effects.rst:1051-1052). A
        // scale or multiply of 0 resolves to 1px in every profile (effects.rst:899).
        ...['oops%', '0%', { scale: 0 }, { screenDivide: '' }, { param: 'size', multiply: 0 }]
            .map(width => [`invalid texture dimension ${JSON.stringify(width)}`, { textures: { atlas: { width } } }, 0]),
        ['input volume passthrough', { starter: false, outputTex3d: 'inputTex3d', passes: [{ name: 'filter', program: 'main', inputs: { volume: 'inputTex3d' }, outputs: { color: 'atlas' } }] }, 0],
        ['geometry passthrough without a sampler', { starter: false, outputGeo: 'inputGeo', passes: [{ name: 'filter', program: 'main', inputs: { volume: 'inputTex3d' }, outputs: { color: 'atlas' } }] }, 0],
        // Noisemaker retired parameter aliases; registration rejects the field.
        ...[{ legacySize: 'volumeSize' }, {}, null].map(paramAliases =>
            [`retired paramAliases ${JSON.stringify(paramAliases)}`, { paramAliases }, 1,
                /FAIL: paramAliases is retired: use the canonical parameter names in the program/])
    ]) {
        await writeFile(join(dir, 'definition.json'), JSON.stringify({ ...base, ...patch }));
        const run = spawnSync(process.execPath, [validator, dir], { encoding: 'utf8', timeout: 10000 });
        assert.equal(run.status, expected, `${label}: ${run.stdout}${run.stderr}`);
        if (message) assert.match(run.stderr, message, `${label}: ${run.stdout}${run.stderr}`);
        console.log(`PASS ${label}`);
    }
    // A version 2 package refuses an outputTex3d or outputGeo that names no
    // texture of the effect (GAP-084), at that field.
    const v2 = { format: 'noisemaker-portable-effect', version: 2, name: 'Volume', func: 'volume', starter: true,
        textures: base.textures, passes: { fill: { program: 'main', inputs: {}, outputs: { color: 'atlas' } } } };
    for (const field of ['outputTex3d', 'outputGeo']) {
        const label = `version 2 missing ${field === 'outputTex3d' ? 'volume' : 'geometry'} output`;
        await writeFile(join(dir, 'definition.json'), JSON.stringify({ ...v2, outputTex3d: 'atlas', [field]: 'missing' }));
        const run = spawnSync(process.execPath, [validator, dir], { encoding: 'utf8', timeout: 10000 });
        assert.equal(run.status, 1, `${label}: ${run.stdout}${run.stderr}`);
        assert.match(run.stderr, new RegExp(`FAIL: ${field} names "missing".* at ${field}\\)`), `${label}: ${run.stdout}${run.stderr}`);
        console.log(`PASS ${label}`);
    }
} finally { await rm(dir, { recursive: true, force: true }); }

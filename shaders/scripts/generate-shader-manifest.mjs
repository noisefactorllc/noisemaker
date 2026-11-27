#!/usr/bin/env node
/**
 * Generate a single top-level shader manifest for all effects. Each effect's
 * metadata comes through the catalog reader, the same from its
 * definition.json as from its legacy definition.js.
 */

import { readdirSync, existsSync, writeFileSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { baselineExportShapes, readCatalogMetadata } from '../../scripts/lib/portable-catalog.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..', '..');
const EFFECTS_ROOT = join(PROJECT_ROOT, 'shaders', 'effects');
const OUTPUT_FILE = join(EFFECTS_ROOT, 'manifest.json');

// Known pipeline inputs that indicate a non-starter effect
const PIPELINE_INPUTS = new Set([
    'inputTex', 'inputTex3d',
    'inputXyz', 'inputVel', 'inputRgba',
    'o0', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7',
]);

// Agent state surfaces — reading these without defining them means NOT a starter
const AGENT_STATE_SURFACES = new Set([
    'global_xyz0', 'global_vel0', 'global_rgba0',
]);

// Whether an effect starts a chain: explicitly, or because no pass reads a
// pipeline input or an agent state surface that it does not define.
function isStarterEffect(definition) {
    if (typeof definition.starter === 'boolean') return definition.starter;
    if (!Array.isArray(definition.passes)) return true;
    const textures = Object.keys(definition.textures ?? {});
    const definesAgentSurfaces = textures.some(name => AGENT_STATE_SURFACES.has(name));
    for (const pass of definition.passes) {
        for (const input of Object.values(pass?.inputs ?? {})) {
            if (PIPELINE_INPUTS.has(input)) return false;
            if (!definesAgentSurfaces && AGENT_STATE_SURFACES.has(input)) return false;
        }
    }
    return true;
}

const text = value => (typeof value === 'string' && value ? value : null);

function scanEffect(effectDir) {
    const result = { glsl: {}, wgsl: {} };

    const glslDir = join(effectDir, 'glsl');
    if (existsSync(glslDir)) {
        for (const name of readdirSync(glslDir)) {
            const fullPath = join(glslDir, name);
            if (!statSync(fullPath).isFile()) continue;
            if (name.endsWith('.glsl')) {
                const stem = name.slice(0, -5);
                result.glsl[stem] = 'combined';
            } else if (name.endsWith('.vert')) {
                const stem = name.slice(0, -5);
                if (!(stem in result.glsl)) result.glsl[stem] = {};
                if (typeof result.glsl[stem] === 'object') result.glsl[stem].v = 1;
            } else if (name.endsWith('.frag')) {
                const stem = name.slice(0, -5);
                if (!(stem in result.glsl)) result.glsl[stem] = {};
                if (typeof result.glsl[stem] === 'object') result.glsl[stem].f = 1;
            }
        }
    }

    const wgslDir = join(effectDir, 'wgsl');
    if (existsSync(wgslDir)) {
        for (const name of readdirSync(wgslDir)) {
            const fullPath = join(wgslDir, name);
            if (!statSync(fullPath).isFile()) continue;
            if (name.endsWith('.wgsl')) {
                const stem = name.slice(0, -5);
                result.wgsl[stem] = 1;
            }
        }
    }

    if (!Object.keys(result.glsl).length) delete result.glsl;
    if (!Object.keys(result.wgsl).length) delete result.wgsl;

    return result;
}

function sortKeys(obj) {
    if (Array.isArray(obj)) return obj.map(sortKeys);
    if (obj && typeof obj === 'object') {
        const sorted = {};
        for (const key of Object.keys(obj).sort()) {
            sorted[key] = sortKeys(obj[key]);
        }
        return sorted;
    }
    return obj;
}

/**
 * The manifest of the effects under `effectsRoot`, with its keys sorted, as
 * main() writes it.
 */
export async function buildManifest(effectsRoot = EFFECTS_ROOT, { exportShapes = baselineExportShapes().shapes } = {}) {
    const manifest = {};
    const shapes = exportShapes;

    const namespaces = [
        'classicNoisedeck', 'filter', 'filter3d',
        'mixer', 'points', 'render', 'synth', 'synth3d',
    ];

    for (const namespace of namespaces) {
        const nsDir = join(effectsRoot, namespace);
        if (!existsSync(nsDir)) continue;

        const entries = readdirSync(nsDir).sort();
        for (const entry of entries) {
            const effectDir = join(nsDir, entry);
            if (!statSync(effectDir).isDirectory()) continue;
            if (!existsSync(join(effectDir, 'definition.js'))) continue;

            const effectId = `${namespace}/${entry}`;
            const effectManifest = scanEffect(effectDir);

            // The effect's metadata, from its definition.json or its legacy
            // definition.js, through the catalog reader.
            const definition = await readCatalogMetadata(effectDir, { exportShapes: shapes });

            const description = text(definition.description);
            if (description) effectManifest.description = description;

            effectManifest.starter = isStarterEffect(definition);

            const externalTexture = text(definition.externalTexture);
            if (externalTexture) effectManifest.externalTexture = externalTexture;

            const externalMesh = text(definition.externalMesh);
            if (externalMesh) effectManifest.externalMesh = externalMesh;

            if (definition.globals?.tex?.type === 'surface') effectManifest.hasTex = true;

            if (Array.isArray(definition.tags) && definition.tags.length) effectManifest.tags = [...definition.tags];

            if (definition.hidden === true) {
                effectManifest.hidden = true;
                const deprecatedBy = text(definition.deprecatedBy);
                if (deprecatedBy) effectManifest.deprecatedBy = deprecatedBy;
            }

            manifest[effectId] = effectManifest;
        }
    }

    return sortKeys(manifest);
}

async function main() {
    const manifest = await buildManifest();
    writeFileSync(OUTPUT_FILE, JSON.stringify(manifest));
    console.log(`Generated ${OUTPUT_FILE} (${Object.keys(manifest).length} effects)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

#!/usr/bin/env node
/**
 * Generate a single top-level shader manifest for all effects.
 * Node.js equivalent of generate_shader_manifest.py — same logic, same output.
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..', '..');
const EFFECTS_ROOT = join(PROJECT_ROOT, 'shaders', 'effects');
const OUTPUT_FILE = join(EFFECTS_ROOT, 'manifest.json');

// Regex to extract description from definition.js
// Matches both object literal (description: "...") and class field (description = "...") syntax
// Handles escaped quotes within the string
const DESCRIPTION_RE = /description[:\s=]+"((?:[^"\\]|\\.)*)"|description[:\s=]+'((?:[^'\\]|\\.)*)'/;

// Regex to extract externalTexture from definition.js
const EXTERNAL_TEXTURE_RE = /externalTexture[:\s=]+"((?:[^"\\]|\\.)*)"|externalTexture[:\s=]+'((?:[^'\\]|\\.)*)'/;

// Regex to extract externalMesh from definition.js
const EXTERNAL_MESH_RE = /externalMesh[:\s=]+"((?:[^"\\]|\\.)*)"|externalMesh[:\s=]+'((?:[^'\\]|\\.)*)'/;

// Regex to extract tags array from definition.js
const TAGS_RE = /\btags\s*[:=]\s*\[([^\]]*)\]/;

// Regex to detect hidden: true
const HIDDEN_RE = /\bhidden\s*[:=]\s*true\b/;

// Regex to extract deprecatedBy from definition.js
const DEPRECATED_BY_RE = /deprecatedBy[:\s=]+"((?:[^"\\]|\\.)*)"|deprecatedBy[:\s=]+'((?:[^'\\]|\\.)*)'/;

// Regex to detect tex global with type: "surface"
const TEX_SURFACE_RE = /\btex\s*[:=]\s*\{[^}]*type\s*[:=]\s*["']surface["']/s;

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

function readDefinition(effectDir) {
    const defFile = join(effectDir, 'definition.js');
    if (!existsSync(defFile)) return null;
    try {
        return readFileSync(defFile, 'utf-8');
    } catch {
        return null;
    }
}

function extractMatch(content, re) {
    const m = content.match(re);
    if (!m) return null;
    const raw = m[1] !== undefined ? m[1] : m[2];
    if (!raw) return null;
    return raw.replace(/\\"/g, '"').replace(/\\'/g, "'");
}

function extractDescription(effectDir) {
    const content = readDefinition(effectDir);
    return content ? extractMatch(content, DESCRIPTION_RE) : null;
}

function extractExternalTexture(effectDir) {
    const content = readDefinition(effectDir);
    return content ? extractMatch(content, EXTERNAL_TEXTURE_RE) : null;
}

function extractExternalMesh(effectDir) {
    const content = readDefinition(effectDir);
    return content ? extractMatch(content, EXTERNAL_MESH_RE) : null;
}

function hasTexSurface(effectDir) {
    const content = readDefinition(effectDir);
    return content ? TEX_SURFACE_RE.test(content) : false;
}

function isHidden(effectDir) {
    const content = readDefinition(effectDir);
    return content ? HIDDEN_RE.test(content) : false;
}

function extractTags(effectDir) {
    const content = readDefinition(effectDir);
    if (!content) return null;
    const m = content.match(TAGS_RE);
    if (!m) return null;
    const tags = [];
    for (const tm of m[1].matchAll(/["']([^"']+)["']/g)) {
        tags.push(tm[1]);
    }
    return tags.length ? tags : null;
}

function isStarterEffect(effectDir) {
    const content = readDefinition(effectDir);
    if (!content) return null;

    // Look for passes array
    const passesMatch = content.match(/passes\s*[=:]\s*\[/);
    if (!passesMatch) return true;

    // Check if effect defines agent state surfaces
    const texturesMatch = content.match(/textures\s*[:=]\s*\{[\s\S]*?\}/);
    let definesAgentSurfaces = false;
    if (texturesMatch) {
        for (const surface of AGENT_STATE_SURFACES) {
            if (texturesMatch[0].includes(surface)) {
                definesAgentSurfaces = true;
                break;
            }
        }
    }

    // Find inputs sections and check for pipeline inputs as VALUES
    const inputsSections = content.matchAll(/inputs:\s*\{[\s\S]*?\}/g);
    for (const inputsMatch of inputsSections) {
        const inputs = inputsMatch[0];
        for (const pipelineInput of PIPELINE_INPUTS) {
            const pattern = new RegExp(`:\\s*["']${pipelineInput}["']`);
            if (pattern.test(inputs)) return false;
        }
        if (!definesAgentSurfaces) {
            for (const surface of AGENT_STATE_SURFACES) {
                const pattern = new RegExp(`:\\s*["']${surface}["']`);
                if (pattern.test(inputs)) return false;
            }
        }
    }

    return true;
}

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

function main() {
    const manifest = {};

    const namespaces = [
        'classicNoisedeck', 'classicNoisemaker', 'filter', 'filter3d',
        'mixer', 'points', 'render', 'synth', 'synth3d',
    ];

    for (const namespace of namespaces) {
        const nsDir = join(EFFECTS_ROOT, namespace);
        if (!existsSync(nsDir)) continue;

        const entries = readdirSync(nsDir).sort();
        for (const entry of entries) {
            const effectDir = join(nsDir, entry);
            if (!statSync(effectDir).isDirectory()) continue;
            if (!existsSync(join(effectDir, 'definition.js'))) continue;

            const effectId = `${namespace}/${entry}`;
            const effectManifest = scanEffect(effectDir);

            const description = extractDescription(effectDir);
            if (description) effectManifest.description = description;

            const starter = isStarterEffect(effectDir);
            if (starter !== null) effectManifest.starter = starter;

            const externalTexture = extractExternalTexture(effectDir);
            if (externalTexture) effectManifest.externalTexture = externalTexture;

            const externalMesh = extractExternalMesh(effectDir);
            if (externalMesh) effectManifest.externalMesh = externalMesh;

            if (hasTexSurface(effectDir)) effectManifest.hasTex = true;

            const tags = extractTags(effectDir);
            if (tags) effectManifest.tags = tags;

            if (isHidden(effectDir)) {
                effectManifest.hidden = true;
                const content = readDefinition(effectDir);
                if (content) {
                    const deprecatedBy = extractMatch(content, DEPRECATED_BY_RE);
                    if (deprecatedBy) effectManifest.deprecatedBy = deprecatedBy;
                }
            }

            manifest[effectId] = effectManifest;
        }
    }

    writeFileSync(OUTPUT_FILE, JSON.stringify(sortKeys(manifest)));

    console.log(`Generated ${OUTPUT_FILE} (${Object.keys(manifest).length} effects)`);
}

main();

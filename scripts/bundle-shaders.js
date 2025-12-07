#!/usr/bin/env node
/**
 * Build single-file Noisemaker Shader bundles with esbuild.
 *
 * Produces one bundle per effects namespace with shader sources inlined.
 * Also produces a core runtime bundle and an all-in-one bundle.
 *
 * Output structure:
 *   dist/shaders/
 *     noisemaker-shaders-core.esm.js       - Runtime only (no effects)
 *     noisemaker-shaders-core.min.js       - Runtime only, minified IIFE
 *     noisemaker-shaders-<namespace>.esm.js - Per-namespace effect bundles
 *     noisemaker-shaders-<namespace>.min.js - Per-namespace IIFE bundles
 *     noisemaker-shaders-all.esm.js         - All namespaces combined
 *     noisemaker-shaders-all.min.js         - All namespaces combined, minified
 *
 * Usage:
 *   node scripts/bundle-shaders.js [--namespace <name>] [--all]
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { build } from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const shadersDir = path.join(repoRoot, 'shaders')
const effectsDir = path.join(shadersDir, 'effects')
const srcDir = path.join(shadersDir, 'src')
const distDir = path.join(repoRoot, 'dist', 'shaders')

// Read manifest to know what shaders exist
const manifestPath = path.join(effectsDir, 'manifest.json')

/**
 * Discover all effect namespaces from the effects directory
 */
function discoverNamespaces() {
    const entries = fs.readdirSync(effectsDir, { withFileTypes: true })
    return entries
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort()
}

/**
 * Discover all effects within a namespace
 */
function discoverEffects(namespace) {
    const nsDir = path.join(effectsDir, namespace)
    if (!fs.existsSync(nsDir)) return []

    const entries = fs.readdirSync(nsDir, { withFileTypes: true })
    return entries
        .filter(e => e.isDirectory())
        .filter(e => fs.existsSync(path.join(nsDir, e.name, 'definition.js')))
        .map(e => e.name)
        .sort()
}

/**
 * Read shader source from file
 */
function readShaderSource(filePath) {
    if (!fs.existsSync(filePath)) return null
    return fs.readFileSync(filePath, 'utf8')
}

/**
 * Load shader sources for an effect based on manifest
 */
function loadEffectShaders(namespace, effectName, manifest) {
    const effectId = `${namespace}/${effectName}`
    const effectManifest = manifest[effectId]
    const effectDir = path.join(effectsDir, namespace, effectName)

    if (!effectManifest) return {}

    const shaders = {}

    // Load GLSL shaders
    if (effectManifest.glsl) {
        for (const [prog, info] of Object.entries(effectManifest.glsl)) {
            if (!shaders[prog]) shaders[prog] = {}

            if (info === 'combined') {
                const src = readShaderSource(path.join(effectDir, 'glsl', `${prog}.glsl`))
                if (src) shaders[prog].glsl = src
            } else if (typeof info === 'object') {
                if (info.v) {
                    const src = readShaderSource(path.join(effectDir, 'glsl', `${prog}.vert`))
                    if (src) shaders[prog].vertex = src
                }
                if (info.f) {
                    const src = readShaderSource(path.join(effectDir, 'glsl', `${prog}.frag`))
                    if (src) shaders[prog].fragment = src
                }
            }
        }
    }

    // Load WGSL shaders
    if (effectManifest.wgsl) {
        for (const [prog, info] of Object.entries(effectManifest.wgsl)) {
            if (!shaders[prog]) shaders[prog] = {}

            if (info === 1 || info === 'combined') {
                const src = readShaderSource(path.join(effectDir, 'wgsl', `${prog}.wgsl`))
                if (src) shaders[prog].wgsl = src
            }
        }
    }

    return shaders
}

/**
 * Calculate relative path from temp dir to target
 */
function relPath(target) {
    const tempDir = path.join(distDir, '.temp')
    return path.relative(tempDir, target).replace(/\\/g, '/')
}

/**
 * Generate a virtual module that exports all effects in a namespace with inlined shaders
 */
function generateNamespaceModule(namespace, manifest) {
    const effects = discoverEffects(namespace)
    if (effects.length === 0) return null

    const imports = []
    const exports = []
    const shaderData = {}

    for (const effectName of effects) {
        const varName = effectName.replace(/[^a-zA-Z0-9]/g, '_')
        const effectPath = relPath(path.join(effectsDir, namespace, effectName, 'definition.js'))

        imports.push(`import ${varName}_def from '${effectPath}';`)

        // Load shader sources
        const shaders = loadEffectShaders(namespace, effectName, manifest)
        shaderData[effectName] = shaders

        exports.push(`  "${effectName}": ${varName}_def`)
    }

    // Generate the module content
    const code = `
// Auto-generated namespace bundle for: ${namespace}
// Contains ${effects.length} effects with inlined shaders

${imports.join('\n')}

// Shader sources - inlined at build time
const SHADER_SOURCES = ${JSON.stringify(shaderData, null, 2)};

// Apply shaders to effect definitions
function applyShaders(effectDef, shaders) {
    if (!effectDef || !shaders || Object.keys(shaders).length === 0) return;
    if (!effectDef.shaders) effectDef.shaders = {};
    for (const [prog, sources] of Object.entries(shaders)) {
        effectDef.shaders[prog] = { ...sources };
    }
}

${effects.map(effectName => {
    const varName = effectName.replace(/[^a-zA-Z0-9]/g, '_')
    return `applyShaders(${varName}_def, SHADER_SOURCES["${effectName}"]);`
}).join('\n')}

// Export effects map
export const effects = {
${exports.join(',\n')}
};

// Export namespace name
export const namespace = "${namespace}";

// Export effect count
export const count = ${effects.length};

// Register all effects with runtime (if available)
export function registerAll(registerFn) {
    for (const [name, def] of Object.entries(effects)) {
        registerFn(\`${namespace}/\${name}\`, def);
    }
}

export default { namespace, effects, count, registerAll };
`

    return code
}

/**
 * Generate the core runtime entry point
 */
function generateCoreModule() {
    const srcPath = relPath(path.join(srcDir, 'index.js'))
    return `
// Noisemaker Shader Runtime - Core Module
// Re-exports the shader runtime without any effects

export * from '${srcPath}';
`
}

/**
 * Generate an all-in-one module combining core + all namespaces
 */
function generateAllModule(namespaces) {
    const imports = []
    const registrations = []

    for (const ns of namespaces) {
        const effects = discoverEffects(ns)
        if (effects.length === 0) continue

        const varName = ns.replace(/[^a-zA-Z0-9]/g, '_')
        imports.push(`import * as ${varName}_ns from './ns-${ns}.js';`)
        registrations.push(`  ${varName}_ns.registerAll(registerEffect);`)
    }

    const srcIndexPath = relPath(path.join(srcDir, 'index.js'))
    const registryPath = relPath(path.join(srcDir, 'runtime', 'registry.js'))

    return `
// Noisemaker Shaders - All-in-One Bundle
// Contains core runtime + all effect namespaces

export * from '${srcIndexPath}';
import { registerEffect } from '${registryPath}';

${imports.join('\n')}

// Register all effects from all namespaces
${registrations.join('\n')}

// Re-export namespace bundles
${namespaces.filter(ns => discoverEffects(ns).length > 0).map(ns => {
    const varName = ns.replace(/[^a-zA-Z0-9]/g, '_')
    return `export { effects as ${varName}Effects } from './ns-${ns}.js';`
}).join('\n')}
`
}

/**
 * Build bundles for a single namespace
 */
async function buildNamespaceBundle(namespace, manifest) {
    const moduleCode = generateNamespaceModule(namespace, manifest)
    if (!moduleCode) {
        console.log(`  ⚠ No effects found in namespace: ${namespace}`)
        return
    }

    // Write virtual module to temp location
    const tempDir = path.join(distDir, '.temp')
    fs.mkdirSync(tempDir, { recursive: true })

    const tempFile = path.join(tempDir, `ns-${namespace}.js`)
    fs.writeFileSync(tempFile, moduleCode)

    const banner = `/**\n * Noisemaker Shaders - ${namespace} namespace\n * Bundled on ${new Date().toISOString()}\n */`

    const sharedOptions = {
        entryPoints: [tempFile],
        bundle: true,
        platform: 'browser',
        target: ['es2020'],
        legalComments: 'none',
        logLevel: 'warning',
    }

    // ESM build
    await build({
        ...sharedOptions,
        format: 'esm',
        outfile: path.join(distDir, `noisemaker-shaders-${namespace}.esm.js`),
        minify: false,
        banner: { js: banner },
    })

    // Minified IIFE build
    await build({
        ...sharedOptions,
        format: 'iife',
        globalName: `NoisemakerShaders_${namespace.replace(/[^a-zA-Z0-9]/g, '_')}`,
        outfile: path.join(distDir, `noisemaker-shaders-${namespace}.min.js`),
        minify: true,
        banner: { js: banner },
    })

    const effects = discoverEffects(namespace)
    console.log(`  ✓ ${namespace} (${effects.length} effects)`)
}

/**
 * Build the core runtime bundle (no effects)
 */
async function buildCoreBundle() {
    const tempDir = path.join(distDir, '.temp')
    fs.mkdirSync(tempDir, { recursive: true })

    const tempFile = path.join(tempDir, 'core.js')
    fs.writeFileSync(tempFile, generateCoreModule())

    const banner = `/**\n * Noisemaker Shaders - Core Runtime\n * Bundled on ${new Date().toISOString()}\n */`

    const sharedOptions = {
        entryPoints: [tempFile],
        bundle: true,
        platform: 'browser',
        target: ['es2020'],
        legalComments: 'none',
        logLevel: 'warning',
    }

    // ESM build
    await build({
        ...sharedOptions,
        format: 'esm',
        outfile: path.join(distDir, 'noisemaker-shaders-core.esm.js'),
        minify: false,
        banner: { js: banner },
    })

    // Minified IIFE build
    await build({
        ...sharedOptions,
        format: 'iife',
        globalName: 'NoisemakerShadersCore',
        outfile: path.join(distDir, 'noisemaker-shaders-core.min.js'),
        minify: true,
        banner: { js: banner },
    })

    console.log('  ✓ core (runtime only)')
}

/**
 * Build the all-in-one bundle
 */
async function buildAllBundle(namespaces, manifest) {
    const tempDir = path.join(distDir, '.temp')
    fs.mkdirSync(tempDir, { recursive: true })

    // First, write all namespace modules
    for (const ns of namespaces) {
        const moduleCode = generateNamespaceModule(ns, manifest)
        if (moduleCode) {
            fs.writeFileSync(path.join(tempDir, `ns-${ns}.js`), moduleCode)
        }
    }

    // Write the all-in-one module
    const allCode = generateAllModule(namespaces)
    const tempFile = path.join(tempDir, 'all.js')
    fs.writeFileSync(tempFile, allCode)

    const banner = `/**\n * Noisemaker Shaders - Complete Bundle\n * All namespaces with inlined shaders\n * Bundled on ${new Date().toISOString()}\n */`

    const sharedOptions = {
        entryPoints: [tempFile],
        bundle: true,
        platform: 'browser',
        target: ['es2020'],
        legalComments: 'none',
        logLevel: 'warning',
    }

    // ESM build
    await build({
        ...sharedOptions,
        format: 'esm',
        outfile: path.join(distDir, 'noisemaker-shaders-all.esm.js'),
        minify: false,
        banner: { js: banner },
    })

    // Minified IIFE build
    await build({
        ...sharedOptions,
        format: 'iife',
        globalName: 'NoisemakerShaders',
        outfile: path.join(distDir, 'noisemaker-shaders-all.min.js'),
        minify: true,
        banner: { js: banner },
    })

    const totalEffects = namespaces.reduce((sum, ns) => sum + discoverEffects(ns).length, 0)
    console.log(`  ✓ all (${namespaces.length} namespaces, ${totalEffects} effects total)`)
}

/**
 * Clean up temp files
 */
function cleanup() {
    const tempDir = path.join(distDir, '.temp')
    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true })
    }
}

/**
 * Main entry point
 */
async function main() {
    const args = process.argv.slice(2)
    const specificNamespace = args.includes('--namespace')
        ? args[args.indexOf('--namespace') + 1]
        : null
    const buildAllNamespaces = args.includes('--all') || !specificNamespace
    const skipAll = args.includes('--skip-all-bundle')

    console.log('Bundling Noisemaker Shaders with esbuild...')

    // Read manifest
    if (!fs.existsSync(manifestPath)) {
        console.error(`Manifest not found: ${manifestPath}`)
        console.error('Run: node shaders/scripts/generate-manifest.js')
        process.exit(1)
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

    // Ensure output directory exists
    fs.mkdirSync(distDir, { recursive: true })

    // Discover namespaces
    const allNamespaces = discoverNamespaces()
    const namespacesToBuild = specificNamespace
        ? [specificNamespace]
        : allNamespaces

    try {
        // Build core runtime
        console.log('\nBuilding core runtime...')
        await buildCoreBundle()

        // Build namespace bundles
        console.log('\nBuilding namespace bundles...')
        for (const ns of namespacesToBuild) {
            await buildNamespaceBundle(ns, manifest)
        }

        // Build all-in-one bundle (if building all namespaces)
        if (buildAllNamespaces && !skipAll) {
            console.log('\nBuilding combined bundle...')
            await buildAllBundle(allNamespaces, manifest)
        }

        console.log('\n✓ Shader bundles written to dist/shaders/')

        // List output files
        const outputs = fs.readdirSync(distDir)
            .filter(f => f.endsWith('.js'))
            .sort()
        for (const f of outputs) {
            const stats = fs.statSync(path.join(distDir, f))
            const sizeKb = (stats.size / 1024).toFixed(1)
            console.log(`  - ${f} (${sizeKb} KB)`)
        }

    } finally {
        cleanup()
    }
}

main().catch((err) => {
    console.error(err)
    cleanup()
    process.exit(1)
})

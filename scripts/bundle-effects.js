#!/usr/bin/env node
/**
 * Build individual mini-bundles for each shader effect with esbuild.
 *
 * Each effect gets a single self-contained bundle with:
 * - The effect definition
 * - All shader sources (GLSL/WGSL) inlined and minified
 * - Help documentation (help.md)
 *
 * Output structure:
 *   dist/effects/{namespace}/{effectName}.js
 *
 * Usage:
 *   node scripts/bundle-effects.js [--namespace <name>] [--effect <name>]
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { build } from 'esbuild'
import { minifyShader } from './shader-minifier.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const shadersDir = path.join(repoRoot, 'shaders')
const effectsDir = path.join(shadersDir, 'effects')
const distDir = path.join(repoRoot, 'dist', 'effects')

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
 * Read help.md file for an effect
 */
function readHelpFile(namespace, effectName) {
    const helpPath = path.join(effectsDir, namespace, effectName, 'help.md')
    if (!fs.existsSync(helpPath)) return null
    return fs.readFileSync(helpPath, 'utf8')
}

/**
 * Load all shader sources for an effect based on manifest (minified)
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
                if (src) shaders[prog].glsl = minifyShader(src)
            } else if (typeof info === 'object') {
                if (info.v) {
                    const src = readShaderSource(path.join(effectDir, 'glsl', `${prog}.vert`))
                    if (src) shaders[prog].vertex = minifyShader(src)
                }
                if (info.f) {
                    const src = readShaderSource(path.join(effectDir, 'glsl', `${prog}.frag`))
                    if (src) shaders[prog].fragment = minifyShader(src)
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
                if (src) shaders[prog].wgsl = minifyShader(src)
            }
        }
    }

    return shaders
}

/**
 * Calculate relative path from temp dir to target
 */
function relPath(tempDir, target) {
    return path.relative(tempDir, target).replace(/\\/g, '/')
}

/**
 * Generate a self-contained effect module with inlined shaders
 */
function generateEffectModule(namespace, effectName, manifest, tempDir) {
    const effectDir = path.join(effectsDir, namespace, effectName)
    const definitionPath = relPath(tempDir, path.join(effectDir, 'definition.js'))
    const shaders = loadEffectShaders(namespace, effectName, manifest)
    const helpContent = readHelpFile(namespace, effectName)

    const code = `
// Mini-bundle for effect: ${namespace}/${effectName}
// Contains definition + inlined shader sources + help

import effectDef from '${definitionPath}';

// Shader sources - inlined at build time
const SHADER_SOURCES = ${JSON.stringify(shaders, null, 2)};

// Help documentation - inlined at build time
export const help = ${helpContent ? JSON.stringify(helpContent) : 'null'};

// Apply shaders to effect definition
if (effectDef && Object.keys(SHADER_SOURCES).length > 0) {
    if (!effectDef.shaders) effectDef.shaders = {};
    for (const [prog, sources] of Object.entries(SHADER_SOURCES)) {
        effectDef.shaders[prog] = { ...sources };
    }
}

// Attach help to effect definition
if (effectDef && help) {
    effectDef.help = help;
}

// Export effect ID for registration
export const effectId = "${namespace}/${effectName}";
export const namespace = "${namespace}";
export const effectName = "${effectName}";

// Export the effect definition
export default effectDef;
`

    return code
}

/**
 * Build mini-bundle for a single effect
 */
async function buildEffectBundle(namespace, effectName, manifest) {
    const tempDir = path.join(distDir, '.temp', namespace)
    fs.mkdirSync(tempDir, { recursive: true })

    const moduleCode = generateEffectModule(namespace, effectName, manifest, tempDir)
    const tempFile = path.join(tempDir, `${effectName}.entry.js`)
    fs.writeFileSync(tempFile, moduleCode)

    const outDir = path.join(distDir, namespace)
    fs.mkdirSync(outDir, { recursive: true })

    const banner = `/* ${namespace}/${effectName} */`

    // ESM build, minified (for dynamic import)
    await build({
        entryPoints: [tempFile],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: ['es2020'],
        outfile: path.join(outDir, `${effectName}.js`),
        minify: true,
        legalComments: 'none',
        logLevel: 'warning',
        banner: { js: banner },
    })
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
    const specificEffect = args.includes('--effect')
        ? args[args.indexOf('--effect') + 1]
        : null

    console.log('Building effect mini-bundles with esbuild...')

    // Read manifest
    if (!fs.existsSync(manifestPath)) {
        console.error(`Manifest not found: ${manifestPath}`)
        console.error('Run: node shaders/scripts/generate-manifest.js')
        process.exit(1)
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

    // Ensure output directory exists
    fs.mkdirSync(distDir, { recursive: true })

    // Discover namespaces and effects
    const allNamespaces = discoverNamespaces()
    const namespacesToBuild = specificNamespace ? [specificNamespace] : allNamespaces

    let builtEffects = 0

    try {
        for (const ns of namespacesToBuild) {
            const effects = discoverEffects(ns)
            const effectsToBuild = specificEffect
                ? effects.filter(e => e === specificEffect)
                : effects

            if (effectsToBuild.length === 0) continue
            console.log(`\nBuilding ${ns}/ (${effectsToBuild.length} effects)...`)

            for (const effectName of effectsToBuild) {
                await buildEffectBundle(ns, effectName, manifest)
                builtEffects++
                process.stdout.write(`  ✓ ${effectName}\n`)
            }
        }

        console.log(`\n✓ Built ${builtEffects} effect bundles in dist/effects/`)

        // Summary by namespace
        for (const ns of namespacesToBuild) {
            const outDir = path.join(distDir, ns)
            if (!fs.existsSync(outDir)) continue

            const files = fs.readdirSync(outDir).filter(f => f.endsWith('.js'))
            const totalSize = files.reduce((sum, f) => {
                return sum + fs.statSync(path.join(outDir, f)).size
            }, 0)
            console.log(`  - ${ns}/: ${files.length} effects (${(totalSize / 1024).toFixed(1)} KB total)`)
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

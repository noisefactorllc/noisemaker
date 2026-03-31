#!/usr/bin/env node
/**
 * Build individual mini-bundles for each shader effect with esbuild.
 *
 * Each effect gets a single self-contained bundle with:
 * - The effect definition
 * - All shader sources (GLSL/WGSL) inlined (optionally minified)
 * - Help documentation (help.md) with auto-generated Usage section
 *
 * Output structure:
 *   dist/effects/{namespace}/{effectName}.js
 *
 * Usage:
 *   node scripts/bundle-effects.js [--namespace <name>] [--effect <name>] [--minify-shaders]
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
 * Check if effect is a starter (generator) - no input texture required
 */
function isStarterEffect(effectDef) {
    if (!effectDef) return false

    // Check tags for 'starter'
    if (effectDef.tags && effectDef.tags.includes('starter')) return true

    // Check if it has no inputTex in passes
    if (effectDef.passes) {
        for (const pass of effectDef.passes) {
            if (pass.inputs) {
                const inputs = Object.values(pass.inputs)
                if (inputs.includes('inputTex')) return false
            }
        }
        return true
    }

    return false
}

/**
 * Check if effect has a tex surface parameter
 */
function hasTexSurfaceParam(effectDef) {
    if (!effectDef || !effectDef.globals) return false
    const texSpec = effectDef.globals.tex
    return texSpec && texSpec.type === 'surface'
}

/**
 * Check if effect has explicit tex parameter (not inputTex default)
 */
function hasExplicitTexParam(effectDef) {
    if (!effectDef || !effectDef.globals) return false
    const texSpec = effectDef.globals.tex
    return texSpec && texSpec.type === 'surface' && texSpec.default !== 'inputTex'
}

/**
 * Check if effect is a 3D volume generator
 */
function is3dGenerator(effectDef) {
    if (!effectDef) return false
    return effectDef.namespace === 'synth3d' ||
           (effectDef.tags && effectDef.tags.includes('3d-gen'))
}

/**
 * Check if effect is a 3D processor
 */
function is3dProcessor(effectDef) {
    if (!effectDef) return false
    return effectDef.namespace === 'filter3d' ||
           (effectDef.tags && effectDef.tags.includes('3d-proc'))
}

/**
 * Get volume and geometry parameters from effect
 */
function getVolGeoParams(effectDef) {
    if (!effectDef || !effectDef.globals) {
        return { volParam: null, geoParam: null }
    }
    let volParam = null
    let geoParam = null
    for (const [key, spec] of Object.entries(effectDef.globals)) {
        if (spec.type === 'volume' && !volParam) volParam = key
        if (spec.type === 'geometry' && !geoParam) geoParam = key
    }
    return { volParam, geoParam }
}

/**
 * Build DSL usage source for an effect - matches demo/shaders patterns
 */
function buildDslSource(effectDef) {
    if (!effectDef) return ''

    const namespace = effectDef.namespace
    const funcName = effectDef.func

    // Determine search directive
    let searchNs = namespace
    if (['filter', 'mixer'].includes(namespace)) {
        searchNs = `${namespace}, synth`
    } else if (namespace === 'points') {
        searchNs = 'synth, points, render'
    } else if (namespace === 'render') {
        searchNs = 'synth, filter, render'
    } else if (namespace === 'classicNoisedeck') {
        searchNs = 'classicNoisedeck, synth'
    } else if (namespace === 'synth3d' || namespace === 'filter3d') {
        searchNs = 'synth3d, filter3d, render'
    }
    const searchDirective = searchNs ? `search ${searchNs}\n\n` : ''

    // Special case: pointsEmit and pointsRender must be paired
    if (funcName === 'pointsEmit' || funcName === 'pointsRender') {
        return `search points, synth, render\n\nnoise()\n  .pointsEmit()\n  .physical()\n  .pointsRender()\n  .write(o0)\n\nrender(o0)`
    }

    // Points namespace behaviors need pointsEmit before and pointsRender after
    if (namespace === 'points') {
        const pointsRenderArgs = funcName === 'attractor' ? 'viewMode: ortho' : ''
        return `search points, synth, render\n\nnoise()\n  .pointsEmit()\n  .${funcName}()\n  .pointsRender(${pointsRenderArgs})\n  .write(o0)\n\nrender(o0)`
    }

    // 3D processors - check BEFORE starter check since they may not have inputTex
    if (is3dProcessor(effectDef)) {
        const renderSuffix = funcName === 'render3d' ? '' : '\n  .render3d()'
        return `${searchDirective}noise3d(volumeSize: x32)\n  .${funcName}()${renderSuffix}\n  .write(o0)\n\nrender(o0)`
    }

    // 3D volume generators
    if (is3dGenerator(effectDef)) {
        const { volParam, geoParam } = getVolGeoParams(effectDef)
        const hasVolGeo = volParam && geoParam
        if (hasVolGeo) {
            return `${searchDirective}noise3d(volumeSize: x32)\n  .write3d(vol0, geo0)\n\n${funcName}(${volParam}: read3d(vol0, geo0), ${geoParam}: read3d(vol0, geo0))\n  .render3d()\n  .write(o0)\n\nrender(o0)`
        }
        return `${searchDirective}${funcName}()\n  .render3d()\n  .write(o0)\n\nrender(o0)`
    }

    const starter = isStarterEffect(effectDef)
    const hasTex = hasTexSurfaceParam(effectDef)
    const hasExplicitTex = hasExplicitTexParam(effectDef)
    const { volParam, geoParam } = getVolGeoParams(effectDef)
    const hasVolGeo = volParam && geoParam

    const noiseCall = 'noise(seed: 1, ridges: true)'

    // Effects with explicit vol/geo parameters
    if (hasVolGeo) {
        return `search synth3d, filter3d, render\n\nnoise3d(volumeSize: x32)\n  .write3d(vol0, geo0)\n\n${funcName}(${volParam}: read3d(vol0, geo0), ${geoParam}: read3d(vol0, geo0))\n  .render3d()\n  .write(o0)\n\nrender(o0)`
    }

    // Effects with explicit tex param
    if (hasExplicitTex) {
        if (starter) {
            return `${searchDirective}${noiseCall}\n  .write(o0)\n\n${funcName}(tex: read(o0))\n  .write(o1)\n\nrender(o1)`
        } else {
            return `${searchDirective}${noiseCall}\n  .write(o0)\n\nnoise(seed: 2, ridges: true)\n  .${funcName}(tex: read(o0))\n  .write(o1)\n\nrender(o1)`
        }
    }

    if (starter) {
        if (hasTex) {
            const sourceSurface = 'o0'
            const outputSurface = 'o1'
            return `${searchDirective}${noiseCall}\n  .write(${sourceSurface})\n\n${funcName}(tex: read(${sourceSurface}))\n  .write(${outputSurface})\n\nrender(${outputSurface})`
        }
        return `${searchDirective}${funcName}()\n  .write(o0)\n\nrender(o0)`
    } else if (hasTex) {
        return `${searchDirective}${noiseCall}\n  .write(o0)\n\nnoise(seed: 2, ridges: true)\n  .${funcName}(tex: read(o0))\n  .write(o1)\n\nrender(o1)`
    } else {
        return `${searchDirective}${noiseCall}\n  .${funcName}()\n  .write(o0)\n\nrender(o0)`
    }
}

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
 * Load all shader sources for an effect based on manifest.
 */
function loadEffectShaders(namespace, effectName, manifest, minifyShaders) {
    const effectId = `${namespace}/${effectName}`
    const effectManifest = manifest[effectId]
    const effectDir = path.join(effectsDir, namespace, effectName)

    if (!effectManifest) return {}

    const shaders = {}

    const maybeMinify = (src) => (minifyShaders ? minifyShader(src) : src)

    // Load GLSL shaders
    if (effectManifest.glsl) {
        for (const [prog, info] of Object.entries(effectManifest.glsl)) {
            if (!shaders[prog]) shaders[prog] = {}

            if (info === 'combined') {
                const src = readShaderSource(path.join(effectDir, 'glsl', `${prog}.glsl`))
                if (src) shaders[prog].glsl = maybeMinify(src)
            } else if (typeof info === 'object') {
                if (info.v) {
                    const src = readShaderSource(path.join(effectDir, 'glsl', `${prog}.vert`))
                    if (src) shaders[prog].vertex = maybeMinify(src)
                }
                if (info.f) {
                    const src = readShaderSource(path.join(effectDir, 'glsl', `${prog}.frag`))
                    if (src) shaders[prog].fragment = maybeMinify(src)
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
                if (src) shaders[prog].wgsl = maybeMinify(src)
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
 * Load effect definition at build time
 */
async function loadEffectDefinition(namespace, effectName) {
    const effectDir = path.join(effectsDir, namespace, effectName)
    const definitionPath = path.join(effectDir, 'definition.js')

    if (!fs.existsSync(definitionPath)) return null

    try {
        const module = await import(`file://${definitionPath}`)
        let effectDef = module.default

        // Handle class-based effects (like Text which extends Effect)
        // If it's a class (function), instantiate it
        if (typeof effectDef === 'function') {
            effectDef = new effectDef()
        }

        return effectDef
    } catch (e) {
        console.warn(`  Warning: Could not load definition for ${namespace}/${effectName}: ${e.message}`)
        return null
    }
}

/**
 * Append Usage section to help content
 */
function appendUsageToHelp(helpContent, dslSource) {
    if (!helpContent || !dslSource) return helpContent

    // Add Usage section at the end
    return `${helpContent.trimEnd()}

## Usage

\`\`\`
${dslSource}
\`\`\`
`
}

/**
 * Generate a self-contained effect module with inlined shaders
 */
async function generateEffectModule(namespace, effectName, manifest, tempDir, minifyShaders) {
    const effectDir = path.join(effectsDir, namespace, effectName)
    const definitionPath = relPath(tempDir, path.join(effectDir, 'definition.js'))
    const shaders = loadEffectShaders(namespace, effectName, manifest, minifyShaders)

    // Load effect definition to generate DSL
    const effectDef = await loadEffectDefinition(namespace, effectName)
    const dslSource = effectDef ? buildDslSource(effectDef) : ''

    // Read help content and append Usage section
    let helpContent = readHelpFile(namespace, effectName)
    if (helpContent && dslSource) {
        helpContent = appendUsageToHelp(helpContent, dslSource)
    }

    const code = `
// Mini-bundle for effect: ${namespace}/${effectName}
// Contains definition + inlined shader sources + help

import effectDef from '${definitionPath}';

// Shader sources - inlined at build time
const SHADER_SOURCES = ${JSON.stringify(shaders, null, 2)};

// Help documentation - inlined at build time (includes auto-generated Usage)
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
async function buildEffectBundle(namespace, effectName, manifest, minifyShaders) {
    const tempDir = path.join(distDir, '.temp', namespace)
    fs.mkdirSync(tempDir, { recursive: true })

    const moduleCode = await generateEffectModule(namespace, effectName, manifest, tempDir, minifyShaders)
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

    const minifyShaders = args.includes('--minify-shaders')

    console.log('Building effect mini-bundles with esbuild...')
    console.log(`  - inlined shader minification: ${minifyShaders ? 'on' : 'off'}`)

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
                await buildEffectBundle(ns, effectName, manifest, minifyShaders)
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

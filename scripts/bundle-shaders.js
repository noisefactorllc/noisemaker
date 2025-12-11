#!/usr/bin/env node
/**
 * Build Noisemaker Shader core bundle with esbuild.
 *
 * Produces a core runtime bundle with shared data (palettes, etc.) inlined,
 * plus mini-bundles for each effect.
 *
 * Output structure:
 *   dist/shaders/
 *     noisemaker-shaders-core.esm.js       - Core runtime + UI libraries (ESM)
 *     noisemaker-shaders-core.min.js       - Core runtime + UI libraries (minified IIFE)
 *   dist/effects/{namespace}/{effectName}.js - Per-effect mini-bundles
 *
 * Usage:
 *   node scripts/bundle-shaders.js
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { build } from 'esbuild'
import { execSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const shadersDir = path.join(repoRoot, 'shaders')
const srcDir = path.join(shadersDir, 'src')
const demoDir = path.join(repoRoot, 'demo', 'shaders', 'lib')
const distDir = path.join(repoRoot, 'dist', 'shaders')

/**
 * Calculate relative path from temp dir to target
 */
function relPath(target) {
    const tempDir = path.join(distDir, '.temp')
    return path.relative(tempDir, target).replace(/\\/g, '/')
}

/**
 * Generate the core runtime entry point (includes CanvasRenderer and UI libraries)
 */
function generateCoreModule() {
    const srcPath = relPath(path.join(srcDir, 'index.js'))
    const demoUiPath = relPath(path.join(demoDir, 'demo-ui.js'))
    const effectSelectPath = relPath(path.join(demoDir, 'effect-select.js'))
    const toggleSwitchPath = relPath(path.join(demoDir, 'toggle-switch.js'))
    return `
// Noisemaker Shader Runtime - Core Module
// Includes: Core runtime + CanvasRenderer + UIController + EffectSelect + ToggleSwitch

// Core runtime exports
export * from '${srcPath}';

// Demo UI exports
export * from '${demoUiPath}';
export { EffectSelect } from '${effectSelectPath}';
export { ToggleSwitch } from '${toggleSwitchPath}';
`
}

/**
 * Build the core runtime bundle (includes all UI libraries)
 */
async function buildCoreBundle() {
    const tempDir = path.join(distDir, '.temp')
    fs.mkdirSync(tempDir, { recursive: true })

    const tempFile = path.join(tempDir, 'core.js')
    fs.writeFileSync(tempFile, generateCoreModule())

    const banner = `/**
 * Noisemaker Shaders - Core Runtime
 * Includes: CanvasRenderer + UIController + EffectSelect
 * Copyright (c) 2017-2025 Noise Factor LLC
 * SPDX-License-Identifier: MIT
 * Bundled on ${new Date().toISOString()}
 */`

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

    // Minified ESM build
    await build({
        ...sharedOptions,
        format: 'esm',
        outfile: path.join(distDir, 'noisemaker-shaders-core.esm.min.js'),
        minify: true,
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

    console.log('  ✓ core (runtime + CanvasRenderer + UIController + EffectSelect)')
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
    console.log('Bundling Noisemaker Shaders with esbuild...')

    // Ensure output directory exists
    fs.mkdirSync(distDir, { recursive: true })

    try {
        // Build core runtime (includes all UI libraries)
        console.log('\nBuilding core runtime...')
        await buildCoreBundle()

        console.log('\n✓ Shader bundle written to dist/shaders/')

        // List output files
        const outputs = fs.readdirSync(distDir)
            .filter(f => f.endsWith('.js'))
            .sort()
        for (const f of outputs) {
            const stats = fs.statSync(path.join(distDir, f))
            const sizeKb = (stats.size / 1024).toFixed(1)
            console.log(`  - ${f} (${sizeKb} KB)`)
        }

        // Build effect mini-bundles
        console.log('\nBuilding effect mini-bundles...')
        const bundleEffectsPath = path.join(__dirname, 'bundle-effects.js')
        execSync(`node "${bundleEffectsPath}"`, { stdio: 'inherit' })

    } finally {
        cleanup()
    }
}

main().catch((err) => {
    console.error(err)
    cleanup()
    process.exit(1)
})

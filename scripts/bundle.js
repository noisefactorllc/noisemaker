#!/usr/bin/env node
/**
 * Build single-file Noisemaker bundles with esbuild.
 * Produces IIFE, minified, and ESM outputs with presets inlined.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { build } from 'esbuild'
import { execSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const entryPoint = path.join(repoRoot, 'js', 'noisemaker', 'index.js')
const distDir = path.join(repoRoot, 'dist')
const presetsDslPath = path.join(repoRoot, 'share', 'dsl', 'presets.dsl')

/**
 * Get git hash (first 8 chars) with dirty indicator
 */
function getGitBuildInfo() {
    try {
        const hash = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim().slice(0, 8)
        const dirty = execSync('git status --porcelain', { cwd: repoRoot, encoding: 'utf8' }).trim() !== ''
        return hash + (dirty ? ' (dirty)' : '')
    } catch {
        return 'unknown'
    }
}

if (!fs.existsSync(entryPoint)) {
  console.error(`Bundle entry point not found: ${entryPoint}`)
  process.exit(1)
}

const presetsSource = fs.readFileSync(presetsDslPath, 'utf8')
fs.mkdirSync(distDir, { recursive: true })

const banner = `/**
 * Noisemaker.js - Procedural Noise Generation
 * Copyright (c) 2017-${new Date().getFullYear()} Noise Factor LLC. https://noisefactor.io/
 * SPDX-License-Identifier: MIT
 * Build: ${getGitBuildInfo()}
 * Date: ${new Date().toISOString()}
 */`

const sharedOptions = {
  entryPoints: [entryPoint],
  bundle: true,
  platform: 'browser',
  target: ['es2020'],
  define: {
    NOISEMAKER_PRESETS_DSL: JSON.stringify(presetsSource),
    __NOISEMAKER_DISABLE_EFFECT_VALIDATION__: 'true',
  },
  // Mark Node.js built-ins as external so dynamic imports in setPresetsPath
  // don't break browser bundling (the function is Node-only anyway)
  external: ['node:fs', 'node:path'],
  legalComments: 'none',
  logLevel: 'warning',
  logOverride: {
    'empty-import-meta': 'silent',  // Expected: import.meta is replaced by define
  },
}

async function buildBundle() {
  console.log('Bundling Noisemaker with esbuild...')

  await build({
    ...sharedOptions,
    format: 'iife',
    globalName: 'Noisemaker',
    outfile: path.join(distDir, 'noisemaker.bundle.js'),
    minify: false,
    banner: { js: banner },
  })

  await build({
    ...sharedOptions,
    format: 'iife',
    globalName: 'Noisemaker',
    outfile: path.join(distDir, 'noisemaker.min.js'),
    minify: true,
    banner: { js: banner },
  })

  await build({
    ...sharedOptions,
    format: 'esm',
    outfile: path.join(distDir, 'noisemaker.esm.js'),
    minify: false,
    banner: { js: banner },
  })

  await build({
    ...sharedOptions,
    format: 'cjs',
    outfile: path.join(distDir, 'noisemaker.cjs'),
    minify: false,
    banner: { js: banner },
  })

  console.log('✓ Bundles written to dist/')
  console.log('  - noisemaker.bundle.js')
  console.log('  - noisemaker.min.js')
  console.log('  - noisemaker.esm.js')
  console.log('  - noisemaker.cjs')
}

buildBundle().catch((err) => {
  console.error(err)
  process.exit(1)
})

#!/usr/bin/env node
// Every core bundle entry point exposes the public Portable API: the ESM, the
// minified ESM and the minified IIFE builds of the core module, which
// scripts/bundle-shaders.js writes. Each build here is made from the same
// module, in memory, with the build's own options, and loaded: its exports
// hold the package, capability and instantiation functions and the engine's
// providers, and the engine's catalog context stays private.
//
// Run: node --test shaders/tests/test_portable_bundle_api.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

import { generateCoreModule } from '../../scripts/bundle-shaders.js'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export const PORTABLE_API = Object.freeze([
    'normalizePortableDefinition', 'toPortablePackage',
    'loadPortablePackage', 'packageFiles', 'fileMapFromZip', 'readFileMap', 'normalizePackagePath',
    'normalizeCapabilityDescriptor', 'checkCapabilityDeclarations',
    'registerPortableCapability', 'getPortableCapability', 'createCapabilityRegistry', 'resolvePortableCapabilities',
    'defaultCapabilityRegistry', 'instantiatePortableEffect', 'wormOverlayProvider', 'mediaDimensionsProvider',
    'CanvasRenderer',
])

// The build options of scripts/bundle-shaders.js buildCoreBundle().
const ENTRY_POINTS = [
    { name: 'noisemaker-shaders-core.esm.js', format: 'esm', minify: false },
    { name: 'noisemaker-shaders-core.esm.min.js', format: 'esm', minify: true },
    { name: 'noisemaker-shaders-core.min.js', format: 'iife', minify: true, globalName: 'NoisemakerShadersCore' },
]

async function buildEntry(directory, entry) {
    const result = await build({
        stdin: { contents: generateCoreModule(target => target.split(path.sep).join('/')), resolveDir: REPO_ROOT, loader: 'js' },
        bundle: true,
        platform: 'browser',
        target: ['es2020'],
        legalComments: 'none',
        logLevel: 'silent',
        format: entry.format,
        minify: entry.minify,
        ...(entry.globalName ? { globalName: entry.globalName } : {}),
        write: false,
    })
    const file = path.join(directory, entry.format === 'esm' ? entry.name.replace(/\.js$/, '.mjs') : entry.name)
    fs.writeFileSync(file, result.outputFiles[0].text)
    return file
}

test('each core bundle entry point exposes the public Portable API, and keeps the catalog context private', async () => {
    const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'portable-bundle-api-'))
    // The core bundle holds the demo UI, which defines its custom elements as
    // it loads. These stand in for the page's, for the load only.
    const stand = { HTMLElement: class {}, customElements: { define() {}, get() { return undefined } } }
    const saved = Object.fromEntries(Object.keys(stand).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
    Object.assign(globalThis, stand)
    try {
        for (const entry of ENTRY_POINTS) {
            const file = await buildEntry(directory, entry)
            let api
            if (entry.format === 'esm') {
                api = await import(pathToFileURL(file).href)
            } else {
                // An IIFE build declares its global; read it in this realm, as a page's script tag would.
                const code = fs.readFileSync(file, 'utf8')
                api = new Function(`${code}\nreturn ${entry.globalName}`)()
            }
            for (const name of PORTABLE_API) assert.ok(api[name] !== undefined, `${entry.name} exports ${name}`)
            assert.equal(api.CATALOG_CONTEXT, undefined, `${entry.name} keeps the catalog context private`)
            assert.ok(api.getPortableCapability('noisemaker/worm-overlay', 1), `${entry.name} registers the engine's worm overlay`)
            assert.ok(api.getPortableCapability('noisemaker/media-dimensions', 1), `${entry.name} registers the engine's media dimensions`)
        }
    } finally {
        for (const [name, descriptor] of Object.entries(saved)) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor)
            else delete globalThis[name]
        }
        fs.rmSync(directory, { recursive: true, force: true })
    }
})

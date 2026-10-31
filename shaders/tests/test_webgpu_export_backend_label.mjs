#!/usr/bin/env node
/**
 * The WebGPU export page names the backend its renderer selected.
 *
 * navigator.gpu can exist while WebGPU has no adapter (iOS Safari did this);
 * the renderer then runs WebGL2. The page chose its backend note and status
 * from navigator.gpu alone, so it reported "webgpu" and "running" over a
 * WebGL2 canvas. This renders export-kit/webgpu's page template with the
 * engine from source and checks the note, the status and the canvas context
 * with navigator.gpu present but no adapter, with no navigator.gpu, and with
 * WebGPU available.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const effects = path.join(root, 'shaders/effects')
process.env.SHADE_EFFECTS_DIR = effects
process.env.SHADE_PROJECT_ROOT = root
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')

const ENGINE_VERSION = '0.0.0-test'
const DSL = 'search synth\n\nnoise(seed: 1).write(o0)\nrender(o0)'
const template = fs.readFileSync(path.join(root, 'export-kit/webgpu/kit/index.template.html'), 'utf8')
const page = template
    .replaceAll('{{NM_PROGRAM_NAME_HTML}}', 'backend label')
    .replaceAll('{{NM_PROGRAM_NAME_JSON}}', JSON.stringify('backend label'))
    .replaceAll('{{NM_DSL_JSON}}', JSON.stringify(DSL))
    .replaceAll('{{NM_ENGINE_VERSION_JSON}}', JSON.stringify(ENGINE_VERSION))
    .replaceAll('{{NM_ENGINE_VERSION}}', ENGINE_VERSION)
assert.doesNotMatch(page, /\{\{NM_[A-Z_]+\}\}/, 'every page token must be filled')

const base = await acquireServer(undefined, root, effects)
const exportUrl = `${base}/export-kit-backend-label/index.html`
// The exported engine is the core bundle (shaders/src plus demo-ui); serve the
// same modules from source, loading effects from source instead of bundles.
const engine = `export * from '${base}/shaders/src/index.js';
export * from '${base}/demo/shaders/lib/demo-ui.js';
import { CanvasRenderer as SourceRenderer } from '${base}/shaders/src/index.js';
export class CanvasRenderer extends SourceRenderer {
    constructor(options) {
        super({ ...options, useBundles: false, basePath: '${base}/shaders' });
    }
}
`

const cases = [
    {
        id: 'navigator.gpu without an adapter',
        init: () => { navigator.gpu.requestAdapter = async () => null },
        expected: { note: `noisemaker ${ENGINE_VERSION} · webgl2 fallback`, status: 'no webgpu — using webgl2', state: 'is-warn', context: 'webgl2' },
    },
    {
        id: 'no navigator.gpu',
        init: () => { delete Navigator.prototype.gpu },
        expected: { note: `noisemaker ${ENGINE_VERSION} · webgl2 fallback`, status: 'no webgpu — using webgl2', state: 'is-warn', context: 'webgl2' },
    },
    {
        id: 'WebGPU available',
        init: null,
        expected: { note: `noisemaker ${ENGINE_VERSION} · webgpu`, status: 'running', state: 'is-done', context: 'webgpu' },
    },
]

const browser = await chromium.launch(shaderTestBrowserOptions())
const failures = []
try {
    for (const c of cases) {
        const context = await browser.newContext({ viewport: { width: 320, height: 240 } })
        const tab = await context.newPage()
        const errors = []
        tab.on('pageerror', (error) => errors.push(error.message))
        tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
        if (c.init) await tab.addInitScript(c.init)
        await tab.route(exportUrl, (route) => route.fulfill({ contentType: 'text/html', body: page }))
        await tab.route('**/export-kit-backend-label/vendor/noisemaker/noisemaker-shaders-core.esm.min.js',
            (route) => route.fulfill({ contentType: 'text/javascript', body: engine }))
        await tab.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }))
        try {
            await tab.goto(exportUrl)
            await tab.waitForFunction(() => /is-(done|warn|failed)/.test(document.getElementById('status').className),
                null, { timeout: 60_000 })
            const observed = await tab.evaluate(() => {
                const canvas = document.getElementById('nm-canvas')
                const status = document.getElementById('status')
                return {
                    note: document.getElementById('backend-note').textContent,
                    status: status.textContent,
                    state: status.className,
                    context: canvas.getContext('webgpu') ? 'webgpu' : (canvas.getContext('webgl2') ? 'webgl2' : 'none'),
                    error: document.getElementById('err').hidden ? null : document.getElementById('err').textContent,
                }
            })
            assert.equal(observed.error, null, 'the program must start')
            assert.deepEqual({ ...observed, error: undefined }, { ...c.expected, error: undefined })
            assert.deepEqual(errors, [], 'console must be clean')
            console.log(`PASS ${c.id}: "${observed.note}", status "${observed.status}", ${observed.context} canvas`)
        } catch (error) {
            failures.push(`${c.id}: ${error.message}`)
            console.log(`FAIL ${c.id}: ${error.message}`)
        } finally {
            await context.close()
        }
    }
} finally {
    await browser.close()
    releaseServer()
}

assert.deepEqual(failures, [], `the WebGPU export page must report the backend that renders:\n${failures.join('\n')}`)
console.log(`PASS WebGPU export page: ${cases.length} cases report the selected backend`)

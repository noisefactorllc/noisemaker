#!/usr/bin/env node
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const backend = process.argv.includes('--backend') ? process.argv[process.argv.indexOf('--backend') + 1] : 'webgl2'
assert.match(backend, /^(webgl2|webgpu)$/)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, root, process.env.SHADE_EFFECTS_DIR)
const browser = await chromium.launch(shaderTestBrowserOptions())

const fillGlsl = `#version 300 es
precision highp float;
out vec4 outputBuffer;
void main() { outputBuffer = vec4(1.0, 0.5, 0.25, 1.0); }`
const fillWgsl = `@group(0) @binding(0) var outputBuffer: texture_storage_2d<rgba8unorm, write>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    textureStore(outputBuffer, vec2<i32>(gid.xy), vec4<f32>(1.0, 0.5, 0.25, 1.0));
}`
const copyGlsl = `#version 300 es
precision highp float;
uniform sampler2D workTex;
out vec4 fragColor;
void main() { fragColor = texelFetch(workTex, ivec2(gl_FragCoord.xy), 0); }`
const copyWgsl = `@group(0) @binding(0) var workTex: texture_2d<f32>;
@fragment fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    return textureLoad(workTex, vec2<i32>(pos.xy), 0);
}`

function definition(func, target) {
    const named = target === 'work'
    return {
        namespace: 'user', name: func, func, globals: {},
        ...(named ? { textures: { work: { width: '100%', height: '100%', format: 'rgba8unorm' } } } : {}),
        shaders: { fill: { glsl: fillGlsl,
            wgsl: named ? fillWgsl : fillWgsl.replace('rgba8unorm', 'rgba16float') },
            ...(named ? { copy: { glsl: copyGlsl, wgsl: copyWgsl } } : {}) },
        passes: [{ name: 'fill', type: 'compute', program: 'fill', workgroups: [8, 8, 1],
            storageTextures: { outputBuffer: target } },
        ...(named ? [{ name: 'copy', program: 'copy', inputs: { workTex: 'work' },
            outputs: { fragColor: 'outputTex' } }] : [])]
    }
}

// A filter that copies its chain input, so a storage write that is not the chain's last write
// must reach the next step through the node's own output texture.
const copyFilter = {
    namespace: 'user', name: 'storageCopyFilter', func: 'storageCopyFilter', globals: {},
    shaders: { copy: { glsl: copyGlsl, wgsl: copyWgsl } },
    passes: [{ name: 'copy', program: 'copy', inputs: { workTex: 'inputTex' }, outputs: { fragColor: 'outputTex' } }]
}

try {
    for (const [call, raws] of [['storageDirectProbe()', [definition('storageDirectProbe', 'outputTex')]],
        ['storageNamedProbe()', [definition('storageNamedProbe', 'work')]],
        ['storageDirectProbe().storageCopyFilter()', [definition('storageDirectProbe', 'outputTex'), copyFilter]]]) {
        const page = await browser.newPage({ viewport: { width: 64, height: 64 } })
        const diagnostics = []
        page.on('pageerror', error => diagnostics.push(error.message))
        page.on('console', message => { if (['warning', 'error'].includes(message.type())) diagnostics.push(message.text()) })
        await page.goto(`${baseUrl}/shaders/effects/manifest.json`)
        await page.setContent('<canvas width="64" height="64"></canvas>')
        const result = await page.evaluate(async ({ baseUrl, raws, call, preferWebGPU }) => {
            const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/index.js`)
            const canvas = document.querySelector('canvas')
            const renderer = new CanvasRenderer({ canvas, width: 64, height: 64,
                basePath: `${baseUrl}/shaders`, preferWebGPU })
            for (const raw of raws) await renderer.registerPortableEffect(raw)
            await renderer.compile(`search user\n${call}.write(o0)\nrender(o0)`)
            await renderer.render(0); await renderer.render(0)
            await renderer.pipeline.backend.device?.queue?.onSubmittedWorkDone?.()
            return { backend: renderer.pipeline.backend.getName().toLowerCase(), png: canvas.toDataURL('image/png') }
        }, { baseUrl, raws, call, preferWebGPU: backend === 'webgpu' })
        assert.ok(result.backend.includes(backend), `${call}: expected ${backend}, got ${result.backend}`)
        assert.deepEqual(diagnostics, [], `${call}: browser diagnostics`)
        const png = PNG.sync.read(Buffer.from(result.png.split(',')[1], 'base64'))
        for (let i = 0; i < png.data.length; i += 4) {
            const pixel = Array.from(png.data.subarray(i, i + 4))
            assert.ok(pixel.every((value, channel) => Math.abs(value - [255, 128, 64, 255][channel]) <= 1),
                `${call}: unexpected pixel ${pixel} at ${i / 4}`)
        }
        await page.close()
    }
    console.log(`PASS ${backend} declared storage texture targets`)
} finally {
    await browser.close()
    await releaseServer()
}

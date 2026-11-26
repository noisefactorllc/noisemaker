import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { chromium } from 'playwright'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const selected = process.argv.includes('--backend') ? process.argv[process.argv.indexOf('--backend') + 1] : null
if (selected) assert.ok(['webgl2', 'webgpu'].includes(selected))
const backends = selected ? [selected] : ['webgl2', 'webgpu']
const cases = [
    [['ONE', 'ZERO'], [0.5, 0.5, 0.5, 0.5]],
    [['ZERO', 'ONE'], [0.25, 0.5, 1, 1]],
    [['SRC_COLOR', 'ZERO'], [0.25, 0.25, 0.25, 0.25]],
    [['DST_COLOR', 'ZERO'], [0.125, 0.25, 0.5, 0.5]],
    [['ONE_MINUS_SRC_COLOR', 'ZERO'], [0.25, 0.25, 0.25, 0.25]],
    [['ONE_MINUS_DST_COLOR', 'ZERO'], [0.375, 0.25, 0, 0]],
    [['SRC_ALPHA', 'ONE_MINUS_SRC_ALPHA'], [0.375, 0.5, 0.75, 0.75]]
]

function shader(color) {
    return {
        glsl: `#version 300 es
precision highp float;
out vec4 fragColor;
void main() { fragColor = vec4(${color}); }`,
        wgsl: `struct Params { gain: f32, }
@group(0) @binding(0) var<uniform> params: Params;
@fragment fn main() -> @location(0) vec4<f32> { return vec4<f32>(${color}) * params.gain; }`
    }
}
const copy = {
    glsl: `#version 300 es
precision highp float;
uniform sampler2D workTex;
out vec4 fragColor;
void main() { fragColor = texelFetch(workTex, ivec2(gl_FragCoord.xy), 0); }`,
    wgsl: `@group(0) @binding(0) var workTex: texture_2d<f32>;
@fragment fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    return textureLoad(workTex, vec2<i32>(pos.xy), 0);
}`
}

function definition(blend) {
    return {
        namespace: 'user', name: 'factorProbe', func: 'factorProbe',
        globals: { gain: { type: 'float', default: 1, min: 0, max: 1 } },
        textures: { work: { width: 8, height: 8, format: 'rgba16f' } },
        shaders: { backdrop: shader('0.25, 0.5, 1.0, 1.0'), source: shader('0.5, 0.5, 0.5, 0.5'), copy },
        passes: [
            { program: 'backdrop', outputs: { fragColor: 'work' } },
            { program: 'source', blend, outputs: { fragColor: 'work' } },
            { program: 'copy', inputs: { workTex: 'work' }, outputs: { fragColor: 'outputTex' } }
        ]
    }
}

test('pass blend factors render their defined source and destination contributions', { timeout: 120000 }, async t => {
    process.env.SHADE_PROJECT_ROOT = root
    process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
    const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
    const baseUrl = await acquireServer(undefined, root, process.env.SHADE_EFFECTS_DIR)
    let browser
    try {
        browser = await chromium.launch({ ...shaderTestBrowserOptions(), timeout: 30000 })
        for (const backend of backends) for (const [blend, expected] of cases) {
            await t.test(`${backend}: ${blend.join(', ')}`, { timeout: 15000 }, async () => {
                const page = await browser.newPage()
                const diagnostics = []
                page.on('pageerror', error => diagnostics.push(error.message))
                page.on('console', message => { if (message.type() === 'error') diagnostics.push(message.text()) })
                try {
                    await page.goto(`${baseUrl}/shaders/effects/manifest.json`)
                    await page.setContent('<canvas width="8" height="8"></canvas>')
                    const result = await page.evaluate(async ({ baseUrl, raw, backend }) => {
                        const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/index.js`)
                        const renderer = new CanvasRenderer({ canvas: document.querySelector('canvas'), width: 8, height: 8,
                            basePath: `${baseUrl}/shaders`, preferWebGPU: backend === 'webgpu' })
                        try {
                            await renderer.loadManifest()
                            await renderer.registerPortableEffect(raw)
                            await renderer.compile('search user\nfactorProbe().write(o0)\nrender(o0)')
                            await renderer.render(0)
                            await renderer.render(0)
                            const pipeline = renderer.pipeline
                            const target = pipeline.frameReadTextures?.get('o0') ?? pipeline.surfaces.get('o0').read
                            const pixels = await pipeline.backend.readPixels(target)
                            return { backend: pipeline.backend.getName().toLowerCase(), pixels: Array.from(pixels.data) }
                        } finally {
                            await renderer.dispose()
                        }
                    }, { baseUrl, raw: definition(blend), backend })
                    assert.equal(result.backend, backend, 'backend fallback cannot qualify the requested backend')
                    assert.deepEqual(diagnostics, [])
                    assert.equal(result.pixels.length, 8 * 8 * 4)
                    for (let i = 0; i < result.pixels.length; i++) {
                        assert.ok(Math.abs(result.pixels[i] - expected[i % 4] * 255) <= 1,
                            `channel ${i}: ${result.pixels[i]}, expected ${expected[i % 4] * 255}`)
                    }
                } finally {
                    await page.close()
                }
            })
        }
    } finally {
        await browser?.close()
        await releaseServer()
    }
})

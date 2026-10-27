import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { shaderTestBrowserOptions } from '../../scripts/lib/shader-test-browser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.env.SHADE_PROJECT_ROOT = root
process.env.SHADE_EFFECTS_DIR = path.join(root, 'shaders/effects')
const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(0, root, process.env.SHADE_EFFECTS_DIR)
let browser
try {
    browser = await chromium.launch(shaderTestBrowserOptions())
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.goto(baseUrl)
    await page.setContent('<canvas width="200" height="200"></canvas>')
    const frames = await page.evaluate(async baseUrl => {
        const { WebGL2Backend } = await import(`${baseUrl}/shaders/src/runtime/backends/webgl2.js`)
        const gl = document.querySelector('canvas').getContext('webgl2')
        if (!gl) throw new Error('WebGL2 is required')
        const backend = new WebGL2Backend(gl)
        backend.compileProgram('mesh', {
            vertex: `#version 300 es
                void main() {
                    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
                    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
                }`,
            source: `#version 300 es
                precision highp float;
                out vec4 color;
                void main() { color = vec4(1.0); }`
        })
        const frames = []
        for (const size of [8, 200]) {
            backend.createTexture('target', { width: size, height: size, format: 'rgba8', usage: ['render'] })
            for (let frame = 1; frame <= 2; frame++) {
                backend.executePass({ id: 'mesh', program: 'mesh', drawMode: 'triangles', count: 3,
                    outputs: { color: 'target' } }, { uniforms: {}, textures: {} })
                gl.bindFramebuffer(gl.FRAMEBUFFER, backend.fbos.get('target'))
                const pixel = new Uint8Array(4)
                gl.readPixels(size / 2, size / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
                frames.push({ size, frame, pixel: [...pixel], error: gl.getError() })
            }
            backend.destroyTexture('target')
        }
        return frames
    }, baseUrl)
    for (const { size, frame, pixel, error } of frames) {
        assert.equal(error, 0, `${size}px frame ${frame}: WebGL error`)
        assert.deepEqual(pixel, [255, 255, 255, 255], `${size}px frame ${frame}: mesh must reach its render target`)
    }
    assert.deepEqual(errors, [], 'browser must not report errors')
    console.log('Mesh reaches new and resized WebGL2 targets on their first frame')
} finally {
    await browser?.close()
    await releaseServer()
}

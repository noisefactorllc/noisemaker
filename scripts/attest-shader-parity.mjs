#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { shaderTestBrowserOptions } from './lib/shader-test-browser.mjs'

import {
    comparePixelFrames,
    computeFileHash,
    computeParitySourceHash,
    effectDirectory,
    isReadbackPerformanceWarning,
    matchesTargetEffectPass,
    PARITY_ATTESTATION_SCHEMA_VERSION,
    validateFrameEvidence,
    validateParityCase,
} from './lib/shader-parity-attestation.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const effectId = process.argv.slice(2).find((arg) => !arg.startsWith('--'))
const shouldWrite = process.argv.includes('--write')

if (!effectId) {
    console.error('Usage: node scripts/attest-shader-parity.mjs <namespace/effect> [--write]')
    process.exit(2)
}

const effectDir = effectDirectory(repoRoot, effectId)
const casePath = path.join(effectDir, 'parity-case.json')
const attestationPath = path.join(effectDir, 'parity-attestation.json')

if (!fs.existsSync(casePath)) {
    throw new Error(`${effectId} has no parity-case.json`)
}

const initialCaseHash = computeFileHash(casePath)
const parityCase = JSON.parse(fs.readFileSync(casePath, 'utf8'))
assert.equal(computeFileHash(casePath), initialCaseHash, 'Parity case changed while loading')
const caseErrors = validateParityCase(parityCase, effectId)
if (caseErrors.length > 0) throw new Error(`Invalid parity case: ${caseErrors.join('; ')}`)
const resolution = parityCase.resolution
const initialSourceHash = computeParitySourceHash(repoRoot, parityCase)

async function renderBackend(browser, baseUrl, preferWebGPU) {
    const [width, height] = resolution
    const page = await browser.newPage({ viewport: { width, height } })
    const consoleMessages = []
    page.on('console', (message) => {
        if (isReadbackPerformanceWarning(message.type(), message.text())) return
        if (message.type() === 'error' || message.type() === 'warning') consoleMessages.push(message.text())
    })
    page.on('pageerror', (error) => consoleMessages.push(error.message))

    try {
        if (preferWebGPU) {
            await page.goto(`${baseUrl}/shaders/manifest.json`, { waitUntil: 'load' })
            consoleMessages.length = 0
        }
        await page.setContent(`<!doctype html>
<link rel="icon" href="data:,">
<canvas id="canvas" width="${width}" height="${height}"></canvas>
<script type="module">
import { CanvasRenderer } from '${baseUrl}/shaders/src/index.js';
const renderer = new CanvasRenderer({
    canvas: document.getElementById('canvas'),
    width: ${width},
    height: ${height},
    basePath: '${baseUrl}/shaders',
    preferWebGPU: ${preferWebGPU}
});
await renderer.loadManifest();
await renderer.loadEffects(${JSON.stringify(parityCase.effects)});
await renderer.compile(${JSON.stringify(parityCase.dsl)});
renderer.stop();
renderer.render(0);
const matchesTargetEffectPass = ${matchesTargetEffectPass.toString()};
for (const texture of ${JSON.stringify(parityCase.textureInputs || [])}) {
    const source = document.createElement('canvas');
    source.width = texture.width;
    source.height = texture.height;
    source.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(texture.data), texture.width, texture.height), 0, 0);
    const passes = renderer.pipeline.graph.passes.filter((pass) => matchesTargetEffectPass(pass, texture.effect));
    if (!passes.length) throw new Error('Texture fixture has no executing effect: ' + texture.effect);
    for (const pass of passes) {
        const textureId = pass.inputs?.[texture.uniform];
        if (typeof textureId !== 'string') throw new Error('Texture fixture uniform is not bound: ' + texture.uniform);
        const uploaded = renderer.updateTextureFromSource(textureId, source, { flipY: false });
        if (uploaded?.width !== texture.width || uploaded?.height !== texture.height) {
            throw new Error('Texture fixture upload dimensions differ');
        }
    }
}
renderer.render(0);
renderer.render(0);
await renderer.pipeline.backend.device?.queue?.onSubmittedWorkDone?.();
const surface = renderer.pipeline.surfaces.get(${JSON.stringify(parityCase.surface || 'o0')});
const candidates = [surface?.read, surface?.write].filter(Boolean);
let capture = null;
for (const id of candidates) {
    try {
        const pixels = await renderer.pipeline.backend.readPixels(id);
        if (!pixels?.data) continue;
        let nonzeroRgbPixels = 0;
        let nonzeroAlphaPixels = 0;
        const colors = new Set();
        for (let i = 0; i < pixels.data.length; i += 4) {
            if (pixels.data[i] || pixels.data[i + 1] || pixels.data[i + 2]) nonzeroRgbPixels++;
            if (pixels.data[i + 3]) nonzeroAlphaPixels++;
            colors.add(pixels.data[i] + ',' + pixels.data[i + 1] + ',' + pixels.data[i + 2]);
        }
        if (!capture || nonzeroRgbPixels > capture.nonzeroRgbPixels) {
            capture = {
                id,
                width: pixels.width,
                height: pixels.height,
                nonzeroRgbPixels,
                nonzeroAlphaPixels,
                uniqueColors: colors.size,
                data: Array.from(pixels.data)
            };
        }
    } catch {}
}
window.parityResult = {
    backend: renderer.pipeline.backend.getName(),
    targetPassCount: renderer.pipeline.graph.passes.filter((pass) =>
        matchesTargetEffectPass(pass, ${JSON.stringify(effectId)})
    ).length,
    capture
};
</script>`, { waitUntil: 'load' })
        await page.waitForFunction(() => window.parityResult, null, { timeout: 30000 })
        const result = await page.evaluate(() => window.parityResult)
        const expectedBackend = preferWebGPU ? 'WebGPU' : 'WebGL2'
        assert.equal(result.backend, expectedBackend, `expected ${expectedBackend}, got ${result.backend}`)
        assert.ok(result.targetPassCount > 0, `${expectedBackend} graph did not execute ${effectId}`)
        assert.ok(result.capture, `${expectedBackend} produced no readable output`)
        assert.deepEqual(consoleMessages, [], `${expectedBackend} console errors:\n${consoleMessages.join('\n')}`)
        return result
    } finally {
        await page.close()
    }
}

const effectsDir = path.join(repoRoot, 'shaders/effects')
process.env.SHADE_EFFECTS_DIR = effectsDir
process.env.SHADE_PROJECT_ROOT = repoRoot
const { acquireServer, releaseServer } = await import('../vendor/shade-mcp/harness/index.js')
const baseUrl = await acquireServer(undefined, repoRoot, effectsDir)
let browser

try {
    browser = await chromium.launch(shaderTestBrowserOptions())
    const webglResult = await renderBackend(browser, baseUrl, false)
    const webgpuResult = await renderBackend(browser, baseUrl, true)
    const webgl = webglResult.capture
    const webgpu = webgpuResult.capture
    const frames = {
        webgl2: {
            width: webgl.width,
            height: webgl.height,
            nonzeroRgbPixels: webgl.nonzeroRgbPixels,
            nonzeroAlphaPixels: webgl.nonzeroAlphaPixels,
            uniqueColors: webgl.uniqueColors,
        },
        webgpu: {
            width: webgpu.width,
            height: webgpu.height,
            nonzeroRgbPixels: webgpu.nonzeroRgbPixels,
            nonzeroAlphaPixels: webgpu.nonzeroAlphaPixels,
            uniqueColors: webgpu.uniqueColors,
        },
    }
    const execution = {
        webgl2TargetPasses: webglResult.targetPassCount,
        webgpuTargetPasses: webgpuResult.targetPassCount,
    }

    const frameErrors = validateFrameEvidence(frames, parityCase.requireColorVariation === true)
    if (frameErrors.length > 0) {
        throw new Error(`EMPTY FRAME GATE FAILED: ${frameErrors.join('; ')}`)
    }

    const parity = comparePixelFrames(webgl, webgpu)
    if (parity.mismatchCount !== 0 || parity.maxDiff !== 0) {
        const samples = []
        for (let y = 0; y < webgl.height && samples.length < 8; y++) {
            for (let x = 0; x < webgl.width && samples.length < 8; x++) {
                const gl = webgl.data.slice((y * webgl.width + x) * 4, (y * webgl.width + x + 1) * 4)
                const gpuIndex = ((webgpu.height - 1 - y) * webgpu.width + x) * 4
                const gpu = webgpu.data.slice(gpuIndex, gpuIndex + 4)
                if (gl.some((value, channel) => value !== gpu[channel])) samples.push({ x, y, webgl2: gl, webgpu: gpu })
            }
        }
        throw new Error(`PIXEL PARITY FAILED: ${JSON.stringify({ ...parity, samples })}`)
    }

    assert.equal(computeParitySourceHash(repoRoot, parityCase), initialSourceHash, 'Shader sources changed during attestation')
    assert.equal(computeFileHash(casePath), initialCaseHash, 'Parity case changed during attestation')

    const attestation = {
        schemaVersion: PARITY_ATTESTATION_SCHEMA_VERSION,
        effect: effectId,
        sourceHash: initialSourceHash,
        caseHash: initialCaseHash,
        resolution,
        frames,
        execution,
        parity,
    }

    if (shouldWrite) {
        fs.writeFileSync(attestationPath, `${JSON.stringify(attestation, null, 2)}\n`)
        console.log(`Wrote ${path.relative(repoRoot, attestationPath)}`)
    } else {
        process.stdout.write(`${JSON.stringify(attestation, null, 2)}\n`)
    }
} finally {
    if (browser) await browser.close()
    releaseServer()
}

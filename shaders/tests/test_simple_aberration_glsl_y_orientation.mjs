#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../..')
const effectsDir = path.join(repoRoot, 'shaders', 'effects')
const outDir = path.join(repoRoot, 'shaders/tests/.artifacts/simple-aberration-glsl-y-orientation')
const keepArtifacts = process.argv.includes('--keep-artifacts') || process.env.KEEP_SHADER_ARTIFACTS === '1'

process.env.SHADE_EFFECTS_DIR = effectsDir
process.env.SHADE_PROJECT_ROOT = repoRoot

const { acquireServer, releaseServer } = await import(path.join(repoRoot, 'vendor/shade-mcp/harness/index.js'))

const width = 128
const height = 128

const baselineDsl = `search synth

testPattern(pattern: uvMap)
  .write(o0)

render(o0)`

const simpleAberrationDsl = `search synth, filter

testPattern(pattern: uvMap)
  .simpleAberration(displacement: 0)
  .write(o0)

render(o0)`

function meanAbsDiff(a, b) {
    assert.equal(a.width, b.width)
    assert.equal(a.height, b.height)
    let sum = 0
    let count = 0
    for (let i = 0; i < a.data.length; i += 4) {
        sum += Math.abs(a.data[i] - b.data[i])
        sum += Math.abs(a.data[i + 1] - b.data[i + 1])
        sum += Math.abs(a.data[i + 2] - b.data[i + 2])
        count += 3
    }
    return sum / count
}

function meanAbsDiffYFlipped(reference, candidate) {
    assert.equal(reference.width, candidate.width)
    assert.equal(reference.height, candidate.height)
    const rowBytes = reference.width * 4
    let sum = 0
    let count = 0
    for (let y = 0; y < reference.height; y++) {
        const candidateY = reference.height - 1 - y
        for (let x = 0; x < reference.width; x++) {
            const ai = y * rowBytes + x * 4
            const bi = candidateY * rowBytes + x * 4
            sum += Math.abs(reference.data[ai] - candidate.data[bi])
            sum += Math.abs(reference.data[ai + 1] - candidate.data[bi + 1])
            sum += Math.abs(reference.data[ai + 2] - candidate.data[bi + 2])
            count += 3
        }
    }
    return sum / count
}

function rowGreenMean(png, y) {
    let sum = 0
    for (let x = 0; x < png.width; x++) {
        sum += png.data[(y * png.width + x) * 4 + 1]
    }
    return sum / png.width
}

function orientationStats(reference, candidate) {
    const directMean = meanAbsDiff(reference, candidate)
    const yFlipMean = meanAbsDiffYFlipped(reference, candidate)
    return {
        directMean,
        yFlipMean,
        yFlipRatio: directMean === 0 ? 1 : yFlipMean / directMean,
        referenceTopGreen: rowGreenMean(reference, 8),
        referenceBottomGreen: rowGreenMean(reference, reference.height - 9),
        candidateTopGreen: rowGreenMean(candidate, 8),
        candidateBottomGreen: rowGreenMean(candidate, candidate.height - 9),
        flipped: directMean > 20 && yFlipMean < 3 && yFlipMean / directMean < 0.15,
    }
}

function formatStats(stats) {
    return [
        `directMean=${stats.directMean.toFixed(3)}`,
        `yFlipMean=${stats.yFlipMean.toFixed(3)}`,
        `yFlipRatio=${stats.yFlipRatio.toFixed(3)}`,
        `referenceTopGreen=${stats.referenceTopGreen.toFixed(1)}`,
        `referenceBottomGreen=${stats.referenceBottomGreen.toFixed(1)}`,
        `candidateTopGreen=${stats.candidateTopGreen.toFixed(1)}`,
        `candidateBottomGreen=${stats.candidateBottomGreen.toFixed(1)}`,
    ].join(', ')
}

function scanUnexpectedGlslYFlips() {
    const allowed = new Set([
        // This effect's whole purpose is user-controlled image flipping/mirroring.
        path.normalize('filter/flipMirror/glsl/flipMirror.glsl'),
        // The classic bundled multi-effect exposes FLIP preprocessor modes.
        path.normalize('classicNoisedeck/effects/glsl/effects.glsl'),
        // Media maps DOM image/video coordinates and exposes user flip modes.
        path.normalize('synth/media/glsl/mediaInput.glsl'),
    ])
    const problems = []

    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                walk(full)
                continue
            }
            if (!entry.isFile() || !entry.name.endsWith('.glsl')) continue
            const rel = path.normalize(path.relative(effectsDir, full))
            if (allowed.has(rel)) continue
            const source = fs.readFileSync(full, 'utf8')
            if (!source.includes('inputTex')) continue
            const matches = source.match(/\b(?:uv|st|localUV|sampleUV|warpedUV|redLocalUV|greenLocalUV|blueLocalUV)\.y\s*=\s*1\.0\s*-\s*(?:uv|st|localUV|sampleUV|warpedUV|redLocalUV|greenLocalUV|blueLocalUV)\.y\s*;/g) || []
            for (const match of matches) {
                problems.push(`${rel}: ${match}`)
            }
        }
    }

    walk(effectsDir)
    return problems
}

async function installHarness(page, baseUrl) {
    await page.setContent(`<!doctype html>
<meta charset="utf-8">
<style>
html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: black; }
canvas { display: block; width: ${width}px; height: ${height}px; }
</style>
<canvas id="canvas" width="${width}" height="${height}"></canvas>
<script type="module">
import { CanvasRenderer } from '${baseUrl}/shaders/src/index.js';

const canvas = document.getElementById('canvas');
const renderer = new CanvasRenderer({
    canvas,
    width: ${width},
    height: ${height},
    basePath: '${baseUrl}/shaders',
    preferWebGPU: false
});
await renderer.loadManifest();
await renderer.loadEffects(['synth/testPattern', 'filter/simpleAberration']);

window.renderTestDsl = async (dsl) => {
    await renderer.compile(dsl);
    renderer.render(0);
    renderer.render(0);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return {
        backend: renderer.pipeline?.backend?.getName?.() || 'unknown',
        frameCount: renderer.frameCount,
        passCount: renderer.pipeline?.graph?.passes?.length || 0
    };
};
</script>`, { waitUntil: 'load' })
    await page.waitForFunction(() => typeof window.renderTestDsl === 'function', null, { timeout: 30000 })
}

async function renderPng(page, dsl, label) {
    const result = await page.evaluate(async (source) => window.renderTestDsl(source), dsl)
    if (result.backend !== 'WebGL2') {
        throw new Error(`expected WebGL2 backend, got ${result.backend}`)
    }
    const handle = await page.$('canvas')
    if (!handle) throw new Error('test canvas not found')
    const buffer = await handle.screenshot({ type: 'png' })
    let outPath = null
    if (keepArtifacts) {
        fs.mkdirSync(outDir, { recursive: true })
        outPath = path.join(outDir, `${label}.png`)
        fs.writeFileSync(outPath, buffer)
    }
    return { png: PNG.sync.read(buffer), outPath, result }
}

async function main() {
    const baseUrl = await acquireServer(undefined, repoRoot, effectsDir)
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--disable-gpu-sandbox',
            process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=egl',
        ],
    })
    const page = await browser.newPage({ viewport: { width, height } })
    page.setDefaultTimeout(30000)
    const consoleMessages = []
    page.on('console', (message) => {
        if (['error', 'warning'].includes(message.type())) {
            consoleMessages.push(`[${message.type()}] ${message.text()}`)
        }
    })
    page.on('pageerror', (error) => consoleMessages.push(`[pageerror] ${error.message}`))

    try {
        await installHarness(page, baseUrl)
        const baseline = await renderPng(page, baselineDsl, 'test-pattern-uvmap-glsl')
        const candidate = await renderPng(page, simpleAberrationDsl, 'simple-aberration-displacement-zero-glsl')
        const stats = orientationStats(baseline.png, candidate.png)

        if (baseline.outPath) console.log(`baseline: ${baseline.outPath}`)
        if (candidate.outPath) console.log(`simpleAberration: ${candidate.outPath}`)
        console.log(formatStats(stats))

        if (stats.flipped) {
            throw new Error(`simpleAberration GL2 output is Y-flipped relative to its input: ${formatStats(stats)}`)
        }
        if (stats.directMean > 2) {
            throw new Error(`simpleAberration(displacement: 0) should preserve GL2 input orientation: ${formatStats(stats)}`)
        }
        const staticProblems = scanUnexpectedGlslYFlips()
        if (staticProblems.length) {
            throw new Error(`unexpected GLSL inputTex Y flips:\n${staticProblems.join('\n')}`)
        }
        if (consoleMessages.length) {
            throw new Error(`browser console reported errors:\n${consoleMessages.join('\n')}`)
        }
    } finally {
        await browser.close()
        releaseServer()
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})

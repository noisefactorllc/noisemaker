/**
 * The loop seam of a program: how much its frame at phase 1 differs from its
 * frame at phase 0, after one loop.
 *
 * A program renders through one loop of `frames` frames on WebGL2 and on
 * WebGPU. Frame k is at time (k mod frames) / frames, counted from 0 and never
 * accumulated, and the last frame is at time 1, not wrapped to 0. The frame at
 * phase 0 is frame `warmupLoops * frames`, and the frame at phase 1 is frame
 * `(warmupLoops + 1) * frames`. Each frame is one step for a stateful effect.
 *
 * The top level of this module imports nothing, so a page can import its
 * frame driver, `renderSeamFrames()`. `measureLoopSeam()` loads the browser and
 * the rest only when it is called.
 */

/** The frames of one loop: the renderer's 10-second loop at the 60 frames a second of stepFrame(). */
export const DEFAULT_FRAMES = 600
/** The agreement harness's frame size. */
export const DEFAULT_SIZE = Object.freeze({ width: 96, height: 96 })
/** A step differs from one frame of the loop when it is off by more than this. */
export const STEP_TOLERANCE = 1e-9
/** Settle renders: the render at time 0 before a program's inputs are bound. */
export const SETTLE_RENDERS = 1

/** The time of frame `k`: (k mod frames) / frames, and 1 for the frame at phase 1. */
export function seamFrameTime(k, frames, warmupLoops) {
    return k === (warmupLoops + 1) * frames ? 1 : (k % frames) / frames
}

/** The frame indexes at phase 0 and at phase 1. */
export function seamFrames(frames, warmupLoops) {
    return { phase0: warmupLoops * frames, phase1: (warmupLoops + 1) * frames }
}

/**
 * Render frames `from` to `to`, both included, and return the step that the
 * runtime gave each one (`pipeline.globalUniforms.deltaTime`). A frame counts
 * when `pipeline.frameIndex` advances; a render that the runtime skips while
 * it compiles is not a step, and the frame is rendered again after `settle()`.
 * @param {object} options
 * @param {{frameIndex: number, globalUniforms: {deltaTime: number}}} options.pipeline
 * @param {(time: number) => (void|Promise<void>)} options.render
 * @param {number} options.frames
 * @param {number} options.warmupLoops
 * @param {number} options.from
 * @param {number} options.to
 * @param {() => Promise<unknown>} [options.settle]
 * @returns {Promise<number[]>}
 */
export async function renderSeamFrames({ pipeline, render, frames, warmupLoops, from, to, settle = async () => {} }) {
    const steps = []
    for (let k = from; k <= to; k++) {
        const time = seamFrameTime(k, frames, warmupLoops)
        for (let attempt = 0; ; attempt++) {
            const before = pipeline.frameIndex
            // CanvasRenderer.render() is async for a scene program.
            await render(time)
            if (pipeline.frameIndex !== before) break
            if (attempt === 99) throw new Error(`Frame ${k} was never rendered: the runtime skipped it 100 times`)
            await settle()
        }
        steps.push(pipeline.globalUniforms.deltaTime)
    }
    return steps
}

/** The frames whose step differs from one frame of the loop, 1 / frames, by more than STEP_TOLERANCE. */
export function irregularSteps(steps, frames) {
    return steps.map((step, frame) => ({ frame, step })).filter(({ step }) => !(Math.abs(step - 1 / frames) <= STEP_TOLERANCE))
}

/**
 * Compare two RGBA frames of 0 to 255 channels.
 * @param {{width: number, height: number, data: ArrayLike<number>}} a
 * @param {{width: number, height: number, data: ArrayLike<number>}} b
 * @returns {{maxDifference: number, pixelsAbove2: number, fractionAbove2: number, meanAbsoluteDifference: number, pixelCount: number}}
 */
export function compareSeamFrames(a, b) {
    if (a.width !== b.width || a.height !== b.height || !(a.width > 0 && a.height > 0)) throw new Error('Frame dimensions differ or are empty')
    const pixelCount = a.width * a.height
    if (a.data.length !== pixelCount * 4 || b.data.length !== pixelCount * 4) throw new Error('Invalid frame data length')
    let pixelsAbove2 = 0
    let maxDifference = 0
    let total = 0
    for (let i = 0; i < a.data.length; i += 4) {
        let difference = 0
        for (let c = 0; c < 4; c++) {
            const channel = Math.abs(a.data[i + c] - b.data[i + c])
            total += channel
            difference = Math.max(difference, channel)
        }
        // A pixel counts as compareFrames() counts it: its largest channel difference is above 2.
        if (difference > 2) pixelsAbove2++
        maxDifference = Math.max(maxDifference, difference)
    }
    return { maxDifference, pixelsAbove2, fractionAbove2: pixelsAbove2 / pixelCount, meanAbsoluteDifference: total / (pixelCount * 4), pixelCount }
}

const BACKENDS = ['webgl2', 'webgpu']
/** The longest that one step in the page may take: the setup, or the frames of one phase. */
const EVALUATE_DEADLINE_MS = 10 * 60_000

function checkOptions({ backend, width, height, frames, warmupLoops }) {
    const requested = backend === 'both' ? BACKENDS : [backend]
    if (!requested.every(name => BACKENDS.includes(name))) throw new Error(`--backend must be webgl2, webgpu or both, not ${backend}`)
    for (const [name, value, least] of [['width', width, 1], ['height', height, 1], ['frames', frames, 1], ['warmup loops', warmupLoops, 0]]) {
        if (!Number.isInteger(value) || value < least) throw new Error(`The ${name} must be an integer of at least ${least}, not ${value}`)
    }
    return requested
}

/**
 * Measure the loop seam of a program on each requested backend.
 * @param {string} dsl
 * @param {object} [options]
 * @param {'webgl2'|'webgpu'|'both'} [options.backend]
 * @param {number} [options.width]
 * @param {number} [options.height]
 * @param {number} [options.frames]
 * @param {number} [options.warmupLoops]
 * @param {string} [options.out] - A directory for the two compared frames of each backend, as PNG files
 * @returns {Promise<{run: object, backends: object[]}>}
 */
export async function measureLoopSeam(dsl, {
    backend = 'both', width = DEFAULT_SIZE.width, height = DEFAULT_SIZE.height,
    frames = DEFAULT_FRAMES, warmupLoops = 0, out,
} = {}) {
    const requested = checkOptions({ backend, width, height, frames, warmupLoops })
    const [{ chromium }, { PNG }, fs, path, { execFileSync }, { fileURLToPath }, { shaderTestBrowserOptions }, { isReadbackPerformanceWarning }, { withPageDeadline }] = await Promise.all([
        import('playwright'), import('pngjs'), import('node:fs/promises'), import('node:path'), import('node:child_process'),
        import('node:url'), import('./shader-test-browser.mjs'), import('./shader-parity-attestation.mjs'), import('./agreement-browser.mjs'),
    ])
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
    process.env.SHADE_PROJECT_ROOT ??= root
    process.env.SHADE_EFFECTS_DIR ??= path.join(root, 'shaders/effects')
    const { acquireServer, releaseServer } = await import('../../vendor/shade-mcp/harness/index.js')
    const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
    const run = {
        type: 'run', source: git(['rev-parse', 'HEAD']), dirty: git(['status', '--porcelain']) !== '',
        size: { width, height }, frames, warmupLoops, settleRenders: SETTLE_RENDERS,
    }
    const { phase0, phase1 } = seamFrames(frames, warmupLoops)
    const backends = []
    let browser
    const baseUrl = await acquireServer(0, root, process.env.SHADE_EFFECTS_DIR)
    try {
        browser = await chromium.launch(shaderTestBrowserOptions())
        const browserBuild = browser.version()
        for (const name of requested) {
            const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
            const errors = []
            page.on('pageerror', error => errors.push(error.message))
            page.on('console', message => {
                if (isReadbackPerformanceWarning(message.type(), message.text())) return
                if (['warning', 'error'].includes(message.type())) errors.push(message.text())
            })
            page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`) })
            await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseUrl).origin ? route.continue() : route.abort())
            const failIfErrors = stage => { if (errors.length) throw new Error(`${stage}: ${errors.join('; ')}`) }
            const evaluate = (fn, arg) => withPageDeadline(page, () => page.evaluate(fn, arg), EVALUATE_DEADLINE_MS)
            const readFrame = async () => {
                const frame = PNG.sync.read(await page.locator('canvas').screenshot())
                if (frame.width !== width || frame.height !== height) throw new Error(`presented ${frame.width}x${frame.height}, not ${width}x${height}`)
                return frame
            }
            try {
                await page.goto(`${baseUrl}/shaders/tests/blank.html`)
                await page.setContent(`<style>body{margin:0;background:#000}canvas{display:block}</style><canvas width="${width}" height="${height}"></canvas>`)
                const gpu = await evaluate(setUpProgram, { baseUrl, backend: name, width, height, dsl })
                failIfErrors('setup')
                await evaluate(renderPhase, { baseUrl, frames, warmupLoops, from: 0, to: phase0 })
                failIfErrors('render')
                const first = await readFrame()
                await evaluate(renderPhase, { baseUrl, frames, warmupLoops, from: phase0 + 1, to: phase1 })
                failIfErrors('render')
                const last = await readFrame()
                const steps = await evaluate(() => window.loopSeam.steps)
                if (out) {
                    await fs.mkdir(out, { recursive: true })
                    await fs.writeFile(path.join(out, `${name}-phase0.png`), PNG.sync.write(first))
                    await fs.writeFile(path.join(out, `${name}-phase1.png`), PNG.sync.write(last))
                }
                backends.push({ type: 'backend', backend: name, ...compareSeamFrames(first, last), irregularSteps: irregularSteps(steps, frames), gpu, browser: browserBuild })
            } catch (error) {
                // The cause, without Playwright's prefix and the page's stack.
                const cause = String(error.message).replace(/^page\.evaluate: (Error: )?/, '').split('\n').filter(line => !/^\s+at /.test(line)).join('; ')
                throw new Error(`${name}: ${cause}`)
            } finally {
                await page.close()
            }
        }
    } finally {
        try { await browser?.close() } finally { await releaseServer() }
    }
    return { run, backends }
}

// In the page: compile the program on the requested backend, bind its inputs
// as the agreement harness does, and settle it. Returns the GPU.
async function setUpProgram({ baseUrl, backend, width, height, dsl }) {
    const { CanvasRenderer } = await import(`${baseUrl}/shaders/src/index.js`)
    const { ProgramState } = await import(`${baseUrl}/demo/shaders/lib/program-state.js`)
    const { UIController } = await import(`${baseUrl}/demo/shaders/lib/demo-ui.js`)
    const errors = []
    let adapterInfo = null
    if (navigator.gpu) {
        const request = navigator.gpu.requestAdapter.bind(navigator.gpu)
        navigator.gpu.requestAdapter = async (...args) => {
            const adapter = await request(...args)
            if (adapter) adapterInfo = Object.fromEntries(['vendor', 'architecture', 'device', 'description', 'isFallbackAdapter'].map(key => [key, adapter.info[key]]))
            return adapter
        }
    }
    const r = new CanvasRenderer({ canvas: document.querySelector('canvas'), width, height, basePath: `${baseUrl}/shaders`,
        preferWebGPU: backend === 'webgpu', onError: error => errors.push(error.message || String(error)) })
    const manifest = await r.loadManifest()
    await r.loadEffects(Object.keys(manifest))
    const image = new Image()
    image.src = `${baseUrl}/demo/shaders/img/testcard.png`
    await image.decode()
    const audio = r.setAudioState()
    audio.waveform.set(Float32Array.from({ length: 128 }, (_, i) => i / 127))
    audio.spectrum.set(Float32Array.from({ length: 128 }, (_, i) => (127 - i) / 127))
    const midi = r.setMidiState()
    midi.channels[1].noteOn(48, 110, { time: 0, order: 1 })
    midi.channels[3].noteOn(67, 75, { time: 0, order: 2 })
    try {
        await r.compile(dsl)
    } catch (error) {
        // The compiler throws diagnostics as plain objects as well as errors.
        const detail = error?.message || error?.diagnostics?.map(d => d.message).join('; ') || JSON.stringify(error)
        throw new Error(`The program did not compile: ${detail}`)
    }
    r.stop()
    if (errors.length) throw new Error(`The program did not compile: ${errors.join('\n')}`)
    const actual = r.pipeline.backend.getName().toLowerCase()
    if (actual !== backend) throw new Error(`${backend} is not available: the renderer ran ${actual}`)
    let gpu = adapterInfo
    const gl = r.pipeline.backend.gl
    if (gl) {
        const debug = gl.getExtension('WEBGL_debug_renderer_info')
        gpu = { renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER), vendor: gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR) }
    }
    // The settle render, at time 0, before the inputs are bound.
    await r.render(0)
    const uploaded = new Set()
    for (const pass of r.pipeline.graph.passes) {
        if (uploaded.has(pass.stepIndex)) continue
        uploaded.add(pass.stepIndex)
        const effect = r.loadedEffects.get(pass.effectKey?.replace('.', '/'))?.instance
        if (effect?.externalTexture === 'textTex') {
            const state = new ProgramState()
            state.fromDsl(dsl)
            const params = state.getStepValues(`step_${pass.stepIndex}`)
            const ui = Object.create(UIController.prototype)
            ui._renderer = r
            ui._programState = state
            ui._textInputs = new Map([[pass.stepIndex, {
                ...params, textContent: params.text, canvas: document.createElement('canvas'),
                textureId: `textTex_step_${pass.stepIndex}`,
            }]])
            ui._renderTextToCanvas(pass.stepIndex)
            r.applyStepParameterValues({ [`step_${pass.stepIndex}`]: { textSize: state.getStepValues(`step_${pass.stepIndex}`).textSize } })
        } else if (effect?.externalTexture) {
            const id = `${effect.externalTexture}_step_${pass.stepIndex}`
            const upload = r.updateTextureFromSource(id, image, { flipY: false })
            if (!upload?.width) throw new Error(`Input upload failed: ${id}`)
            r.applyStepParameterValues({ [`step_${pass.stepIndex}`]: { imageSize: [upload.width, upload.height] } })
        }
        if (effect?.externalMesh) {
            const source = Object.values(effect.builtinMeshes || {})[0]
            if (!source) throw new Error(`No standard mesh for ${pass.effectKey}`)
            const loaded = await r.loadOBJFromURL(`${baseUrl}/${source}`, effect.externalMesh)
            if (!loaded.success || !loaded.vertexCount) throw new Error(`Mesh upload failed: ${pass.effectKey}`)
        }
    }
    await r.pipeline.whenAsyncInitsSettled()
    if (errors.length) throw new Error(`The program did not render: ${errors.join('\n')}`)
    window.loopSeam = { renderer: r, errors, steps: [] }
    return gpu
}

// In the page: render frames `from` to `to`, and wait until the GPU has done them.
async function renderPhase({ baseUrl, frames, warmupLoops, from, to }) {
    const { renderSeamFrames } = await import(`${baseUrl}/scripts/lib/loop-seam.mjs`)
    const { renderer, errors, steps } = window.loopSeam
    // A render that throws does not advance the frame either. Name its cause
    // instead of retrying it as a skipped render.
    const render = async time => {
        if (!renderer.pipeline || renderer.isContextLost) throw new Error('The program did not render: the renderer has no pipeline or lost its context')
        await renderer.render(time)
        if (errors.length) throw new Error(`The program did not render: ${errors.join('; ')}`)
    }
    steps.push(...await renderSeamFrames({
        pipeline: renderer.pipeline, render, frames, warmupLoops, from, to,
        settle: () => renderer.pipeline.whenAsyncInitsSettled(),
    }))
    await renderer.pipeline.backend.device?.queue.onSubmittedWorkDone()
    if (errors.length) throw new Error(`The program did not render: ${errors.join('\n')}`)
}

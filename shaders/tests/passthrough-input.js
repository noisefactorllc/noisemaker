/**
 * Repository-side true input-passthrough measurement (GAP-019).
 *
 * The upstream Shade MCP verb (vendor/shade-mcp/harness/index.js, originally
 * `src/tools/browser/passthrough.ts` - `testNoPassthrough()`) never injects
 * or reads an input texture: it renders the effect at times 0 and 1, compares
 * the two frames (`temporalDiff > 0.01`), and counts unique colors
 * (`uniqueColors > 5`). Its name overstates what is measured - a static
 * varied passthrough passes, and true input passthrough is not tested. Its
 * source lives in the Shade repository, which noisemaker cannot write (a
 * `pull-shade-mcp` vendor refresh replaces the vendored bundle wholesale, so
 * hand edits there are not a resolution).
 *
 * This module is the repository-side truth source. Its in-page probe
 * (`measureInputPassthroughInPage()`) renders the live effect paused at time
 * 0, reads back the input texture the effect's expanded graph actually
 * consumes, reads back the rendered output surface, and reports the measured
 * mean absolute per-channel difference between output and input under both
 * vertical orientations - so a true passthrough (output identical to input)
 * is measured directly instead of inferred from temporal variation.
 *
 * The probe also measures an in-program positive control: the final write
 * blit pass that copies the last node output into the render surface is a
 * genuine passthrough inside every expanded program, so a control diff near
 * zero on every run demonstrates the comparison machinery detects a true
 * passthrough rather than always reporting "effect modifies input".
 *
 * The passthrough boundary is not invented: it is the same source-grounded
 * `0.01` the upstream tool already uses for its temporal metric (reused by
 * GAP-009 as `NO_ANIMATION_TEMPORAL_DIFF_MAX` in `frame-metrics.js`). An
 * effect is a true input passthrough only when its output-to-input mean
 * absolute per-channel difference is at or below that boundary under the
 * better-matching orientation.
 */

import { NO_ANIMATION_TEMPORAL_DIFF_MAX } from './frame-metrics.js'

/**
 * Output-to-input mean absolute per-channel difference at or below this
 * value classifies the effect as a true input passthrough. Same source
 * boundary as the upstream temporal metric (`temporalDiff > 0.01`).
 */
export const INPUT_PASSTHROUGH_DIFF_MAX = NO_ANIMATION_TEMPORAL_DIFF_MAX

/**
 * The pipeline input names an effect definition can declare as pass inputs —
 * the same set the renderer's `isStarterEffect()` (shaders/src/renderer/
 * canvas.js) treats as "needs pipeline input". An effect is a filter-type
 * consumer when its definition-level passes reference one of these; this is
 * the repository's own classification, not the upstream substring rule,
 * which matches nothing in noisemaker's expanded graphs.
 */
const PIPELINE_INPUT_NAMES = new Set([
    'inputTex', 'inputTex3d',
    'o0', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7',
])

/**
 * Repository-side filter classification, mirroring the renderer's
 * `isStarterEffect()` rule over the effect's definition-level passes: an
 * effect consumes pipeline input when any pass input value is one of the
 * pipeline input names. (The upstream verb instead tests EXPANDED pass
 * input values for the substring `input`; in noisemaker those values are
 * concrete texture ids like `node_0_out`, so the upstream rule matches
 * nothing and its check reports `skipped` for every effect.)
 *
 * @param {Array<{inputs?: object}>|null|undefined} definitionPasses
 * @returns {boolean} True when the definition consumes pipeline input.
 */
export function isFilterEffectDefinition(definitionPasses) {
    if (!Array.isArray(definitionPasses)) return false
    return definitionPasses.some((pass) => {
        const inputs = pass?.inputs || {}
        return Object.values(inputs).some((v) => PIPELINE_INPUT_NAMES.has(v))
    })
}

/**
 * The texture id whose contents the effect actually consumes as its input:
 * the first expanded pass (graph order) whose input KEY is a pipeline input
 * name (expanded graphs keep the definition's uniform-name keys, e.g.
 * `inputTex`, and bind the value to the producing node's output texture).
 *
 * @param {Array<{inputs?: object}>|null|undefined} expandedPasses
 * @returns {string|null} The consumed input texture id, or null.
 */
export function firstConsumedInputId(expandedPasses) {
    if (!Array.isArray(expandedPasses)) return null
    for (const pass of expandedPasses) {
        const inputs = pass?.inputs || {}
        for (const [key, value] of Object.entries(inputs)) {
            if (PIPELINE_INPUT_NAMES.has(key) && typeof value === 'string' && value) return value
        }
    }
    return null
}

/**
 * The write-blit pass that copies into the render surface: the pass whose
 * outputs include the render surface name. Its input is the positive
 * control - a genuine passthrough inside every expanded program.
 *
 * @param {Array<{id?: string, inputs?: object, outputs?: object}>|null|undefined} passes
 * @param {string} renderSurface - The graph's render surface name (e.g. `o0`).
 * @returns {string|null} The blit source texture id, or null.
 */
export function blitControlSourceId(passes, renderSurface) {
    if (!Array.isArray(passes) || !renderSurface) return null
    const targets = new Set([renderSurface, `global_${renderSurface}`])
    for (const pass of passes) {
        const outputs = pass?.outputs || {}
        if (Object.values(outputs).some((v) => targets.has(v))) {
            const inputs = pass?.inputs || {}
            const source = Object.values(inputs)[0]
            if (typeof source === 'string' && source) return source
        }
    }
    return null
}

/**
 * Upstream sampling stride: `Math.max(1, Math.floor(pixelCount / 1000))`
 * (vendor bundle, `testNoPassthrough()`), sampling approximately 1000 pixels.
 *
 * @param {number} pixelCount - Total pixel count of the sampled image.
 * @returns {number} Index stride (>= 1).
 */
export function sampleStrideFor(pixelCount) {
    return Math.max(1, Math.floor(pixelCount / 1000))
}

/**
 * Mean absolute per-channel RGB difference between the rendered output and
 * the consumed input, sampling the output on the upstream strided grid and
 * mapping each output sample into the input texture by normalized UV
 * (nearest texel). Both readbacks use the same origin convention (the
 * backend `readPixels` row order), so the aligned orientation compares the
 * shader's natural sampling direction; the flipped orientation covers
 * effects that legitimately mirror their input vertically.
 *
 * @param {{width: number, height: number, data: Uint8Array|Uint8ClampedArray|Float32Array}} inputPixels
 * @param {{width: number, height: number, data: Uint8Array|Uint8ClampedArray|Float32Array}} outputPixels
 * @returns {{aligned: number, flipped: number, min: number, orientation: string, samples: number}|null}
 *   Null when either readback is unusable.
 */
export function compareOutputToInput(inputPixels, outputPixels) {
    if (!inputPixels?.data || !outputPixels?.data) return null
    const outW = outputPixels.width
    const outH = outputPixels.height
    const inW = inputPixels.width
    const inH = inputPixels.height
    if (!outW || !outH || !inW || !inH) return null
    if (!(inputPixels.data.length >= inW * inH * 4) || !(outputPixels.data.length >= outW * outH * 4)) return null
    const normFor = (pixels) => {
        const isByte = !(pixels.data instanceof Float32Array)
        return (v) => {
            const x = isByte ? v / 255 : v
            return x < 0 ? 0 : x > 1 ? 1 : x
        }
    }
    const normOut = normFor(outputPixels)
    const normIn = normFor(inputPixels)
    const stride = sampleStrideFor(outW * outH)
    let diffSum = 0
    let flippedSum = 0
    let samples = 0
    for (let i = 0; i < outW * outH; i += stride) {
        const x = i % outW
        const y = Math.floor(i / outW)
        const ix = Math.min(inW - 1, Math.floor((x / outW) * inW))
        const iyAligned = Math.min(inH - 1, Math.floor((y / outH) * inH))
        const iyFlipped = Math.min(inH - 1, Math.floor(((outH - 1 - y) / outH) * inH))
        const oi = i * 4
        const ia = (iyAligned * inW + ix) * 4
        const iff = (iyFlipped * inW + ix) * 4
        for (let c = 0; c < 3; c++) {
            const out = normOut(outputPixels.data[oi + c])
            diffSum += Math.abs(out - normIn(inputPixels.data[ia + c]))
            flippedSum += Math.abs(out - normIn(inputPixels.data[iff + c]))
        }
        samples++
    }
    if (samples === 0) return null
    const aligned = diffSum / (samples * 3)
    const flipped = flippedSum / (samples * 3)
    const orientation = flipped < aligned ? 'flipped' : 'aligned'
    return { aligned, flipped, min: Math.min(aligned, flipped), orientation, samples }
}

/**
 * Classify a measured comparison against `INPUT_PASSTHROUGH_DIFF_MAX`.
 * At-or-below the boundary is a true input passthrough (the upstream
 * boundary is exclusive for "modifies": `temporalDiff > 0.01`).
 *
 * @param {{min: number}|null} comparison - `compareOutputToInput()` result.
 * @returns {boolean|null} Null when there is no usable comparison.
 */
export function isInputPassthrough(comparison) {
    if (!comparison || typeof comparison.min !== 'number') return null
    return comparison.min <= INPUT_PASSTHROUGH_DIFF_MAX
}

/**
 * Ordered render-surface texture candidates for `backend.readPixels()`.
 * Mirrors the established repository readback order (frame-read texture for
 * the graph's render surface, then `global_<surface>_read`,
 * `global_<surface>_write`, then the highest-index `node_<n>_out`).
 *
 * @param {object|null} pipeline - The live rendering pipeline.
 * @param {object} [backend] - The pipeline backend (defaults to pipeline's).
 * @returns {string[]} Ordered, deduplicated texture ids.
 */
export function renderSurfaceCandidateIds(pipeline, backend = pipeline?.backend) {
    const candidates = []
    const surface = pipeline?.graph?.renderSurface
    const frameReadId = surface ? pipeline?.frameReadTextures?.get(surface) : null
    if (frameReadId) candidates.push(frameReadId)
    if (surface) {
        candidates.push(`global_${surface}_read`)
        candidates.push(`global_${surface}_write`)
    }
    try {
        const nodeIds = []
        for (const key of backend?.textures?.keys() ?? []) {
            if (/node_\d+_out/.test(key)) nodeIds.push(key)
        }
        nodeIds.sort((a, b) => parseInt(a.match(/node_(\d+)/)[1], 10) - parseInt(b.match(/node_(\d+)/)[1], 10))
        if (nodeIds.length) candidates.push(nodeIds[nodeIds.length - 1])
    } catch {
        // Some backends do not expose a texture map in harness mode.
    }
    return [...new Set(candidates)]
}

/**
 * In-page probe (runs inside `page.evaluate`). Renders the live effect
 * paused at time 0, reads back the consumed input texture, the render
 * surface, and the write-blit control source, and reports the measured
 * output-to-input similarity. Restores unpaused playback in `finally`.
 *
 * @param {{canvasRenderer: string, renderingPipeline: string, currentEffect: string, setPaused: string, setPausedTime: string}} globals
 * @returns {Promise<object>} Probe result (see module header).
 */
export async function measureInputPassthroughInPage({ globals }) {
    const w = window
    const renderer = w[globals.canvasRenderer]
    const pipeline = w[globals.renderingPipeline]
    const effect = w[globals.currentEffect]
    const threshold = 0.01
    if (!renderer || !pipeline || !effect) {
        return { status: 'error', threshold, is_filter_effect: null, input_texture_id: null, details: 'No effect loaded' }
    }
    const backend = pipeline.backend
    if (!backend || typeof backend.readPixels !== 'function') {
        return { status: 'error', threshold, is_filter_effect: null, input_texture_id: null, details: 'No async pixel readback' }
    }

    const definitionPasses = effect.instance?.passes || []
    const pipelineInputNames = new Set([
        'inputTex', 'inputTex3d',
        'o0', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7',
    ])
    const isFilter = definitionPasses.some((pass) => {
        const inputs = pass?.inputs || {}
        return Object.values(inputs).some((v) => pipelineInputNames.has(v))
    })
    const passes = pipeline.graph?.passes || []
    let inputTexId = null
    for (const pass of passes) {
        const inputs = pass?.inputs || {}
        for (const [key, value] of Object.entries(inputs)) {
            if (pipelineInputNames.has(key) && typeof value === 'string' && value) { inputTexId = value; break }
        }
        if (inputTexId) break
    }
    if (!isFilter || !inputTexId) {
        return {
            status: 'skipped',
            threshold,
            is_filter_effect: isFilter,
            input_texture_id: inputTexId,
            details: 'Not a filter effect',
        }
    }
    const renderSurface = pipeline.graph?.renderSurface
    const blitTargets = new Set([renderSurface, `global_${renderSurface}`].filter(Boolean))
    let controlSourceId = null
    for (const pass of passes) {
        const outputs = pass?.outputs || {}
        if (Object.values(outputs).some((v) => blitTargets.has(v))) {
            const source = Object.values(pass?.inputs || {})[0]
            if (typeof source === 'string' && source) controlSourceId = source
        }
    }

    if (w[globals.setPaused]) w[globals.setPaused](true)
    if (w[globals.setPausedTime]) w[globals.setPausedTime](0)

    const readPixels = async (textureId) => {
        if (!textureId) return null
        try {
            const pixels = await backend.readPixels(textureId)
            if (pixels?.width && pixels?.height && pixels?.data) return pixels
        } catch {
            // Fall through to the unusable-readback path.
        }
        return null
    }

    // Inlined render-surface candidate order (mirrors frame-readback.js,
    // which cannot be imported inside a serialized page.evaluate body). The
    // pipeline's frame-read texture for the render surface comes first: it
    // names the correct half of the double-buffered surface for the frame
    // just rendered, where a fixed `global_<surface>_read` guess can pick
    // the stale half after the ping-pong swap.
    const readPixelsViaCandidates = async () => {
        const candidates = []
        const surface = pipeline.graph?.renderSurface
        const frameReadId = surface ? pipeline.frameReadTextures?.get(surface) : null
        if (frameReadId) candidates.push(frameReadId)
        if (surface) {
            candidates.push(`global_${surface}_read`)
            candidates.push(`global_${surface}_write`)
        }
        try {
            const nodeIds = []
            for (const key of backend.textures.keys()) {
                if (/node_\d+_out/.test(key)) nodeIds.push(key)
            }
            nodeIds.sort((a, b) => parseInt(a.match(/node_(\d+)/)[1], 10) - parseInt(b.match(/node_(\d+)/)[1], 10))
            if (nodeIds.length) candidates.push(nodeIds[nodeIds.length - 1])
        } catch {
            // Some backends do not expose a texture map in harness mode.
        }
        for (const textureId of [...new Set(candidates)]) {
            const pixels = await readPixels(textureId)
            if (pixels) return pixels
        }
        return null
    }

    try {
        renderer.render(0)
        const firstOutput = await readPixelsViaCandidates()
        const inputPixels = await readPixels(inputTexId)
        // Determinism guard: a second paused render at the same time must
        // reproduce the output bit-for-bit; a diverging readback means an
        // async recompile or loop frame interleaved with the probe (GAP-024
        // async load), and no verdict is invented from inconsistent state.
        renderer.render(0)
        const outputPixels = await readPixelsViaCandidates()
        if (!firstOutput || !outputPixels || !inputPixels) {
            return {
                status: 'error',
                threshold,
                is_filter_effect: true,
                input_texture_id: inputTexId,
                control_texture_id: controlSourceId,
                details: 'Failed to read pixels',
            }
        }
        let unstable = false
        {
            const a = firstOutput.data
            const b = outputPixels.data
            if (a.length === b.length) {
                for (let i = 0; i < a.length; i += 4) {
                    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) { unstable = true; break }
                }
            } else unstable = true
        }
        if (unstable) {
            return {
                status: 'error',
                threshold,
                is_filter_effect: true,
                input_texture_id: inputTexId,
                control_texture_id: controlSourceId,
                details: 'Unstable readback: paused renders disagree',
            }
        }
        const controlPixels = controlSourceId ? await readPixels(controlSourceId) : null

        // Same strided sampling and UV mapping as the node-side mirror; both
        // orientations are compared and the better-matching one decides.
        const outW = outputPixels.width
        const outH = outputPixels.height
        const inW = inputPixels.width
        const inH = inputPixels.height
        const normFor = (pixels) => {
            const isByte = !(pixels.data instanceof Float32Array)
            return (v) => {
                const x = isByte ? v / 255 : v
                return x < 0 ? 0 : x > 1 ? 1 : x
            }
        }
        const norm = normFor(outputPixels)
        const normInput = normFor(inputPixels)
        const stride = Math.max(1, Math.floor((outW * outH) / 1000))
        let diffSum = 0
        let flippedSum = 0
        let samples = 0
        for (let i = 0; i < outW * outH; i += stride) {
            const x = i % outW
            const y = Math.floor(i / outW)
            const ix = Math.min(inW - 1, Math.floor((x / outW) * inW))
            const iyAligned = Math.min(inH - 1, Math.floor((y / outH) * inH))
            const iyFlipped = Math.min(inH - 1, Math.floor(((outH - 1 - y) / outH) * inH))
            const oi = i * 4
            const ia = (iyAligned * inW + ix) * 4
            const iff = (iyFlipped * inW + ix) * 4
            for (let c = 0; c < 3; c++) {
                const out = norm(outputPixels.data[oi + c])
                diffSum += Math.abs(out - normInput(inputPixels.data[ia + c]))
                flippedSum += Math.abs(out - normInput(inputPixels.data[iff + c]))
            }
            samples++
        }
        const aligned = samples > 0 ? diffSum / (samples * 3) : null
        const flipped = samples > 0 ? flippedSum / (samples * 3) : null
        const min = aligned === null ? null : Math.min(aligned, flipped)
        const orientation = aligned === null ? null : (flipped < aligned ? 'flipped' : 'aligned')
        const isPassthrough = min === null ? null : min <= threshold

        // Positive control: the write blit copies its source into the render
        // surface, so its output-to-input diff must sit at the passthrough
        // boundary for the comparison machinery to be trusted.
        let controlMeanAbsDiff = null
        let controlIsPassthrough = null
        if (controlPixels) {
            const cW = controlPixels.width
            const cH = controlPixels.height
            const cNorm = normFor(controlPixels)
            const cStride = Math.max(1, Math.floor((outW * outH) / 1000))
            let cSum = 0
            let cSamples = 0
            for (let i = 0; i < outW * outH; i += cStride) {
                const x = i % outW
                const y = Math.floor(i / outW)
                const cx = Math.min(cW - 1, Math.floor((x / outW) * cW))
                const cy = Math.min(cH - 1, Math.floor((y / outH) * cH))
                const oi = i * 4
                const ci = (cy * cW + cx) * 4
                for (let c = 0; c < 3; c++) {
                    cSum += Math.abs(norm(outputPixels.data[oi + c]) - cNorm(controlPixels.data[ci + c]))
                }
                cSamples++
            }
            controlMeanAbsDiff = cSamples > 0 ? cSum / (cSamples * 3) : null
            controlIsPassthrough = controlMeanAbsDiff === null ? null : controlMeanAbsDiff <= threshold
        }

        return {
            status: 'ok',
            threshold,
            is_filter_effect: true,
            input_texture_id: inputTexId,
            control_texture_id: controlSourceId,
            input_size: [inW, inH],
            output_size: [outW, outH],
            mean_abs_diff: aligned,
            mean_abs_diff_flipped: flipped,
            min,
            orientation,
            samples,
            is_input_passthrough: isPassthrough,
            control_mean_abs_diff: controlMeanAbsDiff,
            control_is_passthrough: controlIsPassthrough,
            details: isPassthrough
                ? 'Output matches consumed input (true input passthrough)'
                : 'Output differs from consumed input',
        }
    } finally {
        if (w[globals.setPaused]) w[globals.setPaused](false)
    }
}

/**
 * Run the in-page probe against a harness browser session.
 *
 * @param {{page: object, runWithConsoleCapture: Function, globals: object}} session
 * @param {object} [globalsOverride] - Globals override (defaults to session's).
 * @returns {Promise<object>} The `measureInputPassthroughInPage()` result.
 */
export async function measureInputPassthroughForSession(session, globalsOverride) {
    const globals = globalsOverride ?? session.globals
    return session.runWithConsoleCapture(async () =>
        session.page.evaluate(measureInputPassthroughInPage, { globals }))
}

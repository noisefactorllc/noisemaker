/**
 * Repository-side uniform responsiveness measurement with reported deltas.
 *
 * The upstream Shade MCP tool (vendor/shade-mcp/harness/index.js,
 * `testUniformResponsiveness()`, originally `src/tools/browser/uniforms.ts`)
 * reports only `name:pass` / `name:fail` strings: the measured luma and
 * per-channel deltas stay inside the tool, so a caller cannot audit the
 * `>0.002` response threshold from the report alone (GAP-011).
 *
 * This module is the repository-side truth source: it re-measures every
 * testable uniform in the live pipeline and returns the measured deltas in
 * the report, so callers (including the harness's `--uniforms` run) can audit
 * the threshold from the report alone. The upstream tool itself is unchanged —
 * a vendor refresh cannot remove this measurement. The classification
 * mirrors `uniform-status.js` semantics: the outer status is derived from
 * every entry, never "ok when any uniform passes".
 */

/**
 * The response threshold, identical to the upstream tool's: a uniform
 * "responds" when its measured luma delta OR its largest per-channel delta
 * is strictly greater than this value.
 */
export const UNIFORM_RESPONSE_THRESHOLD = 0.002

/**
 * Mean R/G/B of a full RGBA byte grid, normalized to 0..1 — the same
 * computation the upstream tool performs over `gl.readPixels` output.
 *
 * @param {Uint8Array|Uint8ClampedArray} pixels - RGBA bytes, 4 per pixel.
 * @param {number} width - Pixel width.
 * @param {number} height - Pixel height.
 * @returns {number[]} `[meanR, meanG, meanB]` in 0..1.
 */
export function meanChannels(pixels, width, height) {
    const count = width * height
    let sumR = 0
    let sumG = 0
    let sumB = 0
    for (let i = 0; i < pixels.length; i += 4) {
        sumR += pixels[i] / 255
        sumG += pixels[i + 1] / 255
        sumB += pixels[i + 2] / 255
    }
    return [sumR / count, sumG / count, sumB / count]
}

/**
 * Measure the luma and max per-channel deltas between two captures and
 * classify responsiveness against `UNIFORM_RESPONSE_THRESHOLD`.
 *
 * @param {number[]} baseline - `[meanR, meanG, meanB]` of the default frame.
 * @param {number[]} test - `[meanR, meanG, meanB]` of the test-value frame.
 * @returns {{luma_diff: number, max_channel_diff: number, responds: boolean}}
 */
export function measureUniformDeltas(baseline, test) {
    const lumaDiff = Math.abs(
        (test[0] + test[1] + test[2]) / 3 - (baseline[0] + baseline[1] + baseline[2]) / 3,
    )
    const maxChannelDiff = Math.max(
        Math.abs(test[0] - baseline[0]),
        Math.abs(test[1] - baseline[1]),
        Math.abs(test[2] - baseline[2]),
    )
    return {
        luma_diff: lumaDiff,
        max_channel_diff: maxChannelDiff,
        responds: lumaDiff > UNIFORM_RESPONSE_THRESHOLD || maxChannelDiff > UNIFORM_RESPONSE_THRESHOLD,
    }
}

/**
 * Classify a measured run truthfully from every entry (GAP-010 semantics):
 * `ok` only when at least one entry exists and every entry passed, `fail`
 * when any failed, `error` when any capture failed, `skipped` when there
 * were no testable uniforms.
 *
 * @param {{uniform_deltas: Array<{responds: boolean|null}>, error: string|undefined}} measured
 * @returns {'ok'|'fail'|'error'|'skipped'}
 */
export function classifyMeasuredUniforms(measured) {
    if (!measured || !Array.isArray(measured.uniform_deltas)) return 'error'
    if (measured.error) return 'error'
    if (measured.uniform_deltas.length === 0) return 'skipped'
    let sawFail = false
    for (const delta of measured.uniform_deltas) {
        if (delta.responds === null || delta.responds === undefined) return 'error'
        if (!delta.responds) sawFail = true
    }
    return sawFail ? 'fail' : 'ok'
}

/**
 * Cross-check the upstream tool's `:pass`/`name:fail` verdicts against the
 * repository-side measured deltas. `:error` entries and uniforms that were
 * not measured are skipped (no data — never an invented mismatch).
 *
 * @param {object|null} upstreamResult - The upstream tool result
 *   (`{ tested_uniforms: ['name:pass', ...] }`).
 * @param {object|null} measured - This module's measurement result.
 * @returns {{mismatches: Array<{name: string, upstream: string, measured: string}>}}
 */
export function auditUniformResponsiveness(upstreamResult, measured) {
    const deltas = new Map()
    for (const delta of measured?.uniform_deltas ?? []) {
        if (delta && typeof delta.name === 'string') deltas.set(delta.name, delta)
    }
    const mismatches = []
    for (const entry of Array.isArray(upstreamResult?.tested_uniforms) ? upstreamResult.tested_uniforms : []) {
        if (typeof entry !== 'string') continue
        const separator = entry.lastIndexOf(':')
        if (separator <= 0) continue
        const name = entry.slice(0, separator)
        const verdict = entry.slice(separator + 1)
        const delta = deltas.get(name)
        if (!delta || typeof delta.responds !== 'boolean') continue
        if (verdict === 'pass' && !delta.responds) {
            mismatches.push({ name, upstream: 'pass', measured: 'flat' })
        } else if (verdict === 'fail' && delta.responds) {
            mismatches.push({ name, upstream: 'fail', measured: 'responds' })
        }
    }
    return { mismatches }
}

/**
 * In-page measurement pass. Runs in the browser via `page.evaluate`: pauses
 * animation, reads the render surface through the backend's `readPixels`
 * (both WebGPU and WebGL2), then for every testable uniform captures the
 * frame at a test value and restores the default, reporting each measured
 * delta. Mirrors the upstream tool's uniform selection and test-value rules
 * exactly.
 *
 * @param {{canvasRenderer: string, renderingPipeline: string, currentEffect: string, setPaused: string, setPausedTime: string}} globals
 * @returns {Promise<object>} `{ status, threshold, uniform_deltas, tested_uniforms, details }`.
 */
export async function measureUniformResponsivenessInPage({ globals }) {
    const w = window
    const renderer = w[globals.canvasRenderer]
    const pipeline = w[globals.renderingPipeline]
    const effect = w[globals.currentEffect]
    const threshold = 0.002
    if (!renderer || !pipeline || !effect?.instance?.globals) {
        return { status: 'error', threshold, uniform_deltas: [], tested_uniforms: [], details: 'No effect loaded' }
    }
    const backend = pipeline.backend
    if (w[globals.setPaused]) w[globals.setPaused](true)
    if (w[globals.setPausedTime]) w[globals.setPausedTime](0)

    const readSurface = async () => {
        if (!backend || typeof backend.readPixels !== 'function') return null
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
            try {
                const pixels = await backend.readPixels(textureId)
                if (pixels?.width && pixels?.height && pixels?.data) return pixels
            } catch {
                // Try the next candidate texture.
            }
        }
        return null
    }

    const capture = async () => {
        renderer.render(0)
        const pixels = await readSurface()
        if (!pixels) return null
        const count = pixels.width * pixels.height
        let sumR = 0
        let sumG = 0
        let sumB = 0
        for (let i = 0; i < pixels.data.length; i += 4) {
            sumR += pixels.data[i] / 255
            sumG += pixels.data[i + 1] / 255
            sumB += pixels.data[i + 2] / 255
        }
        return [sumR / count, sumG / count, sumB / count]
    }

    try {
        const baseline = await capture()
        if (!baseline) {
            return { status: 'error', threshold, uniform_deltas: [], tested_uniforms: [], details: 'Failed to capture baseline' }
        }
        const effectGlobals = effect.instance.globals
        const uniform_deltas = []
        const tested_uniforms = []
        for (const [name, spec] of Object.entries(effectGlobals)) {
            if (!spec.uniform) continue
            if (spec.type === 'boolean' || spec.type === 'button') continue
            if (typeof spec.min !== 'number' || typeof spec.max !== 'number' || spec.min === spec.max) continue
            const defaultVal = spec.default ?? spec.min
            const range = spec.max - spec.min
            let testVal = defaultVal === spec.min ? spec.min + range * 0.75 : spec.min + range * 0.25
            if (spec.type === 'int') testVal = Math.round(testVal)
            if (pipeline.setUniform) pipeline.setUniform(spec.uniform, testVal)
            else if (pipeline.globalUniforms) pipeline.globalUniforms[spec.uniform] = testVal
            const test = await capture()
            if (test) {
                const lumaDiff = Math.abs(
                    (test[0] + test[1] + test[2]) / 3 - (baseline[0] + baseline[1] + baseline[2]) / 3,
                )
                const maxChannelDiff = Math.max(
                    Math.abs(test[0] - baseline[0]),
                    Math.abs(test[1] - baseline[1]),
                    Math.abs(test[2] - baseline[2]),
                )
                const responds = lumaDiff > threshold || maxChannelDiff > threshold
                uniform_deltas.push({
                    name,
                    default_value: defaultVal,
                    test_value: testVal,
                    luma_diff: lumaDiff,
                    max_channel_diff: maxChannelDiff,
                    responds,
                })
                tested_uniforms.push(`${name}:${responds ? 'pass' : 'fail'}`)
            } else {
                uniform_deltas.push({
                    name,
                    default_value: defaultVal,
                    test_value: testVal,
                    luma_diff: null,
                    max_channel_diff: null,
                    responds: null,
                })
                tested_uniforms.push(`${name}:error`)
            }
            if (pipeline.setUniform) pipeline.setUniform(spec.uniform, defaultVal)
            else if (pipeline.globalUniforms) pipeline.globalUniforms[spec.uniform] = defaultVal
        }
        let status = 'ok'
        if (tested_uniforms.length === 0) status = 'skipped'
        else if (tested_uniforms.some((entry) => entry.endsWith(':error'))) status = 'error'
        else if (tested_uniforms.some((entry) => entry.endsWith(':fail'))) status = 'fail'
        return {
            status,
            threshold,
            uniform_deltas,
            tested_uniforms,
            details: status === 'ok'
                ? 'Uniforms affect output'
                : status === 'skipped'
                    ? 'No testable uniforms'
                    : status === 'fail'
                        ? 'No uniforms affected output'
                        : 'Uniform capture failed',
        }
    } finally {
        if (w[globals.setPaused]) w[globals.setPaused](false)
    }
}

/**
 * Run the repository-side measurement against a harness browser session.
 *
 * @param {{page: object, runWithConsoleCapture: Function, globals: object}} session
 * @param {object} [globalsOverride] - Globals override (defaults to session's).
 * @returns {Promise<object>} The `measureUniformResponsivenessInPage()` result.
 */
export async function measureUniformDeltasForSession(session, globalsOverride) {
    const globals = globalsOverride ?? session.globals
    return session.runWithConsoleCapture(async () =>
        session.page.evaluate(measureUniformResponsivenessInPage, { globals }))
}

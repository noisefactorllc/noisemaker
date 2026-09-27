#!/usr/bin/env node
/**
 * GAP-015: an auditable node-side mirror of the metric implementations behind
 * the Shade MCP verbs and the vendored library helper, so the
 * interchangeability of each shared metric field is testable in this
 * repository without a browser.
 *
 * The upstream Shade MCP sources (`src/tools/browser/render.ts`, `dsl.ts`,
 * `parity.ts`) live in the Shade repository, which noisemaker cannot write.
 * This module mirrors what this repository vendors
 * (`vendor/shade-mcp/harness/index.js`, originally those sources plus
 * `src/harness/pixel-reader.ts`): the canonical render-verb and dsl-verb
 * metric computations, the shared strided sample grid, and a per-field
 * audit against the vendored library helper's output.
 *
 * The register row (llms-full.txt GAP-015): "Similar metrics are computed by
 * separate helpers with different sample grids/blank heuristics — metric
 * names cannot be assumed numerically interchangeable across verbs." The
 * audit below turns that warning into a per-field, data-checked verdict:
 * which fields are exactly equal across implementations for identical byte
 * input, and which genuinely diverge and why.
 */

/** Every strided helper samples approximately this many pixels. */
export const VERB_SAMPLE_TARGET = 1000

/**
 * The shared strided sample grid. The render verb, the dsl verb, and the
 * vendored library helper (`computeImageMetrics`) all walk the pixel list
 * with this stride; the parity verb does not (it compares the full image
 * per channel).
 *
 * @param {number} pixelCount - Total pixel count (width * height).
 * @returns {number} Stride in pixels.
 */
export function sampleStrideFor(pixelCount) {
    return Math.max(1, Math.floor(pixelCount / VERB_SAMPLE_TARGET))
}

/**
 * The pixel indices the shared grid visits, in order.
 *
 * @param {number} pixelCount - Total pixel count (width * height).
 * @returns {number[]} Sampled pixel indices.
 */
export function sampleIndicesFor(pixelCount) {
    const stride = sampleStrideFor(pixelCount)
    const indices = []
    for (let i = 0; i < pixelCount; i += stride) indices.push(i)
    return indices
}

/**
 * Canonical mirror of the render verb's in-page metric computation
 * (vendor/shade-mcp/harness/index.js, originally
 * `src/tools/browser/render.ts`): Uint8 RGBA bytes, the shared strided grid,
 * exact RGB byte-triple color set, luma variance computed from per-sample
 * luma against the mean-of-means luma, and the luma-variance blank
 * heuristic. This replicates the verb's formulas exactly, including the
 * unclamped variance square roots, so repository-side callers can compute
 * verb-identical metrics from pixels they already hold in Node.
 *
 * @param {Uint8Array} data - RGBA bytes, length width * height * 4.
 * @param {number} width
 * @param {number} height
 * @returns {object} The render verb's full ImageMetrics shape.
 */
export function computeRenderVerbMetrics(data, width, height) {
    const pixelCount = width * height
    const stride = sampleStrideFor(pixelCount)
    let sumR = 0
    let sumG = 0
    let sumB = 0
    let sumA = 0
    let sumR2 = 0
    let sumG2 = 0
    let sumB2 = 0
    let samples = 0
    const colorSet = new Set()
    for (let i = 0; i < pixelCount; i += stride) {
        const idx = i * 4
        const r = data[idx] / 255
        const g = data[idx + 1] / 255
        const b = data[idx + 2] / 255
        const a = data[idx + 3] / 255
        sumR += r
        sumG += g
        sumB += b
        sumA += a
        sumR2 += r * r
        sumG2 += g * g
        sumB2 += b * b
        colorSet.add(`${data[idx]},${data[idx + 1]},${data[idx + 2]}`)
        samples++
    }
    const meanR = sumR / samples
    const meanG = sumG / samples
    const meanB = sumB / samples
    const stdR = Math.sqrt(sumR2 / samples - meanR * meanR)
    const stdG = Math.sqrt(sumG2 / samples - meanG * meanG)
    const stdB = Math.sqrt(sumB2 / samples - meanB * meanB)
    const luma = 0.299 * meanR + 0.587 * meanG + 0.114 * meanB
    let lumaVar = 0
    for (let i = 0; i < pixelCount; i += stride) {
        const idx = i * 4
        const sampleLuma = 0.299 * data[idx] / 255 + 0.587 * data[idx + 1] / 255 + 0.114 * data[idx + 2] / 255
        lumaVar += (sampleLuma - luma) * (sampleLuma - luma)
    }
    lumaVar /= samples
    return {
        mean_rgb: [meanR, meanG, meanB],
        mean_alpha: sumA / samples,
        std_rgb: [stdR, stdG, stdB],
        luma_variance: lumaVar,
        unique_sampled_colors: colorSet.size,
        is_all_zero: meanR === 0 && meanG === 0 && meanB === 0,
        is_all_transparent: sumA / samples < 0.01,
        is_essentially_blank: lumaVar < 1e-4,
        is_monochrome: colorSet.size <= 1,
    }
}

/**
 * Canonical mirror of the dsl verb's in-page metric computation
 * (vendor/shade-mcp/harness/index.js, originally
 * `src/tools/browser/dsl.ts`): a strict four-field subset of the render
 * verb's shape on the same shared strided grid, with no alpha sums, no
 * luma variance, and no blank heuristic.
 *
 * @param {Uint8Array} data - RGBA bytes, length width * height * 4.
 * @param {number} width
 * @param {number} height
 * @returns {object} The dsl verb's metrics shape.
 */
export function computeDslVerbMetrics(data, width, height) {
    const count = width * height
    const stride = Math.max(1, Math.floor(count / VERB_SAMPLE_TARGET))
    let sumR = 0
    let sumG = 0
    let sumB = 0
    let samples = 0
    const colors = new Set()
    for (let i = 0; i < count; i += stride) {
        const idx = i * 4
        sumR += data[idx] / 255
        sumG += data[idx + 1] / 255
        sumB += data[idx + 2] / 255
        colors.add(`${data[idx]},${data[idx + 1]},${data[idx + 2]}`)
        samples++
    }
    const meanR = sumR / samples
    const meanG = sumG / samples
    const meanB = sumB / samples
    return {
        mean_rgb: [meanR, meanG, meanB],
        unique_sampled_colors: colors.size,
        is_all_zero: meanR === 0 && meanG === 0 && meanB === 0,
        is_monochrome: colors.size <= 1,
    }
}

/**
 * The documented metric contract of each implementation, per its source.
 * `render`, `dsl`, and `library` share the strided grid; `parity` compares
 * the full image per channel and does not produce the ImageMetrics shape at
 * all.
 */
export const VERB_METRIC_CONTRACTS = {
    render: {
        source: 'vendor/shade-mcp/harness/index.js (originally src/tools/browser/render.ts)',
        grid: 'strided ~1000-sample: stride = max(1, floor(pixelCount / 1000))',
        fields: [
            'mean_rgb', 'mean_alpha', 'std_rgb', 'luma_variance',
            'unique_sampled_colors', 'is_all_zero', 'is_all_transparent',
            'is_essentially_blank', 'is_monochrome',
        ],
        blank_heuristic: 'luma variance < 1e-4 (flat at any brightness)',
    },
    dsl: {
        source: 'vendor/shade-mcp/harness/index.js (originally src/tools/browser/dsl.ts)',
        grid: 'strided ~1000-sample: stride = max(1, floor(pixelCount / 1000))',
        fields: ['mean_rgb', 'unique_sampled_colors', 'is_all_zero', 'is_monochrome'],
        blank_heuristic: 'none (no blank metric)',
    },
    parity: {
        source: 'vendor/shade-mcp/harness/index.js (originally src/tools/browser/parity.ts)',
        grid: 'full-image per-channel byte comparison (no stride), epsilon in 0-255 space',
        fields: ['maxDiff', 'meanDiff', 'mismatchCount', 'mismatchPercent', 'resolution', 'details'],
        blank_heuristic: 'solid-color detection via rounded full-image per-channel variance/mean',
    },
    library: {
        source: 'vendor/shade-mcp/harness/index.js (originally src/harness/pixel-reader.ts)',
        grid: 'strided ~1000-sample: stride = max(1, floor(pixelCount / 1000))',
        fields: [
            'mean_rgb', 'mean_alpha', 'std_rgb', 'luma_variance',
            'unique_sampled_colors', 'is_all_zero', 'is_all_transparent',
            'is_essentially_blank', 'is_monochrome',
        ],
        blank_heuristic: 'dark mean (< 0.01 per channel) with <= 10 quantized colors',
    },
}

/**
 * Per-field structural notes for the render-verb vs library-helper
 * comparison. A field is exactly interchangeable only when its formula and
 * sample grid are shared; the note states the difference otherwise.
 */
export const FIELD_INTERCHANGE_NOTES = {
    mean_rgb: 'Shared strided grid and formula; the verb divides bytes by 255 while the library helper multiplies by 1/255, so values can differ in the last float ulp.',
    mean_alpha: 'Shared strided grid and formula; the verb divides bytes by 255 while the library helper multiplies by 1/255, so values can differ in the last float ulp.',
    std_rgb: 'Shared strided grid and formula; the verb divides bytes by 255 while the library helper multiplies by 1/255, and the library helper clamps negative variance to 0 before the square root while the verb does not.',
    luma_variance: 'Shared strided grid and formula; the verb divides bytes by 255 while the library helper multiplies by 1/255, so values can differ in the last float ulp.',
    unique_sampled_colors: 'The verb counts exact RGB byte triples; the library helper quantizes each channel to 6 bits first, so the library count never exceeds the verb count.',
    is_all_zero: 'Equivalent on the shared byte grid: both are true exactly when every sampled RGB byte is 0 (the verb via its mean being exactly 0, the library helper via its 1e-3 per-sample threshold).',
    is_all_transparent: 'Different semantics: the verb is true when the sampled mean alpha < 0.01; the library helper is true only when every sampled alpha <= 1e-3.',
    is_essentially_blank: 'Different heuristics: the verb is blank when luma variance < 1e-4 (flat at any brightness); the library helper is blank when the mean is dark (< 0.01 per channel) with <= 10 quantized colors.',
    is_monochrome: 'The verb uses the exact byte color set; the library helper uses the 6-bit-quantized set, so the library verdict is true more often.',
}

function valuesEqual(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
    }
    return Object.is(a, b)
}

/** Numeric tolerance above float-ulp noise but far below any meaningful metric difference. */
const INTERCHANGE_TOLERANCE = 1e-9

function numericDiff(a, b) {
    if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) return null
    return Math.abs(a - b)
}

function maxDiff(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return null
        let max = 0
        for (let i = 0; i < a.length; i++) {
            const d = numericDiff(a[i], b[i])
            if (d === null) return null
            max = Math.max(max, d)
        }
        return max
    }
    return numericDiff(a, b)
}

/**
 * Audit the real implementations against each other over one byte frame.
 * Computes the canonical render-verb metrics for `data` and compares every
 * field with `libraryMetrics` (the output of the vendored
 * `computeImageMetrics` over the identical bytes).
 *
 * @param {Uint8Array} data - RGBA bytes, length width * height * 4.
 * @param {number} width
 * @param {number} height
 * @param {object} libraryMetrics - `computeImageMetrics(data, width, height)` output.
 * @returns {object} `{ sample_stride, fields }` where each field entry is
 *   `{ field, verb, library, equal, interchangeable, note }`; a field is
 *   `interchangeable` only when the two implementations produced exactly
 *   equal values for this frame.
 */
export function auditMetricImplementationEquivalence(data, width, height, libraryMetrics) {
    const verbMetrics = computeRenderVerbMetrics(data, width, height)
    const fields = Object.keys(verbMetrics).map((field) => {
        const verb = verbMetrics[field]
        const library = libraryMetrics?.[field]
        const equal = valuesEqual(verb, library)
        const diff = maxDiff(verb, library)
        const interchangeable = equal || (diff !== null && diff <= INTERCHANGE_TOLERANCE)
        return {
            field,
            verb,
            library,
            equal,
            interchangeable,
            max_abs_diff: diff === null ? null : (equal ? 0 : diff),
            note: FIELD_INTERCHANGE_NOTES[field] || '',
        }
    })
    return { sample_stride: sampleStrideFor(width * height), fields }
}
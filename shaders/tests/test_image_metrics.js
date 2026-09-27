#!/usr/bin/env node
/**
 * GAP-015 focused regressions: the metric implementations behind the Shade
 * MCP verbs and the vendored library helper, expressed as one auditable
 * node-side mirror.
 *
 * The register row (llms-full.txt GAP-015): "Similar metrics are computed by
 * separate helpers with different sample grids/blank heuristics — metric
 * names cannot be assumed numerically interchangeable across verbs."
 *
 * The upstream Shade MCP sources (`src/tools/browser/render.ts`, `dsl.ts`,
 * `parity.ts`) live in the Shade repository, which noisemaker cannot write.
 * This module and its companion `shaders/tests/image-metrics.js` mirror the
 * implementations this repository vendors (`vendor/shade-mcp/harness/index.js`,
 * originally those sources plus `src/harness/pixel-reader.ts`) so the
 * interchangeability of every shared metric field is testable here, outside
 * a browser, against the real vendored implementations.
 */
import assert from 'node:assert/strict'

import {
    FIELD_INTERCHANGE_NOTES,
    VERB_METRIC_CONTRACTS,
    VERB_SAMPLE_TARGET,
    auditMetricImplementationEquivalence,
    computeDslVerbMetrics,
    computeRenderVerbMetrics,
    sampleIndicesFor,
    sampleStrideFor,
} from './image-metrics.js'
import { computeImageMetrics } from '../../vendor/shade-mcp/harness/index.js'

/** Deterministic RGBA byte frame: pixel p gets bytes (p*7%256, p*13%256, p*29%256, p%256). */
function patternFrame(pixelCount) {
    const data = new Uint8Array(pixelCount * 4)
    for (let p = 0; p < pixelCount; p++) {
        data[p * 4] = (p * 7) % 256
        data[p * 4 + 1] = (p * 13) % 256
        data[p * 4 + 2] = (p * 29) % 256
        data[p * 4 + 3] = p % 256
    }
    return data
}

function solidFrame(byte, pixelCount) {
    const data = new Uint8Array(pixelCount * 4)
    for (let p = 0; p < pixelCount; p++) {
        data[p * 4] = byte
        data[p * 4 + 1] = byte
        data[p * 4 + 2] = byte
        data[p * 4 + 3] = 255
    }
    return data
}

// The shared strided grid: render verb, dsl verb, and library helper all use
// stride = max(1, floor(pixelCount / 1000)); the parity verb does not.
assert.equal(sampleStrideFor(1000), 1)
assert.equal(sampleStrideFor(1001), 1)
assert.equal(sampleStrideFor(2000), 2)
assert.equal(sampleStrideFor(999), 1)
assert.equal(VERB_SAMPLE_TARGET, 1000)
const strideIndices = sampleIndicesFor(2500)
assert.equal(strideIndices.length, 1250)
assert.deepEqual(strideIndices.slice(0, 3), [0, 2, 4])

// The canonical render-verb mirror agrees with the vendored library helper on
// every field whose formula and sample grid are genuinely shared: mean_rgb,
// mean_alpha, std_rgb, and luma_variance must be exactly equal.
const pattern = patternFrame(160 * 90)
const verb = computeRenderVerbMetrics(pattern, 160, 90)
const library = computeImageMetrics(pattern, 160, 90)
// Same formula, but the verb divides bytes by 255 while the library helper
// multiplies by 1/255: the shared numeric fields agree to within float-ulp
// noise, not bit-exactly.
const patternAudit = auditMetricImplementationEquivalence(pattern, 160, 90, library)
const patternByField = Object.fromEntries(patternAudit.fields.map((f) => [f.field, f]))
for (const field of ['mean_rgb', 'mean_alpha', 'std_rgb', 'luma_variance']) {
    assert.equal(patternByField[field].interchangeable, true, field)
    assert.ok(patternByField[field].max_abs_diff <= 1e-12, field)
    assert.ok(patternByField[field].note.includes('1/255'), field)
}

// The blank heuristics genuinely diverge. A bright flat frame is blank under
// the render verb (luma variance near zero at any brightness) but not under
// the library helper (dark mean plus quantized color cardinality).
const brightFlat = solidFrame(255, 64 * 64)
const verbBright = computeRenderVerbMetrics(brightFlat, 64, 64)
const libBright = computeImageMetrics(brightFlat, 64, 64)
assert.equal(verbBright.is_essentially_blank, true)
assert.equal(libBright.is_essentially_blank, false)

// Unique-color cardinality diverges: the verb counts exact byte triples, the
// library helper counts 6-bit-quantized triples, so sub-quantum distinctions
// collapse in the library count only.
const quantum = new Uint8Array(64 * 64 * 4)
for (let p = 0; p < 64 * 64; p++) {
    const dark = p % 64 < 32
    quantum[p * 4] = dark ? 0 : 3
    quantum[p * 4 + 1] = dark ? 0 : 3
    quantum[p * 4 + 2] = dark ? 0 : 3
    quantum[p * 4 + 3] = 255
}
const verbQuantum = computeRenderVerbMetrics(quantum, 64, 64)
const libQuantum = computeImageMetrics(quantum, 64, 64)
assert.equal(verbQuantum.unique_sampled_colors, 2)
assert.equal(libQuantum.unique_sampled_colors, 1)
assert.equal(verbQuantum.is_monochrome, false)
assert.equal(libQuantum.is_monochrome, true)

// is_all_transparent diverges: the verb uses the sampled mean alpha
// (< 0.01), the library helper requires every sampled alpha <= 1e-3.
const faintAlpha = new Uint8Array(64 * 64 * 4)
for (let p = 0; p < 64 * 64; p++) faintAlpha[p * 4 + 3] = 2
const verbFaint = computeRenderVerbMetrics(faintAlpha, 64, 64)
const libFaint = computeImageMetrics(faintAlpha, 64, 64)
assert.equal(verbFaint.is_all_transparent, true)
assert.equal(libFaint.is_all_transparent, false)

// The audit runs both real implementations over the same bytes and reports a
// per-field verdict with the structural note for every field whose formulas
// are not shared.
const audit = auditMetricImplementationEquivalence(pattern, 160, 90, library)
assert.equal(audit.sample_stride, sampleStrideFor(160 * 90))
const byField = Object.fromEntries(audit.fields.map((f) => [f.field, f]))
for (const field of ['mean_rgb', 'mean_alpha', 'std_rgb', 'luma_variance']) {
    assert.equal(byField[field].interchangeable, true, field)
    assert.ok(byField[field].max_abs_diff <= 1e-12, field)
}
for (const field of ['unique_sampled_colors', 'is_essentially_blank', 'is_monochrome']) {
    assert.ok(byField[field].note.length > 0, field)
}
assert.ok(FIELD_INTERCHANGE_NOTES.is_essentially_blank.includes('luma variance'))
assert.ok(FIELD_INTERCHANGE_NOTES.unique_sampled_colors.includes('quantiz'))

// The audit must reflect real divergence when present, not rubber-stamp it.
const auditBright = auditMetricImplementationEquivalence(brightFlat, 64, 64, libBright)
const brightByField = Object.fromEntries(auditBright.fields.map((f) => [f.field, f]))
assert.equal(brightByField.is_essentially_blank.equal, false)
assert.equal(brightByField.is_essentially_blank.interchangeable, false)
assert.equal(brightByField.is_essentially_blank.verb, true)
assert.equal(brightByField.is_essentially_blank.library, false)

// The dsl verb computes a strict subset of the render-verb fields with the
// same grid and the same mean-based all-zero and exact-color monochrome
// semantics, so its four fields are interchangeable with the render verb.
const dsl = computeDslVerbMetrics(pattern, 160, 90)
assert.deepEqual(dsl.mean_rgb, verb.mean_rgb)
assert.equal(dsl.unique_sampled_colors, verb.unique_sampled_colors)
assert.equal(dsl.is_all_zero, verb.is_all_zero)
assert.equal(dsl.is_monochrome, verb.is_monochrome)
assert.equal(Object.keys(dsl).length, 4)

// The parity verb is documented as a different contract entirely: full-image
// per-channel byte comparison against an epsilon in 0-255 space, not the
// strided ~1000-sample ImageMetrics shape.
assert.ok(VERB_METRIC_CONTRACTS.parity.grid.includes('full-image'))
assert.ok(VERB_METRIC_CONTRACTS.parity.fields.includes('maxDiff'))
assert.ok(VERB_METRIC_CONTRACTS.render.fields.includes('luma_variance'))
assert.ok(VERB_METRIC_CONTRACTS.dsl.fields.includes('is_monochrome'))
assert.ok(!VERB_METRIC_CONTRACTS.dsl.fields.includes('luma_variance'))
assert.ok(VERB_METRIC_CONTRACTS.library.blank_heuristic.includes('dark mean'))

console.log('test_image_metrics.js: all assertions passed')
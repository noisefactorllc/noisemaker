/**
 * Grounded frame-metric predicates shared by the test harness's
 * `renderEffectFrame` wrapper (test-harness.js) and its regression tests.
 *
 * The thresholds are not invented: both are the existing shade-mcp filter
 * modification predicate (vendor/shade-mcp/harness/index.js,
 * `testNoPassthrough()`), which classifies an effect as "modifies input"
 * when `temporalDiff > 0.01` OR `uniqueColors > 5`. Reusing the same
 * constants keeps the no-animation and low-variety predicates on the one
 * source-grounded boundary already consumed by the repository.
 */

/**
 * A frame pair with mean absolute RGB difference at or below this value is
 * classified as not animating (`is_no_animation === true`).
 */
export const NO_ANIMATION_TEMPORAL_DIFF_MAX = 0.01

/**
 * A frame sampled to at most this many unique RGB colors is classified as
 * low variety (`is_low_variety === true`).
 */
export const LOW_VARIETY_MAX_UNIQUE_COLORS = 5

/**
 * Compute the normalized mean absolute RGB difference between two frames
 * sampled at identical pixel indices.
 *
 * @param {number[]} samplesA - Flat RGB byte triples from frame A.
 * @param {number[]} samplesB - Flat RGB byte triples from frame B, sampled
 *   at the same indices and in the same order as `samplesA`.
 * @returns {number} Mean absolute per-channel difference normalized to
 *   0..1 (identical semantics to `testNoPassthrough()`'s `temporalDiff`).
 * @throws {Error} When either sample list is empty or the lengths differ.
 */
export function computeTemporalDiff(samplesA, samplesB) {
    if (!Array.isArray(samplesA) || !Array.isArray(samplesB)) {
        throw new Error('computeTemporalDiff: both sample lists must be arrays')
    }
    if (samplesA.length === 0) {
        throw new Error('computeTemporalDiff: sample lists must not be empty')
    }
    if (samplesA.length !== samplesB.length) {
        throw new Error(`computeTemporalDiff: sample list length mismatch (${samplesA.length} vs ${samplesB.length})`)
    }
    let diffSum = 0
    for (let i = 0; i < samplesA.length; i++) {
        diffSum += Math.abs(samplesA[i] - samplesB[i])
    }
    const samples = samplesA.length / 3
    return diffSum / (samples * 3 * 255)
}

/**
 * Classify a temporal diff using the grounded no-animation boundary.
 *
 * @param {number} temporalDiff - Normalized mean absolute RGB difference.
 * @returns {boolean} True when the two frames are temporally identical
 *   within the threshold (the effect does not animate).
 */
export function isNoAnimation(temporalDiff) {
    if (typeof temporalDiff !== 'number' || !Number.isFinite(temporalDiff)) {
        throw new Error('isNoAnimation: temporalDiff must be a finite number')
    }
    return temporalDiff <= NO_ANIMATION_TEMPORAL_DIFF_MAX
}

/**
 * Classify a unique sampled color count using the grounded low-variety
 * boundary.
 *
 * @param {number} uniqueColors - Count of unique sampled RGB colors.
 * @returns {boolean} True when the frame is low variety.
 */
export function isLowVariety(uniqueColors) {
    if (!Number.isInteger(uniqueColors) || uniqueColors < 0) {
        throw new Error('isLowVariety: uniqueColors must be a non-negative integer')
    }
    return uniqueColors <= LOW_VARIETY_MAX_UNIQUE_COLORS
}

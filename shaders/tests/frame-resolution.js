#!/usr/bin/env node
/**
 * GAP-021 auditable mirror: the requested-vs-returned frame resolution
 * contract for the harness `renderEffectFrame` wrapper
 * (shaders/tests/test-harness.js).
 *
 * The upstream Shade MCP verb (`vendor/shade-mcp/harness/index.js`, built
 * from `src/tools/browser/render.ts`) sets the page viewport from the
 * requested `resolution` but reads the canvas dimensions, so the returned
 * frame can silently differ from the request (the register row's exact
 * transcript requested `256x256` and returned `90x90`). This module pins
 * the repository-side resolution: every successful frame result that
 * carried a `resolution` request is annotated with the requested
 * resolution and a `resolution_check` record that classifies the
 * requested-vs-returned relationship, so thresholds always run on a known
 * sample size without the caller re-deriving it. No result `status` is
 * changed and no previously accepted call is rejected — rejecting a
 * mismatch happens only behind the wrapper's explicit
 * `--strict-resolution` opt-in.
 */

/**
 * The normalized `[width, height]` request from `options.resolution`, or
 * null when no resolution was requested or the request is not a pair of
 * finite positive numbers (an uncheckable request is never invented).
 */
export function requestedResolution(options = {}) {
    const resolution = options != null && typeof options === 'object'
        ? options.resolution
        : null
    if (!Array.isArray(resolution) || resolution.length !== 2) return null
    const [width, height] = resolution
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null
    if (width <= 0 || height <= 0) return null
    return [width, height]
}

/**
 * Classify a frame result against the requested resolution.
 *
 * - `unchecked`: no resolution was requested (nothing to compare — the
 *   historical no-`resolution` behavior is unchanged).
 * - `unknown`: a resolution was requested but the result carries no
 *   comparable frame dimensions (error results, malformed frames).
 * - `match`: the returned `frame.width/height` equal the request.
 * - `mismatch`: they differ; `warning` carries the requested-vs-returned
 *   text the caller can surface (the row's "without a warning" defect).
 */
export function resolutionCheck(result, options = {}) {
    const requested = requestedResolution(options)
    if (!requested) {
        return { status: 'unchecked', requested: null, returned: null, match: null, warning: null }
    }
    const width = result?.frame?.width
    const height = result?.frame?.height
    if (result?.status !== 'ok' || !Number.isFinite(width) || !Number.isFinite(height)) {
        return { status: 'unknown', requested, returned: null, match: null, warning: null }
    }
    const match = width === requested[0] && height === requested[1]
    return {
        status: match ? 'match' : 'mismatch',
        requested,
        returned: [width, height],
        match,
        warning: match
            ? null
            : `requested ${requested[0]}x${requested[1]} but returned ${width}x${height}`,
    }
}

/**
 * Additively annotate a frame result with the requested resolution and the
 * check record. The result object is returned unchanged (same reference)
 * when no resolution was requested; otherwise only the additive
 * `requested_resolution` and `resolution_check` fields are attached —
 * `status`, `frame`, and `metrics` are never modified.
 */
export function annotateResolution(result, options = {}) {
    const check = resolutionCheck(result, options)
    if (check.status === 'unchecked') return result
    if (result != null && typeof result === 'object') {
        result.requested_resolution = check.requested
        result.resolution_check = check
    }
    return result
}

/**
 * The opt-in gate predicate: true only for a classified mismatch. Default
 * runs never reject on this; the wrapper's `--strict-resolution` flag is
 * the single explicit opt-in.
 */
export function strictResolutionFailed(check) {
    return check?.status === 'mismatch'
}

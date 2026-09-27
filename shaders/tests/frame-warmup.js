#!/usr/bin/env node
/**
 * GAP-014 auditable mirror: the warmup/pause ordering contract that keeps
 * the harness `renderEffectFrame` wrapper (shaders/tests/test-harness.js)
 * from hanging when a caller requests a positive explicit `time` together
 * with warmup frames.
 *
 * The upstream Shade MCP verb (`vendor/shade-mcp/harness/index.js`, built
 * from `src/tools/browser/render.ts`) pauses animation BEFORE awaiting its
 * frame-count warmup promise. When pausing stops the frame loop, the
 * frame-count promise never resolves and the tool hangs. This module pins
 * the repository-side resolution: explicit-`time` requests take the
 * repository wrapper path (never the upstream verb), and the wrapper
 * awaits its warmup frames BEFORE pausing, so the frame loop is still
 * running while the frame count is awaited.
 */

/**
 * The register row's hang condition: a positive, finite, explicit `time`.
 * Non-numbers, NaN, infinity, zero, and negative values are not hang-risk
 * times under this row (zero/negative still take the safe path below, but
 * they are outside the documented hang condition).
 */
export function isHangRiskTime(time) {
    return typeof time === 'number' && Number.isFinite(time) && time > 0
}

/**
 * True when the options request an explicit pause time at all. Any
 * explicit `time` (including 0) routes the wrapper through the repository
 * path, because the upstream verb's pause-before-warmup ordering is not
 * confined to positive values in its code path.
 */
export function needsSafeWarmupPath(options) {
    return options != null
        && typeof options === 'object'
        && options.time !== undefined
}

/**
 * The wrapper's execution plan for the warmup/pause ordering.
 *
 * - `useRepositoryPath`: explicit-`time` requests must NOT reach the
 *   upstream verb (which pauses before its warmup promise and can hang);
 *   they run through the repository wrapper's own page path.
 * - `warmupBeforePause`: the wrapper awaits its frame-count warmup while
 *   the animation is still running, and only then pauses and sets the
 *   paused time, so the awaited frame count can always be reached.
 * - `pauseAtTime`: the explicit time to pause at, or null when no pause
 *   was requested (no existing behavior changes for those calls).
 */
export function warmupPausePlan(options = {}) {
    const explicitTime = options != null
        && typeof options === 'object'
        && options.time !== undefined
    return {
        useRepositoryPath: explicitTime,
        warmupBeforePause: true,
        pauseAtTime: explicitTime ? options.time : null,
    }
}

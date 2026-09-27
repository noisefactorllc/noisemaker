#!/usr/bin/env node
/**
 * GAP-021 focused regressions: the requested-vs-returned frame resolution
 * contract for the harness `renderEffectFrame` wrapper
 * (shaders/tests/frame-resolution.js, mirrored from the wrapper).
 *
 * The upstream Shade MCP verb (`vendor/shade-mcp/harness/index.js`, built
 * from `src/tools/browser/render.ts`) sets the page viewport from the
 * requested `resolution` but reads the canvas dimensions, so the returned
 * frame could silently differ from the request (the register row's exact
 * transcript requested `256x256` and returned `90x90`). These regressions
 * pin the repository-side resolution: request normalization, the
 * unchecked/unknown/match/mismatch classification, additive-only result
 * annotation, and source guards that keep the wrapper annotating every
 * result and rejecting only behind the explicit opt-in.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
    annotateResolution,
    requestedResolution,
    resolutionCheck,
    strictResolutionFailed,
} from './frame-resolution.js'

// ---------------------------------------------------------------------------
// requestedResolution: only a pair of finite positive numbers is a request.
// ---------------------------------------------------------------------------

assert.deepEqual(requestedResolution({ resolution: [256, 256] }), [256, 256])
assert.deepEqual(requestedResolution({ resolution: [90, 90] }), [90, 90])
assert.deepEqual(requestedResolution({ resolution: [1, 1] }), [1, 1])
assert.equal(requestedResolution({}), null)
assert.equal(requestedResolution({ resolution: undefined }), null)
assert.equal(requestedResolution({ resolution: [] }), null)
assert.equal(requestedResolution({ resolution: [256] }), null)
assert.equal(requestedResolution({ resolution: [256, 256, 8] }), null)
assert.equal(requestedResolution({ resolution: [0, 256] }), null)
assert.equal(requestedResolution({ resolution: [256, -1] }), null)
assert.equal(requestedResolution({ resolution: [Number.NaN, 256] }), null)
assert.equal(requestedResolution({ resolution: [Number.POSITIVE_INFINITY, 256] }), null)
assert.equal(requestedResolution({ resolution: ['256', 256] }), null)
assert.equal(requestedResolution(null), null)
assert.equal(requestedResolution(undefined), null)
assert.equal(requestedResolution('no'), null)

// The returned request is a copy — mutating it cannot alias caller state.
const requested = requestedResolution({ resolution: [256, 256] })
requested[0] = 0
assert.deepEqual(requestedResolution({ resolution: [256, 256] }), [256, 256])

// ---------------------------------------------------------------------------
// resolutionCheck: unchecked / unknown / match / mismatch classification.
// ---------------------------------------------------------------------------

// No resolution requested: unchecked, nothing compared.
assert.deepEqual(
    resolutionCheck({ status: 'ok', frame: { width: 90, height: 90 } }, {}),
    { status: 'unchecked', requested: null, returned: null, match: null, warning: null },
)

// A resolution request against an error result is unknown, never invented.
assert.deepEqual(
    resolutionCheck({ status: 'error', error: 'No renderer' }, { resolution: [256, 256] }),
    { status: 'unknown', requested: [256, 256], returned: null, match: null, warning: null },
)

// A resolution request against a malformed frame is unknown.
assert.deepEqual(
    resolutionCheck({ status: 'ok', frame: {} }, { resolution: [256, 256] }),
    { status: 'unknown', requested: [256, 256], returned: null, match: null, warning: null },
)
assert.deepEqual(
    resolutionCheck(null, { resolution: [256, 256] }),
    { status: 'unknown', requested: [256, 256], returned: null, match: null, warning: null },
)

// The register row's exact transcript shape: requested 256x256, returned 90x90.
const mismatch = resolutionCheck(
    { status: 'ok', frame: { width: 90, height: 90 } },
    { resolution: [256, 256] },
)
assert.equal(mismatch.status, 'mismatch')
assert.equal(mismatch.match, false)
assert.deepEqual(mismatch.returned, [90, 90])
assert.match(mismatch.warning, /requested 256x256 but returned 90x90/)

// Matching dimensions classify as a match with no warning.
assert.deepEqual(
    resolutionCheck({ status: 'ok', frame: { width: 256, height: 256 } }, { resolution: [256, 256] }),
    { status: 'match', requested: [256, 256], returned: [256, 256], match: true, warning: null },
)

// Non-integer or fractional frame dims still compare exactly.
assert.equal(
    resolutionCheck({ status: 'ok', frame: { width: 256.5, height: 256 } }, { resolution: [256.5, 256] }).status,
    'match',
)

// ---------------------------------------------------------------------------
// annotateResolution: additive-only annotation; unchecked results untouched.
// ---------------------------------------------------------------------------

// Unchecked: the same object comes back with no new fields.
const plain = { status: 'ok', frame: { width: 90, height: 90 }, metrics: {} }
assert.equal(annotateResolution(plain, {}), plain)
assert.equal('requested_resolution' in plain, false)
assert.equal('resolution_check' in plain, false)

// Requested: the same object gains only the additive fields.
const annotated = annotateResolution(
    { status: 'ok', frame: { width: 90, height: 90 } },
    { resolution: [256, 256] },
)
assert.equal(annotated.status, 'ok')
assert.deepEqual(annotated.requested_resolution, [256, 256])
assert.equal(annotated.resolution_check.status, 'mismatch')
assert.deepEqual(annotated.frame, { width: 90, height: 90 })

// Error results are annotated too (unknown check), never reclassified.
const errored = annotateResolution(
    { status: 'error', error: 'No renderer' },
    { resolution: [256, 256] },
)
assert.equal(errored.status, 'error')
assert.equal(errored.resolution_check.status, 'unknown')

// Null/malformed results never crash the annotation.
assert.equal(annotateResolution(null, { resolution: [256, 256] }), null)
assert.equal(annotateResolution(undefined, {}), undefined)

// The annotation is serializable (safe for JSON tool-result surfaces).
assert.equal(
    JSON.stringify(annotateResolution({ status: 'ok', frame: { width: 90, height: 90 } }, { resolution: [256, 256] }).resolution_check.status),
    '"mismatch"',
)

// ---------------------------------------------------------------------------
// strictResolutionFailed: the gate fires only for a classified mismatch.
// ---------------------------------------------------------------------------

assert.equal(strictResolutionFailed({ status: 'mismatch' }), true)
assert.equal(strictResolutionFailed({ status: 'match' }), false)
assert.equal(strictResolutionFailed({ status: 'unknown' }), false)
assert.equal(strictResolutionFailed({ status: 'unchecked' }), false)
assert.equal(strictResolutionFailed(null), false)
assert.equal(strictResolutionFailed(undefined), false)

// ---------------------------------------------------------------------------
// Source guards: the wrapper must annotate every renderEffectFrame result
// with the mirror, report the check in its effect loop, and gate only
// behind the explicit `--strict-resolution` opt-in.
// ---------------------------------------------------------------------------

const harnessSource = fs.readFileSync(
    new URL('./test-harness.js', import.meta.url),
    'utf8',
)

// The wrapper imports the mirror.
assert.match(
    harnessSource,
    /import\s*\{[^}]*annotateResolution[^}]*\}\s*from\s*'\.\/frame-resolution\.js'/,
)

// The wrapper's return path routes through annotateResolution with options.
const returnIndex = harnessSource.indexOf(
    'return augmentFrameMetrics(session, annotateResolution(result, options))',
)
assert.notEqual(returnIndex, -1, 'wrapper must annotate its result with options')

// The effect loop reports the check and gates only behind the opt-in.
assert.match(harnessSource, /renderResult\.resolution_check/)
assert.match(
    harnessSource,
    /if \(options\.strictResolution\) results\.resolutionMismatch = true/,
    'mismatch must become a failure only behind options.strictResolution',
)
assert.match(harnessSource, /--strict-resolution/)

// Default runs request no resolution, so the historical render call at the
// effect loop must not pass a `resolution` option (no new rejection surface).
assert.match(
    harnessSource,
    /renderEffectFrame\(session, effectId, \{ warmupFrames: 10 \}\)/,
)

console.log('PASS test_frame_resolution: 5 groups (request normalization, classification, annotation, opt-in gate, source guards)')

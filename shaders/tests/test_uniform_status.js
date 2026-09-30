#!/usr/bin/env node
/**
 * GAP-010 focused regressions: `aggregateUniformResponsiveness()`
 * (shaders/tests/uniform-status.js) reclassifies a
 * `testUniformResponsiveness()` result from every `tested_uniforms` entry,
 * so the outer status is no longer "ok when any tested uniform passes".
 *
 * The upstream tool's unsafe shape (vendor/shade-mcp/harness/index.js,
 * `testUniformResponsiveness()`) is reproduced exactly here: the outer
 * `status` can be `ok` while other entries end in `:fail`/`:error`.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { aggregateUniformResponsiveness } from './uniform-status.js'

// The exact GAP-010 hazard: outer `ok` with a failing entry must not stay ok.
assert.deepEqual(
    aggregateUniformResponsiveness({
        status: 'ok',
        tested_uniforms: ['scale:pass', 'offset:fail'],
        details: 'Uniforms affect output',
    }),
    { status: 'fail', tested_uniforms: ['scale:pass', 'offset:fail'], details: 'Uniforms affect output' },
)

// Outer `ok` with an errored entry is an error, not ok.
assert.deepEqual(
    aggregateUniformResponsiveness({
        status: 'ok',
        tested_uniforms: ['scale:pass', 'offset:error'],
        details: 'Uniforms affect output',
    }).status,
    'error',
)

// All entries passing is the only shape that stays ok.
assert.deepEqual(
    aggregateUniformResponsiveness({
        status: 'ok',
        tested_uniforms: ['a:pass', 'b:pass'],
        details: 'Uniforms affect output',
    }).status,
    'ok',
)

// Upstream "No uniforms affected output" (all entries fail) is a fail, not ok.
assert.deepEqual(
    aggregateUniformResponsiveness({
        status: 'error',
        tested_uniforms: ['a:fail', 'b:fail'],
        details: 'No uniforms affected output',
    }).status,
    'fail',
)

// An :error entry outranks :fail entries.
assert.equal(
    aggregateUniformResponsiveness({
        status: 'error',
        tested_uniforms: ['a:fail', 'b:error'],
        details: 'No uniforms affected output',
    }).status,
    'error',
)

// Upstream skipped (no testable uniforms) stays skipped.
assert.deepEqual(
    aggregateUniformResponsiveness({
        status: 'skipped',
        tested_uniforms: [],
        details: 'No testable uniforms',
    }),
    { status: 'skipped', tested_uniforms: [], details: 'No testable uniforms' },
)

// Upstream error with an empty entry list (no effect loaded, baseline failure) stays error.
assert.equal(
    aggregateUniformResponsiveness({
        status: 'error',
        tested_uniforms: [],
        details: 'No effect loaded',
    }).status,
    'error',
)

// A missing or malformed result is an error, never a silent pass.
assert.equal(aggregateUniformResponsiveness(null).status, 'error')
assert.equal(aggregateUniformResponsiveness(undefined).status, 'error')
assert.equal(aggregateUniformResponsiveness({ status: 'ok', tested_uniforms: 'not-an-array' }).status, 'error')

// Unrecognized entry suffixes are errors, never silently accepted.
assert.equal(
    aggregateUniformResponsiveness({
        status: 'ok',
        tested_uniforms: ['scale:pass', 'offset:???'],
        details: 'Uniforms affect output',
    }).status,
    'error',
)

// Non-string entries are errors too.
assert.equal(
    aggregateUniformResponsiveness({
        status: 'ok',
        tested_uniforms: ['a:pass', 7],
        details: 'Uniforms affect output',
    }).status,
    'error',
)

// tested_uniforms and details pass through unchanged in every classification.
const passthrough = { status: 'ok', tested_uniforms: ['x:pass'], details: 'd' }
assert.equal(aggregateUniformResponsiveness(passthrough).tested_uniforms, passthrough.tested_uniforms)
assert.equal(aggregateUniformResponsiveness(passthrough).details, 'd')

// ---------------------------------------------------------------------------
// resolveUniformGateStatus: the harness's --strict-uniforms gate, mirrored
// from shaders/tests/test-harness.js. The default gate keeps the upstream
// outer-status semantics; the explicit opt-in consumes the truthful
// per-entry aggregate, so previously accepted effects are only newly
// rejected behind the opt-in.
// ---------------------------------------------------------------------------

import { resolveUniformGateStatus } from './uniform-status.js'

// Default gate (opt-in off): the upstream outer status wins even when the
// aggregate disagrees — the unchanged public behavior.
assert.equal(resolveUniformGateStatus(false, 'ok', 'fail'), 'ok')
assert.equal(resolveUniformGateStatus(false, 'ok', 'error'), 'ok')
assert.equal(resolveUniformGateStatus(false, 'error', 'ok'), 'error')
assert.equal(resolveUniformGateStatus(false, 'skipped', 'ok'), 'skipped')

// Opt-in on: the aggregate is the truth.
assert.equal(resolveUniformGateStatus(true, 'ok', 'fail'), 'fail')
assert.equal(resolveUniformGateStatus(true, 'ok', 'error'), 'error')
assert.equal(resolveUniformGateStatus(true, 'error', 'fail'), 'fail')
assert.equal(resolveUniformGateStatus(true, 'skipped', 'skipped'), 'skipped')
assert.equal(resolveUniformGateStatus(true, 'ok', 'ok'), 'ok')

// ---------------------------------------------------------------------------
// Source guards: the harness in shaders/tests/test-harness.js must keep the
// gate wired — the mirror import present, the aggregate computed on every
// --uniforms run, the gated status flowing into results.uniforms, and the
// --strict-uniforms flag implying --uniforms.
// ---------------------------------------------------------------------------

const harnessSource = fs.readFileSync(
    new URL('./test-harness.js', import.meta.url),
    'utf8',
)

// The harness imports the gate mirror.
assert.match(
    harnessSource,
    /import\s*\{[^}]*resolveUniformGateStatus[^}]*\}\s*from\s*'\.\/uniform-status\.js'/,
)

// The aggregate is computed on every --uniforms run, before gating.
const gateIndex = harnessSource.indexOf('resolveUniformGateStatus(')
assert.notEqual(gateIndex, -1, 'gate call must exist')
const gateContext = harnessSource.slice(gateIndex - 1600, gateIndex + 400)
assert.match(gateContext, /options\.runUniforms/, 'gate must live inside the --uniforms run')
assert.match(gateContext, /aggregateUniformResponsiveness\(uniformResult\)/, 'the aggregate must be computed before the gate')
assert.match(harnessSource.slice(gateIndex, gateIndex + 600), /results\.uniforms\s*=/, 'the gated status must flow into results.uniforms')

// --strict-uniforms implies --uniforms and sets the opt-in flag.
assert.match(
    harnessSource,
    /'--strict-uniforms'\)\s*\{\s*parsed\.runUniforms\s*=\s*true\s*parsed\.strictUniforms\s*=\s*true/,
)

console.log('test_uniform_status.js: all assertions passed')

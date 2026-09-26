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

console.log('test_uniform_status.js: all assertions passed')

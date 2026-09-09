#!/usr/bin/env node
/**
 * Regression tests for synth/remap's cross-repo contract with the Remap app.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../..')

let passed = 0
let failed = 0

async function test(name, fn) {
    try {
        await fn()
        console.log(`PASS: ${name}`)
        passed++
    } catch (err) {
        console.error(`FAIL: ${name}`)
        console.error(err)
        failed++
    }
}

await test('synth/remap definition imports and exposes a valid default program', async () => {
    const { default: effect } = await import('../effects/synth/remap/definition.js')

    assert.equal(effect.namespace, 'synth')
    assert.equal(effect.func, 'remap')
    assert.equal(effect.defaultProgram, 'search synth\n\nremap(bgColor: #336699, bgAlpha: 1)\n  .write(o0)')
})

await test('synth/remap GLSL packs zone data in a uniform block', () => {
    const source = fs.readFileSync(
        path.join(root, 'shaders/effects/synth/remap/glsl/remap.glsl'),
        'utf8'
    )

    assert.match(source, /uniform\s+RemapUniforms\s*\{\s*vec4\s+data\s*\[275\]\s*;/s)
    assert.doesNotMatch(source, /\buniform\s+vec4\s+zone\d+_v\d+\b/)
})

await test('synth/remap WGSL declares the same 275-slot uniform array', () => {
    const source = fs.readFileSync(
        path.join(root, 'shaders/effects/synth/remap/wgsl/remap.wgsl'),
        'utf8'
    )

    assert.match(source, /data\s*:\s*array<vec4<f32>,\s*275>/)
})

await test('synth/remap keeps resolution at slot 266 and appends zone bounds at 267..274', async () => {
    const { default: effect } = await import('../effects/synth/remap/definition.js')

    assert.equal(effect.uniformLayout.resolution.slot, 266)
    for (let z = 0; z < 8; z++) {
        assert.deepEqual(effect.uniformLayout[`zone${z}_bounds`], { slot: 267 + z, components: 'xyzw' })
        const bounds = effect.globals[`zone${z}_bounds`]
        assert.equal(bounds.type, 'vec4')
        assert.deepEqual(bounds.default, [0, 0, 1, 1])
        assert.equal(bounds.uniform, `zone${z}_bounds`)
        assert.equal(bounds.ui.hidden, true)
        assert.equal(bounds.ui.format, 'vector')
        assert.equal(bounds.ui.label, 'bounds')
        assert.equal(bounds.ui.category, `zone ${z + 1}`)
    }
    // The vertex slots are untouched by the bounds extension.
    assert.equal(effect.uniformLayout.zone0_v0.slot, 10)
    assert.equal(effect.uniformLayout.zone7_v31.slot, 265)
})

// The zone limits are hand-duplicated in three places: MAX_ZONES /
// MAX_VERTS_PER_ZONE in definition.js (module-private, so they are read back off
// the effect object) and MAX_ZONES / MAX_PAIRS in each shader. Clamp 2 bounds a
// zone's vertex walk with `MAX_PAIRS * 2`, so a definition-only bump would
// silently truncate every zone instead of failing. These helpers let the tests
// below pin the relationship.
const shaderSource = backend => fs.readFileSync(
    path.join(root, `shaders/effects/synth/remap/${backend}/remap.${backend}`),
    'utf8'
)

function shaderConstant(source, backend, name) {
    const pattern = backend === 'glsl'
        ? new RegExp(`^\\s*#define\\s+${name}\\s+(\\d+)`, 'm')
        : new RegExp(`^\\s*const\\s+${name}\\s*:\\s*i32\\s*=\\s*(\\d+)\\s*;`, 'm')
    const match = source.match(pattern)
    assert.ok(match, `${backend} must declare ${name}`)
    return Number(match[1])
}

function shaderArrayLength(source, backend) {
    const pattern = backend === 'glsl'
        ? /vec4\s+data\s*\[\s*(\d+)\s*\]/
        : /data\s*:\s*array<vec4<f32>,\s*(\d+)>/
    const match = source.match(pattern)
    assert.ok(match, `${backend} must declare the packed uniform array`)
    return Number(match[1])
}

await test('synth/remap shader zone constants match the definition', async () => {
    const { default: effect } = await import('../effects/synth/remap/definition.js')

    // definition.js keeps MAX_ZONES / MAX_VERTS_PER_ZONE module-private, but it
    // publishes both as slider maxima, so read them back instead of rehardcoding.
    const maxZones = effect.globals.zoneCount.max
    const maxVerts = effect.globals.zone0_count.max
    assert.equal(maxVerts % 2, 0, 'vertices are packed two per vec4, so the cap must be even')
    for (let z = 0; z < maxZones; z++) {
        assert.equal(effect.globals[`zone${z}_count`].max, maxVerts,
            `zone${z}_count must share the per-zone vertex cap`)
    }

    const constants = {}
    for (const backend of ['glsl', 'wgsl']) {
        const source = shaderSource(backend)
        constants[backend] = {
            zones: shaderConstant(source, backend, 'MAX_ZONES'),
            pairs: shaderConstant(source, backend, 'MAX_PAIRS')
        }
        assert.equal(constants[backend].zones, maxZones,
            `${backend} MAX_ZONES must equal the definition's zone cap`)
        // Clamp 2 uses MAX_PAIRS * 2 as the vertex bound, so this is the
        // assertion that stops a definition-only bump truncating zones.
        assert.equal(constants[backend].pairs * 2, maxVerts,
            `${backend} MAX_PAIRS * 2 must equal the definition's per-zone vertex cap`)
    }
    assert.deepEqual(constants.glsl, constants.wgsl, 'GLSL and WGSL zone constants must agree')
})

await test('synth/remap uniform array length follows from the zone constants', async () => {
    const { default: effect } = await import('../effects/synth/remap/definition.js')

    const maxZones = effect.globals.zoneCount.max
    const maxPairs = effect.globals.zone0_count.max / 2
    // 10 header/control/meta slots, the vertex block, resolution, then one
    // bounds slot per zone.
    const expectedSlots = 10 + maxZones * maxPairs + 1 + maxZones

    for (const backend of ['glsl', 'wgsl']) {
        assert.equal(shaderArrayLength(shaderSource(backend), backend), expectedSlots,
            `${backend} must declare ${expectedSlots} uniform slots`)
    }

    // The layout those slots carry today, pinned so a reshuffle is deliberate.
    assert.equal(effect.uniformLayout.resolution.slot, 266)
    assert.equal(expectedSlots, 275)
    for (let z = 0; z < maxZones; z++) {
        assert.equal(effect.uniformLayout[`zone${z}_bounds`].slot, 267 + z)
    }
})

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`)
    process.exit(1)
}

console.log(`\n${passed} test(s) passed`)

#!/usr/bin/env node
/**
 * GAP-012 focused regressions: the render-surface pixel readback contract
 * that gives the harness `renderEffectFrame` wrapper its single-backend
 * frame metrics on WebGPU (shaders/tests/frame-readback.js, mirrored from
 * the in-page wrapper in shaders/tests/test-harness.js).
 *
 * The upstream Shade MCP verb reads only `pipeline.backend.gl` and fails on
 * WebGPU; this repository's wrapper reads through the backend's async
 * `readPixels(textureId)`. These regressions pin the candidate ordering,
 * the validity rule, and the never-throw readback so the WebGPU path cannot
 * silently regress to a GL-only readback.
 */
import assert from 'node:assert/strict'

import {
    isValidPixelRead,
    readRenderSurfacePixels,
    renderSurfaceCandidateIds,
} from './frame-readback.js'

// ---------------------------------------------------------------------------
// renderSurfaceCandidateIds: the wrapper's exact candidate ordering.
// ---------------------------------------------------------------------------

// No pipeline, no surface, no texture map: no candidates, never throws.
assert.deepEqual(renderSurfaceCandidateIds(null), [])
assert.deepEqual(renderSurfaceCandidateIds({}), [])
assert.deepEqual(renderSurfaceCandidateIds({ graph: {} }), [])

// Backends that do not expose a texture map in harness mode contribute
// nothing instead of throwing.
assert.deepEqual(
    renderSurfaceCandidateIds({ graph: { renderSurface: 'out0' }, backend: {} }),
    ['global_out0_read', 'global_out0_write'],
)

// The pipeline's frame-read texture for the render surface comes first,
// then the global read/write pair.
const pipelineWithFrameRead = {
    graph: { renderSurface: 'out1' },
    frameReadTextures: new Map([['out1', 'frame_out1_read']]),
    backend: { textures: new Map() },
}
assert.deepEqual(
    renderSurfaceCandidateIds(pipelineWithFrameRead),
    ['frame_out1_read', 'global_out1_read', 'global_out1_write'],
)

// The highest-index node_<n>_out texture is appended last; lower indexes,
// non-node textures, and node textures without the _out suffix are ignored.
const backendWithNodes = {
    textures: new Map([
        ['node_2_out', {}],
        ['node_10_out', {}],
        ['node_1_in', {}],
        ['global_temp', {}],
    ]),
}
assert.deepEqual(
    renderSurfaceCandidateIds({ graph: { renderSurface: 'out0' }, backend: backendWithNodes }),
    ['global_out0_read', 'global_out0_write', 'node_10_out'],
)

// Numeric ordering is by index, not lexicographic (node_2 before node_10).
const twoNodeBackend = {
    textures: new Map([['node_2_out', {}], ['node_10_out', {}]]),
}
assert.deepEqual(
    renderSurfaceCandidateIds({ graph: { renderSurface: 'out0' }, backend: twoNodeBackend }),
    ['global_out0_read', 'global_out0_write', 'node_10_out'],
)

// With no render surface only the node candidate remains.
assert.deepEqual(
    renderSurfaceCandidateIds({ backend: twoNodeBackend }),
    ['node_10_out'],
)

// Candidates are deduplicated preserving first occurrence (the frame-read
// texture may alias a global surface id).
assert.deepEqual(
    renderSurfaceCandidateIds({
        graph: { renderSurface: 'out0' },
        frameReadTextures: new Map([['out0', 'global_out0_read']]),
        backend: { textures: new Map() },
    }),
    ['global_out0_read', 'global_out0_write'],
)

// ---------------------------------------------------------------------------
// isValidPixelRead: the wrapper's usability rule.
// ---------------------------------------------------------------------------

assert.equal(isValidPixelRead(null), false)
assert.equal(isValidPixelRead({}), false)
assert.equal(isValidPixelRead({ width: 4, height: 4 }), false)
assert.equal(isValidPixelRead({ width: 0, height: 4, data: new Uint8Array(64) }), false)
assert.equal(isValidPixelRead({ width: 4, height: 0, data: new Uint8Array(16) }), false)
assert.equal(isValidPixelRead({ width: 2, height: 2, data: new Uint8Array(16) }), true)

// ---------------------------------------------------------------------------
// readRenderSurfacePixels: never throws; skips invalid and throwing
// candidates; null when the backend cannot read pixels.
// ---------------------------------------------------------------------------

// A backend without readPixels yields null (the upstream GL-only shape).
assert.equal(await readRenderSurfacePixels({}, {}), null)
assert.equal(await readRenderSurfacePixels(null, null), null)
assert.equal(await readRenderSurfacePixels({ readPixels: 'no' }, {}), null)

// Every candidate failing or invalid yields null rather than an exception.
const failingBackend = {
    textures: new Map(),
    readPixels: async () => {
        throw new Error('boom')
    },
}
assert.equal(await readRenderSurfacePixels(failingBackend, { graph: { renderSurface: 'out0' } }), null)

const invalidBackend = {
    textures: new Map(),
    readPixels: async () => ({ width: 0, height: 0, data: null }),
}
assert.equal(await readRenderSurfacePixels(invalidBackend, { graph: { renderSurface: 'out0' } }), null)

// The first valid candidate wins, and candidates are tried in order.
const requested = []
const orderedBackend = {
    textures: new Map(),
    readPixels: async (textureId) => {
        requested.push(textureId)
        if (textureId === 'frame_out1_read') {
            throw new Error('frame read missing')
        }
        if (textureId === 'global_out1_read') {
            return { width: 0, height: 5, data: new Uint8Array(0) }
        }
        return { width: 3, height: 2, data: new Uint8Array(24) }
    },
}
const pixels = await readRenderSurfacePixels(orderedBackend, {
    graph: { renderSurface: 'out1' },
    frameReadTextures: new Map([['out1', 'frame_out1_read']]),
})
assert.deepEqual(requested, ['frame_out1_read', 'global_out1_read', 'global_out1_write'])
assert.equal(pixels.width, 3)
assert.equal(pixels.height, 2)

// ---------------------------------------------------------------------------
// The harness wrapper must keep reading the render surface through
// `backend.readPixels` on its WebGPU path and must keep producing the full
// single-backend frame metric set (guards against regression to the
// upstream GL-only readback shape).
// ---------------------------------------------------------------------------

const harnessSource = (await import('node:fs')).readFileSync(
    new URL('./test-harness.js', import.meta.url), 'utf-8')

// The wrapper selects its own WebGPU path instead of the upstream verb.
assert.ok(harnessSource.includes("session.backend !== 'webgpu'"))
// The WebGPU path reads pixels through the backend's readPixels, not gl.
assert.ok(harnessSource.includes('await backend.readPixels(textureId)'))
// Readback failure is reported, never silently swallowed.
assert.ok(harnessSource.includes('Failed to read pixels'))
// The full ImageMetrics contract is produced on the WebGPU path.
for (const field of [
    'mean_rgb',
    'mean_alpha',
    'std_rgb',
    'luma_variance',
    'unique_sampled_colors',
    'is_all_zero',
    'is_all_transparent',
    'is_essentially_blank',
    'is_monochrome',
]) {
    assert.ok(harnessSource.includes(field), `missing metric field ${field}`)
}
// The backend identity comes from the live pipeline backend.
assert.ok(harnessSource.includes('backend.getName'))

// ---------------------------------------------------------------------------
// Source guard against the vendored upstream bundle: the delivered pin
// (github:noisedeck/shade-mcp#6a7e2540, release v0.3.0) still ships the
// GL-only render verb whose WebGPU failure this repository reproduced live
// through the configured MCP (status error, backend unknown, "Failed to read
// pixels"). The backend-neutral WebGPU readback exists only in the unreleased
// upstream fix (shade-mcp 987b14d, issue #28); when a vendor refresh delivers
// it, this guard turns red so the wrapper's WebGPU path is re-derived against
// the fixed verb instead of silently coexisting with it.
// ---------------------------------------------------------------------------

const vendorSource = (await import('node:fs')).readFileSync(
    new URL('../../vendor/shade-mcp/harness/index.js', import.meta.url), 'utf-8')

assert.ok(vendorSource.includes('error: "Failed to read pixels"'),
    'vendored renderEffectFrame should keep its GL-only readback failure path (GAP-012)')
assert.ok(vendorSource.includes('pipeline.backend?.gl'),
    'vendored renderEffectFrame should still read through pipeline.backend.gl')
assert.ok(!vendorSource.includes('no readable render surface'),
    'vendored renderEffectFrame should not yet carry the backend-neutral WebGPU readback (GAP-012; a refresh delivering shade-mcp#28 changes this)')

console.log('GAP-012 frame-readback regressions: PASS')

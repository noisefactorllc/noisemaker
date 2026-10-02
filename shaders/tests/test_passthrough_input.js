#!/usr/bin/env node
/**
 * GAP-019 focused regressions: the repository-side true input-passthrough
 * measurement (shaders/tests/passthrough-input.js) compares the rendered
 * output against the input texture the effect's expanded graph actually
 * consumes — the upstream Shade MCP verb (`testNoPassthrough()`, vendored in
 * vendor/shade-mcp/harness/index.js from `src/tools/browser/passthrough.ts`)
 * varies time and counts colors instead, and its `input`-substring filter
 * classification matches nothing in noisemaker's expanded graphs, so the
 * upstream check is vacuous here.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
    INPUT_PASSTHROUGH_DIFF_MAX,
    blitControlSourceId,
    compareOutputToInput,
    firstConsumedInputId,
    isFilterEffectDefinition,
    isInputPassthrough,
    measureInputPassthroughInPage,
    sampleStrideFor,
} from './passthrough-input.js'
import { NO_ANIMATION_TEMPORAL_DIFF_MAX } from './frame-metrics.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// One source-grounded boundary: the probe reuses the upstream tool's own
// 0.01 temporal boundary (also GAP-009's no-animation boundary).
assert.equal(INPUT_PASSTHROUGH_DIFF_MAX, 0.01)
assert.equal(INPUT_PASSTHROUGH_DIFF_MAX, NO_ANIMATION_TEMPORAL_DIFF_MAX)

// The sampling stride is the upstream tool's exact formula.
assert.equal(sampleStrideFor(1024 * 1024), Math.floor((1024 * 1024) / 1000))
assert.equal(sampleStrideFor(1000), 1)
assert.equal(sampleStrideFor(999), 1)
assert.equal(sampleStrideFor(1), 1)

// ---------------------------------------------------------------------------
// Classification mirror. The repository-side rule mirrors the renderer's
// `isStarterEffect()` (definition-level pipeline-input names). The upstream
// verb instead tests EXPANDED pass input values for the substring `input` —
// in noisemaker's expanded graphs those values are concrete texture ids, so
// the upstream rule matches nothing and its check is vacuous here.
// ---------------------------------------------------------------------------

// Observed expanded shapes (webgl2, demo-generated programs): the expanded
// values contain no `input` substring, so the upstream rule never fires.
const observedFilterGraph = [
    { id: 'node_0_pass_0', inputs: {}, outputs: { color: 'node_0_out' } },
    { id: 'node_1_pass_0', inputs: { inputTex: 'node_0_out' }, outputs: { fragColor: 'node_1_out' } },
    { id: 'node_2_write_blit', inputs: { src: 'node_1_out' }, outputs: { color: 'global_o0' } },
]
assert.equal(firstConsumedInputId(observedFilterGraph), 'node_0_out')

// Definition-level classification (the renderer's own rule): a filter
// consumes pipeline input; a starter does not.
assert.equal(isFilterEffectDefinition([{ inputs: { inputTex: 'inputTex' } }]), true)
assert.equal(isFilterEffectDefinition([{ inputs: { inputTex3d: 'inputTex3d' } }]), true)
assert.equal(isFilterEffectDefinition([{ inputs: { tex: 'o0' } }]), true)
assert.equal(isFilterEffectDefinition([{ inputs: { tex: 'none' } }]), false)
assert.equal(isFilterEffectDefinition([{ inputs: { noiseTex: 'noise' } }]), false)
assert.equal(isFilterEffectDefinition([]), false)
assert.equal(isFilterEffectDefinition(null), false)
assert.equal(isFilterEffectDefinition(undefined), false)
assert.equal(isFilterEffectDefinition([{}]), false)

// The consumed input comes from the first expanded pass whose input KEY is a
// pipeline input name (expanded graphs keep the definition's uniform names).
const literalInputGraph = [
    { id: 'p0', inputs: { inputTex: 'inputTex' }, outputs: { fragColor: 'node_1_out' } },
]
assert.equal(firstConsumedInputId(literalInputGraph), 'inputTex')

// Non-arrays and missing inputs are never classified.
assert.equal(firstConsumedInputId(null), null)
assert.equal(firstConsumedInputId(undefined), null)
assert.equal(firstConsumedInputId([{}]), null)
assert.equal(firstConsumedInputId([{ inputs: { src: 'node_0_out' } }]), null)

// The first input-bearing pass in graph order supplies the consumed input.
const multiPassGraph = [
    { id: 'a', inputs: {}, outputs: { color: 'node_0_out' } },
    { id: 'b', inputs: { inputTex: 'global_inputTex' }, outputs: { color: 'node_1_out' } },
    { id: 'c', inputs: { inputTex3d: 'global_inputTex2' }, outputs: { color: 'global_o0' } },
]
assert.equal(firstConsumedInputId(multiPassGraph), 'global_inputTex')

// The positive control: the pass writing the render surface is the write
// blit, and its input is the genuine in-program passthrough source.
assert.equal(blitControlSourceId(observedFilterGraph, 'o0'), 'node_1_out')
assert.equal(blitControlSourceId(observedFilterGraph, 'o7'), null)
assert.equal(blitControlSourceId(null, 'o0'), null)
assert.equal(blitControlSourceId(observedFilterGraph, null), null)
assert.equal(blitControlSourceId([{ outputs: { color: 'global_o0' } }], 'o0'), null)

// ---------------------------------------------------------------------------
// Comparison math on synthetic readbacks.
// ---------------------------------------------------------------------------

// A 4x4 asymmetric pattern (byte readback) as the consumed input.
const inW = 4
const inH = 4
const inputBytes = new Uint8Array(inW * inH * 4)
for (let y = 0; y < inH; y++) {
    for (let x = 0; x < inW; x++) {
        const i = (y * inW + x) * 4
        inputBytes[i] = x * 60
        inputBytes[i + 1] = y * 60
        inputBytes[i + 2] = (x + y) * 30
        inputBytes[i + 3] = 255
    }
}
const inputPixels = { width: inW, height: inH, data: inputBytes }

// An output that repeats the input 1:1 at the same resolution is a perfect
// passthrough in both orientations (the pattern is asymmetric, but a 1:1
// copy is aligned by construction; flipped compares against mirrored rows).
const outputCopy = { width: inW, height: inH, data: inputBytes.slice() }
const identical = compareOutputToInput(inputPixels, outputCopy)
assert.equal(identical.aligned, 0)
assert.ok(identical.flipped > 0, 'an asymmetric copy is not flipped-identical')
assert.equal(identical.min, 0)
assert.equal(identical.orientation, 'aligned')
assert.equal(identical.samples, 16)
assert.equal(isInputPassthrough(identical), true)

// A large output that samples the input by UV (2x upscale) is still a
// passthrough under nearest-neighbor UV mapping.
const upW = 8
const upH = 8
const upBytes = new Uint8Array(upW * upH * 4)
for (let y = 0; y < upH; y++) {
    for (let x = 0; x < upW; x++) {
        const ix = Math.min(inW - 1, Math.floor((x / upW) * inW))
        const iy = Math.min(inH - 1, Math.floor((y / upH) * inH))
        const o = (y * upW + x) * 4
        const s = (iy * inW + ix) * 4
        upBytes[o] = inputBytes[s]
        upBytes[o + 1] = inputBytes[s + 1]
        upBytes[o + 2] = inputBytes[s + 2]
        upBytes[o + 3] = 255
    }
}
const upscaled = compareOutputToInput(inputPixels, { width: upW, height: upH, data: upBytes })
assert.equal(upscaled.aligned, 0)
assert.equal(isInputPassthrough(upscaled), true)

// A uniformly shifted output is not a passthrough at the shared boundary.
const shifted = outputCopy.data.slice()
for (let i = 0; i < shifted.length; i += 4) shifted[i] = Math.min(255, shifted[i] + 8)
const shiftedDiff = compareOutputToInput(inputPixels, { width: inW, height: inH, data: shifted })
// 8/255 ≈ 0.0314 per aligned sample (in both orientations: the vertical
// gradient row order changes, so the flipped mapping differs more).
assert.equal(isInputPassthrough(shiftedDiff), false)
assert.ok(shiftedDiff.aligned > INPUT_PASSTHROUGH_DIFF_MAX)

// The byte-domain boundary: mean diff 0.01 corresponds to 0.01*3*255 = 7.65
// byte-units of per-sample RGB movement, so a uniform 7-byte shift on one
// channel sits below the boundary and an 8-byte shift above it.
const nearBelow = outputCopy.data.slice()
for (let i = 0; i < nearBelow.length; i += 4) nearBelow[i] = Math.min(255, nearBelow[i] + 7)
const belowDiff = compareOutputToInput(inputPixels, { width: inW, height: inH, data: nearBelow })
assert.ok(Math.abs(belowDiff.aligned - 7 / (255 * 3)) < 1e-15)
assert.equal(isInputPassthrough(belowDiff), true)
const nearAbove = outputCopy.data.slice()
for (let i = 0; i < nearAbove.length; i += 4) nearAbove[i] = Math.min(255, nearAbove[i] + 8)
const aboveDiff = compareOutputToInput(inputPixels, { width: inW, height: inH, data: nearAbove })
assert.ok(Math.abs(aboveDiff.aligned - 8 / (255 * 3)) < 1e-15)
assert.equal(isInputPassthrough(aboveDiff), false)

// A vertically mirrored output is caught by the flipped orientation.
const mirrored = new Uint8Array(inW * inH * 4)
for (let y = 0; y < inH; y++) {
    for (let x = 0; x < inW; x++) {
        const src = ((inH - 1 - y) * inW + x) * 4
        const dst = (y * inW + x) * 4
        mirrored[dst] = inputBytes[src]
        mirrored[dst + 1] = inputBytes[src + 1]
        mirrored[dst + 2] = inputBytes[src + 2]
        mirrored[dst + 3] = 255
    }
}
const mirroredDiff = compareOutputToInput(inputPixels, { width: inW, height: inH, data: mirrored })
assert.equal(mirroredDiff.flipped, 0)
assert.equal(mirroredDiff.orientation, 'flipped')
assert.equal(isInputPassthrough(mirroredDiff), true)

// Unusable readbacks are null, never an invented verdict.
assert.equal(compareOutputToInput(null, outputCopy), null)
assert.equal(compareOutputToInput(inputPixels, null), null)
assert.equal(compareOutputToInput({ width: 4, height: 4, data: new Uint8Array(0) }, outputCopy), null)
assert.equal(isInputPassthrough(null), null)

// Float (RGBA16F-style) readbacks compare in the same normalized domain.
const floatInput = { width: 2, height: 1, data: new Float32Array([0, 0.5, 1, 1, 1, 0.5, 0, 1]) }
const floatOutput = { width: 2, height: 1, data: new Float32Array([0, 0.5, 1, 1, 1, 0.5, 0, 1]) }
const floatDiff = compareOutputToInput(floatInput, floatOutput)
assert.equal(floatDiff.aligned, 0)
assert.equal(isInputPassthrough(floatDiff), true)
// Mixed byte output vs float input normalizes each side independently.
const byteOfFloat = { width: 2, height: 1, data: new Uint8Array([0, 128, 255, 255, 255, 128, 0, 255]) }
const mixedDiff = compareOutputToInput(floatInput, byteOfFloat)
assert.ok(mixedDiff.aligned < 1 / 255, `mixed-domain diff should be sub-byte, got ${mixedDiff.aligned}`)

// ---------------------------------------------------------------------------
// In-page probe guards (the browser path is exercised by the harness run;
// these pin the no-session shapes without a browser).
// ---------------------------------------------------------------------------

// No window in Node: the in-page function must fail loudly, not invent data.
let threw = null
try {
    await measureInputPassthroughInPage({ globals: {} })
} catch (err) {
    threw = err
}
assert.ok(threw, 'measureInputPassthroughInPage requires a browser window')

// ---------------------------------------------------------------------------
// Source guards against the vendored upstream bundle, so a vendor refresh
// that changes the upstream facts this module mirrors turns the suite red.
// ---------------------------------------------------------------------------

const vendorSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'vendor', 'shade-mcp', 'harness', 'index.js'),
    'utf8',
)

// The upstream verb's predicate is still the time/color one the gap row
// describes — the repository-side probe exists because of exactly this.
assert.ok(
    vendorSource.includes('temporalDiff > 0.01 || uniqueColors > 5'),
    'vendored testNoPassthrough should keep its temporalDiff/uniqueColors predicate',
)
// The audited upstream source (shade-mcp 1aea08a/987b14d, pending release)
// renders through a readFrame(t) helper instead of the pre-fix literal
// renderer.render(0)/renderer.render(1) calls, and a vendor refresh will
// deliver that refactor together with the issue-#28 readback fix. Accept both
// eras — but either way the verb must still render and compare two distinct
// times (the temporalDiff/uniqueColors predicate above stays pinned verbatim).
const rendersBothTimes =
    (vendorSource.includes('renderer.render(0)') && vendorSource.includes('renderer.render(1)')) ||
    (vendorSource.includes('readFrame(0)') && vendorSource.includes('readFrame(1.0)'))
assert.ok(rendersBothTimes, 'vendored testNoPassthrough should still compare two render times')
assert.ok(
    !vendorSource.includes('updateTextureFromSource'),
    'vendored testNoPassthrough should not inject an input texture (GAP-019)',
)

// The probe's in-page body must keep reading the consumed input texture and
// the render surface through the backend's async readPixels (the GAP-012
// contract), and must keep its positive control.
const probeSource = fs.readFileSync(path.join(__dirname, 'passthrough-input.js'), 'utf8')
assert.ok(probeSource.includes('backend.readPixels(textureId)'), 'probe must read through the backend async readPixels')
assert.ok(probeSource.includes('readPixels(inputTexId)'), 'probe must read the consumed input texture')
assert.ok(probeSource.includes('global_${surface}_read'), 'probe must keep the render-surface candidate order inline')
assert.ok(probeSource.includes('control_mean_abs_diff'), 'probe must keep the write-blit positive control')
assert.ok(probeSource.includes('w[globals.setPaused]'), 'probe must pause animation around its render')
assert.ok(probeSource.includes("w[globals.setPaused](false)"), 'probe must restore unpaused playback')

console.log('PASS: test_passthrough_input')

#!/usr/bin/env node
//
// The AI development contract's texture and frame-lifetime sections describe
// four behaviors that recent engine changes reshaped: which global surfaces
// keep their final frame-local bindings when an update pass is skipped, the
// WebGPU path a persistent texture takes on resize, how WebGPU uploads a 2D
// canvas, and which sampler an unauthored 3D binding gets. This guard pins
// the corrected statements to their implementations in both directions: the
// statement must be present in `llms-full.txt`, and the source must still
// implement it. Removing either side turns the JS suite red instead of
// waiting for an audit.
//
// Run: node shaders/tests/test_contract_frame_lifetime.mjs

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const read = (relative) => readFileSync(`${repoRoot}/${relative}`, 'utf8')

const contract = read('llms-full.txt')
const pipeline = read('shaders/src/runtime/pipeline.js')
const webgpu = read('shaders/src/runtime/backends/webgpu.js')

describe('AI development contract tracks the frame-lifetime behaviors', () => {
    test('feedback and persistent surfaces keep final bindings across skipped writes', () => {
        assert.match(contract,
            /Graph feedback surfaces — a surface that a pass reads before any\s+pass writes it and that a later pass writes — and surfaces whose global\s+texture spec sets `persistent: true` preserve their final frame-local\s+bindings too/,
            'llms-full.txt no longer documents feedback and persistent binding persistence')
        assert.match(contract,
            /A surface written before it is first\s+read is frame-local scratch and still swaps/,
            'llms-full.txt no longer distinguishes frame-local scratch from feedback')
        // The feedback set is reads-before-write intersected with writes.
        assert.match(pipeline, /const readBeforeWriteSurfaces = new Set\(\)/)
        assert.match(pipeline,
            /\[\.\.\.readBeforeWriteSurfaces\]\.filter\(name => writtenSurfaces\.has\(name\)\)/)
        // swapBuffers persists state surfaces, feedback surfaces, and explicitly
        // persistent globals.
        assert.match(pipeline,
            /isStateSurface\(name\) \|\| this\._feedbackSurfaces\?\.has\(name\) \|\|\s+this\.graph\?\.textures\?\.get\?\.\(`global_\$\{name\}`\)\?\.persistent === true/)
    })

    test('a mipmapped persistent source resamples on WebGPU resize even at matching dimensions', () => {
        assert.match(contract,
            /a mipmapped\s+source always takes the resample path, even at matching\s+dimensions/,
            'llms-full.txt no longer documents the mipmapped persistent-resize path')
        assert.match(pipeline, new RegExp(
            'A mipmapped source is copied through the WebGPU resample\\n\\s*// path even when this temporary has the same dimensions\\.'))
        // The temporary must be renderable for the resample pass.
        assert.match(pipeline, /usage: \['render', 'sample', 'copySrc', 'copyDst'\]/)
        assert.match(webgpu,
            /srcTex\.width !== dstTex\.width \|\| srcTex\.height !== dstTex\.height \|\|\s+srcTex\.mipLevels > 1 \|\| dstTex\.mipLevels > 1/,
            'webgpu.js copyTexture no longer routes mipmapped sources to the resample pass')
    })

    test('WebGPU uploads willReadFrequently canvases from getImageData', () => {
        assert.match(contract,
            /A 2D canvas created with `willReadFrequently` keeps its pixels in CPU memory, so WebGPU\s+uploads it from `getImageData\(\)` through `queue\.writeTexture\(\)`/,
            'llms-full.txt no longer documents the willReadFrequently canvas upload path')
        assert.match(contract,
            /`copyExternalImageToTexture` would unpremultiply on the GPU and round low-alpha texels\s+differently/,
            'llms-full.txt no longer states why the canvas path must match WebGL2 bytes')
        assert.match(webgpu, /getContextAttributes\?\.\(\)\.willReadFrequently/,
            'webgpu.js no longer gates the getImageData upload on willReadFrequently')
        assert.match(webgpu, /this\.device\.queue\.writeTexture\(\s*\{ texture: tex\.handle \}/)
    })

    test('unauthored 3D sampling uses the linear default on WebGPU', () => {
        assert.match(contract,
            /an authored\s+`'nearest'` filter binds the nearest sampler, and everything\s+else — including unauthored 3D — binds the default linear sampler, matching\s+WebGL2's default/,
            'llms-full.txt no longer documents the 3D sampler resolution')
        // The 3D texture record defaults to linear, matching WebGL2.
        assert.match(webgpu, /filter: spec\.filter \|\| 'linear'/)
        // The render and compute sampler paths both infer from the 3D record.
        assert.match(webgpu,
            /is3D\s+\?\s+\(sampledTexture\.filter === 'nearest' \? 'nearest' : 'default'\)\s+:\s+inputSamplerDefault/,
            'webgpu.js render-path sampler resolution no longer follows the 3D texture filter')
        assert.match(webgpu,
            /is3D \? \(texRec\.filter === 'linear' \? 'default' : 'nearest'\)/,
            'webgpu.js compute-path sampler resolution no longer follows the 3D texture filter')
    })
})

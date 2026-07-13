#!/usr/bin/env node
// edge renderScale parity (structural lock). edge scales its convolution kernel
// radius by renderScale, which the runtime sets for tiled / large-format export.
// edge.wgsl previously ignored renderScale entirely, so at any non-unit scale
// WebGPU diverged from WebGL2. This pins BOTH backends to the identical
// radius formula so that gap can never silently reopen, and asserts the two
// dead uniforms removed from edge.glsl (tileOffset, fullResolution) stay gone.
// Empirical cross-backend render parity for edge (at the default scale) is
// covered by test_artistic_effect_release.mjs.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dir = path.resolve(__dirname, '../effects/filter/edge')
const glsl = fs.readFileSync(path.join(dir, 'glsl/edge.glsl'), 'utf8')
const wgsl = fs.readFileSync(path.join(dir, 'wgsl/edge.wgsl'), 'utf8')

// Both backends must scale the kernel radius by renderScale, identically.
assert.match(glsl, /radius\s*=\s*min\(\s*int\(\s*\(\s*size\s*\+\s*1\.0\s*\)\s*\*\s*renderScale\s*\)\s*,\s*256\s*\)/,
    'edge.glsl must scale the kernel radius by renderScale: min(int((size + 1.0) * renderScale), 256)')
assert.match(wgsl, /radius\s*=\s*min\(\s*i32\(\s*\(\s*u\.size\s*\+\s*1\.0\s*\)\s*\*\s*u\.renderScale\s*\)\s*,\s*256\s*\)/,
    'edge.wgsl must scale the kernel radius by renderScale identically to GLSL (the WGSL port previously ignored renderScale, diverging at non-unit scale)')

// renderScale must be a real, wired uniform on both backends.
assert.match(glsl, /uniform\s+float\s+renderScale\s*;/, 'edge.glsl must declare the renderScale uniform')
assert.match(wgsl, /renderScale\s*:\s*f32\s*,/, 'edge.wgsl Uniforms struct must carry a renderScale field')

// The dead uniforms removed from edge.glsl must not return.
assert.doesNotMatch(glsl, /uniform\s+vec2\s+tileOffset\s*;/, 'edge.glsl must not re-declare the unused tileOffset uniform')
assert.doesNotMatch(glsl, /uniform\s+vec2\s+fullResolution\s*;/, 'edge.glsl must not re-declare the unused fullResolution uniform')

console.log('edge renderScale parity (structural): ok')

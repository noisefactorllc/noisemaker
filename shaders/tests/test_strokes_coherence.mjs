#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dir = path.resolve(__dirname, '../effects/filter/strokes')
const { default: definition } = await import(path.join(dir, 'definition.js'))

assert.deepEqual(definition.passes.map(pass => pass.program), ['stkSmear', 'stkPost'],
    'Strokes must not execute a preparation pass that is a no-op for four of its five modes')
assert.equal(definition.textures?._stkEroded, undefined,
    'Strokes must not allocate an erosion surface used by only one compile-time mode')

// Pattern guard: no filter effect may gate a pass in the pipeline via a
// pass-condition (runIf/skipIf). Mode-specific pass behavior must live inside
// the shader as a compile-time define -- gating a pass by mode in the pipeline
// is a banned pattern (exactly what Strokes' Sumi-e erosion above re-introduced
// before this fix). Scoped to filter/ so the pre-existing generic condition
// mechanism used elsewhere (e.g. render/) is unaffected.
const filterDir = path.resolve(__dirname, '../effects/filter')
for (const name of fs.readdirSync(filterDir).sort()) {
    const defPath = path.join(filterDir, name, 'definition.js')
    if (!fs.existsSync(defPath)) continue
    const { default: def } = await import(defPath)
    for (const pass of def.passes || []) {
        assert.equal(pass.conditions, undefined,
            `filter/${name} pass "${pass.name}" carries a pipeline pass-condition; gate mode-specific passes with a compile-time define inside the shader instead`)
    }
}

for (const backend of ['glsl', 'wgsl']) {
    const source = fs.readFileSync(path.join(dir, backend, `stkSmear.${backend}`), 'utf8')
    assert.match(source, /brushStrokeField/,
        `${backend} must form anti-aliased capsule brush marks across neighboring spawn cells`)
    assert.doesNotMatch(source, /fwidth\s*\(\s*capsule\s*\)/,
        `${backend} capsule antialiasing must not inherit derivatives across changing spawn-cell neighborhoods`)
    assert.doesNotMatch(source, /strokePigment/,
        `${backend} must not assign a single sampled color to a rectangular stroke cell`)
    assert.match(source, /strokeVariation/, `${backend} run length must vary across a coherent stroke field`)
    assert.doesNotMatch(source, /runBase\s*\*\s*\(0\.5\s*\+\s*hash12\(gc\)\)/,
        `${backend} must not turn every pixel into an independent grain sample`)
    assert.match(source, /sprayJitter/, `${backend} sprayed jitter must vary continuously across a brush mark`)
    assert.doesNotMatch(source, /strokeKey/,
        `${backend} sprayed jitter must not introduce a second hard rectangular partition`)
    assert.match(source, /MODE\s*==\s*3/,
        `${backend} must gate the Sumi-e path with the compile-time MODE define, so other modes compile without its erosion`)
    assert.match(source, /min\(\s*e,/,
        `${backend} Sumi-e must locally erode the source in-shader (srcSample) so the directional smear spreads dark ink like the two-pass original`)
    assert.doesNotMatch(source, /erode3x3/,
        `${backend} must not reintroduce the standalone 3x3 erosion helper`)
    assert.doesNotMatch(source, /erodedTex/,
        `${backend} must not depend on a single-mode preparation texture`)
    assert.equal(fs.existsSync(path.join(dir, backend, `stkErode.${backend}`)), false,
        `${backend} must not retain the redundant preparation shader`)
}

console.log('strokes coherent-mark structure: ok')

#!/usr/bin/env node
/**
 * The loop-seam tool in a real browser, at the default size and frames.
 *
 * - A program whose only time term is a sine osc() with speed 1, which has
 *   period 1 in time, has no seam: 0 pixels above 2.
 * - A program whose only time term is a sine osc() with speed 0.25 does not
 *   return to its start, so it has a seam.
 * - The demo's points program moves its particles on every frame, so it has
 *   a seam.
 *
 *   node shaders/tests/test_loop_seam.mjs [--backend webgl2|webgpu]
 */
import assert from 'node:assert/strict'
import { measureLoopSeam } from '../../scripts/lib/loop-seam.mjs'

const backendArg = process.argv.indexOf('--backend')
const backends = backendArg >= 0 ? [process.argv[backendArg + 1]] : ['webgl2', 'webgpu']

const PROGRAMS = [
    { name: 'a sine osc() of speed 1 has no seam', seam: false, dsl: 'search synth\n\ngradient(rotation: osc(type: oscKind.sine))\n  .write(o0)\n\nrender(o0)\n' },
    { name: 'a sine osc() of speed 0.25 has a seam', seam: true, dsl: 'search synth\n\ngradient(rotation: osc(type: oscKind.sine, speed: 0.25))\n  .write(o0)\n\nrender(o0)\n' },
    { name: 'moving particles have a seam', seam: true, dsl: 'search points, synth, render\n\nperlin()\n  .pointsEmit()\n  .physical()\n  .pointsRender()\n  .write(o0)\n\nrender(o0)\n' },
]

for (const backend of backends) {
    for (const { name, seam, dsl } of PROGRAMS) {
        const started = Date.now()
        const { run, backends: measured } = await measureLoopSeam(dsl, { backend })
        assert.equal(run.frames, 600)
        assert.deepEqual(run.size, { width: 96, height: 96 })
        assert.equal(measured.length, 1)
        const [result] = measured
        assert.equal(result.backend, backend)
        if (seam) assert.ok(result.pixelsAbove2 > 0, `${name} (${backend}): ${JSON.stringify(result)}`)
        else assert.equal(result.pixelsAbove2, 0, `${name} (${backend}): ${JSON.stringify(result)}`)
        console.log(`PASS ${name} (${backend}): ${result.pixelsAbove2} pixels above 2, ${((Date.now() - started) / 1000).toFixed(1)} s`)
    }
}

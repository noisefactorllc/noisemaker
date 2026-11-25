/**
 * The loop-seam tool's frames and steps, with the real Pipeline on a mock
 * backend, so that each step is the one the runtime gives (Pipeline.render()).
 * Also the comparison of two frames.
 */

import assert from 'node:assert/strict'
import { Pipeline } from '../src/runtime/pipeline.js'
import { Backend } from '../src/runtime/backend.js'
import { compareSeamFrames, irregularSteps, renderSeamFrames, seamFrames, seamFrameTime } from '../../scripts/lib/loop-seam.mjs'

class MockBackend extends Backend {
    constructor() { super(null) }
    async init() {}
    createTexture(id, spec) { this.textures.set(id, { id, width: spec.width, height: spec.height }); return this.textures.get(id) }
    destroyTexture(id) { this.textures.delete(id) }
    async compileProgram(id) { this.programs.set(id, {}); return this.programs.get(id) }
    executePass() {}
    beginFrame() {}
    endFrame() {}
    resize() {}
    getName() { return 'Mock' }
    static isAvailable() { return true }
}

async function loop(frames, warmupLoops) {
    const pipeline = new Pipeline({ passes: [], textures: new Map() }, new MockBackend())
    await pipeline.init(8, 8)
    const times = []
    const { phase1 } = seamFrames(frames, warmupLoops)
    const steps = await renderSeamFrames({
        pipeline, frames, warmupLoops, from: 0, to: phase1,
        render: time => { times.push(time); pipeline.render(time) },
    })
    return { times, steps, irregular: irregularSteps(steps, frames) }
}

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) <= 1e-12, `${message}: ${actual} is not ${expected}`)
const tests = []
const test = (name, fn) => tests.push({ name, fn })

test('with 6 frames and no warm-up, frames 0 and 6 are compared, and frames 0 and 1 have a step of 0', async () => {
    assert.deepEqual(seamFrames(6, 0), { phase0: 0, phase1: 6 })
    const { times, irregular } = await loop(6, 0)
    assert.deepEqual(times.length, 7)
    times.forEach((time, k) => close(time, [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1][k], `time of frame ${k}`))
    assert.deepEqual(irregular, [{ frame: 0, step: 0 }, { frame: 1, step: 0 }])
})

test('with 6 frames and one warm-up loop, frames 6 and 12 are compared, and frames 0, 1 and 7 step 0 and frame 6 steps 1/600', async () => {
    assert.deepEqual(seamFrames(6, 1), { phase0: 6, phase1: 12 })
    const { times, irregular } = await loop(6, 1)
    assert.deepEqual(times.length, 13)
    times.forEach((time, k) => close(time, k === 12 ? 1 : (k % 6) / 6, `time of frame ${k}`))
    assert.deepEqual(irregular.map(({ frame }) => frame), [0, 1, 6, 7])
    assert.deepEqual(irregular.filter(({ frame }) => frame !== 6), [{ frame: 0, step: 0 }, { frame: 1, step: 0 }, { frame: 7, step: 0 }])
    close(irregular.find(({ frame }) => frame === 6).step, 1 / 600, 'step of frame 6')
})

test('the last frame of a loop is at time 1, and no frame time is accumulated', () => {
    assert.equal(seamFrameTime(600, 600, 0), 1)
    assert.equal(seamFrameTime(1200, 600, 1), 1)
    assert.equal(seamFrameTime(600, 600, 1), 0)
    assert.equal(seamFrameTime(599, 600, 0), 599 / 600)
})

test('a render that the runtime skips is not a step', async () => {
    const pipeline = { frameIndex: 0, globalUniforms: { deltaTime: 0 } }
    let calls = 0
    const steps = await renderSeamFrames({
        pipeline, frames: 2, warmupLoops: 0, from: 0, to: 2,
        // The first render of frame 1 is skipped, as one is while a program compiles.
        render: time => { calls++; if (calls === 2) return; pipeline.frameIndex++; pipeline.globalUniforms.deltaTime = time },
    })
    assert.equal(calls, 4)
    assert.deepEqual(steps, [0, 0.5, 1])
})

test('a render that fails stops the loop with its own cause, and is not retried', async () => {
    const pipeline = { frameIndex: 0, globalUniforms: { deltaTime: 0 } }
    let calls = 0
    await assert.rejects(renderSeamFrames({
        pipeline, frames: 2, warmupLoops: 0, from: 0, to: 2,
        render: () => { calls++; throw new Error('The program did not render: pass failed') },
    }), /pass failed/)
    assert.equal(calls, 1)
})

test('a render that the runtime always skips fails after 100 renders', async () => {
    const pipeline = { frameIndex: 0, globalUniforms: { deltaTime: 0 } }
    let calls = 0
    await assert.rejects(renderSeamFrames({ pipeline, frames: 2, warmupLoops: 0, from: 0, to: 0, render: () => { calls++ } }), /skipped it 100 times/)
    assert.equal(calls, 100)
})

test('compareSeamFrames gives 0 for equal frames, and one pixel above 2 for a difference of 3', () => {
    const frame = (width, height, fill = 0) => ({ width, height, data: new Uint8Array(width * height * 4).fill(fill) })
    const a = frame(4, 4, 100)
    assert.deepEqual(compareSeamFrames(a, frame(4, 4, 100)), { maxDifference: 0, pixelsAbove2: 0, fractionAbove2: 0, meanAbsoluteDifference: 0, pixelCount: 16 })
    const b = frame(4, 4, 100)
    b.data[5 * 4 + 2] = 103
    const result = compareSeamFrames(a, b)
    assert.equal(result.pixelsAbove2, 1)
    assert.equal(result.maxDifference, 3)
    assert.equal(result.fractionAbove2, 1 / 16)
    close(result.meanAbsoluteDifference, 3 / 64, 'mean')
    const c = frame(4, 4, 100)
    c.data[0] = 102
    assert.equal(compareSeamFrames(a, c).pixelsAbove2, 0, 'a difference of 2 is not above 2')
    assert.throws(() => compareSeamFrames(a, frame(4, 2)), /dimensions/)
})

for (const { name, fn } of tests) {
    try {
        await fn()
        console.log(`PASS: ${name}`)
    } catch (error) {
        console.error(`FAIL: ${name}`)
        console.error(error)
        process.exit(1)
    }
}

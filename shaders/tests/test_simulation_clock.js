/**
 * The fixed-step simulation clock, on its own: exact grid steps across the
 * wrap, after a frame at time 0, after a seek and a start, at a discontinuity,
 * and at 24, 30 and 60 renders a second.
 */

import assert from 'node:assert/strict'
import { SimulationClock, stepsPerLoop, jumpLimit } from '../src/runtime/simulation-clock.js'

const tests = []
const test = (name, fn) => tests.push({ name, fn })

// Renders at the given loop times; returns the steps each one ran.
function run(clock, times, options) {
    return times.map(t => clock.advance(t, options).steps)
}

test('a loop of L seconds has round(60 L) steps, and the jump limit is min(30, ceil(N / 2))', () => {
    assert.equal(stepsPerLoop(10), 600)
    assert.equal(stepsPerLoop(30), 1800)
    assert.equal(stepsPerLoop(7.25), 435)
    assert.equal(stepsPerLoop(0.1), 6)
    assert.equal(stepsPerLoop(0.001), 1)
    assert.equal(jumpLimit(600), 30)
    assert.equal(jumpLimit(6), 3)
    assert.equal(new SimulationClock(10).stepSize, 1 / 600)
})

test('the first render is a start and runs one step, at the grid step of its time', () => {
    const clock = new SimulationClock(10)
    const first = clock.advance(0)
    assert.deepEqual(first.steps, [0])
    assert.equal(first.start, true)
    assert.equal(first.deltaTime, 0)
    const later = new SimulationClock(10).advance(0.5)
    assert.deepEqual(later.steps, [300])
})

test('at 60 renders a second each render runs one step, and the step after a frame at time 0 is a step', () => {
    const clock = new SimulationClock(10)
    const steps = run(clock, Array.from({ length: 5 }, (_, k) => k / 60 / 10))
    assert.deepEqual(steps, [[0], [1], [2], [3], [4]])
})

test('across the wrap the steps continue with no reset and no odd step (L = 10 and L = 30)', () => {
    for (const L of [10, 30]) {
        const n = stepsPerLoop(L)
        const clock = new SimulationClock(L)
        const times = [n - 3, n - 2, n - 1, 0, 1, 2].map(k => k / n)
        const steps = run(clock, times)
        assert.deepEqual(steps, [[n - 3], [n - 2], [n - 1], [n], [n + 1], [n + 2]], `L = ${L}`)
        // Every step is one grid step: the wrap gives exactly one step too.
        const flat = steps.flat()
        for (let i = 1; i < flat.length; i++) assert.equal(flat[i] - flat[i - 1], 1, `L = ${L}, step ${i}`)
        assert.equal(clock.stepTime(n), 0)
    }
})

test('24, 30 and 60 renders a second show the same grid step at the same loop times', () => {
    const shown = fps => {
        const clock = new SimulationClock(10)
        const byTime = new Map()
        for (let k = 0; k <= fps * 10; k++) {
            const t = (k / (fps * 10)) % 1
            const { steps } = clock.advance(t)
            // Frame k is at grid position k * 600 / (fps * 10), that is k * 60 / fps.
            byTime.set(Math.round(k * 60 / fps * 1e6) / 1e6, clock.lastStep)
            assert.ok(steps.length <= 3, `fps ${fps}: ${steps.length} steps in one render`)
        }
        return byTime
    }
    const at24 = shown(24), at30 = shown(30), at60 = shown(60)
    // The frame at t = 1/6 is frame 40 at 24 fps, 50 at 30 fps and 100 at 60 fps.
    assert.equal(at24.get(100), 100)
    assert.equal(at30.get(100), 100)
    assert.equal(at60.get(100), 100)
    let common = 0
    for (const [position, step] of at24) {
        if (at30.has(position)) { assert.equal(at30.get(position), step, `24/30 at ${position}`); common++ }
        if (at60.has(position)) { assert.equal(at60.get(position), step, `24/60 at ${position}`); common++ }
    }
    assert.ok(common > 0)
    // 24 fps alternates 2 and 3 steps a frame.
    const clock = new SimulationClock(10)
    const counts = run(clock, [0, 1, 2, 3, 4].map(k => k / 240)).map(s => s.length)
    assert.deepEqual(counts, [1, 2, 3, 2, 3])
})

test('a render at the same time runs no step', () => {
    const clock = new SimulationClock(10)
    clock.advance(0.25)
    assert.deepEqual(clock.advance(0.25).steps, [])
    assert.deepEqual(clock.advance(0.25 - 1e-12).steps, [], 'a hair earlier is the same time')
})

test('a seek moves the clock without stepping, and the next render steps from the first grid step after it', () => {
    const clock = new SimulationClock(10)
    clock.advance(0.1)
    clock.seek(0.5)
    assert.equal(clock.lastStep, 300)
    const seekRender = clock.advance(0.5)
    assert.deepEqual(seekRender.steps, [])
    assert.deepEqual(clock.advance(0.5 + 2 / 600).steps, [301, 302])
    const fresh = new SimulationClock(10)
    fresh.seek(0.5)
    assert.equal(fresh.startPending, true, 'a seek before the first render leaves the start pending')
})

test('a jump of more than K steps is a discontinuity that re-anchors and runs one step', () => {
    const clock = new SimulationClock(10)
    clock.advance(0)
    assert.deepEqual(clock.advance(30 / 600).steps.length, 30, 'K steps run')
    const forward = clock.advance(0.5)
    assert.equal(forward.discontinuity, true)
    assert.deepEqual(forward.steps, [300])
    assert.equal(clock.stepsSinceStart, 1)
    const backward = clock.advance(0.25)
    assert.equal(backward.discontinuity, true, 'a backward jump reads as a wrap of more than K steps')
    assert.deepEqual(backward.steps, [150])
    assert.equal(backward.deltaTime, 0)
})

test('a loop duration where 60 L is not an integer keeps whole steps per loop', () => {
    const clock = new SimulationClock(7.25)
    const n = clock.stepsPerLoop
    assert.equal(n, 435)
    const times = [n - 1, 0, 1].map(k => k / n)
    assert.deepEqual(run(clock, times), [[n - 1], [n], [n + 1]])
})

test('reset() makes the next render a start', () => {
    const clock = new SimulationClock(10)
    clock.advance(0.1)
    clock.advance(0.1 + 1 / 600)
    clock.reset()
    const result = clock.advance(0.3)
    assert.equal(result.start, true)
    assert.deepEqual(result.steps, [180])
    assert.equal(clock.stepsSinceStart, 1)
})

test('a change of loop duration seeks to the next render time and keeps going', () => {
    const clock = new SimulationClock(10)
    clock.advance(0.5)
    clock.setLoopDuration(20)
    const after = clock.advance(0)
    assert.equal(after.seek, true)
    assert.deepEqual(after.steps, [])
    assert.deepEqual(clock.advance(1 / 1200).steps, [1])
})

test('an edit mark runs one step only while stopped with no step due, and every render clears it', () => {
    const clock = new SimulationClock(10)
    clock.advance(0.2)
    clock.markEdit()
    const edit = clock.advance(0.2, { stopped: true })
    assert.equal(edit.edit, true)
    assert.deepEqual(edit.steps, [121])
    assert.deepEqual(clock.advance(0.2, { stopped: true }).steps, [], 'the mark is used once')
    clock.markEdit()
    assert.deepEqual(clock.advance(0.2, { stopped: false }).steps, [], 'no step while playing')
    assert.deepEqual(clock.advance(0.2, { stopped: true }).steps, [], 'the render while playing cleared the mark')
    clock.markEdit()
    assert.deepEqual(clock.advance(0.2 + 2 / 600, { stopped: true }).steps, [121, 122],
        'a render with steps due runs only its due steps, and the edit step left the grid where it was')
})

test('paused edits never run the clock ahead, so playback resumes without a pause', () => {
    const clock = new SimulationClock(10)
    clock.advance(0.5)
    for (let i = 0; i < 120; i++) {
        clock.markEdit()
        assert.equal(clock.advance(0.5, { stopped: true }).steps.length, 1)
    }
    assert.equal(clock.lastStep, 300)
    assert.equal(clock.nextStepTime(0.5), 301 / 600)
    let ran = 0
    for (let k = 1; k <= 180; k++) ran += clock.advance(0.5 + k / 600, { stopped: false }).steps.length
    assert.equal(ran, 180, 'every frame after the resume runs its step')
})

test('edits while playing at 120 Hz add no steps: 60 steps a second', () => {
    const clock = new SimulationClock(10)
    let ran = 0
    for (let k = 0; k <= 120; k++) {
        clock.markEdit()
        ran += clock.advance(k / 1200, { stopped: false }).steps.length
    }
    assert.equal(ran, 61)
})

test('the deltaTime of a render is the loop time since the previous render, with the wrap as +1', () => {
    const clock = new SimulationClock(10)
    clock.advance(599 / 600)
    const wrap = clock.advance(0)
    assert.ok(Math.abs(wrap.deltaTime - 1 / 600) < 1e-12, String(wrap.deltaTime))
    assert.deepEqual(wrap.steps, [600])
    const next = clock.advance(1 / 600)
    assert.ok(Math.abs(next.deltaTime - 1 / 600) < 1e-12, String(next.deltaTime))
})

test('nextStepTime() gives the loop time of the grid step after the time it is given', () => {
    const clock = new SimulationClock(7.25)
    assert.equal(clock.nextStepTime(0.5), (Math.floor(0.5 * 435 + 1e-6) + 1) / 435)
    clock.advance(434 / 435)
    assert.equal(clock.nextStepTime(434 / 435), 0)
    // Two queued steps: the second steps from the first one's time.
    const first = clock.nextStepTime(0.5)
    assert.equal(clock.nextStepTime(first), (Math.floor(0.5 * 435 + 1e-6) + 2) / 435)
})

test('a change of loop duration with the same steps per loop also seeks', () => {
    const clock = new SimulationClock(10)
    clock.advance(0.5)
    clock.setLoopDuration(10)
    assert.equal(clock.seekPending, true)
    const after = clock.advance(0)
    assert.equal(after.seek, true)
    assert.equal(after.discontinuity, false)
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

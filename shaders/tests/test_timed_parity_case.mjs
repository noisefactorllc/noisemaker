#!/usr/bin/env node
// A timed parity case renders stated frames on the fixed-step clock, with its
// uploads and MIDI messages after stated frames. A case with a control proves
// that its target matters: the control, the case with the target's
// contribution disabled, must render a different frame. A case without a
// timeline or a control keeps the time-0 contract.
import assert from 'node:assert/strict'
import test from 'node:test'

import {
    timelineTimes,
    validateParityAttestation,
    validateParityCase,
} from '../../scripts/lib/shader-parity-attestation.mjs'

const EFFECT = 'filter/example'
const untimed = (extra = {}) => ({
    schemaVersion: 1,
    effects: [EFFECT],
    dsl: 'search filter\nnoise().example().write(o0)\nrender(o0)',
    surface: 'o0',
    resolution: [8, 8],
    epsilon: 0,
    requireColorVariation: true,
    ...extra,
})
const CONTROL = 'search filter\nnoise().example(delay: 0).write(o0)\nrender(o0)'
const timed = (timeline = {}, extra = {}) => untimed({
    timeline: { frames: [0, 1, 2, 3], ...timeline },
    control: CONTROL,
    ...extra,
})
const texture = (extra = {}) => ({ effect: EFFECT, uniform: 'inputTex', width: 1, height: 1, data: [1, 2, 3, 255], ...extra })
const frame = () => ({ width: 8, height: 8, nonzeroRgbPixels: 64, nonzeroAlphaPixels: 64, uniqueColors: 9 })
const attestation = (extra = {}) => ({
    schemaVersion: 1,
    effect: EFFECT,
    sourceHash: 's',
    caseHash: 'c',
    resolution: [8, 8],
    frames: { webgl2: frame(), webgpu: frame() },
    execution: { webgl2TargetPasses: 1, webgpuTargetPasses: 1 },
    parity: { epsilon: 0, maxDiff: 0, meanDiff: 0, mismatchCount: 0, mismatchPercent: 0 },
    ...extra,
})
const expected = (parityCase) => ({
    effectId: EFFECT, sourceHash: 's', caseHash: 'c', resolution: [8, 8], epsilon: 0,
    requireColorVariation: true, timeline: parityCase.timeline, control: parityCase.control,
})
const timelineEvidence = (parityCase) => ({
    frames: parityCase.timeline.frames,
    loopSeconds: parityCase.timeline.loopSeconds ?? 10,
})
const controlEvidence = (differs = { webgl2: true, webgpu: true }, targetPasses = { webgl2: 1, webgpu: 1 }) => ({ differs, targetPasses })
const refused = (errors, pattern, message) => assert.ok(errors.some(error => pattern.test(error)),
    `${message ?? pattern}: ${JSON.stringify(errors)}`)

test('a case with no timeline or control keeps the time-0 contract', () => {
    assert.deepEqual(validateParityCase(untimed(), EFFECT), [])
    assert.deepEqual(validateParityCase(untimed({ textureInputs: [texture()] }), EFFECT), [])
    assert.deepEqual(validateParityAttestation(attestation(), expected(untimed())), [])
})

test('a timed case states frames on the fixed-step grid and a control', () => {
    assert.deepEqual(validateParityCase(timed(), EFFECT), [])
    assert.deepEqual(validateParityCase(timed({ loopSeconds: 2 }), EFFECT), [])
})

test('a timed case that renders only time 0 is refused', () => {
    for (const frames of [[0], [0, 0], [], [0, 0, 0]]) {
        refused(validateParityCase(timed({ frames }), EFFECT), /frames/, JSON.stringify(frames))
    }
})

test('a timed case is refused without a control, and a control must differ from the case', () => {
    const noControl = timed()
    delete noControl.control
    refused(validateParityCase(noControl, EFFECT), /control/)
    refused(validateParityCase(timed({}, { control: untimed().dsl }), EFFECT), /control/)
    refused(validateParityCase(timed({}, { control: `  ${untimed().dsl}\n` }), EFFECT), /control/)
    refused(validateParityCase(timed({}, { control: '  ' }), EFFECT), /control/)
    refused(validateParityCase(untimed({ control: 7 }), EFFECT), /control/)
})

test('an untimed case may state a control: a producer observed through its consumer', () => {
    assert.deepEqual(validateParityCase(untimed({ control: CONTROL }), EFFECT), [])
})

test('a timed case is refused for frames off the grid, out of order or past one loop, and for unknown fields', () => {
    for (const frames of [[1, 2], [0, 2, 1], [0, 1.5], [0, -1], [0, 600], ['0', 1]]) {
        refused(validateParityCase(timed({ frames }), EFFECT), /frames/, JSON.stringify(frames))
    }
    refused(validateParityCase(timed({ frames: [0, 100], loopSeconds: 1 }), EFFECT), /frames/,
        'a one-second loop holds sixty steps')
    assert.deepEqual(validateParityCase(timed({ frames: [0, 30, 60] }), EFFECT), [],
        'frames may skip steps within the clock\'s jump limit: the render runs each due step')
    refused(validateParityCase(timed({ frames: [0, 31] }), EFFECT), /frames/,
        'a gap past the jump limit re-anchors the clock instead of stepping it')
    assert.deepEqual(validateParityCase(timed({ frames: [0, 3], loopSeconds: 0.1 }), EFFECT), [])
    refused(validateParityCase(timed({ frames: [0, 4], loopSeconds: 0.1 }), EFFECT), /frames/,
        'a six-step loop has a jump limit of three steps')
    for (const loopSeconds of [0, -1, '10', Number.NaN, 601]) {
        refused(validateParityCase(timed({ loopSeconds }), EFFECT), /loopSeconds/, String(loopSeconds))
    }
    refused(validateParityCase(timed({ seconds: [0, 1] }), EFFECT), /seconds/)
    refused(validateParityCase(untimed({ timline: { frames: [0, 1] } }), EFFECT), /timline/,
        'a misspelt timeline is refused, not read as an untimed case')
    refused(validateParityCase(timed({}, { textureInputs: [texture({ afterframe: 2 })] }), EFFECT), /afterframe/)
    refused(validateParityCase(untimed({ meshInputs: [{ mesh: 'mesh0', path: 'share/meshes/cube.obj', scale: 2 }] }), EFFECT), /scale/)
    assert.deepEqual(validateParityCase(untimed({ tiles: { size: [4, 8], renderScale: 2 } }), EFFECT), [])
    refused(validateParityCase(untimed({ tiles: { size: [4, 8], renderscale: 2 } }), EFFECT), /renderscale/,
        'a misspelt renderScale would render at scale 1')
    refused(validateParityCase(untimed({ timeline: [0, 1], control: CONTROL }), EFFECT), /timeline/)
})

test('a texture input uploads after a stated frame of a timed case', () => {
    assert.deepEqual(validateParityCase(timed({}, { textureInputs: [texture({ afterFrame: 2 })] }), EFFECT), [])
    assert.deepEqual(validateParityCase(timed({}, {
        textureInputs: [texture({ afterFrame: 0 }), texture({ afterFrame: 3, data: [9, 9, 9, 255] })],
    }), EFFECT), [], 'a sequence of uploads changes an input over frames')
    refused(validateParityCase(timed({}, { textureInputs: [texture({ afterFrame: 5 })] }), EFFECT), /afterFrame/)
    refused(validateParityCase(untimed({ textureInputs: [texture({ afterFrame: 0 })] }), EFFECT), /afterFrame/,
        'an untimed case uploads after its only frame')
})

test('MIDI messages feed note activity after stated frames of a timed case', () => {
    const note = (afterFrame, data) => ({ afterFrame, data })
    assert.deepEqual(validateParityCase(timed({}, {
        midiMessages: [note(0, [0x90, 60, 100]), note(2, [0x91, 64, 127]), note(3, [0x80, 60, 0])],
    }), EFFECT), [])
    assert.deepEqual(validateParityCase(timed({}, {
        midiMessages: [note(0, [0xb0, 1, 64]), note(1, [0xd0, 90]), note(1, [0xe0, 0, 64]), note(2, [0xa1, 60, 50]), note(3, [0xf8])],
    }), EFFECT), [], 'control change, pressure, pitch bend, polyphonic pressure and clock')
    for (const message of [note(5, [0x90, 60, 100]), note(0, []), note(0, [0x90, 60, 128]), note(0, [0x90, 60, 100, 1]),
        note(0, ['x']), { data: [0x90, 60, 100] }, null,
        note(0, [0x90]), note(0, [0x90, 60]), note(0, [60, 60, 100]), note(0, [0xc0, 5]), note(0, [0xd0, 90, 1]),
        note(0, [0xf8, 1]), note(0, [0xfa])]) {
        refused(validateParityCase(timed({}, { midiMessages: [message] }), EFFECT), /MIDI/, JSON.stringify(message))
    }
    refused(validateParityCase(timed({}, { midiMessages: [{ ...note(0, [0x90, 60, 100]), port: 'a' }] }), EFFECT), /port/)
    refused(validateParityCase(untimed({ midiMessages: [note(0, [0x90, 60, 100])] }), EFFECT), /MIDI/,
        'note activity needs a timeline')
})

test('the frames map to the clock\'s normalized times', () => {
    assert.deepEqual(timelineTimes(timed().timeline), [0, 1 / 600, 2 / 600, 3 / 600])
    assert.deepEqual(timelineTimes(timed({ loopSeconds: 2, frames: [0, 60, 119] }).timeline), [0, 60 / 120, 119 / 120])
})

test('a timed attestation records its frames, and a control must differ on both backends', () => {
    const parityCase = timed()
    const good = { timeline: timelineEvidence(parityCase), control: controlEvidence() }
    assert.deepEqual(validateParityAttestation(attestation(good), expected(parityCase)), [])
    refused(validateParityAttestation(attestation({ control: good.control }), expected(parityCase)), /timeline/,
        'a timed case without timeline evidence is refused')
    refused(validateParityAttestation(attestation({ timeline: good.timeline }), expected(parityCase)), /control/,
        'a case with a control needs control evidence')
    for (const differs of [{ webgl2: false, webgpu: true }, { webgl2: true, webgpu: false }, {}]) {
        refused(validateParityAttestation(attestation({ ...good, control: controlEvidence(differs) }), expected(parityCase)),
            /control/, JSON.stringify(differs))
    }
    refused(validateParityAttestation(attestation({ ...good, timeline: { ...good.timeline, frames: [0, 1] } }), expected(parityCase)),
        /frames/)
    refused(validateParityAttestation(attestation({ ...good, timeline: { ...good.timeline, loopSeconds: 2 } }), expected(parityCase)),
        /loopSeconds/)
    refused(validateParityAttestation(attestation(good), expected(untimed())), /timeline/,
        'an untimed case carries no timeline evidence')
    refused(validateParityAttestation(attestation({ control: good.control }), expected(untimed())), /control/,
        'a case without a control carries no control evidence')
    for (const targetPasses of [{ webgl2: 0, webgpu: 1 }, { webgl2: 1, webgpu: 0 }, {}]) {
        refused(validateParityAttestation(attestation({ ...good, control: controlEvidence(undefined, targetPasses) }), expected(parityCase)),
            /control/, `a timed control must execute the target: ${JSON.stringify(targetPasses)}`)
    }
    const producer = untimed({ control: CONTROL })
    assert.deepEqual(validateParityAttestation(attestation({ control: controlEvidence() }), expected(producer)), [])
    assert.deepEqual(validateParityAttestation(attestation({ control: controlEvidence(undefined, { webgl2: 0, webgpu: 0 }) }),
        expected(producer)), [], 'a producer control may replace the target')
})

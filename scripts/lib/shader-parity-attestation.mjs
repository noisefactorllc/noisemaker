import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { jumpLimit, stepsPerLoop } from '../../shaders/src/runtime/simulation-clock.js'

export const PARITY_ATTESTATION_SCHEMA_VERSION = 1

export function isReadbackPerformanceWarning(type, message) {
    // Pixel certification deliberately performs synchronous GPU readback.
    // Chrome's driver reports that synchronization as a performance warning.
    return type === 'warning' && /^\[\.WebGL-[^\]]+\]GL Driver Message \(OpenGL, Performance, [^)]+\): GPU stall due to ReadPixels(?: \(this message will no longer repeat\))?$/.test(message)
}

function assertEffectId(effectId) {
    if (!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(effectId)) {
        throw new Error(`Invalid effect ID: ${effectId}`)
    }
}

function filesRecursively(dir) {
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(dir, entry.name)
        return entry.isDirectory() ? filesRecursively(entryPath) : [entryPath]
    })
}

export function effectDirectory(repoRoot, effectId) {
    assertEffectId(effectId)
    return path.join(repoRoot, 'shaders/effects', ...effectId.split('/'))
}

export function effectSourceFiles(repoRoot, effectId) {
    const dir = effectDirectory(repoRoot, effectId)
    const files = [
        path.join(dir, 'definition.js'),
        ...filesRecursively(path.join(dir, 'glsl')),
        ...filesRecursively(path.join(dir, 'wgsl')),
    ].filter((file) => fs.existsSync(file))

    if (!fs.existsSync(path.join(dir, 'definition.js')) ||
        !fs.existsSync(path.join(dir, 'glsl')) ||
        !fs.existsSync(path.join(dir, 'wgsl'))) {
        throw new Error(`${effectId} is not a dual-language shader effect`)
    }
    return files.sort()
}

export function computeEffectSourceHash(repoRoot, effectId) {
    const hash = crypto.createHash('sha256')
    for (const file of effectSourceFiles(repoRoot, effectId)) {
        const relative = path.relative(repoRoot, file).split(path.sep).join('/')
        const content = fs.readFileSync(file)
        hash.update(relative)
        hash.update('\0')
        hash.update(String(content.length))
        hash.update('\0')
        hash.update(content)
        hash.update('\0')
    }
    return hash.digest('hex')
}

export function computeParitySourceHash(repoRoot, parityCase) {
    if (!Array.isArray(parityCase?.effects) || parityCase.effects.length === 0) {
        throw new Error('parity case must list at least one effect')
    }
    const effectIds = [...new Set(parityCase.effects)].sort()
    const hash = crypto.createHash('sha256')
    for (const effectId of effectIds) {
        assertEffectId(effectId)
        hash.update(effectId)
        hash.update('\0')
        hash.update(computeEffectSourceHash(repoRoot, effectId))
        hash.update('\0')
    }
    // A mesh fixture is rendered input like the effect sources: editing the
    // OBJ must make the evidence stale. Cases without meshes hash as before.
    for (const mesh of parityCase.meshInputs || []) {
        hash.update(`mesh:${mesh.path}`)
        hash.update('\0')
        hash.update(computeFileHash(path.join(repoRoot, mesh.path)))
        hash.update('\0')
    }
    return hash.digest('hex')
}

export function computeFileHash(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

export function comparePixelFrames(webgl, webgpu) {
    if (webgl.width !== webgpu.width || webgl.height !== webgpu.height) {
        throw new Error('backend frame dimensions differ')
    }
    if (webgl.data.length !== webgpu.data.length) {
        throw new Error('backend frame byte lengths differ')
    }

    const rowBytes = webgl.width * 4
    let maxDiff = 0
    let mismatchCount = 0
    let totalDiff = 0
    for (let y = 0; y < webgl.height; y++) {
        const webglOffset = y * rowBytes
        const webgpuOffset = (webgpu.height - 1 - y) * rowBytes
        for (let channel = 0; channel < rowBytes; channel++) {
            const diff = Math.abs(webgl.data[webglOffset + channel] - webgpu.data[webgpuOffset + channel])
            maxDiff = Math.max(maxDiff, diff)
            totalDiff += diff
            if (diff !== 0) mismatchCount++
        }
    }
    return {
        epsilon: 0,
        maxDiff,
        meanDiff: totalDiff / webgl.data.length,
        mismatchCount,
        mismatchPercent: mismatchCount / webgl.data.length * 100,
    }
}

export function matchesTargetEffectPass(pass, effectId) {
    const separator = effectId.indexOf('/')
    const namespace = effectId.slice(0, separator)
    const func = effectId.slice(separator + 1)
    const identityMatches = pass.effectFunc === func ||
        pass.effectKey === func || pass.effectKey === effectId
    return identityMatches &&
        (pass.effectNamespace == null || pass.effectNamespace === namespace)
}

export function changedEffectIds(files) {
    const ids = new Set()
    for (const file of files) {
        const normalized = file.split(path.sep).join('/')
        const match = normalized.match(/^shaders\/effects\/([^/]+)\/([^/]+)\/(definition\.js|glsl\/|wgsl\/|parity-(?:case|attestation)\.json)/)
        if (match) ids.add(`${match[1]}/${match[2]}`)
    }
    return [...ids].sort()
}

export function affectedParityEffectIds(repoRoot, files) {
    const changed = changedEffectIds(files)
    const affected = new Set(changed)
    const changedMeshes = new Set(files.map((file) => file.split(path.sep).join('/'))
        .filter((file) => /^share\/meshes\/[^/]+\.obj$/.test(file)))
    if (changed.length === 0 && changedMeshes.size === 0) return []

    const effectsRoot = path.join(repoRoot, 'shaders/effects')
    for (const casePath of filesRecursively(effectsRoot).filter((file) => path.basename(file) === 'parity-case.json')) {
        const parityCase = JSON.parse(fs.readFileSync(casePath, 'utf8'))
        const usesChangedMesh = (parityCase.meshInputs || []).some((mesh) => changedMeshes.has(mesh.path))
        if (!usesChangedMesh && (!Array.isArray(parityCase.effects) ||
            !parityCase.effects.some((effectId) => affected.has(effectId)))) continue

        const relative = path.relative(effectsRoot, casePath).split(path.sep)
        if (relative.length === 3) affected.add(`${relative[0]}/${relative[1]}`)
    }
    return [...affected].sort()
}

export function registeredParityEffectIds(repoRoot) {
    const effectsRoot = path.join(repoRoot, 'shaders/effects')
    const effectIds = []
    for (const casePath of filesRecursively(effectsRoot).filter((file) => path.basename(file) === 'parity-case.json')) {
        const relative = path.relative(effectsRoot, casePath).split(path.sep)
        if (relative.length === 3) effectIds.push(`${relative[0]}/${relative[1]}`)
    }
    return [...new Set(effectIds)].sort()
}

const CASE_KEYS = new Set(['schemaVersion', 'effects', 'dsl', 'surface', 'resolution', 'epsilon',
    'requireColorVariation', 'settleMs', 'tiles', 'textureInputs', 'meshInputs', 'timeline', 'control', 'midiMessages', 'midiInputs'])
const TEXTURE_INPUT_KEYS = new Set(['effect', 'uniform', 'width', 'height', 'data', 'afterFrame'])
const MESH_INPUT_KEYS = new Set(['mesh', 'path'])
const TILES_KEYS = new Set(['size', 'renderScale'])
const MIDI_MESSAGE_KEYS = new Set(['afterFrame', 'data'])
const MIDI_INPUT_KEYS = new Set(['effect', 'notes'])
const MIDI_NOTE_KEYS = new Set(['channel', 'key', 'velocity'])

// A misspelt field must not silently change what a case records: a misspelt
// timeline would record an untimed case, and a misspelt afterFrame would
// upload after the first frame.
function unknownKeys(value, known, where) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    return Object.keys(value).filter((key) => !known.has(key)).map((key) => `${where} has an unknown field ${key}`)
}

export function validateParityCase(parityCase, effectId) {
    const errors = [...unknownKeys(parityCase, CASE_KEYS, 'parity case')]
    for (const texture of Array.isArray(parityCase?.textureInputs) ? parityCase.textureInputs : []) {
        errors.push(...unknownKeys(texture, TEXTURE_INPUT_KEYS, 'parity case texture input'))
    }
    for (const mesh of Array.isArray(parityCase?.meshInputs) ? parityCase.meshInputs : []) {
        errors.push(...unknownKeys(mesh, MESH_INPUT_KEYS, 'parity case mesh input'))
    }
    errors.push(...unknownKeys(parityCase?.tiles, TILES_KEYS, 'parity case tiles'))
    for (const message of Array.isArray(parityCase?.midiMessages) ? parityCase.midiMessages : []) {
        errors.push(...unknownKeys(message, MIDI_MESSAGE_KEYS, 'parity case MIDI message'))
    }
    for (const midiInput of Array.isArray(parityCase?.midiInputs) ? parityCase.midiInputs : []) {
        errors.push(...unknownKeys(midiInput, MIDI_INPUT_KEYS, 'parity case midi input'))
        for (const note of Array.isArray(midiInput?.notes) ? midiInput.notes : []) {
            errors.push(...unknownKeys(note, MIDI_NOTE_KEYS, 'parity case midi note'))
        }
    }
    if (parityCase?.schemaVersion !== 1) errors.push('parity case schemaVersion must equal 1')
    if (!Array.isArray(parityCase?.effects) || parityCase.effects.length === 0) {
        errors.push('parity case effects must be a non-empty array')
    } else {
        if (!parityCase.effects.includes(effectId)) {
            errors.push(`parity case effects must include ${effectId}`)
        }
        if (parityCase.effects.some((id) => typeof id !== 'string' ||
            !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(id))) {
            errors.push('parity case effects contain an invalid effect ID')
        }
    }
    if (typeof parityCase?.dsl !== 'string' || parityCase.dsl.trim().length === 0) {
        errors.push('parity case DSL must be non-empty')
    }
    if (typeof parityCase?.surface !== 'string' || parityCase.surface.trim().length === 0) {
        errors.push('parity case surface must be non-empty')
    }
    if (!Array.isArray(parityCase?.resolution) || parityCase.resolution.length !== 2 ||
        !parityCase.resolution.every((value) => integerInRange(value, 1, Number.MAX_SAFE_INTEGER))) {
        errors.push('parity case resolution must contain two positive integers')
    }
    if (parityCase?.epsilon !== 0) errors.push('parity case epsilon must be zero')
    if (parityCase?.requireColorVariation !== true) {
        errors.push('parity case must require color variation')
    }
    if (parityCase?.settleMs !== undefined &&
        (!Number.isInteger(parityCase.settleMs) || !integerInRange(parityCase.settleMs, 0, 60000))) {
        errors.push('parity case settleMs must be an integer between 0 and 60000')
    }
    if (parityCase?.textureInputs !== undefined) {
        if (!Array.isArray(parityCase.textureInputs)) {
            errors.push('parity case texture inputs must be an array')
        } else {
            for (const texture of parityCase.textureInputs) {
                if (!texture || !parityCase.effects?.includes(texture.effect) ||
                    typeof texture.uniform !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(texture.uniform) ||
                    !integerInRange(texture.width, 1, 64) || !integerInRange(texture.height, 1, 64) ||
                    !Array.isArray(texture.data) || texture.data.length !== texture.width * texture.height * 4 ||
                    !texture.data.every((value) => integerInRange(value, 0, 255))) {
                    errors.push('parity case texture input must name a loaded effect and uniform, with valid dimensions and RGBA bytes')
                }
            }
        }
    }
    if (parityCase?.meshInputs !== undefined) {
        if (!Array.isArray(parityCase.meshInputs)) {
            errors.push('parity case mesh inputs must be an array')
        } else {
            for (const mesh of parityCase.meshInputs) {
                if (!mesh || typeof mesh.mesh !== 'string' || !/^mesh[0-7]$/.test(mesh.mesh) ||
                    typeof mesh.path !== 'string' || !/^share\/meshes\/[A-Za-z0-9_-]+\.obj$/.test(mesh.path)) {
                    errors.push('parity case mesh input must name mesh0-mesh7 and a share/meshes OBJ file')
                }
            }
        }
    }
    if (parityCase?.midiInputs !== undefined) {
        if (!Array.isArray(parityCase.midiInputs)) {
            errors.push('parity case midi inputs must be an array')
        } else {
            for (const midiInput of parityCase.midiInputs) {
                if (!midiInput || !parityCase.effects?.includes(midiInput.effect) ||
                    !Array.isArray(midiInput.notes) || midiInput.notes.length === 0) {
                    errors.push('parity case midi input must name a loaded effect and at least one note')
                    continue
                }
                for (const note of midiInput.notes) {
                    // MidiState keys its channels 1 to 16, as MIDI names them.
                    if (!note || !integerInRange(note.channel, 1, 16) || !integerInRange(note.key, 0, 127) ||
                        !integerInRange(note.velocity, 1, 127)) {
                        errors.push('parity case midi note must give channel 1-16, key 0-127 and velocity 1-127')
                    }
                }
            }
        }
    }
    if (parityCase?.tiles !== undefined) {
        const tiles = parityCase.tiles
        const size = tiles?.size
        const resolution = parityCase?.resolution
        if (!tiles || typeof tiles !== 'object' || !Array.isArray(size) || size.length !== 2 ||
            !size.every((value) => integerInRange(value, 1, Number.MAX_SAFE_INTEGER)) ||
            !Array.isArray(resolution) || resolution.length !== 2 ||
            resolution[0] % size[0] !== 0 || resolution[1] % size[1] !== 0 ||
            (resolution[0] / size[0]) * (resolution[1] / size[1]) < 2) {
            errors.push('parity case tiles must give a tile size that divides the resolution into at least two tiles')
        }
        if (tiles?.renderScale !== undefined &&
            (typeof tiles.renderScale !== 'number' || !Number.isFinite(tiles.renderScale) || tiles.renderScale <= 0)) {
            errors.push('parity case tiles renderScale must be a positive number')
        }
    }
    if (parityCase?.timeline !== undefined) errors.push(...validateTimeline(parityCase.timeline))
    errors.push(...validateScheduledInputs(parityCase))
    if (parityCase?.control !== undefined || parityCase?.timeline !== undefined) {
        errors.push(...validateControl(parityCase))
    }
    return errors
}

export const TIMELINE_DEFAULT_LOOP_SECONDS = 10
const TIMELINE_KEYS = new Set(['frames', 'loopSeconds'])

function timelineLoopSeconds(timeline) {
    return timeline.loopSeconds ?? TIMELINE_DEFAULT_LOOP_SECONDS
}

// A timed case renders its frames in order on the fixed-step clock: frame k of a
// loop of N steps renders at the normalized time k / N, and runs every grid step
// after the previous frame, so the frames need not be consecutive.
export function timelineTimes(timeline) {
    const steps = stepsPerLoop(timelineLoopSeconds(timeline))
    return timeline.frames.map((frame) => frame / steps)
}

function validateTimeline(timeline) {
    const errors = []
    if (!timeline || typeof timeline !== 'object' || Array.isArray(timeline)) {
        return ['parity case timeline must be an object']
    }
    for (const key of Object.keys(timeline)) {
        if (!TIMELINE_KEYS.has(key)) errors.push(`parity case timeline has an unknown field ${key}`)
    }
    const loopSeconds = timeline.loopSeconds
    if (loopSeconds !== undefined && (typeof loopSeconds !== 'number' || !Number.isFinite(loopSeconds) ||
        loopSeconds <= 0 || loopSeconds > 600)) {
        errors.push('parity case timeline loopSeconds must be a number above 0 and at most 600')
        return errors
    }
    const frames = timeline.frames
    const steps = stepsPerLoop(timelineLoopSeconds(timeline))
    // A render due more steps than the clock's jump limit re-anchors the clock
    // instead of stepping it, so no gap between frames may exceed the limit.
    const limit = jumpLimit(steps)
    if (!Array.isArray(frames) || frames.length < 2 || frames[0] !== 0 ||
        !frames.every((frame, index) => integerInRange(frame, 0, steps - 1) &&
            (index === 0 || (frame > frames[index - 1] && frame - frames[index - 1] <= limit)))) {
        errors.push(`parity case timeline frames must start at 0 and step strictly upward on the grid of ${steps} steps, at most ${limit} steps apart`)
    }
    return errors
}

// A timed case schedules each texture upload and MIDI message after one of its
// frames. An untimed case uploads after its only render, as before.
function validateScheduledInputs(parityCase) {
    const errors = []
    const frames = Array.isArray(parityCase?.timeline?.frames) ? parityCase.timeline.frames : null
    for (const texture of Array.isArray(parityCase?.textureInputs) ? parityCase.textureInputs : []) {
        if (texture?.afterFrame === undefined) continue
        if (!frames || !frames.includes(texture.afterFrame)) {
            errors.push('parity case texture input afterFrame must be one of the timeline frames')
        }
    }
    // A timed case gives its notes as midiMessages, at the frames they reach.
    if (parityCase?.midiInputs !== undefined && parityCase?.timeline !== undefined) {
        errors.push('parity case midi inputs are the untimed form; a timed case gives its notes as midiMessages')
    }
    if (parityCase?.midiMessages === undefined) return errors
    if (!frames) return [...errors, 'parity case MIDI messages need a timeline']
    if (!Array.isArray(parityCase.midiMessages) || parityCase.midiMessages.length === 0) {
        return [...errors, 'parity case MIDI messages must be a non-empty array']
    }
    for (const message of parityCase.midiMessages) {
        if (!message || !frames.includes(message.afterFrame) || !isHandledMidiMessage(message.data)) {
            errors.push('parity case MIDI message must give afterFrame, one of the timeline frames, and a message the engine handles: ' +
                'a note off, note on, polyphonic pressure, control change or pitch bend of three bytes, a channel pressure of two, or a clock of one')
        }
    }
    return errors
}

// The messages MidiState.handleMessage acts on (shaders/src/runtime/external-input.js).
// It ignores others, so a case that states them would claim activity that never
// reaches the note grid.
const MIDI_THREE_BYTE_TYPES = new Set([0x80, 0x90, 0xa0, 0xb0, 0xe0])
function isHandledMidiMessage(data) {
    if (!Array.isArray(data) || data.length === 0 || !data.every((value) => integerInRange(value, 0, 255))) return false
    const [status, ...rest] = data
    if (!rest.every((value) => value <= 127)) return false
    if (status === 0xf8) return data.length === 1
    const type = status & 0xf0
    if (MIDI_THREE_BYTE_TYPES.has(type)) return data.length === 3
    if (type === 0xd0) return data.length === 2
    return false
}

// A control is the case with its target's contribution disabled: its time-
// dependence for a timed case, or its output for a producer observed through a
// consumer. The recorder fails unless the control renders a different frame.
function validateControl(parityCase) {
    const control = parityCase.control
    if (typeof control !== 'string' || control.trim().length === 0 ||
        control.trim() === String(parityCase.dsl ?? '').trim()) {
        return ['parity case control must be a DSL that differs from the case: the case with its target\'s contribution disabled (a timed case needs one)']
    }
    return []
}

function stripWgslComments(source) {
    let stripped = ''
    let blockDepth = 0
    for (let index = 0; index < source.length;) {
        const char = source[index]
        const next = source[index + 1]
        if (blockDepth > 0) {
            if (char === '/' && next === '*') {
                stripped += '  '
                blockDepth++
                index += 2
            } else if (char === '*' && next === '/') {
                stripped += '  '
                blockDepth--
                index += 2
            } else {
                stripped += char === '\n' ? '\n' : ' '
                index++
            }
        } else if (char === '/' && next === '/') {
            stripped += '  '
            index += 2
            while (index < source.length && source[index] !== '\n') {
                stripped += ' '
                index++
            }
        } else if (char === '/' && next === '*') {
            stripped += '  '
            blockDepth = 1
            index += 2
        } else {
            stripped += char
            index++
        }
    }
    return stripped
}

function sampledTextureBindings(source) {
    const bindings = []
    const bindingRegex = /@group\s*\(\s*(\d+)\s*\)\s*@binding\s*\(\s*(\d+)\s*\)\s*var(?:<([^>]+)>)?\s+(\w+)\s*:\s*([^;]+)/g
    let match
    while ((match = bindingRegex.exec(stripWgslComments(source))) !== null) {
        const type = match[5].trim()
        if (Number(match[1]) === 0 && type.startsWith('texture_') &&
            !type.startsWith('texture_storage_')) {
            bindings.push(match[4])
        }
    }
    return bindings
}

export function validateWgslTextureBindings(repoRoot, effectId, effect) {
    const dir = effectDirectory(repoRoot, effectId)
    const errors = []

    for (const pass of effect?.passes || []) {
        if (typeof pass.program !== 'string') continue
        const file = path.join(dir, 'wgsl', `${pass.program}.wgsl`)
        if (!fs.existsSync(file)) {
            errors.push(`${pass.program}.wgsl is missing for pass ${pass.name || pass.program}`)
            continue
        }

        const inputNames = Object.keys(pass.inputs || {})
        for (const bindingName of sampledTextureBindings(fs.readFileSync(file, 'utf8'))) {
            let inputName = inputNames.includes(bindingName) ? bindingName : null
            if (!inputName && bindingName === 'inputColor' && inputNames.includes('inputTex')) {
                inputName = 'inputTex'
            }
            const positional = /^tex(\d+)$/.exec(bindingName)
            if (!inputName && positional && Number(positional[1]) < inputNames.length) {
                inputName = inputNames[Number(positional[1])]
            }

            if (!inputName) {
                const expected = inputNames.length > 0 ? inputNames.join(', ') : '(none)'
                errors.push(`${path.basename(file)} declares texture ${bindingName}, but pass ${pass.name || pass.program} inputs are ${expected}`)
            }
        }
    }

    return errors
}

export function validateFrameEvidence(frames, requireColorVariation = false) {
    const errors = []
    for (const [backend, label] of [['webgl2', 'WebGL2'], ['webgpu', 'WebGPU']]) {
        const frame = frames?.[backend]
        if (!frame) {
            errors.push(`${label} frame evidence is missing`)
        } else if (!(frame.nonzeroRgbPixels > 0)) {
            errors.push(`${label} frame is empty (zero non-black RGB pixels)`)
        } else if (!(frame.nonzeroAlphaPixels > 0)) {
            errors.push(`${label} frame is fully transparent`)
        } else if (requireColorVariation && !(frame.uniqueColors > 1)) {
            errors.push(`${label} frame is flat (fewer than two RGB colors)`)
        }
    }
    return errors
}

function integerInRange(value, minimum, maximum) {
    return Number.isInteger(value) && value >= minimum && value <= maximum
}

function validateFrameSchema(frame, label, width, height) {
    if (!frame) return [`${label} frame evidence is missing`]
    const errors = []
    const pixelCount = width * height
    if (frame.width !== width) errors.push(`${label} frame width must equal ${width}`)
    if (frame.height !== height) errors.push(`${label} frame height must equal ${height}`)
    if (!integerInRange(frame.nonzeroRgbPixels, 0, pixelCount)) {
        errors.push(`${label} nonzeroRgbPixels must be an integer from 0 to ${pixelCount}`)
    }
    if (!integerInRange(frame.nonzeroAlphaPixels, 0, pixelCount)) {
        errors.push(`${label} nonzeroAlphaPixels must be an integer from 0 to ${pixelCount}`)
    }
    if (!integerInRange(frame.uniqueColors, 0, pixelCount)) {
        errors.push(`${label} uniqueColors must be an integer from 0 to ${pixelCount}`)
    }
    return errors
}

export function validateParityAttestation(attestation, expected) {
    const errors = []
    if (attestation?.schemaVersion !== PARITY_ATTESTATION_SCHEMA_VERSION) {
        errors.push(`unsupported schema version ${attestation?.schemaVersion ?? 'missing'}`)
    }
    if (attestation?.effect !== expected.effectId) {
        errors.push(`effect is ${attestation?.effect ?? 'missing'}, expected ${expected.effectId}`)
    }
    if (attestation?.sourceHash !== expected.sourceHash) {
        errors.push('source hash is stale')
    }
    if (attestation?.caseHash !== expected.caseHash) {
        errors.push('parity case hash is stale')
    }
    if (errors.length > 0) return errors

    const [width, height] = expected.resolution || []
    if (!integerInRange(width, 1, Number.MAX_SAFE_INTEGER) ||
        !integerInRange(height, 1, Number.MAX_SAFE_INTEGER)) {
        return ['expected parity resolution is invalid']
    }
    if (expected.epsilon !== 0) {
        errors.push('parity case epsilon must be zero')
    }
    if (!Array.isArray(attestation.resolution) || attestation.resolution.length !== 2 ||
        attestation.resolution[0] !== width || attestation.resolution[1] !== height) {
        errors.push(`attestation resolution must equal ${width}x${height}`)
    }

    errors.push(...validateFrameSchema(attestation.frames?.webgl2, 'WebGL2', width, height))
    errors.push(...validateFrameSchema(attestation.frames?.webgpu, 'WebGPU', width, height))
    if (!integerInRange(attestation.execution?.webgl2TargetPasses, 1, Number.MAX_SAFE_INTEGER) ||
        !integerInRange(attestation.execution?.webgpuTargetPasses, 1, Number.MAX_SAFE_INTEGER)) {
        errors.push(`attestation must show ${expected.effectId} executed on WebGL2 and WebGPU`)
    }
    if (errors.length > 0) return errors

    errors.push(...validateFrameEvidence(attestation.frames, expected.requireColorVariation))
    if (errors.length > 0) return errors

    const parity = attestation.parity
    if (!parity) return ['pixel parity evidence is missing']
    if (parity.epsilon !== 0) errors.push('attestation parity epsilon must be zero')
    if (parity.maxDiff !== 0) errors.push('attestation maximum channel difference must be zero')
    if (parity.meanDiff !== 0) errors.push('attestation mean channel difference must be zero')
    if (parity.mismatchCount !== 0) errors.push('attestation mismatch count must be zero')
    if (parity.mismatchPercent !== 0) errors.push('attestation mismatch percent must be zero')
    errors.push(...validateTimelineEvidence(attestation.timeline, expected.timeline))
    errors.push(...validateControlEvidence(attestation.control, expected.control, expected.timeline))
    return errors
}

// A timed case's attestation records the frames it rendered. A case without a
// timeline carries no such block, so its attestation keeps its earlier form.
function validateTimelineEvidence(evidence, timeline) {
    if (timeline === undefined) {
        return evidence === undefined ? [] : ['an untimed parity case carries no timeline evidence']
    }
    if (!evidence || typeof evidence !== 'object') return ['a timed parity case needs timeline evidence']
    const errors = []
    if (!Array.isArray(evidence.frames) || evidence.frames.length !== timeline.frames.length ||
        evidence.frames.some((frame, index) => frame !== timeline.frames[index])) {
        errors.push('timeline evidence frames must equal the case timeline frames')
    }
    if (evidence.loopSeconds !== timelineLoopSeconds(timeline)) {
        errors.push('timeline evidence loopSeconds must equal the case timeline')
    }
    return errors
}

// A case with a control records that the control rendered a different frame on
// each backend, and how many target passes the control ran. A timed case's
// control disables the target's time-dependence, so it must still run the
// target: another program that merely renders a different frame proves nothing.
// A producer's control may replace the target.
function validateControlEvidence(evidence, control, timeline) {
    if (control === undefined) {
        return evidence === undefined ? [] : ['a parity case without a control carries no control evidence']
    }
    const errors = []
    if (evidence?.differs?.webgl2 !== true || evidence?.differs?.webgpu !== true) {
        errors.push('control evidence must show the control renders a different frame from the case on WebGL2 and WebGPU')
    }
    const passes = evidence?.targetPasses
    if (!integerInRange(passes?.webgl2, 0, Number.MAX_SAFE_INTEGER) || !integerInRange(passes?.webgpu, 0, Number.MAX_SAFE_INTEGER)) {
        errors.push('control evidence must record the target passes the control ran on WebGL2 and WebGPU')
    } else if (timeline !== undefined && (passes.webgl2 < 1 || passes.webgpu < 1)) {
        errors.push('a timed case control must run the target on WebGL2 and WebGPU, with its time-dependence disabled')
    }
    return errors
}

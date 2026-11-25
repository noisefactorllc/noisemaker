/**
 * Pipeline Executor
 * Orchestrates frame execution using a compiled graph and backend.
 */

import { WebGL2Backend } from './backends/webgl2.js'
import { WebGPUBackend } from './backends/webgpu.js'
import { expandPalette } from './palette-expansion.js'
import { getEffect } from './registry.js'
import { ELEMENT_IDENTITY } from './expander.js'
import { Effect } from './effect.js'
import { CUBE_FACE_BASES } from '../renderer/cubeCamera.js'
import { CanvasSink, SinkManager } from './sink.js'
import { preflightEffect, mrtFormatBytes } from './preflight.js'
import { DiagnosticCollector } from './backends/diagnostics.js'
import { SRGB, configureWebGL2Canvas, configureWebGPUCanvas } from './color-output.js'
import { SimulationClock } from './simulation-clock.js'
import { SCENE_COLOR_TEXTURE } from '../rendering/scene-compiler.js'

// A uniform scoped to one element by its `_id:` (expander elementStateKey()).
const ELEMENT_SCOPED = new RegExp(`_id_${ELEMENT_IDENTITY}@[^@]+$`)
// An element's state key, with its identity and op captured.
const ELEMENT_KEY = new RegExp(`^id_(${ELEMENT_IDENTITY})@(.+)$`)
// A particle texture scoped to an emitter by its node or its `_id:`.
const SCOPED_PARTICLE_TEXTURE = new RegExp(`^(xyz|vel|rgba|points_trail)_(node_\\d+|id_${ELEMENT_IDENTITY}@[^@]+)$`)

/**
 * Oscillator evaluation functions.
 * Each returns a value between 0 and 1 based on the time phase.
 *
 * Oscillator types:
 * 0: sine    - 0 → 1 → 0 (smooth)
 * 1: tri     - 0 → 1 → 0 (linear)
 * 2: saw     - 0 → 1
 * 3: sawInv  - 1 → 0
 * 4: square  - 0 or 1
 * 5: noise   - periodic 2D noise
 * 6: noise2d - two-stage periodic noise
 */
const TAU = Math.PI * 2

function oscSine(t) {
    // Smooth continuous sine: 0->1->0 over t=0..1, no discontinuity at wrap
    return (1.0 - Math.cos(t * TAU)) * 0.5
}

function oscTri(t) {
    // Triangle wave: 0->1->0 over t=0..1
    const tf = t - Math.floor(t)
    return 1.0 - Math.abs(tf * 2.0 - 1.0)
}

function oscSaw(t) {
    // Sawtooth: 0->1 over t=0..1
    return t - Math.floor(t)
}

function oscSawInv(t) {
    // Inverted sawtooth: 1->0 over t=0..1
    return 1.0 - (t - Math.floor(t))
}

function oscSquare(t) {
    // Square wave: 0 or 1
    return (t - Math.floor(t)) >= 0.5 ? 1.0 : 0.0
}

// Lifecycle-hook detection: an effect carries a real hook when the
// config constructor stored a config callback or a subclass (or a plain
// registered object) defines a function for it. The base-class no-ops and
// missing keys must never count — plain-object definitions registered via
// registerEffect() may omit hooks entirely.
function hasLifecycleHook(effectDef, hook) {
    if (!effectDef) return false
    const configKey = '_config' + hook.charAt(0).toUpperCase() + hook.slice(1)
    if (typeof effectDef[configKey] === 'function') return true
    return typeof effectDef[hook] === 'function' && effectDef[hook] !== Effect.prototype[hook]
}

// Simple hash for noise
function hash21(px, py, s) {
    let x = (px * 234.34 + s) % 1
    let y = (py * 435.345 + s) % 1
    if (x < 0) x += 1
    if (y < 0) y += 1
    const p = x + y + (x + y) * 34.23
    return (x * y * p) % 1
}

// Value noise 2D
function noise2D(px, py, s) {
    const ix = Math.floor(px)
    const iy = Math.floor(py)
    let fx = px - ix
    let fy = py - iy
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)

    const a = hash21(ix, iy, s)
    const b = hash21(ix + 1, iy, s)
    const c = hash21(ix, iy + 1, s)
    const d = hash21(ix + 1, iy + 1, s)

    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
}

// Looping noise - samples on a circle for seamless temporal loops
function oscNoise(t, seed) {
    const temporal = t % 1
    const angle = temporal * TAU
    const radius = 2
    const loopX = Math.cos(angle) * radius
    const loopY = Math.sin(angle) * radius
    const n1 = noise2D(loopX + seed, loopY + seed, seed)
    const n2 = noise2D(loopX + seed * 2, loopY + seed * 2, seed)
    return (n1 + n2) / 2
}

// Two-stage periodic noise (noise2d, kind 6) - mirrors the osc2d effect:
//   scaledTime = periodicValue(time, timeNoise) * speed
//   value      = periodicValue(scaledTime, valueNoise)
// `time` is the normalized loop time plus the phase offset; speed is applied
// once, after the first periodic wrap, exactly as in the osc2d shader.
// osc() has no spatial position, so both noise stages are sampled at a fixed
// position derived from the seed (the osc2d shader salts the second stage with
// +12345). periodicValue() has period 1 in time, so whole-number speeds loop
// seamlessly.
function oscNoise2d(time, speed, seed) {
    const periodicValue = (x, v) => (Math.sin((x - v) * TAU) + 1) * 0.5
    const px = (Math.abs(seed % 16) + 0.5) / 16
    const py = (Math.abs(Math.floor(seed / 16) % 16) + 0.5) / 16
    const timeNoise = noise2D(px, py, seed + 12345)
    const valueNoise = noise2D(px, py, seed)
    const scaledTime = periodicValue(time, timeNoise) * speed
    return periodicValue(scaledTime, valueNoise)
}

const AUTOMATION_FIELD_RANGES = {
    unit: { min: 0, max: 1 },
    oscillatorSpeed: { min: -20, max: 20 },
    oscillatorOffset: { min: -1, max: 1 },
    oscillatorSeed: { min: 1, max: 9999 },
    midiSensitivity: { min: 0, max: 10 }
}
const MAX_AUTOMATION_DEPTH = 8

// 16-point Gauss-Legendre nodes and weights on [-1, 1]. Fixed quadrature keeps
// noise and deeply nested rate modulation deterministic and seekable.
const INTEGRATION_NODES = [
    -0.9894009349916499, -0.9445750230732326, -0.8656312023878318, -0.755404408355003,
    -0.6178762444026438, -0.4580167776572274, -0.2816035507792589, -0.0950125098376374,
    0.0950125098376374, 0.2816035507792589, 0.4580167776572274, 0.6178762444026438,
    0.755404408355003, 0.8656312023878318, 0.9445750230732326, 0.9894009349916499
]
const INTEGRATION_WEIGHTS = [
    0.0271524594117541, 0.0622535239386479, 0.0951585116824928, 0.1246289712555339,
    0.1495959888165767, 0.1691565193950025, 0.1826034150449236, 0.1894506104550685,
    0.1894506104550685, 0.1826034150449236, 0.1691565193950025, 0.1495959888165767,
    0.1246289712555339, 0.0951585116824928, 0.0622535239386479, 0.0271524594117541
]
const INTEGRATION_RULES = [
    { nodes: INTEGRATION_NODES, weights: INTEGRATION_WEIGHTS },
    {
        nodes: [
            -0.9602898564975363, -0.7966664774136267, -0.525532409916329,
            -0.1834346424956498, 0.1834346424956498, 0.525532409916329,
            0.7966664774136267, 0.9602898564975363
        ],
        weights: [
            0.1012285362903763, 0.2223810344533745, 0.3137066458778873,
            0.362683783378362, 0.362683783378362, 0.3137066458778873,
            0.2223810344533745, 0.1012285362903763
        ]
    },
    {
        nodes: [-0.8611363115940526, -0.3399810435848563, 0.3399810435848563, 0.8611363115940526],
        weights: [0.3478548451374538, 0.6521451548625461, 0.6521451548625461, 0.3478548451374538]
    },
    {
        nodes: [-0.5773502691896257, 0.5773502691896257],
        weights: [1, 1]
    }
]

function isAutomationValue(value) {
    return value && typeof value === 'object' &&
        (value.type === 'Oscillator' || value.type === 'Midi' || value.type === 'Audio' ||
         value._ast?.type === 'Oscillator' || value._ast?.type === 'Midi' || value._ast?.type === 'Audio')
}

function scaleAutomationValue(value, range) {
    if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return value
    return range.min + value * (range.max - range.min)
}

function resolveAutomationField(value, normalizedTime, range, externalState, depth, stack, fallback, context) {
    if (isAutomationValue(value)) {
        return evaluateAutomation(value, normalizedTime, range, externalState, depth + 1, stack, context)
    }
    return Number.isFinite(value) ? value : fallback
}

function hasDynamicAutomationFields(config) {
    const fields = config.type === 'Midi' || config._ast?.type === 'Midi'
        ? ['min', 'max', 'sensitivity']
        : ['min', 'max']
    return fields.some(field => isAutomationValue(config[field]))
}

function oscPrimitive(type, x) {
    const whole = Math.floor(x)
    const fraction = x - whole
    switch (type) {
        case 0:
            return x * 0.5 - Math.sin(x * TAU) / (2 * TAU)
        case 1: {
            const partial = fraction < 0.5
                ? fraction * fraction
                : 2 * fraction - fraction * fraction - 0.5
            return whole * 0.5 + partial
        }
        case 2:
            return whole * 0.5 + fraction * fraction * 0.5
        case 3:
            return x - (whole * 0.5 + fraction * fraction * 0.5)
        case 4:
            return whole * 0.5 + Math.max(0, fraction - 0.5)
        default:
            return null
    }
}

function canIntegrateOscillatorExactly(config) {
    return config.oscType >= 0 && config.oscType <= 4 &&
        [config.min, config.max, config.speed, config.offset, config.seed].every(Number.isFinite)
}

function integrateSimpleOscillator(config, normalizedTime) {
    const { oscType, min, max, speed, offset } = config
    if (speed === 0) {
        return evaluateOscillator(config, 0, null, 0, new Set()) * normalizedTime
    }
    const start = oscPrimitive(oscType, offset)
    const end = oscPrimitive(oscType, offset + speed * normalizedTime)
    const rawIntegral = (end - start) / speed
    return min * normalizedTime + (max - min) * rawIntegral
}

function integrateAutomation(config, normalizedTime, range, externalState, depth, stack, context) {
    let integral
    if ((config.type === 'Oscillator' || config._ast?.type === 'Oscillator') &&
        canIntegrateOscillatorExactly(config)) {
        integral = integrateSimpleOscillator(config, normalizedTime)
    } else if ((config.type === 'Midi' || config.type === 'Audio' ||
        config._ast?.type === 'Midi' || config._ast?.type === 'Audio') &&
        !hasDynamicAutomationFields(config)) {
        // External inputs expose the current snapshot rather than a history.
        // Treat that snapshot as constant across the requested interval.
        integral = evaluateAutomation(
            config, normalizedTime, null, externalState, depth + 1, stack, context) * normalizedTime
    } else {
        // Decrease the quadrature order as rate modulators nest. This bounds an
        // eight-level graph to thousands, rather than millions, of evaluations
        // while retaining the highest precision at the user-visible output.
        const rule = INTEGRATION_RULES[Math.min(depth, INTEGRATION_RULES.length - 1)]
        const midpoint = normalizedTime * 0.5
        const halfWidth = normalizedTime * 0.5
        let sum = 0
        for (let i = 0; i < rule.nodes.length; i++) {
            const sampleTime = midpoint + halfWidth * rule.nodes[i]
            sum += rule.weights[i] * evaluateAutomation(
                config, sampleTime, null, externalState, depth + 1, stack, context)
        }
        integral = halfWidth * sum
    }

    if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return integral
    return range.min * normalizedTime + integral * (range.max - range.min)
}

function evaluateAutomation(config, normalizedTime, range, externalState, depth = 0, stack = new Set(),
    context = { wallTime: Date.now() }) {
    if (!isAutomationValue(config) || depth > MAX_AUTOMATION_DEPTH || stack.has(config)) {
        return scaleAutomationValue(0, range)
    }

    stack.add(config)
    let value
    try {
        if (config.type === 'Oscillator' || config._ast?.type === 'Oscillator') {
            value = evaluateOscillator(config, normalizedTime, externalState, depth, stack, context)
        } else if (config.type === 'Midi' || config._ast?.type === 'Midi') {
            const midiState = externalState?.midi?.getPortState
                ? externalState.midi.getPortState(config)
                : externalState?.midi
            const min = resolveAutomationField(
                config.min, normalizedTime, AUTOMATION_FIELD_RANGES.unit, externalState, depth, stack, 0, context)
            const max = resolveAutomationField(
                config.max, normalizedTime, AUTOMATION_FIELD_RANGES.unit, externalState, depth, stack, 1, context)
            const sensitivity = resolveAutomationField(
                config.sensitivity, normalizedTime, AUTOMATION_FIELD_RANGES.midiSensitivity,
                externalState, depth, stack, 1, context)
            value = evaluateMidi(config, midiState, context.wallTime, min, max, sensitivity)
        } else if (config._invalid) {
            value = Number.isFinite(config.min) ? config.min : 0
        } else {
            const min = resolveAutomationField(
                config.min, normalizedTime, AUTOMATION_FIELD_RANGES.unit, externalState, depth, stack, 0, context)
            const max = resolveAutomationField(
                config.max, normalizedTime, AUTOMATION_FIELD_RANGES.unit, externalState, depth, stack, 1, context)
            value = evaluateAudio(config, externalState?.audio, min, max)
        }
    } finally {
        stack.delete(config)
    }
    return scaleAutomationValue(value, range)
}

/**
 * Evaluate an oscillator value based on current time and animation duration.
 *
 * @param {object} osc - Oscillator configuration
 * @param {number} osc.oscType - 0:sine, 1:tri, 2:saw, 3:sawInv, 4:square, 5:noise
 * @param {number} osc.min - Minimum output value
 * @param {number} osc.max - Maximum output value
 * @param {number} osc.speed - Speed multiplier (integer, divides evenly into loop)
 * @param {number} osc.offset - Phase offset 0..1
 * @param {number} osc.seed - Noise seed (for noise type only)
 * @param {number} normalizedTime - Time normalized to animation duration (0..1)
 * @returns {number} The evaluated oscillator value
 */
export function evaluateOscillator(osc, normalizedTime, externalState, depth = 0, stack = new Set(), context) {
    const { oscType } = osc
    const min = resolveAutomationField(
        osc.min, normalizedTime, AUTOMATION_FIELD_RANGES.unit, externalState, depth, stack, 0, context)
    const max = resolveAutomationField(
        osc.max, normalizedTime, AUTOMATION_FIELD_RANGES.unit, externalState, depth, stack, 1, context)
    const offset = resolveAutomationField(
        osc.offset, normalizedTime, AUTOMATION_FIELD_RANGES.oscillatorOffset, externalState, depth, stack, 0, context)
    const seed = resolveAutomationField(
        osc.seed, normalizedTime, AUTOMATION_FIELD_RANGES.oscillatorSeed, externalState, depth, stack, 1, context)

    // A modulated rate is frequency modulation, so phase is the integral of
    // rate. Literal rates keep the existing closed form exactly.
    const phase = isAutomationValue(osc.speed)
        ? integrateAutomation(
            osc.speed, normalizedTime, AUTOMATION_FIELD_RANGES.oscillatorSpeed,
            externalState, depth, stack, context)
        : normalizedTime * (Number.isFinite(osc.speed) ? osc.speed : 1)
    const t = phase + offset

    // Get raw oscillator value (0..1)
    let value
    switch (oscType) {
        case 0: value = oscSine(t); break
        case 1: value = oscTri(t); break
        case 2: value = oscSaw(t); break
        case 3: value = oscSawInv(t); break
        case 4: value = oscSquare(t); break
        case 5: value = oscNoise(t, seed); break
        case 6: {
            const speed = resolveAutomationField(
                osc.speed, normalizedTime, AUTOMATION_FIELD_RANGES.oscillatorSpeed,
                externalState, depth, stack, 1, context)
            value = oscNoise2d(normalizedTime + offset, Number.isFinite(speed) ? speed : 1, seed)
            break
        }
        default: value = 0
    }

    // Map to min..max range
    return min + value * (max - min)
}

/**
 * Evaluate a MIDI automation value based on channel state.
 *
 * MIDI Modes:
 * 0: noteChange - value from note number regardless of gate
 * 1: gateNote - value from note only while gate is on
 * 2: gateVelocity - value from velocity only while gate is on
 * 3: triggerNote - note value with time-based falloff from note-on
 * 4: velocity - velocity with time-based falloff (default)
 *
 * @param {object} config - MIDI configuration
 * @param {number} config.channel - MIDI channel (1-16)
 * @param {number} config.mode - MIDI mode (0-4)
 * @param {number} config.min - Minimum output value
 * @param {number} config.max - Maximum output value
 * @param {number} config.sensitivity - Trigger falloff rate (higher = faster decay)
 * @param {import('./external-input.js').MidiState} midiState - Current MIDI state
 * @param {number} currentTime - Current time (Date.now())
 * @returns {number} The evaluated value in min..max range
 */
export function evaluateMidi(config, midiState, currentTime, min = config.min, max = config.max,
    sensitivity = config.sensitivity) {
    if (config._invalid || !midiState) return min

    const { mode } = config
    const hasZone = config.zone !== undefined
    if (hasZone && (config.channel !== undefined || (config.zone !== 0 && config.zone !== 1))) return min
    if (config.members !== undefined && (!hasZone || !Number.isInteger(config.members) ||
        config.members < 1 || config.members > 15)) return min
    if (!hasZone && mode >= 5 &&
        (!Number.isInteger(config.channel) || config.channel < 1 || config.channel > 16)) return min
    const voice = hasZone ? midiState.getZoneVoice?.(config) : null
    if (hasZone && !voice) return min
    const channel = hasZone ? voice.channel : midiState.getChannel(config.channel)
    const note = voice ? { ...voice, gate: 1 } : channel

    let rawValue = 0

    switch (mode) {
        case 0: // noteChange - value from note regardless of gate
            rawValue = note.key
            break

        case 1: // gateNote - value from note only while gate on
            if (note.gate === 1) {
                rawValue = note.key
            }
            break

        case 2: // gateVelocity - value from velocity only while gate on
            if (note.gate === 1) {
                rawValue = note.velocity
            }
            break

        case 3: // triggerNote - note value with falloff
            if (note.gate === 1) {
                rawValue = note.key
                const elapsed = currentTime - note.time
                const decay = Math.min(1, elapsed * sensitivity * 0.001)
                rawValue = rawValue * (1 - decay)
            }
            break

        case 5: // 7-bit control change
        case 6: { // paired 14-bit control change
            const cc = config.cc ?? 1
            if (!Number.isInteger(cc) || cc < 0 || cc > (mode === 6 ? 31 : 127)) return min
            const normalized = mode === 6
                ? (channel.cc14?.[cc] ?? 0) / 16383
                : (channel.cc?.[cc] ?? 0) / 127
            return min + normalized * (max - min)
        }

        case 7:
            if (!Number.isInteger(config.nrpn) || config.nrpn < 0 || config.nrpn > 16382) return min
            return min + (channel.nrpn?.get(config.nrpn) ?? 0) / 16383 * (max - min)
        case 8:
            return min + (channel.pitchBend ?? 8192) / 16383 * (max - min)
        case 9:
            return min + (channel.pressure ?? 0) / 127 * (max - min)
        case 10:
            return min + (channel.polyPressure?.[note.key] ?? 0) / 127 * (max - min)

        case 4: // velocity (default) - velocity with falloff
        default:
            if (note.gate === 1) {
                rawValue = note.velocity
                const elapsed = currentTime - note.time
                const decay = Math.min(1, elapsed * sensitivity * 0.001)
                rawValue = rawValue * (1 - decay)
            }
            break
    }

    // Map 0-127 MIDI range to min-max output range
    const normalized = rawValue / 127
    return min + normalized * (max - min)
}

function hasAudioSelectorIntent(config) {
    const source = config._ast?.type === 'Audio' ? config._ast : config
    return config.name !== undefined || config.id !== undefined ||
        config.channel !== undefined ||
        source.name !== undefined || source.id !== undefined ||
        source.channel !== undefined
}

function isValidAudioSelector(config) {
    const source = config._ast?.type === 'Audio' ? config._ast : config
    if ((source.name !== undefined && config.name === undefined) ||
        (source.id !== undefined && config.id === undefined) ||
        (source.channel !== undefined && config.channel === undefined)) return false
    if (config.name !== undefined && (typeof config.name !== 'string' || !config.name)) return false
    if (config.id !== undefined && (typeof config.id !== 'string' || !config.id || !config.name)) return false
    return Number.isInteger(config.channel) && config.channel >= 1 && config.channel <= 32
}

/**
 * Evaluate an audio automation value based on frequency band.
 *
 * Audio Bands:
 * 0: low - Low frequency band
 * 1: mid - Mid frequency band
 * 2: high - High frequency band
 * 3: vol - Overall volume
 * 4: raw - Bipolar time-domain/DC signal
 *
 * @param {object} config - Audio configuration
 * @param {number} config.band - Audio band or raw signal mode (0-4)
 * @param {number} config.min - Minimum output value
 * @param {number} config.max - Maximum output value
 * @param {import('./external-input.js').AudioState} audioState - Current audio state
 * @returns {number} The evaluated value in min..max range
 */
export function evaluateAudio(config, audioState, min = config.min, max = config.max) {
    if (config._invalid) return min
    if (!audioState) return min

    const { band } = config
    const hasSelector = hasAudioSelectorIntent(config)
    if (hasSelector && !isValidAudioSelector(config)) return min
    const selectedState = hasSelector
        ? audioState.getDeviceChannelState?.(config)
        : audioState
    if (!selectedState) return min

    let rawValue = 0

    switch (band) {
        case 0: // low
            rawValue = selectedState.low
            break
        case 1: // mid
            rawValue = selectedState.mid
            break
        case 2: // high
            rawValue = selectedState.high
            break
        case 4: // raw bipolar signal
            if (selectedState.rawReady !== true) return min
            rawValue = (Math.max(-1, Math.min(1, selectedState.raw || 0)) + 1) * 0.5
            break
        case 3: // vol
            rawValue = selectedState.vol
            break
        default:
            rawValue = 0
            break
    }

    // rawValue is already 0-1, clamp and map to min-max
    rawValue = Math.max(0, Math.min(1, rawValue))
    return min + rawValue * (max - min)
}

/**
 * Pass an isolated sink failure to the sink that threw it. A sink opts in
 * with an optional onError(error) method, for example to end an output whose
 * new size it cannot send. Rendering and the other sinks continue either way.
 */
function reportSinkError(error, sink) {
    if (typeof sink?.onError === 'function') sink.onError(error)
}

/**
 * Turn the rows of a read-back image over in place: its last row becomes its
 * first.
 * @param {{width:number, height:number, data:Uint8Array}} image
 * @returns {{width:number, height:number, data:Uint8Array}} image
 */
function reverseRows(image) {
    const { width, height, data } = image
    const rowBytes = width * 4
    const row = new Uint8Array(rowBytes)
    for (let top = 0, bottom = (height - 1) * rowBytes; top < bottom; top += rowBytes, bottom -= rowBytes) {
        row.set(data.subarray(top, top + rowBytes))
        data.copyWithin(top, bottom, bottom + rowBytes)
        data.set(row, bottom)
    }
    return image
}

export class Pipeline {
    constructor(graph, backend, options = {}) {
        this.graph = graph
        // The per-step state of the graph that this one replaced (swapGraph()),
        // for a move from a position key (isRenameOf()). A new pipeline has none.
        this.previousStepStateKeys = null
        this.backend = backend
        // Opt-in consumption of the analyzer's physical allocation plan
        // (graph.allocations): pooled virtual textures share one backend
        // texture. Default off preserves the historical one-texture-per-virtual
        // behavior for every existing program.
        this.texturePooling = options.texturePooling === true
        // virtualId -> storageId for pooled textures (rebuilt per recreateTextures)
        this._textureAliases = new Map()
        this.sinkManager = new SinkManager({ onError: reportSinkError })
        // Sinks receive the surface texture, whose values are extended sRGB, so
        // the descriptor stays srgb under any canvas output. A sink that wants
        // Display P3 frames exports them with a display-p3 descriptor.
        this._sinkDescriptor = {
            width: 0,
            height: 0,
            format: 'rgba8unorm',
            colorSpace: 'srgb',
            alphaMode: 'premultiplied',
            fps: 60
        }
        if (typeof backend?.present === 'function') {
            // The canvas presents with the current graph's gamut directive.
            this.sinkManager.add(new CanvasSink(backend, () => this.graph?.gamut ?? null))
        }
        // The current graph's gamut directive. While it is `gamut p3`, media
        // uploads decode in Display P3, and a display-p3 frame export skips the
        // sRGB clamp.
        if (backend) {
            backend.gamutOf = () => this.graph?.gamut ?? null
        }
        this._disposed = false
        // Queryable structured diagnostics for the historically-silent
        // unknown-dimension-form fallback.
        this.diagnostics = new DiagnosticCollector()
        this._warnedDimensionFallbacks = new Set()
        this.frameIndex = 0
        this.lastTime = 0
        this._hasTimeReference = false
        this.surfaces = new Map()        // Global surfaces (o0-o7)
        this._mipTargets = []            // Texture ids whose mip chains regenerate each frame
        this.globalUniforms = {}
        this.width = 0
        this.height = 0
        // Pre-allocate frame Maps to avoid per-frame allocation
        this.frameReadTextures = new Map()
        this.frameWriteTextures = new Map()
        this.animationDuration = 10  // Default animation loop duration in seconds
        // The fixed-step simulation clock (simulation-clock.js). A graph with
        // state runs its step passes once per grid step; see render().
        this.clock = new SimulationClock(this.animationDuration)
        // The graph's step and draw passes (analyzeSimulation()), or null.
        this._simulation = null
        // Whether the host's animation loop is running (for the edit mark).
        this._loopRunning = false
        // Pre-allocate frame state object to avoid per-frame allocation
        this._frameState = {
            frameIndex: 0,
            time: 0,
            globalUniforms: null,
            surfaces: {},
            writeSurfaces: {},
            graph: null,
            screenWidth: 0,
            screenHeight: 0
        }
        // Pre-allocated surface key arrays to avoid allocation during getFrameState
        this._surfaceKeys = []
        this._writeSurfaceKeys = []
        // Pre-allocated pass proxy for oscillator resolution (avoids per-frame object spread)
        this._oscillatorPassProxy = {
            uniforms: {}
        }
        this._resolvedUniforms = {}  // Reused for oscillator resolution
        // Track render passes per frame
        this.lastPassCount = 0
        // Flag to prevent rendering during async program compilation
        this.isCompiling = false
        // Tile region state for tiled large-resolution export
        this._tileOffset = null       // [x, y] pixel offset, or null when not tiling
        this._fullResolution = null   // [w, h] full image size, or null when not tiling
        // External input state (MIDI & Audio) - set by host application
        this.externalState = {
            midi: null,   // MidiState instance
            audio: null   // AudioState instance
        }

        // Track effect instances for asyncInit lifecycle
        this._asyncRenders = new Map()  // nodeId → cancel function
        this._asyncInitPromises = new Map()  // nodeId → in-flight asyncInit promise

        // Production lifecycle hooks: effects in the current graph
        // that carry onInit/onUpdate/onDestroy, keyed by effectKey. Rebuilt
        // whenever the graph is (re)compiled; onInit fires once per pipeline.
        this._lifecycleEffects = new Map()
        this._initLifecycleDone = new Set()
        // Per-frame uniforms returned by onUpdate hooks, bound only for keys
        // the pass does not already resolve (shipped effects such as
        // synth/media define onUpdate hooks; their returned defaults must
        // never clobber DSL/step-provided pass values).
        this._runtimeUniforms = new Map()
        this._hasRuntimeUniforms = false
        // Pre-allocated onUpdate context (avoids per-frame allocation)
        this._updateContext = { time: 0, delta: 0, uniforms: null }
    }

    /**
     * The color space the canvas presents in: 'srgb', or 'display-p3' when the
     * host asked for it and every support check passed (color-output.js).
     * @returns {'srgb'|'display-p3'}
     */
    get colorOutput() {
        return this.backend?.colorOutput ?? SRGB
    }

    /**
     * Register an output sink for the selected render surface.
     * @param {{configure: Function, submit: Function, close: Function}} sink
     * @returns {() => void} Idempotent sink removal function
     */
    addSink(sink) {
        return this.sinkManager.add(sink)
    }

    /**
     * Report whether a registered sink asks to skip drawing the next frame.
     * @returns {boolean}
     */
    shouldDeferRender() {
        return this.sinkManager.shouldDeferRender()
    }

    /**
     * Set the MIDI state for midi() function resolution.
     * The host application should create a MidiState instance and pass it here.
     * @param {import('./external-input.js').MidiState} midiState
     */
    setMidiState(midiState) {
        this.externalState.midi = midiState
    }

    /**
     * Set the audio state for audio() function resolution.
     * The host application should create an AudioState instance and pass it here.
     * @param {import('./external-input.js').AudioState} audioState
     */
    setAudioState(audioState) {
        this.externalState.audio = audioState
    }

    /**
     * Get device capabilities from the backend.
     * Useful for UI to show/hide options or adjust defaults.
     * @returns {{isMobile: boolean, floatBlend: boolean, floatLinear: boolean, colorBufferFloat: boolean, maxDrawBuffers: number, maxTextureSize: number, maxColorBytesPerSample: number, maxStateSize: number}}
     */
    getCapabilities() {
        return this.backend?.capabilities || {
            isMobile: false,
            floatBlend: true,
            floatLinear: true,
            colorBufferFloat: true,
            maxDrawBuffers: 8,
            maxTextureSize: 4096,
            maxColorBytesPerSample: 64,
            maxStateSize: 2048
        }
    }

    /**
     * Set the animation duration for oscillators.
     * Oscillators loop evenly over this duration.
     * @param {number} seconds - Animation loop duration in seconds
     */
    setAnimationDuration(seconds) {
        this.setLoopDuration(seconds)
    }

    /**
     * Set the loop duration. It sets the simulation clock's steps per loop,
     * round(60 * seconds); the state is kept.
     * @param {number} seconds - Loop duration in seconds
     */
    setLoopDuration(seconds) {
        this.animationDuration = seconds
        this.clock.setLoopDuration(seconds)
    }

    /**
     * Whether the graph has simulation state, and so step passes.
     * @returns {boolean}
     */
    get hasSimulation() {
        return this._simulation?.stepPasses.size > 0
    }

    /**
     * Tell the pipeline whether the host's animation loop runs. It clears a
     * pending edit mark, so an edit made before never steps a later render.
     * @param {boolean} running
     */
    setLoopRunning(running) {
        this._loopRunning = running === true
        this.clock.clearEdit()
    }

    /**
     * Mark an edit. The next render runs one simulation step when the loop
     * is stopped and no step is due, so a paused edit shows its effect. The
     * next render clears the mark whether or not it uses it.
     */
    markEdit() {
        this.clock.markEdit()
    }

    /**
     * The loop time of the next simulation grid step, wrapped to [0, 1).
     * @param {number} [fromTime=this.lastTime]
     * @returns {number}
     */
    nextStepTime(fromTime = this.lastTime) {
        return this.clock.nextStepTime(fromTime)
    }

    /**
     * Clear all simulation state to zero, the contents of a new texture, and
     * make the next render a start: it anchors the clock at its own time and
     * runs one step, which sees the current uniforms.
     * @param {number} [time] - The loop time of the next render, kept as lastTime
     */
    resetSimulation(time) {
        const simulation = this._simulation
        if (simulation && this.backend?.clearTexture) {
            for (const key of simulation.clearKeys) {
                const surfaceName = key.startsWith('global:') ? key.slice('global:'.length) : null
                if (surfaceName) {
                    const surface = this.surfaces.get(surfaceName)
                    if (surface?.read) this.backend.clearTexture(surface.read)
                    if (surface?.write) this.backend.clearTexture(surface.write)
                } else if (this.backend.textures?.has?.(key)) {
                    this.backend.clearTexture(key)
                }
            }
        }
        this.clock.reset()
        if (typeof time === 'number') this._setTimeReference(time)
    }

    /**
     * Initialize the pipeline
     * @param {number} width - Width in pixels
     * @param {number} height - Height in pixels
     */
    async init(width, height) {
        await this.backend.init()
        await this.compilePrograms()
        this.resize(width, height)
    }

    /**
     * Compile all shader programs referenced by a graph.
     * Sets isCompiling flag to prevent render loop from executing during compilation.
     * When a program fails, the backend gets back the programs it held before
     * this call, so a rejected candidate never replaces a program that the
     * current graph renders with.
     * @param {object} [graph] - The graph to compile; the current graph by default
     */
    async compilePrograms(graph = this.graph) {
        if (!graph || !graph.passes) return

        this.isCompiling = true
        const programs = this.backend?.programs
        const accepted = programs instanceof Map ? new Map(programs) : null

        try {
            const compiled = new Set()

            for (const pass of graph.passes) {
                if (compiled.has(pass.program)) continue

                const spec = this.resolveProgramSpec(pass, graph)

                if (!spec) {
                    throw {
                        code: 'ERR_PROGRAM_SPEC_MISSING',
                        program: pass.program,
                        pass: pass.id
                    }
                }

                await this.backend.compileProgram(pass.program, spec)
                compiled.add(pass.program)
            }
        } catch (error) {
            if (accepted) this.restorePrograms(accepted)
            throw error
        } finally {
            this.isCompiling = false
        }
    }

    /**
     * Give the backend back the programs in `accepted`, and release every
     * program compiled since.
     * @param {Map} accepted - The backend's programs before a compile began
     */
    restorePrograms(accepted) {
        const programs = this.backend.programs
        for (const [id, program] of programs) {
            if (accepted.get(id) !== program) this.backend.releaseProgram?.(program)
        }
        programs.clear()
        for (const [id, program] of accepted) programs.set(id, program)
    }

    /**
     * Resolve the program specification for a pass
     * @param {object} pass - A pass of `graph`
     * @param {object} [graph] - The graph that holds the pass; the current graph by default
     */
    resolveProgramSpec(pass, graph = this.graph) {
        const programs = graph?.programs

        if (programs instanceof Map && programs.has(pass.program)) {
            return programs.get(pass.program)
        }

        if (programs && typeof programs === 'object' && programs[pass.program]) {
            return programs[pass.program]
        }

        return null
    }

    /**
     * Resize the pipeline
     * @param {number} width - Width in pixels
     * @param {number} height - Height in pixels
     */
    resize(width, height) {
        this.width = width
        this.height = height
        this._sinkDescriptor.width = width
        this._sinkDescriptor.height = height
        this.sinkManager.configure(this._sinkDescriptor)

        const before = this.simulationTextureRecords()

        // Create/recreate global surfaces
        this.createSurfaces()
        this.refreshMipTargets()

        // Recreate textures with screen-relative dimensions
        // Collect default uniforms from passes for parameter-based texture sizing
        const defaultUniforms = this.collectDefaultUniforms()
        this.recreateTextures(defaultUniforms)
        this.initAsyncEffects()
        this.initLifecycleEffects()

        // A simulation texture recreated without its contents makes the next
        // render a start, so its state is seeded at once.
        if (this.simulationTexturesRecreated(before)) this.clock.reset()
    }

    /**
     * The backend texture records of the current simulation textures, by id.
     * @returns {Map<string, object>}
     */
    simulationTextureRecords() {
        const records = new Map()
        for (const key of this._simulation?.clearKeys || []) {
            const ids = key.startsWith('global:')
                ? [`global_${key.slice('global:'.length)}_read`, `global_${key.slice('global:'.length)}_write`]
                : [key]
            for (const id of ids) {
                const record = this.backend?.textures?.get?.(id)
                if (record) records.set(id, record)
            }
        }
        return records
    }

    /**
     * Whether a simulation texture recorded before a resize was recreated
     * without keeping its contents. A persistent texture keeps them.
     * @param {Map<string, object>} before - simulationTextureRecords() before
     * @returns {boolean}
     */
    simulationTexturesRecreated(before) {
        for (const [id, record] of before) {
            if (this.backend?.textures?.get?.(id) === record) continue
            const surfaceName = this.parseGlobalName(id.replace(/_(read|write)$/, ''))
            const spec = this.graph?.textures?.get?.(surfaceName ? `global_${surfaceName}` : id)
            if (spec?.persistent === true) continue
            return true
        }
        return false
    }

    /**
     * Production lifecycle hooks.
     * Called after texture allocation, on resize, and on hot recompile (the
     * same sites as initAsyncEffects()). Rebuilds the managed-effect map from
     * the current graph and calls onInit() once per effect instance per
     * pipeline lifetime — effects are registry singletons shared by nodes,
     * and recompiles must not re-run onInit.
     */
    initLifecycleEffects() {
        if (!this.graph || !this.graph.passes) return

        this._lifecycleEffects.clear()
        const seen = new Set()
        for (const pass of this.graph.passes) {
            if (!pass.effectKey || seen.has(pass.effectKey)) continue
            seen.add(pass.effectKey)

            const effectDef = getEffect(pass.effectKey)
            if (!effectDef) continue
            if (!hasLifecycleHook(effectDef, 'onInit')
                && !hasLifecycleHook(effectDef, 'onUpdate')
                && !hasLifecycleHook(effectDef, 'onDestroy')) continue

            this._lifecycleEffects.set(pass.effectKey, effectDef)

            if (hasLifecycleHook(effectDef, 'onInit') && !this._initLifecycleDone.has(pass.effectKey)) {
                this._initLifecycleDone.add(pass.effectKey)
                effectDef.onInit()
            }
        }
    }

    /**
     * Invoke the onUpdate hook of every managed effect once per frame and
     * collect the uniforms each hook returns. Context mirrors the test
     * harness: { time, delta, uniforms } with the pipeline's global uniforms.
     */
    _invokeUpdateHooks(time, deltaTime) {
        this._hasRuntimeUniforms = false
        if (this._runtimeUniforms.size > 0) this._runtimeUniforms.clear()

        for (const [effectKey, effectDef] of this._lifecycleEffects) {
            if (!hasLifecycleHook(effectDef, 'onUpdate')) continue
            this._updateContext.time = time
            this._updateContext.delta = deltaTime
            this._updateContext.uniforms = this.globalUniforms
            const runtimeUniforms = effectDef.onUpdate(this._updateContext)
            if (runtimeUniforms && typeof runtimeUniforms === 'object') {
                this._runtimeUniforms.set(effectKey, runtimeUniforms)
                this._hasRuntimeUniforms = true
            }
        }
    }

    /**
     * Overlay onUpdate-returned uniforms onto a pass's resolved uniforms.
     * Fallback semantics: a hook's uniform binds only when the pass does not
     * already resolve that key, so DSL/step-provided values — including
     * shipped effects' authored defaults (synth/media's imageSize) — keep
     * priority and existing behavior is preserved. Rare path: only taken
     * when an effect's onUpdate hook returned uniforms.
     */
    _withRuntimeUniforms(pass, runtimeUniforms) {
        const merged = Object.assign({}, pass.uniforms)
        for (const key in runtimeUniforms) {
            if (merged[key] === undefined) merged[key] = runtimeUniforms[key]
        }
        return Object.assign({}, pass, { uniforms: merged })
    }

    /**
     * Initialize effects that have asyncInit handlers.
     * Called after texture allocation and on seed change.
     */
    initAsyncEffects() {
        if (!this.graph || !this.graph.passes) return

        // Full reset before re-rendering: cancel in-flight traces (including
        // nodes no longer present in the current graph), drop pending
        // debounced regens, and clear the param cache. Without the cache
        // clear, a post-recompile checkAsyncRegen with the step's real values
        // would compare against values recorded for a PREVIOUS graph's
        // overlay and suppress the corrective re-trace, leaving the overlay
        // rendered with effect defaults while the UI reports the real value.
        for (const cancel of this._asyncRenders.values()) cancel()
        this._asyncRenders.clear()
        if (this._asyncDebounceTimers) {
            for (const timer of this._asyncDebounceTimers.values()) clearTimeout(timer)
            this._asyncDebounceTimers.clear()
        }
        this._asyncParamCache?.clear()

        // Find unique effects with asyncInit by scanning passes
        const seen = new Set()
        for (const pass of this.graph.passes) {
            if (!pass.effectKey || !pass.nodeId || seen.has(pass.nodeId)) continue
            seen.add(pass.nodeId)

            const effectDef = getEffect(pass.effectKey)
            if (!effectDef) continue

            // Check if effect has a real asyncInit (not the base class no-op)
            if (!effectDef._configAsyncInit && effectDef.asyncInit === Effect.prototype.asyncInit) continue

            this._startAsyncInit(pass.nodeId, effectDef)
        }
    }

    /**
     * Check if an async effect needs regen based on step-specific param changes.
     * Called by ProgramState._applyToPipeline with the step's own values.
     * Only regens the specific node — never touches other effects.
     */
    checkAsyncRegen(nodeId, effectKey, stepValues) {
        const effectDef = getEffect(effectKey)
        if (!effectDef) return
        if (!effectDef._configAsyncInit && effectDef.asyncInit === Effect.prototype.asyncInit) return

        // Check if any non-alpha param actually changed
        if (!this._asyncParamCache) this._asyncParamCache = new Map()
        const cache = this._asyncParamCache.get(nodeId) || {}
        let changed = false

        for (const [paramName, value] of Object.entries(stepValues)) {
            if (paramName === 'alpha' || paramName.startsWith('_')) continue
            if (value === undefined || value === null) continue
            // Automation configs (oscillator/midi/audio) and vector values are
            // object-shaped; identity comparison would flag "changed" on every
            // application and re-trace constantly. Async overlays consume only
            // scalar params, so objects are ignored here.
            if (typeof value === 'object') continue
            if (!effectDef.globals?.[paramName]) continue
            if (cache[paramName] !== value) {
                changed = true
                cache[paramName] = value
            }
        }

        this._asyncParamCache.set(nodeId, cache)
        if (changed) {
            this._startAsyncInit(nodeId, effectDef, { debounce: true, params: stepValues })
        }
    }

    /**
     * Run checkAsyncRegen for every asyncInit node whose effect reads this
     * uniform, with the node's current param values.
     * @param {string} uniformName - The uniform setUniform just changed
     * @private
     */
    _regenAsyncForUniform(uniformName) {
        const seen = new Set()
        for (const pass of this.graph.passes) {
            if (!pass.nodeId || !pass.effectKey || seen.has(pass.nodeId)) continue
            const effectDef = getEffect(pass.effectKey)
            if (!effectDef?.globals) continue
            if (!effectDef._configAsyncInit && effectDef.asyncInit === Effect.prototype.asyncInit) continue
            const params = {}
            let reads = false
            for (const [paramName, spec] of Object.entries(effectDef.globals)) {
                const uniform = spec.uniform || paramName
                if (uniform === uniformName) reads = true
                const value = pass.uniforms?.[uniform] ?? this.globalUniforms[uniform]
                if (value !== undefined) params[paramName] = value
            }
            if (!reads) continue
            seen.add(pass.nodeId)
            this.checkAsyncRegen(pass.nodeId, pass.effectKey, params)
        }
    }

    _startAsyncInit(nodeId, effectDef, { debounce = false, params = null } = {}) {
        if (debounce) {
            // Debounce: wait for slider to settle before regenerating
            if (!this._asyncDebounceTimers) this._asyncDebounceTimers = new Map()
            const prevTimer = this._asyncDebounceTimers.get(nodeId)
            if (prevTimer) clearTimeout(prevTimer)
            this._asyncDebounceTimers.set(nodeId, setTimeout(() => {
                this._asyncDebounceTimers.delete(nodeId)
                this._startAsyncInit(nodeId, effectDef, { debounce: false, params })
            }, 300))
            return
        }

        // Cancel previous render for this node
        const prevCancel = this._asyncRenders.get(nodeId)
        if (prevCancel) prevCancel()

        let cancelled = false
        this._asyncRenders.set(nodeId, () => { cancelled = true })

        // An automated param (oscillator, MIDI, audio) is a config object, not
        // a number; an overlay drawn once cannot follow it, so it is drawn at
        // the param's default rather than from NaN.
        const drawParams = params ? { ...params } : { ...this.globalUniforms }
        for (const [paramName, spec] of Object.entries(effectDef.globals || {})) {
            if (isAutomationValue(drawParams[paramName])) drawParams[paramName] = spec.default
        }

        // Remember the scalar values this overlay is drawn from: a later
        // checkAsyncRegen with the same values leaves it alone, and one with
        // other values (a step value, a stale host value) redraws it.
        if (!this._asyncParamCache) this._asyncParamCache = new Map()
        const drawn = {}
        for (const [paramName, spec] of Object.entries(effectDef.globals || {})) {
            const value = drawParams[paramName] ?? drawParams[spec.uniform]
            if (value !== undefined && value !== null && typeof value !== 'object') drawn[paramName] = value
        }
        this._asyncParamCache.set(nodeId, drawn)

        const context = {
            updateTexture: (texName, canvas) => {
                if (cancelled) return
                // Map effect-local texture name to graph-scoped name
                const texId = `${this.stateIdOf(nodeId)}_${texName}`
                // An overlay canvas is the effect's own 2D canvas: its
                // context tells WebGPU to upload a willReadFrequently overlay
                // with the bytes WebGL2 uploads. Other sources (an
                // ImageBitmap) have no context to pass.
                this.backend.updateTextureFromSource(texId, canvas, { flipY: true, context2d: canvas.getContext?.('2d') })
            },
            width: this.width,
            height: this.height,
            params: drawParams,
            isCancelled: () => cancelled
        }

        const run = Promise.resolve(effectDef.asyncInit(context))
            .catch(err => {
                console.error(`[Pipeline] asyncInit error for ${nodeId}:`, err)
            })
            .finally(() => {
                if (this._asyncInitPromises.get(nodeId) === run) this._asyncInitPromises.delete(nodeId)
            })
        this._asyncInitPromises.set(nodeId, run)
    }

    /**
     * Resolve once every asyncInit started so far has settled, including a
     * debounced regeneration that is already scheduled. Async CPU effects
     * (fibers, scratches, strayHair, ...) draw their overlay over several
     * frames; a host or test that captures a frame awaits this instead of
     * counting frames. Errors are logged by the pipeline and do not reject.
     * @returns {Promise<void>}
     */
    async whenAsyncInitsSettled() {
        while (this._asyncInitPromises.size > 0 || (this._asyncDebounceTimers?.size ?? 0) > 0) {
            if (this._asyncInitPromises.size > 0) {
                await Promise.all([...this._asyncInitPromises.values()])
            } else {
                await new Promise(resolve => setTimeout(resolve, 50))
            }
        }
    }

    /**
     * Collect uniform values from all passes for resolving parameter-based
     * texture dimensions. Per-effect uniforms (zoom, stateSize, ...) are
     * authoritative on each pass; the chain-scoped variants written by the
     * expander (e.g. `zoom_chain_0`) carry the per-effect value into a
     * unique key so different chains don't clobber each other when the
     * passes are merged here.
     */
    collectDefaultUniforms() {
        const uniforms = {}
        if (this.graph && this.graph.passes) {
            for (const pass of this.graph.passes) {
                if (pass.uniforms) {
                    Object.assign(uniforms, pass.uniforms)
                }
            }
        }
        return uniforms
    }

    /**
     * Describe the browser audio captures required by the compiled graph.
     * Hosts use this runtime view so inline and multiline DSL forms behave the
     * same as let-bound automation sources.
     *
     * @returns {{needsLegacy: boolean, needsLegacyRaw: boolean, selected: Array<{id: string|null, name: string, channel: number, needsRaw: boolean}>}}
     */
    getAudioInputRequirements() {
        let needsLegacy = false
        let needsLegacyRaw = false
        const selected = []
        const selectedKeys = new Set()
        const visited = new Set()

        const visit = (value) => {
            if (!value || typeof value !== 'object' || visited.has(value)) return
            visited.add(value)

            if (value.type === 'Audio' || value._ast?.type === 'Audio') {
                const hasSelectorIntent = hasAudioSelectorIntent(value)
                const hasValidBand = value._invalid !== true &&
                    Number.isInteger(value.band) && value.band >= 0 && value.band <= 4
                if (!hasValidBand) return

                // Valid Audio descriptors can delegate their numeric bounds to
                // other sources, which may introduce additional capture needs.
                visit(value.min)
                visit(value.max)

                if (hasSelectorIntent && isValidAudioSelector(value)) {
                    const requirement = {
                        id: typeof value.id === 'string' && value.id.length > 0 ? value.id : null,
                        name: value.name ?? null,
                        channel: value.channel ?? 1,
                        needsRaw: value.band === 4
                    }
                    const key = JSON.stringify([requirement.id, requirement.name, requirement.channel])
                    if (selectedKeys.has(key)) {
                        const existing = selected.find(candidate => (
                            candidate.id === requirement.id &&
                            candidate.name === requirement.name &&
                            candidate.channel === requirement.channel
                        ))
                        if (existing && requirement.needsRaw) existing.needsRaw = true
                    } else {
                        selectedKeys.add(key)
                        selected.push(requirement)
                    }
                } else if (!hasSelectorIntent) {
                    needsLegacy = true
                    if (value.band === 4) needsLegacyRaw = true
                }
                return
            }

            if (Array.isArray(value)) {
                for (const item of value) visit(item)
                return
            }
            if (ArrayBuffer.isView(value)) return
            for (const item of Object.values(value)) visit(item)
        }

        for (const pass of this.graph?.passes || []) {
            const effectDef = pass.effectKey ? getEffect(pass.effectKey) : null
            if (effectDef?.tags?.includes('audio')) needsLegacy = true
            visit(pass.uniforms)
        }
        return { needsLegacy, needsLegacyRaw, selected }
    }

    /**
     * Create global output surfaces (o0, o1, o2, o3, o4, o5, o6, o7)
     * Also scans the graph for any other required global surfaces (starting with global_)
     */
    /**
     * Check if a texture ID is a global surface reference and extract the name.
     * Supports "global_name" pattern.
     * Returns null if not a global, otherwise returns the surface name.
     */
    parseGlobalName(texId) {
        if (typeof texId !== 'string') return null

        // "global_name" (underscore separator)
        if (texId.startsWith('global_')) {
            return texId.replace('global_', '')
        }

        return null
    }

    /**
     * Check if a uniform name belongs to the volumeSize family
     * (unscoped, chain-scoped, or node-scoped).
     * @param {string} name - Uniform name
     * @returns {boolean}
     */
    isVolumeSizeUniform(name) {
        return name === 'volumeSize' ||
               name.startsWith('volumeSize_chain_') ||
               name.startsWith('volumeSize_node_')
    }

    /**
     * Clamp a volumeSize value so the volume atlas (volumeSize × volumeSize²)
     * fits the device's maximum texture size, snapping down power-of-two so
     * the clamped size matches the effects' own size choices. Mobile WebKit
     * caps WebGL2 MAX_TEXTURE_SIZE at 8192, where volumeSize 128 demands a
     * 128×16384 atlas: the allocation fails, the volume samples as zeros,
     * and 3D renders degrade to a flat gray "solid cube". No-op when the
     * backend reports no maxTextureSize (headless stubs) or the atlas fits.
     * @param {number} value - Requested volume size
     * @returns {number} A volume size whose atlas fits the device
     */
    clampVolumeSize(value) {
        const maxTextureSize = this.backend?.capabilities?.maxTextureSize
        if (typeof value !== 'number' || !maxTextureSize || value * value <= maxTextureSize) {
            return value
        }
        let clamped = 16
        while ((clamped * 2) * (clamped * 2) <= maxTextureSize && clamped * 2 < value) {
            clamped *= 2
        }
        if (!this._warnedVolumeClamps) this._warnedVolumeClamps = new Set()
        const warnKey = `${value}->${clamped}`
        if (!this._warnedVolumeClamps.has(warnKey)) {
            this._warnedVolumeClamps.add(warnKey)
            console.warn(`[Pipeline] Capping volumeSize from ${value} to ${clamped}: the ${value}x${value * value} volume atlas exceeds this device's max texture size (${maxTextureSize})`)
        }
        return clamped
    }

    /**
     * The scene volume() constraint on a volumeSize uniform scope, if any.
     *
     * A volume() node marches a fixed-size atlas, so the chain writing the
     * surface it reads is pinned to that size — compileGraph enforces it and
     * records the pinned scopes on the graph (`sceneVolumeAtlasScopes`). The
     * runtime UI paths patch pass uniforms in place and never recompile, so
     * this is where the same contract is kept for a slider drag.
     *
     * The lookup is exact: a chain writing an unmarched surface keeps its own
     * scope and stays free to resize.
     * @param {string} scopeName - 'volumeSize' or a scoped variant
     * @returns {{surface: string, size: number}|null} The constraint, or null
     */
    sceneVolumeAtlasConstraint(scopeName) {
        return this.graph?.sceneVolumeAtlasScopes?.[scopeName] || null
    }

    /**
     * Resolve a runtime volumeSize update against the scene volume() contract:
     * the requested value when the scope is free, the pinned size when it is
     * not. Refusing rather than accepting matches the compile-time behaviour —
     * a stretched atlas renders a plausible-looking wrong volume, so silently
     * letting the drag through is the one outcome that reports nothing.
     * @param {string} scopeName - 'volumeSize' or a scoped variant
     * @param {any} value - Requested value
     * @returns {any} The value to apply
     */
    applySceneVolumeAtlasConstraint(scopeName, value) {
        if (typeof value !== 'number') return value
        const constraint = this.sceneVolumeAtlasConstraint(scopeName)
        if (!constraint || value === constraint.size) return value

        if (!this._warnedVolumeConstraints) this._warnedVolumeConstraints = new Set()
        const warnKey = `${scopeName}:${value}`
        if (!this._warnedVolumeConstraints.has(warnKey)) {
            this._warnedVolumeConstraints.add(warnKey)
            console.warn(`[Pipeline] Refusing volumeSize x${value} on the chain writing ${constraint.surface}: the scene's volume(${constraint.surface}) marches a ${constraint.size}-cube atlas and would decode a x${value} chain at the wrong slice stride. Keeping volumeSize x${constraint.size}.`)
        }
        return constraint.size
    }

    /**
     * Forget which refusals have already been reported.
     *
     * The memo above is keyed by scope and requested value, and it is the
     * refusal's only signal — the drag is reverted in place and nothing is
     * returned to the caller. Carried across a graph swap it would mute every
     * later refusal of a value already refused once, so a hot recompile leaves
     * the guard working and silent. Called from swapGraph(), where the graph
     * the memo was built against is replaced.
     */
    resetSceneVolumeAtlasWarnings() {
        this._warnedVolumeConstraints = null
    }

    /**
     * Clamp every volumeSize-family uniform baked into the graph's passes
     * (expander output) to the device limit. Runs from createSurfaces() so
     * cold init, resize, and hot recompile all pass through it before any
     * atlas is sized. Automation configs are left alone.
     */
    clampGraphVolumeSizes() {
        if (!this.graph || !this.graph.passes) return
        for (const pass of this.graph.passes) {
            if (!pass.uniforms) continue
            for (const key of Object.keys(pass.uniforms)) {
                if (!this.isVolumeSizeUniform(key)) continue
                const value = pass.uniforms[key]
                if (typeof value !== 'number') continue
                const clamped = this.clampVolumeSize(value)
                if (clamped !== value) {
                    pass.uniforms[key] = clamped
                }
            }
        }
    }

    /**
     * Byte cost per sample of a color attachment format, for the MRT
     * attachment budget. Unlisted formats (including defaulted rgba16f
     * surfaces) cost 8. Delegates to the shared preflight implementation so
     * Pipeline.applyMrtFormatBudget() and preflightEffect() stay in lockstep.
     * @param {string|undefined} format - Texture format name
     * @returns {number} Bytes per sample
     */
    mrtFormatBytes(format) {
        return mrtFormatBytes(format)
    }

    /**
     * Static preflight of this pipeline's effect graph against device
     * capabilities. Runs the same analysis as
     * preflightEffect() — per-backend authorability, predicted MRT
     * format demotions, and predicted maxTextureSize clamps — before any
     * program is compiled. Read-only; never mutates the graph.
     * @param {object} [capabilities] - Defaults to the active backend's
     *   capabilities (Pipeline.getCapabilities()).
     * @returns {{ backends: {webgl2: {authorable: boolean, reasons: string[]}, webgpu: {authorable: boolean, reasons: string[]}}, formatChanges: Array, clamps: Array }}
     */
    preflight(capabilities) {
        const caps = capabilities || this.getCapabilities()
        const shaders = {}
        for (const pass of this.graph?.passes || []) {
            if (!pass.program) continue
            const spec = this.resolveProgramSpec(pass)
            if (spec) shaders[pass.program] = spec
        }
        const definition = {
            passes: this.graph?.passes || [],
            textures: this.graph?.textures,
            shaders
        }
        // Without program specs, source availability is unknown — don't judge it.
        return preflightEffect(definition, caps, Object.keys(shaders).length ? shaders : undefined)
    }

    /**
     * Demote trailing rgba32f attachments of over-budget MRT passes to
     * rgba16f so the framebuffer stays within the device's color-attachment
     * byte budget. Apple GPUs enforce Metal's 32-bytes-per-sample rule on
     * WebGL2 framebuffers (FRAMEBUFFER_UNSUPPORTED past it, measured on
     * iOS 26.5), where pointsEmit's xyz+vel+rgba MRT (16+16+4 = 36 bytes)
     * fails every frame. Demoting from the last attachment backward keeps
     * the highest-precision-need attachments (agent positions) intact.
     * No-op when the backend reports no maxColorBytesPerSample or every
     * group already fits.
     */
    applyMrtFormatBudget() {
        const budget = this.backend?.capabilities?.maxColorBytesPerSample
        if (!budget || !this.graph || !this.graph.passes || !this.graph.textures) return
        for (const pass of this.graph.passes) {
            if (!pass.outputs) continue
            const texIds = Object.values(pass.outputs)
            if (texIds.length <= 1) continue
            const entries = texIds.map((texId) => ({ texId, spec: this.graph.textures.get(texId) }))
            let total = entries.reduce((sum, entry) => sum + this.mrtFormatBytes(entry.spec?.format), 0)
            if (total <= budget) continue
            for (let i = entries.length - 1; i >= 0 && total > budget; i--) {
                const spec = entries[i].spec
                if (!spec) continue
                if (spec.format === 'rgba32f' || spec.format === 'rgba32float') {
                    console.warn(`[Pipeline] Demoting MRT attachment ${entries[i].texId} from ${spec.format} to rgba16f: pass ${pass.id} needs ${total} bytes/sample, device allows ${budget}`)
                    spec.format = 'rgba16f'
                    total -= 8
                }
            }
        }
    }

    /**
     * Destroy and recreate a 2D texture. When the previous texture record was
     * marked `persistent` (opt-in via the texture spec), its contents are
     * resampled into the replacement through backend.copyTexture(), so the
     * texture survives resize and parameter-driven recreation at its new size.
     * @param {string} texId - Texture id to recreate
     * @param {object} spec - New texture spec { width, height, format, usage, ... }
     */
    recreateTexturePreserving(texId, spec) {
        const existingTex = this.backend.textures?.get?.(texId)
        let preserveId = null
        if (existingTex && !existingTex.is3D && existingTex.persistent) {
            preserveId = `${texId}__preserve_tmp`
            this.backend.createTexture(preserveId, {
                width: existingTex.width,
                height: existingTex.height,
                format: existingTex.format,
                // A mipmapped source is copied through the WebGPU resample
                // path even when this temporary has the same dimensions.
                usage: ['render', 'sample', 'copySrc', 'copyDst']
            })
            this.backend.copyTexture(texId, preserveId)
        }
        this.backend.destroyTexture(texId)
        this.backend.createTexture(texId, spec)
        if (preserveId) {
            this.backend.copyTexture(preserveId, texId)
            this.backend.destroyTexture(preserveId)
        }
    }

    /**
     * Recompute the list of texture ids whose mip chains must be regenerated
     * after each frame. Global surfaces map their single graph spec to both
     * halves of the double-buffered surface.
     */
    refreshMipTargets() {
        this._mipTargets.length = 0
        if (!this.graph || !this.graph.textures) return
        for (const [texId, spec] of this.graph.textures) {
            if (!spec.mipmaps) continue
            if (texId.startsWith('global_')) {
                const surfaceName = this.parseGlobalName(texId)
                if (surfaceName && this.surfaces.has(surfaceName)) {
                    const surface = this.surfaces.get(surfaceName)
                    this._mipTargets.push(surface.read, surface.write)
                }
            } else {
                this._mipTargets.push(texId)
            }
        }
    }

    createSurfaces() {
        // Volume atlas sizing reads volumeSize out of pass uniforms — clamp
        // them to the device limit before any dimension is resolved.
        this.clampGraphVolumeSizes()

        // MRT attachment formats must fit the device's color byte budget
        // before any texture spec is read for allocation.
        this.applyMrtFormatBudget()

        const surfaceNames = new Set(['o0', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7',
            'geo0', 'geo1', 'geo2', 'geo3', 'geo4', 'geo5', 'geo6', 'geo7',
            'vol0', 'vol1', 'vol2', 'vol3', 'vol4', 'vol5', 'vol6', 'vol7'])
        const readBeforeWriteSurfaces = new Set()
        const writtenSurfaces = new Set()

        // Global mesh surfaces (mesh0-mesh7) - each mesh has 3 linked textures
        const meshNames = new Set(['mesh0', 'mesh1', 'mesh2', 'mesh3', 'mesh4', 'mesh5', 'mesh6', 'mesh7'])

        // Collect default uniforms for parameter-based texture sizing
        const defaultUniforms = this.collectDefaultUniforms()

        // Scan graph for other globals
        // Mesh texture pattern: mesh0_positions, mesh1_normals, mesh2_uvs, etc.
        // These are NOT ping-pong surfaces - they're static data textures uploaded by loadOBJ
        const meshTexturePattern = /^mesh\d+_(positions|normals|uvs)$/
        if (this.graph && this.graph.passes) {
            for (const pass of this.graph.passes) {
                if (pass.inputs) {
                    for (const texId of Object.values(pass.inputs)) {
                        const globalName = this.parseGlobalName(texId)
                        if (globalName && !meshTexturePattern.test(globalName)) {
                            surfaceNames.add(globalName)
                            if (!writtenSurfaces.has(globalName)) {
                                readBeforeWriteSurfaces.add(globalName)
                            }
                        }
                    }
                }
                if (pass.outputs || pass.storageTextures) {
                    // WebGL2's compute fallback uses storageTextures only when
                    // the pass has no explicit outputs.
                    for (const texId of Object.values(pass.outputs || pass.storageTextures)) {
                        const globalName = this.parseGlobalName(texId)
                        if (globalName && !meshTexturePattern.test(globalName)) {
                            surfaceNames.add(globalName)
                            writtenSurfaces.add(globalName)
                        }
                    }
                }
            }
        }
        // A surface first written and then read is frame-local scratch (such
        // as Lenia's clear/deposit density target), not cross-frame feedback.
        this._feedbackSurfaces = new Set(
            [...readBeforeWriteSurfaces].filter(name => writtenSurfaces.has(name)))

        // The step and draw passes of the simulation clock. A new graph (a
        // compile or a recompile) is a start.
        if (this._simulation?.graph !== this.graph) {
            this._simulation = this.analyzeSimulation()
            this.clock.reset()
        }

        // Check if any pass references midiNoteGrid texture
        this._needsMidiNoteGrid = false
        if (this.graph && this.graph.passes) {
            for (const pass of this.graph.passes) {
                if (pass.inputs) {
                    for (const texId of Object.values(pass.inputs)) {
                        if (texId === 'midiNoteGrid') { this._needsMidiNoteGrid = true; break }
                    }
                }
                if (this._needsMidiNoteGrid) break
            }
        }

        // Create global surfaces (o0-o7 and dynamic globals).
        // Per-effect zoom (e.g. screenDivide:'zoom_chain_N') is resolved by
        // resolveDimension() reading the chain-scoped uniform out of
        // defaultUniforms. There is no pipeline-wide zoom; sizing is owned
        // by each effect via its own textures spec.
        for (const name of surfaceNames) {
            // Unwritten volume surfaces retain the native default atlas size.
            // write3d supplies explicit producer specs for both volume and geometry.
            const isVolume = /^vol[0-7]$/.test(name)
            let surfaceWidth = isVolume ? 64 : this.width
            let surfaceHeight = isVolume ? 4096 : this.height
            let surfaceFormat = 'rgba16f'

            const underscoreId = `global_${name}`
            let texSpec = this.graph?.textures?.get?.(underscoreId)
            if (texSpec) {
                surfaceWidth = this.resolveDimension(texSpec.width, this.width, defaultUniforms)
                surfaceHeight = this.resolveDimension(texSpec.height, this.height, defaultUniforms)
                if (texSpec.format) surfaceFormat = texSpec.format
            }

            // Reuse only a complete matching surface (preserves sim state on recompile).
            const oldSurface = this.surfaces.get(name)
            if (oldSurface) {
                const existingReadTex = this.backend.textures?.get?.(oldSurface.read)
                const existingWriteTex = this.backend.textures?.get?.(oldSurface.write)
                if (existingReadTex && existingWriteTex &&
                    existingReadTex.width === surfaceWidth &&
                    existingReadTex.height === surfaceHeight &&
                    existingReadTex.format === surfaceFormat &&
                    existingWriteTex.width === surfaceWidth &&
                    existingWriteTex.height === surfaceHeight &&
                    existingWriteTex.format === surfaceFormat) {
                    // Surface has a matching allocation, preserve it.
                    continue
                }
                // Allocation changed, destroy the old surface (preserving contents of
                // persistent surfaces across the resize).
                this.recreateTexturePreserving(`global_${name}_read`, {
                    width: surfaceWidth,
                    height: surfaceHeight,
                    format: surfaceFormat,
                    usage: ['render', 'sample', 'copySrc', 'copyDst', 'storage'],
                    mipmaps: texSpec?.mipmaps === true,
                    persistent: texSpec?.persistent === true
                })
                this.recreateTexturePreserving(`global_${name}_write`, {
                    width: surfaceWidth,
                    height: surfaceHeight,
                    format: surfaceFormat,
                    usage: ['render', 'sample', 'copySrc', 'copyDst', 'storage'],
                    mipmaps: texSpec?.mipmaps === true,
                    persistent: texSpec?.persistent === true
                })
                continue
            }

            // Create double-buffered surface
            // Include 'storage' usage for compute shader output
            this.backend.createTexture(`global_${name}_read`, {
                width: surfaceWidth,
                height: surfaceHeight,
                format: surfaceFormat,
                usage: ['render', 'sample', 'copySrc', 'copyDst', 'storage'],
                mipmaps: texSpec?.mipmaps === true,
                persistent: texSpec?.persistent === true
            })

            this.backend.createTexture(`global_${name}_write`, {
                width: surfaceWidth,
                height: surfaceHeight,
                format: surfaceFormat,
                usage: ['render', 'sample', 'copySrc', 'copyDst', 'storage'],
                mipmaps: texSpec?.mipmaps === true,
                persistent: texSpec?.persistent === true
            })

            this.surfaces.set(name, {
                read: `global_${name}_read`,
                write: `global_${name}_write`,
                currentFrame: 0
            })
        }

        // Create mesh surfaces (mesh0-mesh7)
        // Each mesh surface is a linked triplet of textures: positions, normals, UVs
        for (const name of meshNames) {
            const oldSurface = this.surfaces.get(name)
            if (oldSurface) {
                // Already exists, skip
                continue
            }

            // Default mesh size: 256x256 = 65536 vertices max
            // Users can override via mesh texture dimensions in their effect
            const meshWidth = 256
            const meshHeight = 256

            // Position texture: xyz position in world space, w = vertex valid flag
            this.backend.createTexture(`global_${name}_positions`, {
                width: meshWidth,
                height: meshHeight,
                format: 'rgba32f',
                usage: ['render', 'sample', 'copySrc', 'copyDst', 'storage']
            })

            // Normal texture: xyz normal vector, w unused
            // Must be rgba32f to match uploadMeshData which writes Float32Array data
            this.backend.createTexture(`global_${name}_normals`, {
                width: meshWidth,
                height: meshHeight,
                format: 'rgba32f',
                usage: ['render', 'sample', 'copySrc', 'copyDst', 'storage']
            })

            // UV texture: uv coordinates, zw unused
            // Must be rgba32f to match uploadMeshData which writes Float32Array data
            this.backend.createTexture(`global_${name}_uvs`, {
                width: meshWidth,
                height: meshHeight,
                format: 'rgba32f',
                usage: ['render', 'sample', 'copySrc', 'copyDst', 'storage']
            })

            this.surfaces.set(name, {
                positions: `global_${name}_positions`,
                normals: `global_${name}_normals`,
                uvs: `global_${name}_uvs`,
                width: meshWidth,
                height: meshHeight
            })
        }
    }

    /**
     * The texture key of a pass input or output: `global:<name>` for a global
     * surface, the texture id otherwise, and null for a static mesh texture.
     * @param {string} texId
     * @returns {string|null}
     */
    simulationTextureKey(texId) {
        if (typeof texId !== 'string') return null
        const globalName = this.parseGlobalName(texId)
        if (globalName) return /^mesh\d+_(positions|normals|uvs)$/.test(globalName) ? null : `global:${globalName}`
        return texId
    }

    /**
     * Whether a pass's viewport covers each texture it writes: it starts at 0, 0
     * and resolves to the texture's own size. A volume generator writes its
     * whole atlas through such a viewport, so the write is a full one.
     * @param {object} pass
     * @param {object} uniforms - Default uniforms for parameter-sized dimensions
     * @returns {boolean}
     */
    viewportCoversOutputs(pass, uniforms) {
        const viewport = pass.viewport
        if (!viewport || typeof viewport !== 'object') return false
        if ((viewport.x ?? 0) !== 0 || (viewport.y ?? 0) !== 0) return false
        const widthSpec = viewport.width ?? viewport.w
        const heightSpec = viewport.height ?? viewport.h
        if (widthSpec === undefined || heightSpec === undefined) return false
        const scoped = { ...uniforms, ...(pass.uniforms || {}) }
        const width = this.resolveDimension(widthSpec, this.width, scoped)
        const height = this.resolveDimension(heightSpec, this.height, scoped)
        const outputs = Object.values(pass.outputs || pass.storageTextures || {})
        return outputs.length > 0 && outputs.every(id => {
            const spec = this.graph?.textures?.get?.(id)
            if (!spec) return false
            return this.resolveDimension(spec.width, this.width, uniforms) === width &&
                this.resolveDimension(spec.height, this.height, uniforms) === height
        })
    }

    /**
     * Find the simulation state of the current graph.
     *
     * A state texture is a texture that a pass reads before any pass
     * definitely writes it in the frame, and that the frame writes: it holds
     * a previous frame's value. A write under runIf or skipIf is not definite,
     * and a write that blends, uses a drawMode, or uses a viewport without a
     * clear also reads its destination.
     *
     * The step set is the smallest set of passes that holds each pass that
     * writes a state texture, each pass that reads a state texture before it
     * is definitely written, each in-frame producer of a member, and each
     * pass that writes a texture a later member writes (so the order of
     * writes is kept). Step passes run once per simulation step; every other
     * pass is a draw pass and runs once per render.
     * @returns {{graph: object, stepPasses: Set<number>, stateKeys: Set<string>, heldTextures: Set<string>, clearKeys: Set<string>, sceneDrawPasses: Set<number>}}
     */
    analyzeSimulation() {
        const passes = this.graph?.passes || []
        const reads = []
        const writes = []
        const definite = []
        const uniforms = this.collectDefaultUniforms()
        for (const pass of passes) {
            const outputs = [...new Set(Object.values(pass.outputs || pass.storageTextures || {})
                .map(id => this.simulationTextureKey(id)).filter(Boolean))]
            const inputs = new Set(Object.values(pass.inputs || {}).map(id => this.simulationTextureKey(id)).filter(Boolean))
            const partialViewport = pass.viewport && !pass.clear && !this.viewportCoversOutputs(pass, uniforms)
            const partial = Boolean(pass.drawMode || pass.blend || partialViewport)
            if (partial) for (const key of outputs) inputs.add(key)
            reads.push(inputs)
            writes.push(outputs)
            definite.push(!pass.conditions && !partial)
        }

        const definitelyWritten = new Set()
        const written = new Set()
        const readBeforeWrite = new Map() // key -> readers before a definite write
        for (let i = 0; i < passes.length; i++) {
            for (const key of reads[i]) {
                if (definitelyWritten.has(key)) continue
                if (!readBeforeWrite.has(key)) readBeforeWrite.set(key, [])
                readBeforeWrite.get(key).push(i)
            }
            for (const key of writes[i]) {
                written.add(key)
                if (definite[i]) definitelyWritten.add(key)
            }
        }
        const stateKeys = new Set([...readBeforeWrite.keys()].filter(key => written.has(key)))

        const stepPasses = new Set()
        for (let i = 0; i < passes.length; i++) {
            if (writes[i].some(key => stateKeys.has(key))) stepPasses.add(i)
        }
        for (const key of stateKeys) for (const reader of readBeforeWrite.get(key)) stepPasses.add(reader)

        // Close the set under in-frame producers, under earlier writers of a
        // texture a member writes, and under earlier readers of a texture a
        // member writes later: step passes run before draw passes, so each of
        // those would otherwise see another write than in graph order.
        let changed = stepPasses.size > 0
        while (changed) {
            changed = false
            for (const member of [...stepPasses]) {
                for (let j = 0; j < member; j++) {
                    if (stepPasses.has(j)) continue
                    const produces = writes[j].some(key => reads[member].has(key))
                    const writesSame = writes[j].some(key => writes[member].includes(key))
                    const readsLaterWrite = writes[member].some(key => reads[j].has(key))
                    if (produces || writesSame || readsLaterWrite) {
                        stepPasses.add(j)
                        changed = true
                    }
                }
            }
        }

        // A step pass that samples a mipmapped texture would need its mips per
        // step; they regenerate once a render. No shipped effect does this.
        for (const i of stepPasses) {
            for (const id of Object.values(passes[i].inputs || {})) {
                if (this.graph?.textures?.get?.(id)?.mipmaps === true) {
                    throw new Error(`Pass ${passes[i].id} is a simulation step that samples the mipmapped texture ${id}; its mips regenerate once a render, not once a step`)
                }
            }
        }

        // The textures step passes write stay as the last step left them,
        // so they are never pooled; resetSimulation() clears them.
        const heldTextures = new Set()
        const clearKeys = new Set(stateKeys)
        for (const i of stepPasses) {
            for (const id of Object.values(passes[i].outputs || passes[i].storageTextures || {})) {
                const key = this.simulationTextureKey(id)
                if (!key) continue
                clearKeys.add(key)
                if (!key.startsWith('global:')) heldTextures.add(key)
            }
        }

        // For a scene program, the draw passes that depend on the scene image,
        // directly or through an in-frame producer, run after the scene render,
        // and so does each later draw pass that writes a texture one of them
        // read or wrote, which keeps the order of reads and writes.
        const sceneDrawPasses = new Set()
        const sceneDependent = new Set()
        const sceneRead = new Set()
        for (let i = 0; i < passes.length; i++) {
            if (stepPasses.has(i)) continue
            const dependsOnScene = Object.values(passes[i].inputs || {}).includes(SCENE_COLOR_TEXTURE) ||
                [...reads[i]].some(key => sceneDependent.has(key)) ||
                writes[i].some(key => sceneDependent.has(key) || sceneRead.has(key))
            if (dependsOnScene) {
                sceneDrawPasses.add(i)
                for (const key of writes[i]) sceneDependent.add(key)
                for (const key of reads[i]) sceneRead.add(key)
            }
        }

        return { graph: this.graph, stepPasses, stateKeys, heldTextures, clearKeys, sceneDrawPasses }
    }

    /**
     * Check if a dimension spec is dynamic (screen-relative, percentage, or parameter-based)
     * Fixed numeric values return false; everything else returns true.
     * @param {number|string|object} spec - Dimension specification
     * @returns {boolean} True if the spec should be re-resolved on resize
     */
    isDynamicDimension(spec) {
        // Fixed numeric value - not dynamic
        if (typeof spec === 'number') {
            return false
        }
        // 'screen', 'auto', or percentage like '50%' - dynamic
        if (typeof spec === 'string') {
            return true
        }
        // Object specs (param-based, scale-based) - dynamic
        if (typeof spec === 'object' && spec !== null) {
            return true
        }
        // Unknown - treat as dynamic to be safe
        return true
    }

    /**
     * Recreate textures with new dimensions based on current uniform values
     * @param {object} [uniforms] - Current uniform values for parameter-based sizing
     */
    recreateTextures(uniforms = {}) {
        // A simulation texture recreated without its contents (for example a
        // stateSize change) makes the next render a start, so it is seeded at once.
        const before = this.simulationTextureRecords()
        this.recreateGraphTextures(uniforms)
        if (this.simulationTexturesRecreated(before)) this.clock.reset()
    }

    /**
     * Create or resize the graph's textures for the current size and uniforms.
     * @param {object} [uniforms]
     */
    recreateGraphTextures(uniforms = {}) {
        if (!this.graph || !this.graph.textures) return

        // Rebuild the pooling plan from the analyzer's allocation map. Must run
        // after applyMrtFormatBudget() so demoted formats are seen here.
        const previousAliases = this._textureAliases
        this._textureAliases = this.texturePooling
            ? this.buildTexturePoolingPlan()
            : new Map()
        this.releaseRegroupedTextures(previousAliases, this._textureAliases)

        for (const [texId, spec] of this.graph.textures.entries()) {
            // Check if this is a global surface (double-buffered)
            // Global surfaces use naming like "global_node_X_caState" in textures map
            // but the surface is stored as "caState" with read/write variants
            const isGlobalSurface = texId.startsWith('global_') || texId.startsWith('global')

            // For global surfaces, only resize if they have dynamic dimensions
            // (screen-relative, percentage, or parameter-based)
            if (isGlobalSurface) {
                const hasDynamicWidth = this.isDynamicDimension(spec.width)
                const hasDynamicHeight = this.isDynamicDimension(spec.height)
                if (!hasDynamicWidth && !hasDynamicHeight) {
                    continue  // Fixed-size global, skip
                }
            }

            // Resolve dimensions with current uniforms
            const width = this.resolveDimension(spec.width, this.width, uniforms)
            const height = this.resolveDimension(spec.height, this.height, uniforms)

            if (isGlobalSurface) {
                // Handle double-buffered global surface
                // Match the complete surface name: geo0 contains "o0", but must
                // never resize the display surface when its atlas changes size.
                const surfaceName = this.parseGlobalName(texId)

                if (!surfaceName || !this.surfaces.has(surfaceName)) {
                    continue  // Can't find matching surface
                }

                const surface = this.surfaces.get(surfaceName)
                const readTexId = surface.read
                const writeTexId = surface.write

                // Reuse only when both halves match the graph allocation.
                const expectedFormat = spec.format || 'rgba16f'
                const existingReadTex = this.backend.textures?.get?.(readTexId)
                const existingWriteTex = this.backend.textures?.get?.(writeTexId)
                if (existingReadTex && existingWriteTex &&
                    existingReadTex.width === width &&
                    existingReadTex.height === height &&
                    existingReadTex.format === expectedFormat &&
                    existingWriteTex.width === width &&
                    existingWriteTex.height === height &&
                    existingWriteTex.format === expectedFormat) {
                    continue  // No change needed
                }

                // Destroy old textures (preserving persistent surface contents across
                // the resize)
                const format = spec.format || 'rgba16f'
                this.recreateTexturePreserving(readTexId, {
                    width,
                    height,
                    format,
                    usage: ['render', 'sample', 'copySrc', 'copyDst', 'storage'],
                    mipmaps: spec.mipmaps === true,
                    persistent: spec.persistent === true
                })
                this.recreateTexturePreserving(writeTexId, {
                    width,
                    height,
                    format,
                    usage: ['render', 'sample', 'copySrc', 'copyDst', 'storage'],
                    mipmaps: spec.mipmaps === true,
                    persistent: spec.persistent === true
                })
            } else {
                // Handle regular (non-global) texture
                // Pooled secondary members skip their own allocation: the
                // storage texture is created once under the group's primary id
                // and aliased below (applyTextureAliases()).
                const storageId = this._textureAliases.get(texId)
                if (storageId && storageId !== texId) continue

                // Reuse only when dimensions, format, and depth all match.
                const existingTex = this.backend.textures?.get?.(texId)
                if (existingTex &&
                    existingTex.width === width &&
                    existingTex.height === height &&
                    existingTex.format === spec.format) {
                    // For 3D textures, also check depth
                    if (!spec.is3D || existingTex.depth === this.resolveDimension(spec.depth, width, uniforms)) {
                        continue  // No change needed
                    }
                }

                // Destroy old texture (persistent textures keep their contents through
                // backend.copyTexture resampling)
                if (spec.is3D) {
                    const depth = this.resolveDimension(spec.depth, width, uniforms)
                    this.backend.destroyTexture(texId)
                    this.backend.createTexture3D(texId, {
                        ...spec,
                        width,
                        height,
                        depth
                    })
                } else {
                    this.recreateTexturePreserving(texId, {
                        ...spec,
                        width,
                        height
                    })
                }
            }
        }
        this.applyTextureAliases()
        this.refreshMipTargets()
    }

    /**
     * Build the pooling plan consumed from the analyzer's physical allocation
     * map (graph.allocations, produced by allocateResources()). Returns a Map
     * of virtualId -> storageId for every poolable texture; members of a
     * physical group share one backend texture created under the group's
     * primary (first) member id.
     *
     * A group is poolable only when every member carries an identical plain
     * 2D spec: persistent textures must keep their cross-frame contents, and
     * mipmapped/3D textures carry policy state a shared record must not
     * absorb. Groups with mismatched dimensions or formats fall back to
     * standalone textures.
     *
     * First-read safety: a member whose first touch in the pass list is an
     * input read (or that is sampled by its own producing pass) expects the
     * zero-initialized/previous-frame contents a standalone texture would
     * hold, so it is never pooled into a slot a group-mate writes earlier in
     * the same frame. The same protection excludes textures written by
     * partial/non-clearing passes — any explicit `drawMode` (points,
     * billboards, triangles) scatters geometry without covering the surface,
     * and `blend` makes the result depend on the destination's previous
     * contents — because pooled storage would hand them a group-mate's
     * content instead of their own accumulated state.
     * @returns {Map} Map<virtualId, storageId>
     */
    buildTexturePoolingPlan() {
        const allocations = this.graph?.allocations
        const textures = this.graph?.textures
        const aliases = new Map()
        if (!(allocations instanceof Map) || !textures) return aliases

        // First-touch classification from the pass list
        const firstTouchIsWrite = new Map()
        const selfSampled = new Set()
        const partiallyWritten = new Set()
        for (const pass of this.graph.passes || []) {
            const inputs = new Set(Object.values(pass.inputs || {}))
            const outputs = Object.values(pass.outputs || {})
            // A pass that does not fully overwrite its target (scatter draw
            // modes, blending against the destination) leaves the texture's
            // previous contents observable, so pooled storage is unsafe.
            if (pass.drawMode || pass.blend) {
                for (const texId of outputs) partiallyWritten.add(texId)
            }
            // A `viewport` pass that does not declare `clear: true` renders
            // into a sub-region: WebGPU uses loadOp 'load' by default and
            // WebGL2 sets a gl.viewport without clearing, so unwritten
            // regions expose whatever was there before (a group-mate's
            // content under pooled storage). Full clears (`clear: true`,
            // no viewport) overwrite the whole texture and stay poolable.
            else if (pass.viewport && !pass.clear) {
                for (const texId of outputs) partiallyWritten.add(texId)
            }
            for (const texId of outputs) {
                if (!firstTouchIsWrite.has(texId)) firstTouchIsWrite.set(texId, true)
                if (inputs.has(texId)) selfSampled.add(texId)
            }
            for (const texId of inputs) {
                if (!firstTouchIsWrite.has(texId)) firstTouchIsWrite.set(texId, false)
            }
        }

        const groups = new Map() // physicalId -> [virtualIds]
        for (const [texId, physicalId] of allocations) {
            if (!physicalId || !textures.has(texId)) continue
            // Global surfaces are double-buffered and never pooled
            if (texId.startsWith('global')) continue
            // A texture a simulation step writes holds its value between steps.
            if (this._simulation?.heldTextures.has(texId)) continue
            if (firstTouchIsWrite.get(texId) === false) continue
            if (selfSampled.has(texId)) continue
            if (partiallyWritten.has(texId)) continue
            if (!groups.has(physicalId)) groups.set(physicalId, [])
            groups.get(physicalId).push(texId)
        }

        for (const members of groups.values()) {
            if (members.length < 2) continue
            const specs = members.map(id => textures.get(id))
            if (specs.some(spec => !spec ||
                spec.persistent === true ||
                spec.mipmaps === true ||
                spec.is3D === true)) {
                continue
            }
            const signature = spec => JSON.stringify([spec.width, spec.height, spec.format])
            const first = signature(specs[0])
            if (!specs.every(spec => signature(spec) === first)) continue

            const storageId = members[0]
            for (const member of members) aliases.set(member, storageId)
        }
        return aliases
    }

    /**
     * Destroy backend textures of pooling groups whose membership changed
     * since the previous plan, so the recreation loop rebuilds them with the
     * correct (standalone or re-grouped) sharing.
     */
    releaseRegroupedTextures(previousAliases, nextAliases) {
        if (!(previousAliases instanceof Map) || previousAliases.size === 0) return
        const groups = new Map()
        for (const [member, storage] of previousAliases) {
            if (!groups.has(storage)) groups.set(storage, [])
            groups.get(storage).push(member)
        }
        for (const [storage, members] of groups) {
            const unchanged = members.every(m => nextAliases.get(m) === storage)
            if (unchanged) continue
            for (const member of members) {
                if (this.backend.textures?.has?.(member)) {
                    this.backend.destroyTexture(member)
                }
            }
        }
    }

    /**
     * Point every pooled secondary member's backend map entry at its group's
     * shared storage record, so pass execution binds the same texture through
     * either id.
     */
    applyTextureAliases() {
        for (const [member, storage] of this._textureAliases) {
            if (member === storage) continue
            const record = this.backend.textures?.get?.(storage)
            if (!record) continue
            const existing = this.backend.textures?.get?.(member)
            if (existing && existing !== record) {
                this.backend.destroyTexture(member)
            }
            this.backend.textures?.set?.(member, record)
        }
    }

    /**
     * Query the actual runtime texture allocation/reuse plan.
     *
     * Reports the analyzer's physical allocation map (graph.allocations) and
     * the sharing the renderer actually materialized: non-global graph
     * textures grouped by identical backend texture record. With texture
     * pooling enabled, members of a `sharedTextures` group are served by one
     * physical texture; without it every virtual texture owns its own record.
     * @returns {object} { pooling, allocations, sharedTextures, textures }
     */
    getResourcePlan() {
        const textures = this.graph?.textures
        if (!textures) {
            return {
                pooling: this.texturePooling === true,
                allocations: new Map(),
                sharedTextures: [],
                textures: []
            }
        }
        const allocations = this.graph.allocations instanceof Map
            ? this.graph.allocations
            : new Map()

        const records = new Map() // backend record object -> { id, members }
        for (const [texId] of textures) {
            if (texId.startsWith('global')) continue
            const record = this.backend?.textures?.get?.(texId)
            if (!record) continue
            if (!records.has(record)) records.set(record, { id: texId, members: [] })
            records.get(record).members.push(texId)
        }

        const textureRecords = []
        const sharedTextures = []
        for (const { id, members } of records.values()) {
            const record = this.backend.textures.get(id)
            textureRecords.push({
                id,
                width: record?.width,
                height: record?.height,
                format: record?.format,
                virtualTextures: members
            })
            if (members.length > 1) sharedTextures.push(members)
        }

        return {
            pooling: this.texturePooling === true,
            allocations,
            sharedTextures,
            textures: textureRecords
        }
    }

    /**
     * Update parameter-dependent textures when uniforms change
     * Call this when volumeSize or similar sizing parameters change
     * @param {object} uniforms - Current uniform values
     */
    updateParameterTextures(uniforms = {}) {
        this.recreateTextures(uniforms)
        this.refreshMipTargets()
    }

    /**
     * Check if a value is an automation config (oscillator, midi, audio)
     * These should not be overwritten by setUniform calls
     * @param {any} value - Value to check
     * @returns {boolean} True if this is an automation config
     */
    isAutomationConfig(value) {
        return isAutomationValue(value)
    }

    /**
     * Set tile region for tiled large-resolution rendering.
     * When set, shaders receive tileOffset and fullResolution uniforms
     * so they can compute global coordinates across the full image.
     * @param {{offset: number[], fullResolution: number[], renderScale?: number}} region
     * @param {number[]} region.offset - [x, y] pixel offset of this tile in the full image
     * @param {number[]} region.fullResolution - [w, h] dimensions of the complete output image
     * @param {number} [region.renderScale] - scale factor vs original canvas (e.g. 5.86 for 6000px from 1024px)
     */
    setTileRegion({ offset, fullResolution, renderScale }) {
        this._tileOffset = offset
        this._fullResolution = fullResolution
        this._renderScale = renderScale ?? 1
    }

    /**
     * Clear tile region, returning to normal (non-tiled) rendering.
     */
    clearTileRegion() {
        this._tileOffset = null
        this._fullResolution = null
        this._renderScale = null
    }

    /**
     * Render the current graph once per cube face into 6 face pixel buffers.
     * Faces are ordered +X,-X,+Y,-Y,+Z,-Z (GL cubemap order). Each face is an
     * image with its top row first, on both backends.
     *
     * The returned array is reused and its entries overwritten on every call;
     * copy the faces (or their `data`) if you need to retain them across calls.
     * The render style (lit blob vs raw sample) is whichever cubemap renderer the
     * graph ends in (renderCubemap3d / renderCubemapSurface) — not a parameter here.
     * yieldBetweenFaces awaits an animation frame before each face render so a
     * host render loop keeps painting during large (e.g. 1024px) captures.
     *
     * onFace is awaited before each face's passes run. A scene program has no
     * cubemap-renderer shader for `cubeBasis` to reach, so its six faces come
     * from six renders of the scene through cube-face cameras — that is what
     * the hook does, drawing the face into the texture this pipeline then blits
     * and reads back. Everything else about the capture stays shared: the
     * resize, the face order, the readback and the reused return buffer.
     *
     * That hook order — the scene face BEFORE this pipeline's passes — is why
     * the scene path takes one priming render first. Whatever the scene reads
     * from this pipeline (a volume atlas a scene volume() marches, a surface a
     * material samples) is produced by these passes, so without priming, face 0
     * would read the last pre-export frame's while faces 1-5 read this export's.
     *
     * KNOWN LIMITATION: priming makes all six faces read state produced at the
     * same size and the same instant, but a stateful chain — cellularAutomata3d,
     * reactionDiffusion3d — advances one generation per render call, not per
     * `time`. Those still step once per face, so their six faces are six
     * consecutive generations rather than one. Fixing that means the pipeline
     * being able to replay a chain without advancing it, which it cannot.
     * @param {{size?:number, outputSurface?:string, time?:number, yieldBetweenFaces?:boolean, onFace?:?function(number):(void|Promise<void>)}} cfg
     * @returns {Promise<Array<{width:number,height:number,data:Uint8Array}>>} reused buffer — copy if retaining
     */
    async renderCubemap({ size = 512, outputSurface = 'o0', time = 0, yieldBetweenFaces = false, onFace = null } = {}) {
        // The faces of a capture share one simulation state: a render with no
        // due step runs only draw passes. A cube-rendering pass that is itself
        // a simulation step would hold face 0 for all six faces.
        const passes = this.graph?.passes || []
        for (const i of this._simulation?.stepPasses || []) {
            if (passes[i]?.uniforms && Object.hasOwn(passes[i].uniforms, 'cubeBasis')) {
                throw new Error(`renderCubemap: the cube-rendering pass ${passes[i].id} is a simulation step (it feeds simulation state), so its six faces cannot differ`)
            }
        }
        // A capture is not an edit: a pending edit mark never steps a face.
        this.clock.clearEdit()
        const prevW = this.width, prevH = this.height
        if (this.width !== size || this.height !== size) this.resize(size, size)
        if (!this._cubeFaces) this._cubeFaces = new Array(6)
        try {
            // Prime, for the scene path only: a 2D graph's own passes ARE the
            // face, so an extra render before face 0 would only advance it.
            // After the resize, so what the faces read was produced at the size
            // they read it at.
            if (onFace) this.render(time)
            for (let face = 0; face < 6; face++) {
                if (yieldBetweenFaces) {
                    // Race rAF against a timer: rAF alone never fires in a
                    // hidden/backgrounded tab, which would otherwise stall this
                    // loop indefinitely instead of just yielding a paint.
                    await new Promise((resolve) => {
                        let settled = false
                        const finish = () => {
                            if (settled) return
                            settled = true
                            resolve()
                        }
                        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finish)
                        setTimeout(finish, 120)
                    })
                }
                this.setUniform('cubeBasis', CUBE_FACE_BASES[face])
                if (onFace) await onFace(face)
                this.render(time)
                const surface = this.surfaces.get(outputSurface)
                if (!surface) {
                    throw new Error(`renderCubemap: output surface "${outputSurface}" not found — the composition must write its result to it (e.g. .renderCubemapSurface().write(${outputSurface}), or scene(...).write(${outputSurface}))`)
                }
                const pixels = await this.backend.readPixels(surface.read)
                // WebGPU holds a surface bottom row first and reads it back as
                // it holds it. WebGL2's readback is already top row first.
                this._cubeFaces[face] = this.backend.getName() === 'WebGPU' ? reverseRows(pixels) : pixels
            }
        } finally {
            // In a finally: a face that throws — a missing surface, a failed
            // readback, a scene hook that rejected — must not strand the canvas
            // at export resolution until something else happens to resize it.
            if (prevW !== size || prevH !== size) this.resize(prevW, prevH)
        }
        return this._cubeFaces
    }

    /**
     * Copy the live state under one element key into another, for a host
     * that renames an element (CanvasRenderer.moveState()). A key is a state
     * texture id that CanvasRenderer.keyOf() returns: both halves of a state
     * surface (`global_…`) are copied, or one node-local texture. The from-key
     * can also be the position key of that state in the program compiled just
     * before this one (CanvasRenderer.stateKeysOf()), as for an element that
     * gains an `_id:`. A host's upload to a media step is moved instead, from
     * another key or from the step-numbered id of a step that gains an `_id:`.
     * Nothing is stored outside the program text.
     * @param {string} fromKey - The key that holds the state
     * @param {string} toKey - The key that takes it
     * @returns {boolean} False when a key holds no state, the two keys are
     *   not one state of one op under two element ids (or that state's key in
     *   the previous program, or an upload's step-numbered id and its key), a
     *   step still binds the upload, or a texture is 3D or of another format
     */
    moveState(fromKey, toKey) {
        if (typeof fromKey !== 'string' || typeof toKey !== 'string' || fromKey === toKey) return false
        // Both keys name one state of one op, under two element ids: the
        // to-key is a state of an element of the current program, and the
        // from-key is that state's name under another id of the same op.
        if (!this.isRenameOf(fromKey, toKey)) return false
        // An uploaded texture (a media step's) is the host's, not the graph's:
        // it moves to the new key.
        if (this.graph?.mediaSteps?.some(step => step.textureId === toKey)) {
            // An upload that a step of the program still binds stays with it.
            if (this.graph.mediaSteps.some(step => step.textureId === fromKey)) return false
            if (typeof this.backend?.moveTexture === 'function') return this.backend.moveTexture(fromKey, toKey)
            const record = this.backend?.textures?.get?.(fromKey)
            if (!record) return false
            if (this.backend.textures.has(toKey)) this.backend.destroyTexture(toKey)
            this.backend.textures.set(toKey, record)
            this.backend.textures.delete(fromKey)
            return true
        }
        const textures = (key) => {
            if (key.startsWith('global_')) {
                const surface = this.surfaces.get(this.parseGlobalName(key))
                return surface ? [surface.read, surface.write] : null
            }
            return this.backend?.textures?.has?.(key) ? [key] : null
        }
        const from = textures(fromKey)
        const to = textures(toKey)
        if (!from || !to || from.length !== to.length) return false
        // A copy needs two 2D textures of one format.
        for (let i = 0; i < from.length; i++) {
            const a = this.backend.textures?.get?.(from[i])
            const b = this.backend.textures?.get?.(to[i])
            if (!a || !b || a.format !== b.format || a.depth > 1 || b.depth > 1 || a.is3D || b.is3D) return false
        }
        for (let i = 0; i < from.length; i++) this.backend.copyTexture(from[i], to[i])
        return true
    }

    /**
     * Whether `fromKey` is the state `toKey` names, under another element id
     * of the same op, or as an element of the same op held it in the program
     * compiled just before this one. `toKey` is a state of an element of the
     * current program (graph.elementKeys); its state name and op fix where
     * the id stands.
     * @param {string} fromKey
     * @param {string} toKey
     * @returns {boolean}
     */
    isRenameOf(fromKey, toKey) {
        for (const element of Object.values(this.graph?.elementKeys || {})) {
            for (const [name, keyed] of Object.entries(element.state)) {
                if (keyed !== toKey) continue
                // The same state of a step of the same op in the previous
                // program, by its position key or its key under another id,
                // unless the current program gives that key to another effect
                // or another state: the texture then holds that state.
                const previous = Object.values(this.previousStepStateKeys || {})
                if (previous.some(step => step.op === element.op && step.state[name] === fromKey)) {
                    return !this.isCurrentKey(fromKey) || Object.values(this.graph.stepStateKeys || {})
                        .some(step => step.op === element.op && step.state[name] === fromKey)
                }
                const [prefix, suffix] = keyed === `${name}_${element.key}` ? [`${name}_`, '']
                    : keyed === `${element.key}_${name}` ? ['', `_${name}`] : [null, null]
                if (prefix === null) return false
                // An uploaded texture's step-numbered id, as an element without
                // an `_id:` binds it, moves to its key when the element gains one.
                const uploaded = this.graph?.mediaSteps?.some(step => step.textureId === toKey)
                if (uploaded && suffix === `_${name}` && fromKey.startsWith(`${name}_step_`) &&
                    /^\d+$/.test(fromKey.slice(`${name}_step_`.length))) return true
                if (!fromKey.startsWith(prefix) || !fromKey.endsWith(suffix)) return false
                const fromElement = fromKey.slice(prefix.length, fromKey.length - suffix.length)
                const id = fromElement.match(ELEMENT_KEY)
                return Boolean(id) && id[2] === element.op && fromElement !== element.key
            }
        }
        return false
    }

    /**
     * Whether the current program uses a texture id: as a texture it
     * allocates, or as a pass input or output.
     * @param {string} key
     * @returns {boolean}
     */
    isCurrentKey(key) {
        if (this.graph?.textures?.has?.(key)) return true
        return (this.graph?.passes || []).some(pass =>
            Object.values(pass.inputs || {}).includes(key) || Object.values(pass.outputs || {}).includes(key))
    }

    /**
     * The id an element's own textures carry: its state key when the element
     * is keyed by its `_id:`, and its node id otherwise.
     * @param {string} nodeId - The element's node id
     * @returns {string}
     */
    stateIdOf(nodeId) {
        return this.graph?.passes?.find(pass => pass.nodeId === nodeId)?.stateId ?? nodeId
    }

    /**
     * Set a global uniform value
     * Automatically triggers texture resizing if the parameter affects texture dimensions
     * NOTE: Does not overwrite automation configs (oscillator, midi, audio) in pass uniforms
     * @param {string} name - Uniform name
     * @param {any} value - Uniform value
     */
    setUniform(name, value) {
        // Apply mobile stateSize cap for particle systems
        // This prevents OOM on mobile devices with limited GPU memory
        if ((name === 'stateSize' || name.startsWith('stateSize_node_') || name.startsWith('stateSize_id_')) && typeof value === 'number') {
            const maxStateSize = this.backend?.capabilities?.maxStateSize || 2048
            if (value > maxStateSize) {
                console.warn(`[Pipeline] Capping stateSize from ${value} to ${maxStateSize} for device compatibility`)
                value = maxStateSize
            }
        }

        // Clamp volumeSize so the 3D volume atlas (volumeSize × volumeSize²)
        // fits the device's max texture size — see clampVolumeSize(). A chain
        // a scene volume() marches is pinned instead: the volN globals are a
        // fixed size regardless of the device, so the clamp cannot help there
        // and the pin has to win.
        if (this.isVolumeSizeUniform(name) && typeof value === 'number') {
            value = this.clampVolumeSize(value)
            // An unscoped write fans out to every `_chain_N` variant below, so
            // a pin on any one chain constrains it. A scoped write reaches
            // only its own chain.
            let scopeName = name
            if (name === 'volumeSize' && !this.sceneVolumeAtlasConstraint(name)) {
                const pinned = Object.keys(this.graph?.sceneVolumeAtlasScopes || {})
                if (pinned.length > 0) scopeName = pinned[0]
            }
            value = this.applySceneVolumeAtlasConstraint(scopeName, value)
        }

        const oldValue = this.globalUniforms[name]
        this.globalUniforms[name] = value

        // Legacy classicNoisedeck palette expansion:
        // When the 'palette' uniform is set with an integer, expand the preset
        // into the dependent vec3/int uniforms the shaders expect. The palette
        // uniform itself is written too, as the UI parameter paths write it:
        // an effect whose `palette` is an ordinary choice (filter/dither)
        // reads only that.
        if (name === 'palette' && typeof value === 'number') {
            const expanded = expandPalette(value)
            if (expanded) {
                for (const [uName, uValue] of Object.entries(expanded)) {
                    this.setUniform(uName, uValue)
                }
            }
        }

        // Scoped uniforms (e.g. stateSize_node_5, volumeSize_chain_0) target
        // exactly one chain or particle pipeline; don't fan out to siblings.
        const isScopedUniform = /_node_\d+$/.test(name) || /_chain_\d+$/.test(name) || ELEMENT_SCOPED.test(name)

        // Update the uniform in all passes that reference it.
        //
        // For unscoped sizing names (zoom, volumeSize, stateSize), also fan
        // out to chain-scoped (`_chain_N`) and node-scoped (`_node_N`) variants.
        // This is the legacy "host wants to set this for the whole pipeline"
        // path used by docs viewer, MCP harness, foundry, etc., which work
        // with single-chain DSLs. For multi-chain DSLs the DSL itself supplies
        // per-chain values via the expander; callers that want to update one
        // chain at runtime should use applyStepParameterValues / _applyToPipeline,
        // which write the scoped names directly and never enter this branch.
        if (this.graph && this.graph.passes) {
            for (const pass of this.graph.passes) {
                if (pass.uniforms && name in pass.uniforms) {
                    // Don't overwrite automation configs (oscillators, midi, audio)
                    // These are set by the DSL and should take precedence over UI/defaults
                    const currentValue = pass.uniforms[name]
                    if (!this.isAutomationConfig(currentValue)) {
                        pass.uniforms[name] = value
                    }
                }
                // Shader uniforms the pass feeds from this parameter under
                // another name (uniforms: { mixAmt: "mix" }), as the UI
                // parameter paths do.
                if (pass.uniformAliases && pass.uniforms) {
                    for (const [shaderName, globalName] of Object.entries(pass.uniformAliases)) {
                        if (globalName !== name || this.isAutomationConfig(pass.uniforms[shaderName])) continue
                        pass.uniforms[shaderName] = Array.isArray(value) ? value.slice() : value
                    }
                }
                if (!isScopedUniform && pass.uniforms) {
                    for (const key of Object.keys(pass.uniforms)) {
                        if (key.startsWith(name + '_node_') || key.startsWith(name + '_chain_') || key.startsWith(name + '_id_')) {
                            const currentValue = pass.uniforms[key]
                            if (!this.isAutomationConfig(currentValue)) {
                                pass.uniforms[key] = value
                                this.globalUniforms[key] = value
                            }
                        }
                    }
                }
            }
        }

        // An asyncInit effect (the fibers, scratches and strayHair CPU
        // overlays) draws its overlay from its params: re-run it when one of
        // them changes, as the UI parameter paths do through checkAsyncRegen.
        // checkAsyncRegen compares with the values each node's overlay was
        // drawn from, so this needs no comparison with the global value.
        if (this.graph && this.graph.passes) {
            this._regenAsyncForUniform(name)
        }

        // Check if this uniform affects any texture dimensions
        // Include both direct matches and scoped variants (e.g., stateSize_node_1)
        if (oldValue !== value && this.graph && this.graph.textures) {
            let affectsTextures = false
            for (const spec of this.graph.textures.values()) {
                if (this.dimensionReferencesParam(spec.width, name) ||
                    this.dimensionReferencesParam(spec.height, name) ||
                    (spec.depth && this.dimensionReferencesParam(spec.depth, name)) ||
                    this.dimensionReferencesScopedParam(spec.width, name) ||
                    this.dimensionReferencesScopedParam(spec.height, name) ||
                    (spec.depth && this.dimensionReferencesScopedParam(spec.depth, name))) {
                    affectsTextures = true
                    break
                }
            }

            if (affectsTextures) {
                // Chain- and node-scoped sizing values live only in pass
                // uniforms. Resolving from globalUniforms alone shrinks every
                // other scoped texture to its fallback size.
                // Pass values also take precedence in the backends: UI updates
                // can leave older sizing values cached in globalUniforms.
                this.updateParameterTextures({ ...this.globalUniforms, ...this.collectDefaultUniforms() })
            }
        }
    }

    /**
     * Broadcast a runtime update to a chain-scoped param to all other passes
     * in the same chain. The scoped variant name (e.g. 'volumeSize_chain_0')
     * uniquely identifies chain membership — any pass that has it in its
     * uniforms belongs to that chain (the expander seeds it via pipelineUniforms
     * propagation, so every pass in the chain holds a copy).
     *
     * Without this broadcast, runtime updates would leave per-pass copies
     * inconsistent, and `collectDefaultUniforms()`'s last-write-wins merge
     * would pick a stale value — causing atlas sizing to ignore the source
     * emitter's new value.
     *
     * For consumer passes that inherit the unscoped uniform from upstream
     * (`pass.inheritsVolumeSize`), also update the unscoped value so the
     * shader sees the new size. Currently only volumeSize has this inherit
     * semantics; downstream 3D effects use it.
     */
    broadcastChainScopedParam(sourcePass, uniformName, scopedName) {
        if (!this.graph || !this.graph.passes || !sourcePass.uniforms) return
        let value = sourcePass.uniforms[uniformName]
        if (uniformName === 'volumeSize' && typeof value === 'number') {
            // Device clamp first, then the scene volume() pin — a marched
            // atlas has one legal size and the clamp cannot satisfy it.
            const resolved = this.applySceneVolumeAtlasConstraint(
                scopedName, this.clampVolumeSize(value))
            if (resolved !== value) {
                value = resolved
                // The UI paths write the raw value to the source pass before
                // broadcasting; keep the source aligned with what the chain gets.
                sourcePass.uniforms[uniformName] = resolved
                if (scopedName in sourcePass.uniforms) {
                    sourcePass.uniforms[scopedName] = resolved
                }
            }
        }
        for (const otherPass of this.graph.passes) {
            if (otherPass === sourcePass || !otherPass.uniforms) continue
            if (!(scopedName in otherPass.uniforms)) continue
            otherPass.uniforms[scopedName] = value
            if (uniformName === 'volumeSize' &&
                otherPass.inheritsVolumeSize &&
                uniformName in otherPass.uniforms) {
                otherPass.uniforms[uniformName] = value
            }
        }
    }

    /**
     * Check if a dimension spec references a specific parameter directly.
     * Matches both `{ param: 'X' }` (used by 3D atlases, particle state) and
     * `{ screenDivide: 'X' }` (used by sim surfaces).
     * @param {number|string|object} spec - Dimension specification
     * @param {string} paramName - Parameter name to check for
     * @returns {boolean} True if the spec references the parameter
     */
    dimensionReferencesParam(spec, paramName) {
        return typeof spec === 'object' && spec !== null &&
               (spec.param === paramName || spec.screenDivide === paramName)
    }

    /**
     * Check if a dimension spec references a scoped variant of a parameter.
     * Scoped params take two forms:
     *   - `paramName_node_N` (per-particle-pipeline, e.g. stateSize_node_5)
     *   - `paramName_chain_N` (per-chain, e.g. volumeSize_chain_0, zoom_chain_0)
     *   - `paramName_id_<id>@<op>` (per element with an `_id:`, e.g. zoom_id_pond@synth.reactionDiffusion)
     * @param {number|string|object} spec - Dimension specification
     * @param {string} paramName - Base parameter name to check for
     * @returns {boolean} True if the spec references a scoped version of the parameter
     */
    dimensionReferencesScopedParam(spec, paramName) {
        if (typeof spec !== 'object' || spec === null) return false
        const ref = (typeof spec.param === 'string') ? spec.param
                  : (typeof spec.screenDivide === 'string') ? spec.screenDivide
                  : null
        if (!ref) return false
        return ref.startsWith(paramName + '_node_') ||
               ref.startsWith(paramName + '_chain_') ||
               ref.startsWith(paramName + '_id_')
    }

    /**
     * Resolve dimension spec to actual pixel value
     * @param {number|string|object} spec - Dimension specification
     * @param {number} screenSize - Screen dimension for relative specs
     * @param {object} [uniforms] - Current uniform values for param references
     */
    resolveDimension(spec, screenSize, uniforms = {}) {
        if (typeof spec === 'number') {
            return Math.max(1, Math.floor(spec))
        }

        // 'input' and 'resolution' are validator-accepted dimension keywords
        // (DIM_KEYWORDS in effect-validator.js) whose historical resolution
        // is the screen dimension; they are recognized forms, not unknown
        // fallbacks, so they add no diagnostic.
        if (spec === 'screen' || spec === 'auto' || spec === 'input' || spec === 'resolution') {
            return screenSize
        }

        if (typeof spec === 'string' && spec.endsWith('%')) {
            const percent = parseFloat(spec)
            return Math.max(1, Math.floor(screenSize * percent / 100))
        }

        if (typeof spec === 'object') {
            // Handle parameter reference: { param: 'volumeSize' }
            if (spec.param !== undefined) {
                // Get the parameter value from uniforms, or use paramDefault/64 as fallback
                // NOTE: 'default' is used as the FINAL computed fallback when power/multiply
                // are present. Use 'paramDefault' to specify the param's own default.
                const hasTransform = spec.power !== undefined || spec.multiply !== undefined
                const paramDefault = spec.paramDefault ?? 64  // Default param value

                // If param is in uniforms, use it. Otherwise use paramDefault for computation.
                let value = uniforms[spec.param] ?? paramDefault

                // Apply multiplier if specified: { param: 'volumeSize', multiply: 2 }
                if (spec.multiply !== undefined) {
                    value *= spec.multiply
                }

                // Apply power if specified: { param: 'volumeSize', power: 2 } means value^2
                if (spec.power !== undefined) {
                    value = Math.pow(value, spec.power)
                }

                // If we have a transform AND the param wasn't found in uniforms AND
                // a 'default' is specified, use 'default' as the final computed value
                // This allows specs like { param: 'volumeSize', power: 2, default: 4096 }
                // where 4096 is the intended height when volumeSize=64 (64^2=4096)
                if (hasTransform && uniforms[spec.param] === undefined && spec.default !== undefined) {
                    value = spec.default
                }

                // Func wrappers and other nonnumeric authored values are not
                // evaluated by the runtime. Use the texture spec's existing
                // numeric default so backends never allocate a NaN size.
                if (!Number.isFinite(Number(value))) {
                    if (spec.default !== undefined) {
                        value = spec.default
                    } else {
                        value = paramDefault
                        if (spec.multiply !== undefined) value *= spec.multiply
                        if (spec.power !== undefined) value = Math.pow(value, spec.power)
                    }
                }

                return Math.max(1, Math.floor(value))
            }

            // Handle screen-divide spec: { screenDivide: 'zoom' }
            // Resolves to screenSize / uniforms[param], for per-effect zoom scaling
            if (spec.screenDivide !== undefined) {
                let divisor = uniforms[spec.screenDivide] ?? spec.default ?? 1
                if (!Number.isFinite(Number(divisor))) divisor = spec.default ?? 1
                return Math.max(1, Math.round(screenSize / divisor))
            }

            // Handle scale-based spec
            if (spec.scale !== undefined) {
                let computed = Math.floor(screenSize * spec.scale)
                if (spec.clamp) {
                    if (spec.clamp.min !== undefined) {
                        computed = Math.max(spec.clamp.min, computed)
                    }
                    if (spec.clamp.max !== undefined) {
                        computed = Math.min(spec.clamp.max, computed)
                    }
                }
                return Math.max(1, computed)
            }
        }

        // Unknown dimension forms keep the historical screen-size fallback
        // (no new rejection of previously accepted input), but surface it as
        // a structured diagnostic instead of pure silence. An
        // absent spec is a default, not an unknown form.
        if (spec !== undefined && spec !== null) {
            let key = typeof spec === 'object' ? null : String(spec)
            if (key === null) {
                try {
                    key = JSON.stringify(spec)
                } catch {
                    key = '[unserializable]'
                }
            }
            if (!this._warnedDimensionFallbacks.has(key)) {
                this._warnedDimensionFallbacks.add(key)
                console.warn(`[Pipeline] Unknown dimension spec ${key}; falling back to screen size (${screenSize})`)
                this.diagnostics.add({
                    code: 'ERR_DIMENSION_FALLBACK',
                    backend: this.backend && typeof this.backend.getName === 'function'
                        ? this.backend.getName()
                        : 'unknown',
                    stage: 'dimension',
                    spec: key,
                    fallback: 'screen'
                })
            }
        }

        return screenSize
    }

    _setTimeReference(time) {
        this.lastTime = time
        this._hasTimeReference = true
    }

    /**
     * Sync the internal time reference to a specific value.
     * Call this when pausing to ensure subsequent paused renders have deltaTime = 0.
     * @param {number} time - The normalized time value to sync to
     */
    syncTime(time) {
        this._setTimeReference(time)
        // A seek: the clock moves without stepping, and the state is kept.
        this.clock.seek(time)
    }

    /**
     * Execute a single frame.
     * Skips rendering if compilation is in progress to avoid race conditions
     * where passes reference programs that haven't been compiled yet.
     */
    render(time = 0, presentationTimestamp) {
        // Skip rendering if compilation is in progress
        // This prevents ERR_PROGRAM_NOT_FOUND errors when the graph has been
        // updated but programs haven't finished compiling yet
        if (this.isCompiling) {
            return
        }

        // A graph with simulation state runs on the fixed-step clock. A graph
        // without it renders exactly as before the clock.
        if (this.hasSimulation) {
            this.advance(time)
            this.draw(presentationTimestamp)
            return
        }

        // Normalized time wraps once per loop.
        let deltaTime = this._hasTimeReference ? time - this.lastTime : 0
        if (deltaTime < 0) deltaTime += 1
        this._setTimeReference(time)

        // Update global uniforms
        this.updateGlobalUniforms(time, deltaTime)

        // Production lifecycle hooks: per-effect onUpdate, and the
        // uniforms each hook returns are bound over the pass uniforms below.
        this._invokeUpdateHooks(time, deltaTime)

        // Initialize per-frame surface bindings so within-frame reads see fresh writes
        // Clear and reuse Maps to avoid per-frame allocation
        this.frameReadTextures.clear()
        this.frameWriteTextures.clear()
        for (const [name, surface] of this.surfaces.entries()) {
            this.frameReadTextures.set(name, surface.read)
            this.frameWriteTextures.set(name, surface.write)  // Start by writing to write buffer
        }

        // Begin frame
        this.backend.beginFrame(this.getFrameState())

        // Track passes executed this frame
        let passCount = 0

        // Execute passes
        if (this.graph && this.graph.passes) {
            try {
                for (let i = 0; i < this.graph.passes.length; i++) {
                    passCount += this.executeGraphPass(this.graph.passes[i], time)
                }
            } catch (loopErr) {
                console.error(`[Pipeline.render] LOOP ERROR: ${loopErr.detail || loopErr.message || JSON.stringify(loopErr)}`)
                throw loopErr
            }
        }

        // Regenerate mip chains of mipmapped textures from their level-0
        // contents written by this frame's passes.
        if (this._mipTargets.length > 0 && typeof this.backend.generateMipmaps === 'function') {
            this.backend.generateMipmaps(this._mipTargets)
        }

        // End frame
        this.backend.endFrame()

        this.presentRenderSurface(presentationTimestamp)

        // Swap double buffers for global surfaces
        this.swapBuffers()

        // Store pass count for this frame
        this.lastPassCount = passCount

        this.frameIndex++
    }

    /**
     * Run one graph pass at a loop time: resolve its uniforms and viewport,
     * apply its conditions and repeat count, and execute it.
     * @param {object} originalPass - A pass of the graph
     * @param {number} time - Loop time for the pass's uniforms
     * @param {Set<string>} [writtenSurfaces] - Collects the global surfaces it writes
     * @returns {number} The number of pass executions
     */
    executeGraphPass(originalPass, time, writtenSurfaces) {
        // Resolve authored viewport specs before the
        // oscillator proxy is built so the proxy can carry the
        // cached resolved box; re-resolve after uniform
        // resolution so param-driven viewports track the
        // frame's uniform values.
        if (originalPass.viewport !== undefined) {
            this.resolvePassViewport(originalPass)
        }
        let pass = this.resolvePassUniforms(originalPass, time)
        if (originalPass.viewport !== undefined) {
            this.resolvePassViewport(pass, originalPass)
        }
        // Bind onUpdate-returned uniforms. Fallback
        // semantics: a returned uniform binds only when the pass
        // does not already resolve that key, so authored and
        // step-provided values keep priority. Rare: only effects
        // with an onUpdate hook that returned uniforms contribute.
        if (this._hasRuntimeUniforms && pass.effectKey !== undefined) {
            const runtimeUniforms = this._runtimeUniforms.get(pass.effectKey)
            if (runtimeUniforms) {
                pass = this._withRuntimeUniforms(pass, runtimeUniforms)
            }
        }
        // Check pass conditions
        if (this.shouldSkipPass(pass)) {
            return 0
        }

        // Determine iteration count (repeat N times per frame)
        const repeatCount = this.resolveRepeatCount(pass)

        let count = 0
        for (let iter = 0; iter < repeatCount; iter++) {
            // Execute pass
            try {
                const state = this.getFrameState()
                this.backend.executePass(pass, state)
                count++
                this.updateFrameSurfaceBindings(pass, state)
            } catch (err) {
                console.error(`[Pipeline.render] ERROR executing pass ${pass.id}: ${err.detail || err.message || JSON.stringify(err)}`)
                throw err
            }

            // Adopt this iteration's frame-local ping-pong bindings into
            // the cross-frame surface record (frame-local maps remain
            // the source of truth -- see adoptIterationBindings() doc).
            if (repeatCount > 1) {
                this.adoptIterationBindings(pass)
            }
        }
        if (writtenSurfaces && count > 0) {
            for (const id of Object.values(pass.outputs || pass.storageTextures || {})) {
                const name = this.parseGlobalName(id)
                if (name) writtenSurfaces.add(name)
            }
        }
        return count
    }

    /**
     * Submit the render surface to the sinks: the canvas and frame export.
     * Uses the explicit render() directive's surface.
     * @param {number} [presentationTimestamp]
     */
    presentRenderSurface(presentationTimestamp) {
        const renderSurfaceName = this.graph?.renderSurface
        if (renderSurfaceName) {
            const renderSurface = this.surfaces.get(renderSurfaceName)
            if (renderSurface) {
                const presentId = this.frameReadTextures?.get(renderSurfaceName) ?? renderSurface.read
                if (presentationTimestamp === undefined) {
                    presentationTimestamp = typeof performance !== 'undefined' && typeof performance.now === 'function'
                        ? performance.now()
                        : Date.now()
                }
                this.sinkManager.submit(presentId, presentationTimestamp)
            }
        }
    }

    /**
     * Advance the simulation to loop time `time`: run each due grid step's
     * step passes, at the step's time, with deltaTime = 1 / N and frame = the
     * steps since the last start. Then run the draw passes that do not depend
     * on a scene image. The frame stays open for draw().
     *
     * A host that renders a scene between them calls advance(), then
     * endSceneSplit() and its scene render, then draw(). render() calls
     * advance() and draw().
     * @param {number} time - Loop time in [0, 1)
     */
    advance(time) {
        if (this.isCompiling) return
        const simulation = this._simulation
        const result = this.clock.advance(time, { stopped: !this._loopRunning })
        this._setTimeReference(time)
        this.lastClockResult = result

        // Once a render: the global uniforms (and the MIDI note grid) and the
        // lifecycle hooks, at the render time.
        this.updateGlobalUniforms(time, result.deltaTime)
        this._invokeUpdateHooks(time, result.deltaTime)

        this.frameReadTextures.clear()
        this.frameWriteTextures.clear()
        for (const [name, surface] of this.surfaces.entries()) {
            this.frameReadTextures.set(name, surface.read)
            this.frameWriteTextures.set(name, surface.write)
        }
        this._writtenSurfaces = new Set()
        this._passCount = 0
        this._advancedGraph = this.graph
        this._frameOpen = true
        this.backend.beginFrame(this.getFrameState())

        const passes = this.graph?.passes || []
        const g = this.globalUniforms
        const stepSize = this.clock.stepSize
        const firstFrame = this.clock.stepsSinceStart - result.steps.length
        try {
            result.steps.forEach((step, index) => {
                const stepTime = this.clock.stepTime(step)
                g.time = stepTime
                g.deltaTime = stepSize
                g.frame = firstFrame + index
                for (let i = 0; i < passes.length; i++) {
                    if (!simulation.stepPasses.has(i)) continue
                    this._passCount += this.executeGraphPass(passes[i], stepTime, this._writtenSurfaces)
                }
            })
            // Draw passes see the render time and the time since the previous render.
            g.time = time
            g.deltaTime = result.deltaTime
            g.frame = this.frameIndex
            for (let i = 0; i < passes.length; i++) {
                if (simulation.stepPasses.has(i) || simulation.sceneDrawPasses.has(i)) continue
                this._passCount += this.executeGraphPass(passes[i], time, this._writtenSurfaces)
            }
        } catch (loopErr) {
            console.error(`[Pipeline.render] LOOP ERROR: ${loopErr.detail || loopErr.message || JSON.stringify(loopErr)}`)
            this.backend.endFrame()
            this._frameOpen = false
            throw loopErr
        }
    }

    /**
     * Close the frame that advance() opened and publish the surfaces it wrote,
     * so a scene render that samples pipeline surfaces reads this render's
     * state. draw() then opens a new frame for the draw passes that depend on
     * the scene image.
     */
    endSceneSplit() {
        if (!this._frameOpen) return
        this.backend.endFrame()
        this._frameOpen = false
        this.publishWrittenSurfaces()
    }

    /**
     * Run the draw passes that depend on a scene image, close the frame,
     * present, and publish the surfaces this render wrote.
     * @param {number} [presentationTimestamp]
     */
    draw(presentationTimestamp) {
        if (this.isCompiling || !this._writtenSurfaces) return
        // A recompile between advance() and draw(), for example during a scene
        // render, replaced the graph: render the new graph whole at this time.
        if (this.graph !== this._advancedGraph) {
            if (this._frameOpen) {
                this.backend.endFrame()
                this._frameOpen = false
            }
            this._writtenSurfaces = null
            this.render(this.lastTime, presentationTimestamp)
            return
        }
        const simulation = this._simulation
        const passes = this.graph?.passes || []
        if (simulation.sceneDrawPasses.size > 0) {
            if (!this._frameOpen) {
                this.backend.beginFrame(this.getFrameState())
                this._frameOpen = true
            }
            try {
                for (const i of simulation.sceneDrawPasses) {
                    this._passCount += this.executeGraphPass(passes[i], this.lastTime, this._writtenSurfaces)
                }
            } catch (loopErr) {
                console.error(`[Pipeline.render] LOOP ERROR: ${loopErr.detail || loopErr.message || JSON.stringify(loopErr)}`)
                this.backend.endFrame()
                this._frameOpen = false
                throw loopErr
            }
        }
        if (!this._frameOpen) {
            this.backend.beginFrame(this.getFrameState())
            this._frameOpen = true
        }
        if (this._mipTargets.length > 0 && typeof this.backend.generateMipmaps === 'function') {
            this.backend.generateMipmaps(this._mipTargets)
        }
        this.backend.endFrame()
        this._frameOpen = false

        this.presentRenderSurface(presentationTimestamp)
        this.publishWrittenSurfaces()
        for (const surface of this.surfaces.values()) surface.currentFrame = this.frameIndex

        this.lastPassCount = this._passCount
        this._writtenSurfaces = null
        this.frameIndex++
    }

    /**
     * After a simulation render, a surface that a pass wrote takes the
     * frame's final bindings, so its read buffer is its last write; a surface
     * that no pass wrote keeps its bindings.
     */
    publishWrittenSurfaces() {
        for (const name of this._writtenSurfaces || []) {
            const surface = this.surfaces.get(name)
            const finalRead = this.frameReadTextures.get(name)
            const finalWrite = this.frameWriteTextures.get(name)
            if (surface && finalRead && finalWrite) {
                surface.read = finalRead
                surface.write = finalWrite
            }
        }
    }

    /**
     * Update global uniforms (time, resolution, etc.)
     * Mutates existing object to avoid per-frame allocation
     */
    updateGlobalUniforms(time, deltaTime) {
        const g = this.globalUniforms
        const aspectValue = this.width / this.height
        // Update time-varying uniforms in place
        g.time = time
        g.deltaTime = deltaTime
        g.frame = this.frameIndex
        // Reuse or create resolution array
        if (!g.resolution) {
            g.resolution = [this.width, this.height]
        } else {
            g.resolution[0] = this.width
            g.resolution[1] = this.height
        }
        // Tile region uniforms for tiled large-resolution export
        // Defaults (tileOffset=0, fullResolution=resolution) are no-ops
        if (!g.tileOffset) {
            g.tileOffset = [0, 0]
        }
        if (!g.fullResolution) {
            g.fullResolution = [this.width, this.height]
        }
        if (this._tileOffset) {
            g.tileOffset[0] = this._tileOffset[0]
            g.tileOffset[1] = this._tileOffset[1]
        } else {
            g.tileOffset[0] = 0
            g.tileOffset[1] = 0
        }
        if (this._fullResolution) {
            g.fullResolution[0] = this._fullResolution[0]
            g.fullResolution[1] = this._fullResolution[1]
            // When tiling, aspect ratio uses full image dimensions
            const fullAspect = this._fullResolution[0] / this._fullResolution[1]
            g.aspect = fullAspect
            g.aspectRatio = fullAspect
            // Correctly-rounded reciprocal of the aspect, used by rotate2D's
            // final rescale so neither backend evaluates an in-shader
            // division there (Dawn lowers divisions to approximate
            // reciprocal multiplies; ANGLE divides correctly).
            g.aspectInv = 1.0 / fullAspect
            // Correctly-rounded per-component reciprocals. Both shader mains
            // multiply by this instead of dividing: Dawn's relaxed math lowers
            // a vec2 division to an approximate reciprocal multiply while
            // ANGLE divides correctly, and the 1-2 ulp uv difference flips
            // sampler taps. A multiply of identical values is deterministic.
            g.invFullResolution = [
                1.0 / this._fullResolution[0],
                1.0 / this._fullResolution[1],
            ]
        } else {
            g.fullResolution[0] = this.width
            g.fullResolution[1] = this.height
            g.aspect = aspectValue
            g.aspectRatio = aspectValue
            g.aspectInv = 1.0 / aspectValue
            g.invFullResolution = [1.0 / this.width, 1.0 / this.height]
        }
        g.renderScale = this._renderScale || 1.0

        // Audio data (128 float arrays, 0-1)
        if (this.externalState.audio?.waveform) {
            g.audioWaveform = this.externalState.audio.waveform
        }
        if (this.externalState.audio?.spectrum) {
            g.audioSpectrum = this.externalState.audio.spectrum
        }

        // MIDI note grid (128x16 RGBA float texture)
        if (this.externalState.midi) {
            this.externalState.midi.updateNoteGrid()
            this.backend.uploadDataTexture('midiNoteGrid', this.externalState.midi.noteGrid, 128, 16)
            g.midiClockCount = this.externalState.midi.clockCount
        } else if (this._needsMidiNoteGrid) {
            if (!this._emptyNoteGrid) this._emptyNoteGrid = new Float32Array(128 * 16 * 4)
            this.backend.uploadDataTexture('midiNoteGrid', this._emptyNoteGrid, 128, 16)
        }
        g.midiClockCount = g.midiClockCount || 0
    }

    /**
     * Resolve automation values (oscillators, MIDI, audio) in a uniform value.
     * If the value is an automation configuration, evaluate it and scale by consumer range.
     * @param {any} value - The uniform value (may be an automation config)
     * @param {number} time - Current time in seconds
     * @param {Object} [paramSpec] - Consumer parameter range { min, max }
     * @returns {any} The resolved value
     */
    resolveUniformValue(value, time, paramSpec) {
        if (!isAutomationValue(value)) return value
        // `time` is already normalized 0..1 by CanvasRenderer. Recursive
        // evaluation uses the same absolute time, so seeking and export remain
        // independent of frame order.
        const resolved = evaluateAutomation(value, time, paramSpec, this.externalState)
        return paramSpec?.type === 'int' ? Math.round(resolved) : resolved
    }

    /**
     * Resolve all oscillators in pass uniforms for the current frame.
     * Uses a pre-allocated proxy object to avoid per-frame allocations.
     * @param {Object} pass - The pass definition
     * @param {number} time - Current time in seconds
     * @returns {Object} Pass or proxy with resolved uniforms
     */
    resolvePassUniforms(pass, time) {
        if (!pass.uniforms) return pass

        const resolvedUniforms = this._resolvedUniforms
        let hasOscillators = false

        // Clear resolved uniforms (set to undefined to avoid delete deopt)
        for (const key in resolvedUniforms) {
            resolvedUniforms[key] = undefined
        }

        for (const name in pass.uniforms) {
            const value = pass.uniforms[name]
            const spec = pass.uniformSpecs?.[name]
            const resolved = this.resolveUniformValue(value, time, spec)
            resolvedUniforms[name] = resolved
            if (resolved !== value) {
                hasOscillators = true
            }
        }

        // If no oscillators, return original pass
        if (!hasOscillators) {
            return pass
        }

        // Use pre-allocated proxy object to avoid per-frame allocation
        // Copy all pass properties to proxy (this is rare - only for oscillator passes)
        const proxy = this._oscillatorPassProxy
        proxy.id = pass.id
        proxy.program = pass.program
        proxy.inputs = pass.inputs
        proxy.outputs = pass.outputs
        proxy.clear = pass.clear
        proxy.blend = pass.blend
        proxy.drawMode = pass.drawMode
        proxy.count = pass.count
        proxy.repeat = pass.repeat
        proxy.conditions = pass.conditions
        proxy.viewport = pass.viewport
        proxy.viewportResolved = pass.viewportResolved
        proxy.drawBuffers = pass.drawBuffers
        proxy.storageTextures = pass.storageTextures
        proxy.samplerTypes = pass.samplerTypes
        proxy.entryPoint = pass.entryPoint

        // Swap uniform references (avoid copying values)
        const proxyUniforms = proxy.uniforms
        proxy.uniforms = resolvedUniforms
        this._resolvedUniforms = proxyUniforms

        return proxy
    }

    /**
     * Check if a pass should be skipped based on conditions
     */
    shouldSkipPass(pass) {
        if (!pass.conditions) return false

        const { skipIf, runIf } = pass.conditions

        // Check skipIf conditions - skip if ANY condition matches
        if (skipIf) {
            for (const condition of skipIf) {
                const value = pass.uniforms?.[condition.uniform] ?? this.globalUniforms[condition.uniform]
                if (value === condition.equals) {
                    return true
                }
            }
        }

        // Check runIf conditions - skip if ANY condition doesn't match
        if (runIf) {
            let shouldRun = true
            for (const condition of runIf) {
                const value = pass.uniforms?.[condition.uniform] ?? this.globalUniforms[condition.uniform]
                if (value !== condition.equals) {
                    shouldRun = false
                    break
                }
            }
            if (!shouldRun) {
                return true
            }
        }

        return false
    }

    /**
     * Resolve the repeat count for a pass.
     * Supports static values or uniform-driven iteration counts.
     * @param {Object} pass - The pass definition
     * @returns {number} - Number of times to execute the pass
     */
    resolveRepeatCount(pass) {
        if (!pass.repeat) return 1

        // If repeat is a number, use it directly
        if (typeof pass.repeat === 'number') {
            return Math.max(1, Math.floor(pass.repeat))
        }

        // If repeat is a string, treat it as a uniform name
        if (typeof pass.repeat === 'string') {
            const value = this.globalUniforms[pass.repeat] ?? pass.uniforms?.[pass.repeat]
            if (typeof value === 'number') {
                return Math.max(1, Math.floor(value))
            }
        }

        return 1
    }

    /**
     * Resolve an authored pass viewport spec to backend {x, y, w, h} numbers.
     * The authored spec accepts the same dimension grammar as
     * texture sizes (numbers, 'screen', percentages, {param}/{screenDivide}/
     * {scale, clamp} forms) on the x/y/w/h/width/height keys. Resolution is
     * cached per pass: the reusable box is mutated in place each frame so
     * param-driven viewports track uniform changes without per-frame
     * allocation. The authored spec stays queryable on `pass.viewport`; the
     * resolved numbers land on `pass.viewportResolved`, which the backends
     * prefer over the raw spec.
     * @param {Object} pass - Pass providing the uniforms for resolution (the
     *   oscillator-resolved proxy when applicable)
     * @param {Object} [cacheHolder] - Object carrying the cached resolution
     *   (the original compiled pass; defaults to `pass`)
     */
    resolvePassViewport(pass, cacheHolder = pass) {
        const spec = cacheHolder.viewport
        if (!spec || typeof spec !== 'object') return

        if (cacheHolder._viewportSpecSource !== spec) {
            Object.defineProperty(cacheHolder, '_viewportSpecSource', { value: spec, enumerable: false, configurable: true, writable: true })
            const isNumericBox = typeof spec.x === 'number' && typeof spec.y === 'number' &&
                typeof spec.w === 'number' && typeof spec.h === 'number'
            if (isNumericBox) {
                // Legacy contract: an already-numeric viewport passes through
                // unchanged, exactly like a manually constructed graph pass.
                Object.defineProperty(cacheHolder, '_viewportBox', { value: null, enumerable: false, configurable: true, writable: true })
                cacheHolder.viewportResolved = spec
                if (pass !== cacheHolder) pass.viewportResolved = spec
                return
            }
            const box = { x: 0, y: 0, w: 0, h: 0 }
            Object.defineProperty(cacheHolder, '_viewportBox', { value: box, enumerable: false, configurable: true, writable: true })
        }

        if (cacheHolder.viewportResolved === spec) {
            if (pass !== cacheHolder) pass.viewportResolved = spec
            return
        }

        const box = cacheHolder._viewportBox
        const uniforms = pass.uniforms || {}
        box.x = this.resolveDimension(spec.x ?? 0, this.width, uniforms)
        box.y = this.resolveDimension(spec.y ?? 0, this.height, uniforms)
        const widthSpec = spec.w ?? spec.width
        const heightSpec = spec.h ?? spec.height
        box.w = widthSpec !== undefined ? this.resolveDimension(widthSpec, this.width, uniforms) : this.width
        box.h = heightSpec !== undefined ? this.resolveDimension(heightSpec, this.height, uniforms) : this.height
        cacheHolder.viewportResolved = box
        if (pass !== cacheHolder) pass.viewportResolved = box
    }

    /**
     * Adopt a repeated pass's frame-local ping-pong bindings into the
     * cross-frame surface record. Frame-local maps (frameReadTextures/
     * frameWriteTextures) are the source of truth -- updateFrameSurfaceBindings()
     * has already advanced them for this iteration; this mirrors those bindings
     * into this.surfaces so end-of-frame persistence and the surface.read/write
     * fallback stay consistent between iterations of a repeated pass. Do NOT
     * recompute the swap from this.surfaces here: a preceding non-repeat pass
     * (e.g. a seed pass) advances only the frame-local maps, so this.surfaces
     * can be stale when this first runs, and re-deriving from it would clobber
     * the correct binding.
     * @param {Object} pass - The pass that just executed
     */
    adoptIterationBindings(pass) {
        const outputs = pass.outputs || pass.storageTextures
        if (!outputs) return

        for (const outputName of Object.values(outputs)) {
            if (typeof outputName !== 'string') continue

            // Only affects global surfaces (not feedback surfaces)
            const globalName = this.parseGlobalName(outputName)
            if (!globalName) continue

            const surface = this.surfaces.get(globalName)
            if (!surface) continue

            // updateFrameSurfaceBindings() runs after every pass and has already
            // advanced this frame's within-frame ping-pong bindings
            // (frameReadTextures/frameWriteTextures) for this surface. Mirror
            // those frame-local bindings into the cross-frame surface record so
            // end-of-frame persistence and the surface.read/write fallback stay
            // consistent. Recomputing the swap from surface.read/write here would
            // desync whenever a preceding non-repeat pass (e.g. a seed pass)
            // advanced only the frame-local maps -- the stale surface record
            // would then clobber the correct read binding on the first iteration.
            const frameRead = this.frameReadTextures?.get(globalName)
            const frameWrite = this.frameWriteTextures?.get(globalName)
            if (frameRead !== undefined) surface.read = frameRead
            if (frameWrite !== undefined) surface.write = frameWrite
        }
    }

    /**
     * Swap double-buffered surfaces at end of frame.
     *
     * For state surfaces (xyz, vel, rgba, trail), graph feedback surfaces, and
     * surfaces explicitly marked persistent,
     * persist the frame's final read/write bindings so the next frame reads
     * the latest write even when an intervening update pass was skipped.
     *
     * For display surfaces (o0-o7), we swap so the next frame renders fresh.
     */
    swapBuffers() {
        // Check if a surface name is a state surface that should persist
        const isStateSurface = (name) => {
            // Exact matches
            if (name === 'xyz' || name === 'vel' || name === 'rgba' || name === 'trail') {
                return true
            }
            // Suffix matches for namespaced surfaces (e.g., points_trail, flow_trail)
            if (name.endsWith('_xyz') || name.endsWith('_vel') ||
                name.endsWith('_rgba') || name.endsWith('_trail')) {
                return true
            }
            // State texture patterns
            if (name.includes('state') || name.includes('State')) {
                return true
            }
            // Scoped particle textures: xyz_node_N, vel_node_N, rgba_node_N, points_trail_node_N,
            // or the same names keyed by an emitter's `_id:`. These are created when
            // multiple particle pipelines coexist in the same chain
            if (SCOPED_PARTICLE_TEXTURE.test(name)) {
                return true
            }
            return false
        }

        for (const [name, surface] of this.surfaces.entries()) {
            surface.currentFrame = this.frameIndex

            if (isStateSurface(name) || this._feedbackSurfaces?.has(name) ||
                this.graph?.textures?.get?.(`global_${name}`)?.persistent === true) {
                // State surfaces: persist the frame's final bindings
                const finalRead = this.frameReadTextures?.get(name)
                const finalWrite = this.frameWriteTextures?.get(name)

                if (finalRead && finalWrite) {
                    surface.read = finalRead
                    surface.write = finalWrite
                }
            } else {
                // Display surfaces: normal swap
                const temp = surface.read
                surface.read = surface.write
                surface.write = temp
            }
        }
    }

    /**
     * Get current frame state
     * Reuses pre-allocated objects to minimize per-frame allocations
     */
    getFrameState() {
        const state = this._frameState
        const surfaceMap = state.surfaces
        const writeSurfaceMap = state.writeSurfaces

        // Clear previous frame's surface entries by setting to undefined
        // (delete causes hidden class deoptimization)
        const oldSurfaceKeys = this._surfaceKeys
        const oldWriteSurfaceKeys = this._writeSurfaceKeys
        for (let i = 0; i < oldSurfaceKeys.length; i++) {
            surfaceMap[oldSurfaceKeys[i]] = undefined
        }
        for (let i = 0; i < oldWriteSurfaceKeys.length; i++) {
            writeSurfaceMap[oldWriteSurfaceKeys[i]] = undefined
        }
        // Reset key arrays (reuse same arrays)
        oldSurfaceKeys.length = 0
        oldWriteSurfaceKeys.length = 0

        // Build surfaces map with current read textures
        for (const [name, surface] of this.surfaces.entries()) {
            const readTextureId = this.frameReadTextures.get(name) ?? surface.read
            const tex = this.backend.textures.get(readTextureId)
            if (tex) {
                surfaceMap[name] = tex
                oldSurfaceKeys.push(name)
            }
            // Use the frame's write target (set at frame start, doesn't change during frame)
            // This ensures multiple passes writing to the same surface all write to the same buffer
            const writeTarget = this.frameWriteTextures.get(name) ?? surface.write
            writeSurfaceMap[name] = writeTarget
            oldWriteSurfaceKeys.push(name)
        }

        // Update scalar state fields
        state.frameIndex = this.frameIndex
        state.time = this.lastTime
        state.globalUniforms = this.globalUniforms
        state.graph = this.graph
        state.screenWidth = this.width
        state.screenHeight = this.height

        return state
    }

    /**
     * Get the output texture for a surface
     * @param {string} surfaceName - Surface name (defaults to graph.renderSurface)
     */
    getOutput(surfaceName) {
        const name = surfaceName || this.graph?.renderSurface
        if (!name) return null
        const surface = this.surfaces.get(name)
        if (!surface) return null

        return this.backend.textures.get(surface.read)
    }

    /**
     * Clear a surface to transparent black.
     * Used to clear surfaces when chains are deleted.
     * @param {string} surfaceName - Surface name (e.g., 'o0', 'o1')
     */
    clearSurface(surfaceName) {
        if (!surfaceName) return

        const surface = this.surfaces.get(surfaceName)
        if (!surface) return

        // Clear both read and write textures to ensure no stale data
        if (this.backend.clearTexture) {
            this.backend.clearTexture(surface.read)
            this.backend.clearTexture(surface.write)
        }
    }

    /**
     * Update frame-local surface bindings after a pass writes to a global surface.
     * This implements within-frame ping-pong: after a pass writes to a surface,
     * subsequent passes will read from that write buffer, and write to the other buffer.
     */
    updateFrameSurfaceBindings(pass, state) {
        const outputs = pass.outputs || pass.storageTextures
        if (!outputs) return

        for (const outputName of Object.values(outputs)) {
            if (typeof outputName !== 'string') continue

            // Handle global surface writes (both global_ and globalName patterns)
            const surfaceName = this.parseGlobalName(outputName)
            if (surfaceName) {
                if (!this.frameReadTextures || !this.frameWriteTextures) continue

                const writeId = state.writeSurfaces?.[surfaceName]
                if (!writeId) continue

                // Get the current read texture (will become the new write target)
                const currentReadId = this.frameReadTextures.get(surfaceName)

                // Subsequent passes in this frame should sample the freshly written texture
                this.frameReadTextures.set(surfaceName, writeId)

                // And write to the buffer we were just reading from (ping-pong)
                if (currentReadId) {
                    this.frameWriteTextures.set(surfaceName, currentReadId)
                }
            }
        }
    }

    /**
     * Dispose of all pipeline resources.
     * @param {object} [options]
     * @param {boolean} [options.loseContext=false] - Ask the backend to lose its context after cleanup
     * @param {boolean} [options.backendLost=false] - Skip unsafe GPU cleanup when the backend is already lost
     */
    dispose(options = {}) {
        if (this._disposed) return
        this._disposed = true

        const { loseContext = false, backendLost = false } = options
        let firstError

        const captureError = (error) => {
            if (!firstError) firstError = error
        }

        // Production lifecycle hooks: every managed effect's
        // onDestroy runs before backend teardown; hook errors join the
        // existing dispose error path instead of masking cleanup.
        if (this._lifecycleEffects && this._lifecycleEffects.size > 0) {
            for (const effectDef of this._lifecycleEffects.values()) {
                if (!hasLifecycleHook(effectDef, 'onDestroy')) continue
                try {
                    effectDef.onDestroy()
                } catch (error) {
                    captureError(error)
                }
            }
            this._lifecycleEffects.clear()
        }

        // Cancel all async renders
        for (const cancel of this._asyncRenders.values()) {
            try {
                cancel()
            } catch (error) {
                captureError(error)
            }
        }
        this._asyncRenders.clear()

        // Pending debounced regens would fire _startAsyncInit after dispose —
        // a full CPU worm trace whose uploads all no-op on the dead backend.
        if (this._asyncDebounceTimers) {
            for (const timer of this._asyncDebounceTimers.values()) clearTimeout(timer)
            this._asyncDebounceTimers.clear()
        }

        try {
            this.sinkManager.close(backendLost ? { backendLost: true } : undefined)
        } catch (error) {
            captureError(error)
        }

        if (!backendLost) {
            // Every texture the pipeline owns is registered with the backend:
            // global surfaces (including mesh positions/normals/uvs triplets),
            // graph textures, and runtime-managed textures such as MIDI grids,
            // media inputs, and async-init uploads. A single sweep of the backend
            // texture registry destroys each one exactly once.
            if (this.backend?.textures) {
                for (const texId of Array.from(this.backend.textures.keys())) {
                    try {
                        this.backend.destroyTexture(texId)
                    } catch (error) {
                        captureError(error)
                    }
                }
            }

            // Release the remaining backend resources — programs, buffers,
            // samplers, depth attachments, and context. Textures are already
            // gone, so skip the backend's own texture sweep.
            if (this.backend && typeof this.backend.destroy === 'function') {
                try {
                    this.backend.destroy({ skipTextures: true, loseContext })
                } catch (error) {
                    captureError(error)
                }
            }
        } else if (typeof this.backend?.releaseColorOutput === 'function') {
            // A lost backend is not destroyed, but it stops following the display.
            try {
                this.backend.releaseColorOutput()
            } catch (error) {
                captureError(error)
            }
        }

        this.surfaces.clear()

        // Clear references
        this.graph = null
        this.frameReadTextures = null
        this.frameWriteTextures = null
        this.globalUniforms = {}
        this.backend = null

        if (firstError) throw firstError
    }
}

/**
 * Create a pipeline with the appropriate backend
 * @param {object} graph - Compiled shader graph
 * @param {object} options - Options
 * @param {HTMLCanvasElement} options.canvas - Canvas element
 * @param {number} options.width - Width in pixels
 * @param {number} options.height - Height in pixels
 * @param {boolean} options.preferWebGPU - Use WebGPU if available
 * @param {'srgb'|'display-p3'} [options.colorOutput='srgb'] - The canvas color space. 'display-p3'
 *   falls back to 'srgb' when a support check fails; read the result from pipeline.colorOutput.
 */
export async function createPipeline(graph, options = {}) {
    let backend

    // Determine backend
    if (options.preferWebGPU && await WebGPUBackend.isAvailable()) {
        const adapter = await navigator.gpu.requestAdapter()
        // Request higher limits for MRT with high-precision textures
        // Default maxColorAttachmentBytesPerSample is 32, but we need 40+
        // for 2x RGBA32Float (16 bytes each) + RGBA8Unorm (4 bytes) = 40 bytes
        // Request the adapter's full 2D texture size: the default 8192 would
        // cap a 128^3 volume atlas (128 x 16384) to 64^3, which WebGL2 keeps
        // at 128^3 wherever MAX_TEXTURE_SIZE allows it.
        // Also request float32-filterable for mesh data textures (rgba32float)
        const requiredFeatures = []
        if (adapter.features.has('float32-filterable')) {
            requiredFeatures.push('float32-filterable')
        }
        const device = await adapter.requestDevice({
            requiredFeatures,
            requiredLimits: {
                maxColorAttachmentBytesPerSample: Math.min(
                    adapter.limits.maxColorAttachmentBytesPerSample,
                    128  // Request up to 128 bytes for flexibility
                ),
                maxTextureDimension2D: adapter.limits.maxTextureDimension2D
            }
        })
        let context = null
        let canvasOptions = {}
        if (options.canvas) {
            context = options.canvas.getContext('webgpu')
            if (context) {
                const configuration = {
                    device: device,
                    format: navigator.gpu.getPreferredCanvasFormat(),
                    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST,
                    alphaMode: 'premultiplied'
                }
                const requested = options.colorOutput ?? SRGB
                const configured = configureWebGPUCanvas(context, configuration, { requested })
                canvasOptions = {
                    canvasConfiguration: configured.configuration,
                    colorOutput: configured.colorOutput,
                    colorRequest: { requested, configuration }
                }
            }
        }
        backend = new WebGPUBackend(device, context, canvasOptions)
    } else if (options.canvas) {
        const gl = options.canvas.getContext('webgl2', { preserveDrawingBuffer: true })
        if (!gl) {
            throw new Error('WebGL2 not available')
        }
        const requested = options.colorOutput ?? SRGB
        const colorOutput = configureWebGL2Canvas(gl, { requested })
        backend = new WebGL2Backend(gl, options.canvas, { colorOutput, colorRequest: { requested } })
    } else {
        throw new Error('No backend available or canvas not provided')
    }

    const pipeline = new Pipeline(graph, backend, options)
    try {
        await pipeline.init(options.width || 800, options.height || 600)
    } catch (error) {
        // The caller drops a pipeline that fails here. Its backend stops
        // following the display, or the display listener keeps it reachable.
        backend.releaseColorOutput?.()
        throw error
    }

    return pipeline
}

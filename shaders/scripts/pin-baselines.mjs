import { validateParityCase } from '../../scripts/lib/shader-parity-attestation.mjs'

// The fields a pin case shares with a parity case, which mean what they mean there.
const PARITY_FIELDS = ['effects', 'dsl', 'surface', 'resolution', 'settleMs', 'tiles', 'textureInputs', 'meshInputs', 'timeline', 'control', 'midiMessages']

/**
 * The problems of a pin case, checked as the attestation checks a parity case:
 * its parity-case fields go through validateParityCase, and its audio must be
 * "ramps" if it is set. A pin reads no control, so a timed case needs none.
 * The file a case comes from (a parity case, a cases file, the wide-gamut
 * corpus) defines the case's other fields, so by default they are left to it.
 * A caller that knows them all names them in otherFields: then any other field
 * is refused, as the validator refuses one, so that a misspelt timeline cannot
 * record an untimed case.
 * @param {object} pinCase - The case
 * @param {string} target - The effect ID the case renders. A pin case outside
 *   a cases file names none, and passes its last effect.
 * @param {string[]|null} [otherFields] - Every field of the case outside the
 *   parity case shape and audio, or null to leave them to the case's file
 * @returns {string[]}
 */
export function pinCaseErrors(pinCase, target, otherFields = null) {
    const fields = Object.fromEntries(PARITY_FIELDS.filter((field) => pinCase?.[field] !== undefined).map((field) => [field, pinCase[field]]))
    const errors = validateParityCase({ schemaVersion: 1, epsilon: 0, requireColorVariation: true, ...fields }, target)
        .filter((error) => !(pinCase?.control === undefined && error.startsWith('parity case control ')))
    if (otherFields) {
        const known = new Set([...PARITY_FIELDS, 'schemaVersion', 'epsilon', 'requireColorVariation', 'audio', ...otherFields])
        for (const key of Object.keys(pinCase || {})) if (!known.has(key)) errors.push(`pin case has an unknown field ${key}`)
    }
    if (pinCase?.audio !== undefined && pinCase.audio !== 'ramps') errors.push(`pin case audio must be "ramps", not ${JSON.stringify(pinCase.audio)}`)
    return errors
}

/**
 * Pin baselines, keyed by GPU.
 *
 * A pin is a hash of rendered bytes, and two GPUs do not render the same
 * bytes. So a baseline file holds one entry for each GPU it was recorded on,
 * under that GPU's ANGLE renderer string, as shaders/tests/corrective_baselines.js
 * keys its hashes. A GPU with no entry is refused: it gets one by recording it
 * on that machine.
 */

/**
 * The baseline a pin file holds for one GPU.
 * @param {object} pinFile - Parsed baseline file
 * @param {string} gpu - The GPU's ANGLE renderer string
 * @returns {{webgl2: object, webgpu: object}}
 */
export function baselineForGpu(pinFile, gpu) {
    if (!gpu) throw new Error('The GPU could not be identified, so no pin baseline applies')
    const baseline = pinFile?.baselines?.[gpu]
    if (!baseline) {
        const listed = Object.keys(pinFile?.baselines ?? {})
        throw new Error(`No pin baseline for this GPU: ${gpu}. ` +
            `The file lists ${listed.length ? listed.join('; ') : 'no GPU'}. ` +
            'Record one on this machine with --out.')
    }
    return baseline
}

/**
 * A pin file with one GPU's baseline recorded. Entries for other GPUs are
 * kept when they belong to the same case and resolution.
 * @param {object|null} pinFile - The parsed file being replaced, or null
 * @param {object} pin
 * @param {string} pin.case - Case path, relative to the repository
 * @param {number[]} pin.resolution
 * @param {string} pin.gpu - The GPU's ANGLE renderer string
 * @param {object} pin.webgl2
 * @param {object} pin.webgpu
 * @returns {object} The file to write
 */
export function withGpuBaseline(pinFile, pin) {
    if (!pin.gpu) throw new Error('The GPU could not be identified, so no pin baseline can be recorded')
    const sameCase = pinFile?.case === pin.case &&
        JSON.stringify(pinFile?.resolution) === JSON.stringify(pin.resolution)
    return {
        case: pin.case,
        resolution: pin.resolution,
        baselines: {
            ...(sameCase ? pinFile.baselines : {}),
            [pin.gpu]: { webgl2: pin.webgl2, webgpu: pin.webgpu },
        },
    }
}

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

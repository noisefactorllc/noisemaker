/**
 * Wide-gamut canvas output: which color space the browser, the display and the
 * backend can present in.
 *
 * The renderer presents in 'srgb' unless a host asks for 'display-p3' and every
 * check below passes. A check that fails, or that the browser cannot answer,
 * falls back to 'srgb'.
 *
 * - The display: matchMedia('(color-gamut: p3)').
 * - WebGPU: configure the canvas with colorSpace 'display-p3' and read the
 *   configuration back with getConfiguration(). WebIDL drops a dictionary
 *   member the browser does not know, without an error, so only the read-back
 *   shows the space in effect. A browser without getConfiguration() cannot
 *   show it, and counts as unsupported.
 * - WebGL2: test 'drawingBufferColorSpace' in gl, set it, and read it back. On
 *   a browser without the feature the assignment would only create a plain
 *   JavaScript property, so the property is tested before it is set.
 */

export const SRGB = 'srgb'
export const DISPLAY_P3 = 'display-p3'
export const COLOR_OUTPUTS = Object.freeze([SRGB, DISPLAY_P3])

/**
 * Whether the display reports a Display P3 gamut.
 * @param {{matchMedia?: Function}} [env=globalThis]
 * @returns {boolean}
 */
export function displaySupportsP3(env = globalThis) {
    if (typeof env?.matchMedia !== 'function') return false
    try {
        return env.matchMedia('(color-gamut: p3)')?.matches === true
    } catch {
        return false
    }
}

/**
 * The color space of a configured WebGPU canvas context, read back.
 * @param {GPUCanvasContext} context
 * @returns {'srgb'|'display-p3'}
 */
export function webgpuConfiguredColorSpace(context) {
    if (typeof context?.getConfiguration !== 'function') return SRGB
    try {
        return context.getConfiguration()?.colorSpace === DISPLAY_P3 ? DISPLAY_P3 : SRGB
    } catch {
        return SRGB
    }
}

/**
 * Configure a WebGPU canvas for Display P3 with standard tone mapping, and
 * report the space in effect. When the read-back is not Display P3, the
 * context is configured again as the given configuration asks, in sRGB.
 * @param {GPUCanvasContext} context
 * @param {GPUCanvasConfiguration} configuration - device, format, usage, alphaMode
 * @returns {'srgb'|'display-p3'}
 */
export function configureWebGPUColorOutput(context, configuration) {
    try {
        context.configure({ ...configuration, colorSpace: DISPLAY_P3, toneMapping: { mode: 'standard' } })
        if (webgpuConfiguredColorSpace(context) === DISPLAY_P3) return DISPLAY_P3
    } catch {
        // A browser that refuses the space falls back like one that drops it.
    }
    context.configure({ ...configuration, colorSpace: SRGB })
    return SRGB
}

/**
 * Set a WebGL2 drawing buffer to Display P3 where the browser supports it, and
 * report the space in effect.
 * @param {WebGL2RenderingContext} gl
 * @returns {'srgb'|'display-p3'}
 */
export function configureWebGL2ColorOutput(gl) {
    if (!gl || !('drawingBufferColorSpace' in gl)) return SRGB
    try {
        gl.drawingBufferColorSpace = DISPLAY_P3
    } catch {
        return SRGB
    }
    return gl.drawingBufferColorSpace === DISPLAY_P3 ? DISPLAY_P3 : SRGB
}

/**
 * The color output a renderer uses: 'display-p3' only when the host asks for
 * it, the display reports a P3 gamut, and the backend's check passes. Every
 * other request gives 'srgb'.
 * @param {object} options
 * @param {'srgb'|'display-p3'} [options.requested='srgb']
 * @param {'webgl2'|'webgpu'} options.backend
 * @param {object} [options.env=globalThis] - Provides matchMedia
 * @param {WebGL2RenderingContext} [options.gl] - For 'webgl2'
 * @param {GPUCanvasContext} [options.context] - For 'webgpu'
 * @param {GPUCanvasConfiguration} [options.configuration] - For 'webgpu'
 * @returns {'srgb'|'display-p3'}
 */
export function resolveColorOutput({ requested = SRGB, backend, env = globalThis, gl, context, configuration } = {}) {
    if (requested !== DISPLAY_P3 || !displaySupportsP3(env)) return SRGB
    if (backend === 'webgpu') return context && configuration ? configureWebGPUColorOutput(context, configuration) : SRGB
    if (backend === 'webgl2') return configureWebGL2ColorOutput(gl)
    return SRGB
}

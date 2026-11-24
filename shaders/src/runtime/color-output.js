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
 *   JavaScript property, so the property is tested before it is set. The
 *   renderer's Display P3 drawing buffer is also 16-bit float, set with
 *   drawingBufferStorage(); a browser without it falls back.
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
 * context is configured again with the fallback configuration.
 * @param {GPUCanvasContext} context
 * @param {GPUCanvasConfiguration} configuration - device, format, usage, alphaMode
 * @param {GPUCanvasConfiguration} [fallback] - The sRGB configuration; by default, the same one in 'srgb'
 * @returns {'srgb'|'display-p3'}
 */
export function configureWebGPUColorOutput(context, configuration, fallback = { ...configuration, colorSpace: SRGB }) {
    try {
        context.configure({ ...configuration, colorSpace: DISPLAY_P3, toneMapping: { mode: 'standard' } })
        if (webgpuConfiguredColorSpace(context) === DISPLAY_P3) return DISPLAY_P3
    } catch {
        // A browser that refuses the space falls back like one that drops it.
    }
    context.configure(fallback)
    return SRGB
}

/**
 * The canvas format of a Display P3 WebGPU canvas. An 8-bit Display P3 canvas
 * holds every P3 color, but it has fewer levels inside the sRGB gamut: an sRGB
 * color that goes through the present conversion and back can move by more
 * than one 8-bit step. A 16-bit float canvas keeps every 8-bit sRGB color
 * within one step. `wide-gamut-corpus.mjs banding` measures both on the corpus.
 */
export const P3_CANVAS_FORMAT = 'rgba16float'

/**
 * GPUTextureUsage.COPY_SRC, and RENDER_ATTACHMENT, the canvas default usage,
 * for environments without the GPUTextureUsage global.
 */
const COPY_SRC = 0x01
const RENDER_ATTACHMENT = 0x10

/**
 * Configure a WebGPU canvas for a requested color output, and report what is
 * in effect.
 *
 * Under 'srgb', or when a check fails, the context gets `configuration`
 * exactly as given. Under 'display-p3', it gets `configuration` with the
 * Display P3 color space, standard tone mapping, P3_CANVAS_FORMAT and the
 * COPY_SRC usage, which the backend's canvas copy needs.
 * @param {GPUCanvasContext} context
 * @param {GPUCanvasConfiguration} configuration - The sRGB configuration: device, format, usage, alphaMode
 * @param {object} [options]
 * @param {'srgb'|'display-p3'} [options.requested='srgb']
 * @param {object} [options.env=globalThis] - Provides matchMedia
 * @returns {{colorOutput: 'srgb'|'display-p3', configuration: GPUCanvasConfiguration}}
 */
export function configureWebGPUCanvas(context, configuration, { requested = SRGB, env = globalThis } = {}) {
    if (requested === DISPLAY_P3 && displaySupportsP3(env)) {
        const wide = { ...configuration, format: P3_CANVAS_FORMAT, usage: (configuration.usage ?? RENDER_ATTACHMENT) | COPY_SRC }
        if (configureWebGPUColorOutput(context, wide, configuration) === DISPLAY_P3) {
            return { colorOutput: DISPLAY_P3, configuration: { ...wide, colorSpace: DISPLAY_P3, toneMapping: { mode: 'standard' } } }
        }
        return { colorOutput: SRGB, configuration }
    }
    context.configure(configuration)
    return { colorOutput: SRGB, configuration }
}

/**
 * The display's gamut query, or null where the environment has none.
 * @param {object} [env=globalThis]
 * @returns {MediaQueryList|null}
 */
export function gamutQuery(env = globalThis) {
    if (typeof env?.matchMedia !== 'function') return null
    try {
        return env.matchMedia('(color-gamut: p3)') ?? null
    } catch {
        return null
    }
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
 * Refuse a pass that writes to 'screen' under 'display-p3'. Such a pass renders
 * into the canvas directly and skips the present conversion, so its colors
 * would show as Display P3 values. No effect writes to 'screen'.
 * @param {'srgb'|'display-p3'} colorOutput
 * @param {string} passId
 */
export function refuseScreenOutput(colorOutput, passId) {
    if (colorOutput === DISPLAY_P3) {
        throw new Error(`Pass ${passId} writes to screen, which skips the present conversion; under display-p3 a pass writes to a surface`)
    }
}

/** WebGL2's sized formats of a drawing buffer, for environments without a context's constants. */
const RGBA8 = 0x8058
const RGBA16F = 0x881A

/**
 * Give a WebGL2 drawing buffer a sized format with drawingBufferStorage(), at
 * its current size, and report whether the format is in effect. A 16-bit
 * float buffer needs EXT_color_buffer_float; without it the browser refuses
 * the format and the buffer stays as it was.
 * @param {WebGL2RenderingContext} gl
 * @param {number} format - RGBA8 or RGBA16F
 * @returns {boolean}
 */
function setDrawingBufferFormat(gl, format) {
    if (typeof gl.drawingBufferStorage !== 'function') return false
    if (format === RGBA16F && !gl.getExtension?.('EXT_color_buffer_float')) return false
    // drawingBufferStorage() clears the buffer, so a buffer already in the
    // format is not made again: a reused context keeps its last frame.
    if (gl.drawingBufferFormat === format) return true
    try {
        gl.drawingBufferStorage(format, gl.drawingBufferWidth, gl.drawingBufferHeight)
    } catch {
        return false
    }
    return gl.drawingBufferFormat === format
}

/**
 * Set a WebGL2 canvas for a requested color output, and report what is in
 * effect.
 *
 * Under 'display-p3', the drawing buffer is set to Display P3 and given a
 * 16-bit float format, for the reason P3_CANVAS_FORMAT gives. Every other
 * outcome gives srgb in an 8-bit buffer: a fresh context already is, and is
 * left as it is; a context that an earlier pipeline left in Display P3 is put
 * back (restoreWebGL2Canvas). The drawing buffer keeps its format when the
 * canvas is resized.
 * @param {WebGL2RenderingContext} gl
 * @param {object} [options]
 * @param {'srgb'|'display-p3'} [options.requested='srgb']
 * @param {object} [options.env=globalThis] - Provides matchMedia
 * @returns {'srgb'|'display-p3'}
 */
export function configureWebGL2Canvas(gl, { requested = SRGB, env = globalThis } = {}) {
    if (requested === DISPLAY_P3 && displaySupportsP3(env) && configureWebGL2ColorOutput(gl) === DISPLAY_P3 &&
        setDrawingBufferFormat(gl, RGBA16F)) {
        return DISPLAY_P3
    }
    restoreWebGL2Canvas(gl)
    return SRGB
}

/**
 * Put a WebGL2 canvas back to the default: srgb, in an 8-bit drawing buffer.
 * Only what differs from the default is set, so a fresh context is not
 * touched, and only a 16-bit float buffer, the one configureWebGL2Canvas
 * makes, is given an 8-bit buffer again.
 * @param {WebGL2RenderingContext} gl
 */
export function restoreWebGL2Canvas(gl) {
    if (!gl || !('drawingBufferColorSpace' in gl)) return
    if (gl.drawingBufferColorSpace !== SRGB) {
        try {
            gl.drawingBufferColorSpace = SRGB
        } catch {
            // A browser that refuses the assignment keeps the space it has.
        }
    }
    // Only the format this module sets is put back: a host's own format
    // (RGB8 for alpha: false, SRGB8_ALPHA8) is left as it is.
    if (gl.drawingBufferFormat === RGBA16F) setDrawingBufferFormat(gl, RGBA8)
}

/**
 * The color output that the support checks allow: 'display-p3' only when the
 * host asks for it, the display reports a P3 gamut, and the backend's color
 * space check passes. Every other request gives 'srgb'. The renderer also
 * needs a 16-bit canvas or drawing buffer (configureWebGPUCanvas,
 * configureWebGL2Canvas), so it can report 'srgb' where this reports
 * 'display-p3'.
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

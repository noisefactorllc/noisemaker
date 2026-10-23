/**
 * Software rendering detection.
 *
 * A browser without a usable GPU renders WebGL2 through a CPU rasterizer
 * (SwiftShader, llvmpipe and similar). CanvasRenderer uses this verdict for
 * its opt-in single-frame mode (`softwareRendering: 'auto'`).
 *
 * The verdict must not flag a hardware GPU. A renderer string that names a
 * GPU therefore wins over a failed failIfMajorPerformanceCaveat probe, which
 * can also fail on a blocklisted hardware GPU. The probe decides only when
 * the renderer string is masked or missing.
 *
 * @module renderer/software-rendering
 */

const SOFTWARE_RASTERIZERS = [
    ['SwiftShader', /swiftshader/i],
    ['llvmpipe', /llvmpipe/i],
    ['softpipe', /softpipe/i],
    ['Microsoft Basic Render Driver', /microsoft basic render driver/i],
    ['Apple Software Renderer', /apple software renderer/i]
]

// Strings a browser reports in place of the real renderer name.
const MASKED_RENDERERS = /^(webkit webgl|mozilla)$/i

/**
 * Decide whether WebGL2 runs on a software rasterizer.
 * @param {object} probe
 * @param {boolean} probe.webgl2 - A WebGL2 context could be created
 * @param {boolean} probe.caveatPassed - A context with failIfMajorPerformanceCaveat: true was created
 * @param {string|null} probe.renderer - The (unmasked, when available) renderer string
 * @returns {{software: boolean, webgl2: boolean, renderer: string|null, caveatProbe: string|null, reasons: string[]}}
 */
export function classifySoftwareRendering({ webgl2, caveatPassed, renderer }) {
    const name = typeof renderer === 'string' ? renderer.trim() : ''
    const caveatProbe = webgl2 ? (caveatPassed ? 'passed' : 'failed') : null
    const report = { software: false, webgl2: Boolean(webgl2), renderer: renderer ?? null, caveatProbe, reasons: [] }
    if (!webgl2) {
        report.reasons.push('WebGL2 is unavailable')
        return report
    }
    const rasterizer = SOFTWARE_RASTERIZERS.find(([, pattern]) => pattern.test(name))
    if (rasterizer) {
        report.software = true
        report.reasons.push(`renderer is the ${rasterizer[0]} software rasterizer: ${name}`)
    } else if (name && !MASKED_RENDERERS.test(name)) {
        report.reasons.push(`renderer names a GPU: ${name}`)
        if (!caveatPassed) report.reasons.push('the performance-caveat probe failed, but the named GPU decides')
    } else if (!caveatPassed) {
        report.software = true
        report.reasons.push('the renderer is masked and the browser reports a major performance caveat')
    } else {
        report.reasons.push('the renderer is masked and the browser reports no major performance caveat')
    }
    return report
}

function defaultCreateCanvas() {
    if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(1, 1)
    if (typeof document !== 'undefined' && document.createElement) return document.createElement('canvas')
    return null
}

function rendererName(gl) {
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    return gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? null
}

function release(gl) {
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
}

/**
 * Resolve CanvasRenderer's softwareRendering option. 'off' (the default) runs
 * no detection; 'on' forces the mode; 'auto' follows detectSoftwareRendering().
 * @param {string} [mode='off'] - 'off' | 'auto' | 'on'
 * @param {function(): object} [detect] - Detection, replaceable for hosts that probe elsewhere
 * @returns {{mode: string, active: boolean, report: object|null}}
 */
export function resolveSoftwareRendering(mode = 'off', detect = detectSoftwareRendering) {
    if (mode === 'on') {
        return {
            mode, active: true,
            report: { software: true, webgl2: null, renderer: null, caveatProbe: null, reasons: ["softwareRendering is 'on'"] }
        }
    }
    if (mode === 'auto') {
        const report = detect()
        return { mode, active: report.software, report }
    }
    if (mode !== 'off') {
        console.warn(`[CanvasRenderer] Unknown softwareRendering value ${JSON.stringify(mode)}; using 'off'. Use 'off', 'auto' or 'on'.`)
    }
    return { mode: 'off', active: false, report: null }
}

/**
 * Probe WebGL2 on throwaway canvases and classify the result. The render
 * canvas is never touched, because a canvas keeps its first context type.
 * @param {object} [options]
 * @param {function(): (HTMLCanvasElement|OffscreenCanvas|null)} [options.createCanvas] - Canvas factory
 * @returns {ReturnType<typeof classifySoftwareRendering>}
 */
export function detectSoftwareRendering({ createCanvas = defaultCreateCanvas } = {}) {
    let caveatContext = null
    let plainContext = null
    try {
        caveatContext = createCanvas()?.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) ?? null
        plainContext = createCanvas()?.getContext('webgl2') ?? null
        const context = plainContext || caveatContext
        return classifySoftwareRendering({
            webgl2: Boolean(context),
            caveatPassed: Boolean(caveatContext),
            renderer: context ? rendererName(context) : null
        })
    } finally {
        release(caveatContext)
        release(plainContext)
    }
}

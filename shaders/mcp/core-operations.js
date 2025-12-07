/**
 * Core Operations Library for Shader Effect Testing
 *
 * This module provides the fundamental operations for testing shader effects:
 * - compileEffect: Compile a shader and report structured diagnostics
 * - renderEffectFrame: Render a single frame and compute numerical image metrics
 * - benchmarkEffectFps: Run a timed render loop and produce frame-time statistics
 * - describeEffectFrame: Render and hand the image to a vision model
 *
 * These operations are used by both the MCP server (for coding agents) and
 * the test suite (for CI). The MCP layer returns raw results; tests apply thresholds.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '../..')

// Timeout for shader compilation status checks (ms)
export const STATUS_TIMEOUT = 10000

/**
 * Get OpenAI API key from .openai file or environment variable
 * @returns {string|null} API key or null if not found
 */
export function getOpenAIApiKey() {
    // Read from .openai file in project root
    const keyFile = path.join(PROJECT_ROOT, '.openai')
    try {
        const key = fs.readFileSync(keyFile, 'utf-8').trim()
        if (key) return key
    } catch {
        // File doesn't exist or can't be read
    }
    return null
}

/**
 * Wait for shader compilation status in the demo page
 * @param {import('@playwright/test').Page} page - Playwright page
 * @returns {Promise<{state: 'ok'|'error', message: string}>}
 */
export async function waitForCompileStatus(page) {
    const handle = await page.waitForFunction(() => {
        const status = document.getElementById('status')
        if (!status) return null
        const text = (status.textContent || '').toLowerCase()
        if (!text.trim()) return null
        if (text.includes('compilation failed')) {
            return { state: 'error', message: status.textContent || '' }
        }
        if (text.includes('compiled')) {
            return { state: 'ok', message: status.textContent || '' }
        }
        return null
    }, { timeout: STATUS_TIMEOUT, polling: 10 })

    return handle.jsonValue()
}

/**
 * Compile a shader effect and return structured diagnostics
 *
 * @param {import('@playwright/test').Page} page - Playwright page with demo loaded
 * @param {string} effectId - Effect identifier (e.g., "classicBasics/noise")
 * @param {object} options
 * @param {'webgl2'|'webgpu'} options.backend - Rendering backend (REQUIRED)
 * @returns {Promise<{status: 'ok'|'error', backend: string, passes: Array<{id: string, status: 'ok'|'error', errors?: Array}>}>}
 */
export async function compileEffect(page, effectId, options = {}) {
    if (!options.backend) {
        throw new Error('FATAL: backend parameter is REQUIRED. Pass { backend: "webgl2" } or { backend: "webgpu" }')
    }
    const backend = options.backend
    const targetBackend = backend === 'webgpu' ? 'wgsl' : 'glsl'

    // Do everything in a single browser round-trip
    const result = await page.evaluate(async ({ effectId, targetBackend, timeout }) => {
        // Set backend if needed
        const currentBackend = typeof window.__noisemakerCurrentBackend === 'function'
            ? window.__noisemakerCurrentBackend()
            : 'glsl'

        if (currentBackend !== targetBackend) {
            const radio = document.querySelector(`input[name="backend"][value="${targetBackend}"]`)
            if (radio) {
                radio.click()
                // Wait for backend switch to complete - pipeline must be rebuilt
                const switchStart = Date.now()
                while (Date.now() - switchStart < timeout) {
                    // Check that:
                    // 1. The status shows "switched to X"
                    // 2. The pipeline exists and has the correct backend
                    const status = document.getElementById('status')
                    const text = (status?.textContent || '').toLowerCase()
                    const pipeline = window.__noisemakerRenderingPipeline
                    const pipelineBackend = pipeline?.backend?.getName?.()?.toLowerCase() || ''
                    const expectedBackend = targetBackend === 'wgsl' ? 'webgpu' : 'webgl2'

                    if (text.includes(`switched to ${targetBackend}`) &&
                        pipelineBackend.includes(expectedBackend.toLowerCase())) {
                        break
                    }
                    await new Promise(r => setTimeout(r, 10))
                }
            }
        }

        // Select the effect
        const select = document.getElementById('effect-select')
        if (select) {
            // Check if effectId exists in dropdown options
            const optionExists = Array.from(select.options).some(opt => opt.value === effectId)
            if (!optionExists) {
                console.error(`[compileEffect] Effect "${effectId}" not found in dropdown! Available options:`,
                    Array.from(select.options).map(o => o.value).filter(v => v).join(', '))
                return { state: 'error', message: `Effect "${effectId}" not found in effect selector` }
            }
            select.value = effectId
            select.dispatchEvent(new Event('change', { bubbles: true }))
        }

        // Wait for effect to be loaded and at least one frame rendered
        // This ensures the pipeline has fully processed the new effect
        const effectStart = Date.now()
        let initialFrame = window.__noisemakerFrameCount || 0
        while (Date.now() - effectStart < timeout) {
            const pipeline = window.__noisemakerRenderingPipeline
            const currentFrame = window.__noisemakerFrameCount || 0
            // Effect is ready when: pipeline exists, has graph, and at least 1 frame rendered
            if (pipeline && pipeline.graph && pipeline.graph.passes &&
                pipeline.graph.passes.length > 0 && currentFrame > initialFrame) {
                break
            }
            await new Promise(r => setTimeout(r, 10))
        }

        // Poll for compilation status (inline, no round-trips)
        const startTime = Date.now()
        while (Date.now() - startTime < timeout) {
            const status = document.getElementById('status')
            if (status) {
                const text = (status.textContent || '').toLowerCase()
                if (text.includes('compilation failed')) {
                    return { state: 'error', message: status.textContent || '' }
                }
                if (text.includes('compiled')) {
                    // Get pass info while we're here
                    const pipeline = window.__noisemakerRenderingPipeline
                    const passes = (pipeline?.graph?.passes || []).map(pass => ({
                        id: pass.id || pass.program,
                        status: 'ok'
                    }))
                    console.log('[compileEffect] compiled, passes:', JSON.stringify(passes))
                    return { state: 'ok', message: status.textContent || '', passes }
                }
            }
            await new Promise(r => setTimeout(r, 5))  // 5ms poll interval
        }
        return { state: 'error', message: 'Compilation timeout' }
    }, { effectId, targetBackend, timeout: STATUS_TIMEOUT })

    return {
        status: result.state,
        backend: backend,
        passes: result.passes?.length > 0 ? result.passes : [{ id: effectId, status: result.state }],
        message: result.message
    }
}

/**
 * Compute image metrics from pixel data
 *
 * @param {Uint8Array|Float32Array} data - RGBA pixel data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {{mean_rgb: [number,number,number], mean_alpha: number, std_rgb: [number,number,number], luma_variance: number, unique_sampled_colors: number, is_all_zero: boolean, is_all_transparent: boolean, is_essentially_blank: boolean, is_monochrome: boolean}}
 */
export function computeImageMetrics(data, width, height) {
    const pixelCount = width * height
    const stride = Math.max(1, Math.floor(pixelCount / 1000)) // Sample ~1000 pixels

    let sumR = 0, sumG = 0, sumB = 0, sumA = 0
    let sumR2 = 0, sumG2 = 0, sumB2 = 0
    let sumLuma = 0, sumLuma2 = 0
    const sampledColors = new Set()
    let sampleCount = 0
    let isAllZero = true
    let isAllTransparent = true

    // Determine if data is normalized (0-1) or byte (0-255)
    const isFloat = data instanceof Float32Array
    const scale = isFloat ? 255 : 1

    for (let i = 0; i < data.length; i += stride * 4) {
        const r = data[i] * scale
        const g = data[i + 1] * scale
        const b = data[i + 2] * scale
        const a = data[i + 3] * scale

        if (r !== 0 || g !== 0 || b !== 0) {
            isAllZero = false
        }

        if (a > 0) {
            isAllTransparent = false
        }

        sumR += r
        sumG += g
        sumB += b
        sumA += a
        sumR2 += r * r
        sumG2 += g * g
        sumB2 += b * b

        const luma = 0.299 * r + 0.587 * g + 0.114 * b
        sumLuma += luma
        sumLuma2 += luma * luma

        // Quantize color to 6-bit per channel for counting unique colors
        const colorKey = (Math.floor(r / 4) << 12) | (Math.floor(g / 4) << 6) | Math.floor(b / 4)
        sampledColors.add(colorKey)
        sampleCount++
    }

    const meanR = sumR / sampleCount
    const meanG = sumG / sampleCount
    const meanB = sumB / sampleCount
    const meanA = sumA / sampleCount
    const meanLuma = sumLuma / sampleCount

    const stdR = Math.sqrt(sumR2 / sampleCount - meanR * meanR)
    const stdG = Math.sqrt(sumG2 / sampleCount - meanG * meanG)
    const stdB = Math.sqrt(sumB2 / sampleCount - meanB * meanB)
    const lumaVariance = sumLuma2 / sampleCount - meanLuma * meanLuma

    const isMonochrome = sampledColors.size <= 1

    // "Essentially blank" = mean RGB is very close to zero AND very few unique colors
    // Threshold: mean RGB < 0.01 (each channel) AND unique colors <= 10
    const normalizedMeanR = meanR / 255
    const normalizedMeanG = meanG / 255
    const normalizedMeanB = meanB / 255
    const isEssentiallyBlank = (
        normalizedMeanR < 0.01 &&
        normalizedMeanG < 0.01 &&
        normalizedMeanB < 0.01 &&
        sampledColors.size <= 10
    )

    return {
        mean_rgb: [normalizedMeanR, normalizedMeanG, normalizedMeanB],
        mean_alpha: meanA / 255,
        std_rgb: [stdR / 255, stdG / 255, stdB / 255],
        luma_variance: lumaVariance / (255 * 255),
        unique_sampled_colors: sampledColors.size,
        is_all_zero: isAllZero,
        is_all_transparent: isAllTransparent,
        is_essentially_blank: isEssentiallyBlank,
        is_monochrome: isMonochrome
    }
}

/**
 * Render an effect frame and compute metrics
 *
 * @param {import('@playwright/test').Page} page - Playwright page with demo loaded
 * @param {string} effectId - Effect identifier
 * @param {object} options
 * @param {'webgl2'|'webgpu'} options.backend - Rendering backend (REQUIRED)
 * @param {number} [options.time] - Time to render at (ignored - uses page's natural render loop)
 * @param {[number,number]} [options.resolution] - Resolution [width, height]
 * @param {number} [options.seed] - Random seed
 * @param {Record<string,any>} [options.uniforms] - Uniform overrides
 * @param {number} [options.warmupFrames=10] - Frames to wait before capture (default 10 for stability)
 * @returns {Promise<{status: 'ok'|'error', frame: {image_uri: string, width: number, height: number}, metrics: object}>}
 */
export async function renderEffectFrame(page, effectId, options = {}) {
    if (!options.backend) {
        throw new Error('FATAL: backend parameter is REQUIRED. Pass { backend: "webgl2" } or { backend: "webgpu" }')
    }
    const warmupFrames = options.warmupFrames ?? 10
    const skipCompile = options.skipCompile ?? false

    // Compile the effect (unless already done)
    if (!skipCompile) {
        const compileResult = await compileEffect(page, effectId, { backend: options.backend })
        if (compileResult.status === 'error') {
            return {
                status: 'error',
                frame: null,
                metrics: null,
                error: compileResult.message
            }
        }
    }

    // Wait for the page's natural render loop to run warmup frames
    // Use a longer timeout since we're waiting for actual frame renders
    const FRAME_WAIT_TIMEOUT = 5000  // 5 seconds should be plenty for 10 frames

    // Apply uniform overrides BEFORE warmup so they take effect during rendering
    // Use setUniform method to trigger texture resizing for dimension params
    if (options.uniforms) {
        await page.evaluate((uniforms) => {
            const pipeline = window.__noisemakerRenderingPipeline
            if (!pipeline) {
                console.log('[MCP-UNIFORM] No pipeline found')
                return { error: 'No pipeline found' }
            }

            const results = []

            // Use setUniform for each uniform to trigger dimension-dependent texture resizing
            if (pipeline.setUniform) {
                console.log('[MCP-UNIFORM] Using setUniform method')
                for (const [name, value] of Object.entries(uniforms)) {
                    try {
                        console.log(`[MCP-UNIFORM] Calling setUniform(${name}, ${value})`)
                        pipeline.setUniform(name, value)
                        results.push(`${name}=${value} (via setUniform)`)
                    } catch (e) {
                        console.log(`[MCP-UNIFORM] setUniform FAILED: ${e.message}`)
                        results.push(`${name} FAILED: ${e.message}`)
                    }
                }
            } else if (pipeline.globalUniforms) {
                console.log('[MCP-UNIFORM] Fallback to direct assign')
                // Fallback: direct assignment
                Object.assign(pipeline.globalUniforms, uniforms)
                for (const [name, value] of Object.entries(uniforms)) {
                    results.push(`${name}=${value} (direct assign)`)
                }
            } else {
                console.log('[MCP-UNIFORM] Pipeline has neither setUniform nor globalUniforms')
                return { error: 'Pipeline has neither setUniform nor globalUniforms' }
            }

            return {
                success: true,
                results,
                hasSetUniform: !!pipeline.setUniform,
                hasGlobalUniforms: !!pipeline.globalUniforms
            }
        }, options.uniforms)
    }

    // Clear any stale baseline before starting
    await page.evaluate(() => {
        delete window.__noisemakerTestBaselineFrame
    })

    try {
        await page.waitForFunction(({ warmupFrames }) => {
            const pipeline = window.__noisemakerRenderingPipeline
            if (!pipeline) return false
            const frameCount = window.__noisemakerFrameCount || 0
            // Store baseline if not set
            if (window.__noisemakerTestBaselineFrame === undefined) {
                window.__noisemakerTestBaselineFrame = frameCount
            }
            return frameCount >= window.__noisemakerTestBaselineFrame + warmupFrames
        }, { warmupFrames }, { timeout: FRAME_WAIT_TIMEOUT })
    } catch (err) {
        // Check frame count for debugging
        const debugInfo = await page.evaluate(() => ({
            frameCount: window.__noisemakerFrameCount,
            baseline: window.__noisemakerTestBaselineFrame,
            hasPipeline: !!window.__noisemakerRenderingPipeline
        }))
        return {
            status: 'error',
            frame: null,
            metrics: null,
            error: `Frame wait timeout: ${JSON.stringify(debugInfo)}`
        }
    }

    // Clear baseline for next test
    await page.evaluate(() => {
        delete window.__noisemakerTestBaselineFrame
    })

    // Single round-trip: read pixels, compute metrics in browser, and optionally capture image
    const captureImage = options.captureImage ?? false
    const result = await page.evaluate(async (captureImage) => {
        const pipeline = window.__noisemakerRenderingPipeline
        if (!pipeline) {
            return { error: 'Pipeline not available' }
        }

        const backend = pipeline.backend
        const backendName = backend?.getName?.() || 'WebGL2'
        const surface = pipeline.surfaces?.get('o0')

        if (!surface) {
            return { error: 'Surface o0 not found' }
        }

        let data, width, height

        if (backendName === 'WebGPU') {
            try {
                const result = await backend.readPixels(surface.read)
                if (!result || !result.data) {
                    return { error: 'Failed to read pixels from WebGPU' }
                }
                data = result.data
                width = result.width
                height = result.height
            } catch (err) {
                return { error: `WebGPU readPixels failed: ${err.message}` }
            }
        } else {
            // WebGL2 path
            const gl = backend?.gl
            if (!gl) {
                return { error: 'GL context not available' }
            }

            const textureInfo = backend.textures?.get(surface.read)
            if (!textureInfo) {
                return { error: `Texture info missing for ${surface.read}` }
            }

            width = textureInfo.width
            height = textureInfo.height

            const fbo = gl.createFramebuffer()
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textureInfo.handle, 0)

            // Check for float buffer extension (required for rgba16f textures)
            const hasFloatExt = !!gl.getExtension('EXT_color_buffer_float')
            let isFloat = false

            if (hasFloatExt) {
                // Try reading as float first (for rgba16f textures)
                data = new Float32Array(width * height * 4)
                gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, data)
                if (gl.getError() === gl.NO_ERROR) {
                    isFloat = true
                } else {
                    // Fall back to UNSIGNED_BYTE
                    data = new Uint8Array(width * height * 4)
                    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data)
                }
            } else {
                data = new Uint8Array(width * height * 4)
                gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data)
            }

            gl.bindFramebuffer(gl.FRAMEBUFFER, null)
            gl.deleteFramebuffer(fbo)

            // Convert float data to 0-255 range for consistent metrics
            if (isFloat) {
                const converted = new Uint8Array(data.length)
                for (let i = 0; i < data.length; i++) {
                    converted[i] = Math.max(0, Math.min(255, Math.round(data[i] * 255)))
                }
                data = converted
            }
        }

        // Compute metrics in browser to avoid transferring megabytes of pixel data
        const pixelCount = width * height
        const stride = Math.max(1, Math.floor(pixelCount / 1000))

        let sumR = 0, sumG = 0, sumB = 0, sumA = 0
        let sumR2 = 0, sumG2 = 0, sumB2 = 0
        let sumLuma = 0, sumLuma2 = 0
        const sampledColors = new Set()
        let sampleCount = 0
        let isAllZero = true
        let isAllTransparent = true

        for (let i = 0; i < data.length; i += stride * 4) {
            const r = data[i]
            const g = data[i + 1]
            const b = data[i + 2]
            const a = data[i + 3]

            if (r !== 0 || g !== 0 || b !== 0) isAllZero = false
            if (a > 0) isAllTransparent = false

            sumR += r; sumG += g; sumB += b; sumA += a
            sumR2 += r * r; sumG2 += g * g; sumB2 += b * b

            const luma = 0.299 * r + 0.587 * g + 0.114 * b
            sumLuma += luma
            sumLuma2 += luma * luma

            const colorKey = (Math.floor(r / 4) << 12) | (Math.floor(g / 4) << 6) | Math.floor(b / 4)
            sampledColors.add(colorKey)
            sampleCount++
        }

        const meanR = sumR / sampleCount
        const meanG = sumG / sampleCount
        const meanB = sumB / sampleCount
        const meanA = sumA / sampleCount
        const meanLuma = sumLuma / sampleCount

        // Normalized values (0-1)
        const normalizedMeanR = meanR / 255
        const normalizedMeanG = meanG / 255
        const normalizedMeanB = meanB / 255

        // "Essentially blank" = mean RGB is very close to zero AND very few unique colors
        const isEssentiallyBlank = (
            normalizedMeanR < 0.01 &&
            normalizedMeanG < 0.01 &&
            normalizedMeanB < 0.01 &&
            sampledColors.size <= 10
        )

        const metrics = {
            mean_rgb: [normalizedMeanR, normalizedMeanG, normalizedMeanB],
            mean_alpha: meanA / 255,
            std_rgb: [
                Math.sqrt(sumR2 / sampleCount - meanR * meanR) / 255,
                Math.sqrt(sumG2 / sampleCount - meanG * meanG) / 255,
                Math.sqrt(sumB2 / sampleCount - meanB * meanB) / 255
            ],
            luma_variance: (sumLuma2 / sampleCount - meanLuma * meanLuma) / (255 * 255),
            unique_sampled_colors: sampledColors.size,
            is_all_zero: isAllZero,
            is_all_transparent: isAllTransparent,
            is_essentially_blank: isEssentiallyBlank,
            is_monochrome: sampledColors.size <= 1
        }

        // Generate data URL from texture data if requested
        let imageUri = null
        if (captureImage) {
            try {
                // Create a temporary canvas to render the pixel data
                const tempCanvas = document.createElement('canvas')
                tempCanvas.width = width
                tempCanvas.height = height
                const ctx = tempCanvas.getContext('2d')

                // Create ImageData from pixel data
                // Note: WebGL/WebGPU textures are flipped vertically, so we need to flip when drawing
                const imageData = ctx.createImageData(width, height)

                // Copy data, flipping vertically (WebGL has origin at bottom-left)
                for (let y = 0; y < height; y++) {
                    const srcRow = (height - 1 - y) * width * 4
                    const dstRow = y * width * 4
                    for (let x = 0; x < width * 4; x++) {
                        imageData.data[dstRow + x] = data[srcRow + x]
                    }
                }

                ctx.putImageData(imageData, 0, 0)
                imageUri = tempCanvas.toDataURL('image/png')
            } catch (e) {
                console.warn('[renderEffectFrame] Image capture from texture failed:', e.message)
            }
        }

        return { width, height, metrics, backendName, imageUri }
    }, captureImage)

    if (result.error) {
        return {
            status: 'error',
            frame: null,
            metrics: null,
            error: result.error
        }
    }

    return {
        status: 'ok',
        backend: result.backendName,
        frame: {
            image_uri: result.imageUri,
            width: result.width,
            height: result.height
        },
        metrics: result.metrics
    }
}

/**
 * Run a DSL program and compute metrics
 *
 * Unlike compileEffect/renderEffectFrame which select pre-defined effects,
 * this function compiles and runs arbitrary DSL source code.
 *
 * @param {import('@playwright/test').Page} page - Playwright page with demo loaded
 * @param {string} dsl - DSL source code to compile and run
 * @param {object} options
 * @param {'webgl2'|'webgpu'} options.backend - Rendering backend (REQUIRED)
 * @param {number} [options.time] - Time to render at
 * @param {[number,number]} [options.resolution] - Resolution [width, height]
 * @param {number} [options.seed] - Random seed
 * @param {Record<string,any>} [options.uniforms] - Uniform overrides
 * @param {number} [options.warmupFrames=10] - Frames to wait before capture
 * @returns {Promise<{status: 'ok'|'error', frame: {width: number, height: number}, metrics: object, diagnostics?: Array}>}
 */
export async function runDslProgram(page, dsl, options = {}) {
    if (!options.backend) {
        throw new Error('FATAL: backend parameter is REQUIRED. Pass { backend: "webgl2" } or { backend: "webgpu" }')
    }
    const backend = options.backend
    const targetBackend = backend === 'webgpu' ? 'wgsl' : 'glsl'
    const warmupFrames = options.warmupFrames ?? 10

    // Compile and run the DSL in the browser
    const result = await page.evaluate(async ({ dsl, targetBackend, warmupFrames, uniforms, timeout }) => {
        // Switch backend if needed
        const currentBackend = typeof window.__noisemakerCurrentBackend === 'function'
            ? window.__noisemakerCurrentBackend()
            : 'glsl'

        if (currentBackend !== targetBackend) {
            const radio = document.querySelector(`input[name="backend"][value="${targetBackend}"]`)
            if (radio) {
                radio.click()
                const switchStart = Date.now()
                while (Date.now() - switchStart < timeout) {
                    const status = document.getElementById('status')
                    const text = (status?.textContent || '').toLowerCase()
                    const pipeline = window.__noisemakerRenderingPipeline
                    const pipelineBackend = pipeline?.backend?.getName?.()?.toLowerCase() || ''
                    const expectedBackend = targetBackend === 'wgsl' ? 'webgpu' : 'webgl2'

                    if (text.includes(`switched to ${targetBackend}`) &&
                        pipelineBackend.includes(expectedBackend.toLowerCase())) {
                        break
                    }
                    await new Promise(r => setTimeout(r, 10))
                }
            }
        }

        // Set the DSL in the editor and trigger compilation
        const dslEditor = document.getElementById('dsl-editor')
        if (!dslEditor) {
            return { error: 'DSL editor not found' }
        }

        dslEditor.value = dsl
        dslEditor.dispatchEvent(new Event('input', { bubbles: true }))

        // Click the run button to compile
        const runBtn = document.getElementById('dsl-run-btn')
        if (runBtn) {
            runBtn.click()
        }

        // Wait for compilation status
        const startTime = Date.now()
        let compilationStatus = null
        let compilationMessage = ''

        while (Date.now() - startTime < timeout) {
            const status = document.getElementById('status')
            if (status) {
                const text = (status.textContent || '').toLowerCase()
                if (text.includes('compilation failed')) {
                    compilationStatus = 'error'
                    compilationMessage = status.textContent || ''
                    break
                }
                if (text.includes('compiled')) {
                    compilationStatus = 'ok'
                    compilationMessage = status.textContent || ''
                    break
                }
            }
            await new Promise(r => setTimeout(r, 10))
        }

        if (compilationStatus === 'error') {
            return {
                status: 'error',
                error: compilationMessage,
                diagnostics: []
            }
        }

        if (compilationStatus === null) {
            return {
                status: 'error',
                error: 'Compilation timeout',
                diagnostics: []
            }
        }

        // Apply uniform overrides if provided
        if (uniforms) {
            const pipeline = window.__noisemakerRenderingPipeline
            if (pipeline) {
                if (pipeline.setUniform) {
                    for (const [name, value] of Object.entries(uniforms)) {
                        try {
                            pipeline.setUniform(name, value)
                        } catch (e) {
                            console.warn(`[runDslProgram] Failed to set uniform ${name}:`, e.message)
                        }
                    }
                } else if (pipeline.globalUniforms) {
                    Object.assign(pipeline.globalUniforms, uniforms)
                }
            }
        }

        // Wait for warmup frames
        const initialFrame = window.__noisemakerFrameCount || 0
        const warmupStart = Date.now()
        while (Date.now() - warmupStart < timeout) {
            const currentFrame = window.__noisemakerFrameCount || 0
            if (currentFrame >= initialFrame + warmupFrames) {
                break
            }
            await new Promise(r => setTimeout(r, 10))
        }

        // Read pixels and compute metrics (same logic as renderEffectFrame)
        const pipeline = window.__noisemakerRenderingPipeline
        if (!pipeline) {
            return { status: 'error', error: 'Pipeline not available after compilation' }
        }

        const backendObj = pipeline.backend
        const backendName = backendObj?.getName?.() || 'WebGL2'
        const surface = pipeline.surfaces?.get('o0')

        if (!surface) {
            return { status: 'error', error: 'Surface o0 not found' }
        }

        let data, width, height

        if (backendName === 'WebGPU') {
            try {
                const result = await backendObj.readPixels(surface.read)
                if (!result || !result.data) {
                    return { status: 'error', error: 'Failed to read pixels from WebGPU' }
                }
                data = result.data
                width = result.width
                height = result.height
            } catch (err) {
                return { status: 'error', error: `WebGPU readPixels failed: ${err.message}` }
            }
        } else {
            // WebGL2 path
            const gl = backendObj?.gl
            if (!gl) {
                return { status: 'error', error: 'GL context not available' }
            }

            const textureInfo = backendObj.textures?.get(surface.read)
            if (!textureInfo) {
                return { status: 'error', error: `Texture info missing for ${surface.read}` }
            }

            width = textureInfo.width
            height = textureInfo.height

            const fbo = gl.createFramebuffer()
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textureInfo.handle, 0)

            const hasFloatExt = !!gl.getExtension('EXT_color_buffer_float')
            let isFloat = false

            if (hasFloatExt) {
                data = new Float32Array(width * height * 4)
                gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, data)
                if (gl.getError() === gl.NO_ERROR) {
                    isFloat = true
                } else {
                    data = new Uint8Array(width * height * 4)
                    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data)
                }
            } else {
                data = new Uint8Array(width * height * 4)
                gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data)
            }

            gl.bindFramebuffer(gl.FRAMEBUFFER, null)
            gl.deleteFramebuffer(fbo)

            if (isFloat) {
                const converted = new Uint8Array(data.length)
                for (let i = 0; i < data.length; i++) {
                    converted[i] = Math.max(0, Math.min(255, Math.round(data[i] * 255)))
                }
                data = converted
            }
        }

        // Compute metrics
        const pixelCount = width * height
        const stride = Math.max(1, Math.floor(pixelCount / 1000))

        let sumR = 0, sumG = 0, sumB = 0, sumA = 0
        let sumR2 = 0, sumG2 = 0, sumB2 = 0
        let sumLuma = 0, sumLuma2 = 0
        const sampledColors = new Set()
        let sampleCount = 0
        let isAllZero = true
        let isAllTransparent = true

        for (let i = 0; i < data.length; i += stride * 4) {
            const r = data[i]
            const g = data[i + 1]
            const b = data[i + 2]
            const a = data[i + 3]

            if (r !== 0 || g !== 0 || b !== 0) isAllZero = false
            if (a > 0) isAllTransparent = false

            sumR += r; sumG += g; sumB += b; sumA += a
            sumR2 += r * r; sumG2 += g * g; sumB2 += b * b

            const luma = 0.299 * r + 0.587 * g + 0.114 * b
            sumLuma += luma
            sumLuma2 += luma * luma

            const colorKey = (Math.floor(r / 4) << 12) | (Math.floor(g / 4) << 6) | Math.floor(b / 4)
            sampledColors.add(colorKey)
            sampleCount++
        }

        const meanR = sumR / sampleCount
        const meanG = sumG / sampleCount
        const meanB = sumB / sampleCount
        const meanA = sumA / sampleCount
        const meanLuma = sumLuma / sampleCount

        const normalizedMeanR = meanR / 255
        const normalizedMeanG = meanG / 255
        const normalizedMeanB = meanB / 255

        const isEssentiallyBlank = (
            normalizedMeanR < 0.01 &&
            normalizedMeanG < 0.01 &&
            normalizedMeanB < 0.01 &&
            sampledColors.size <= 10
        )

        const metrics = {
            mean_rgb: [normalizedMeanR, normalizedMeanG, normalizedMeanB],
            mean_alpha: meanA / 255,
            std_rgb: [
                Math.sqrt(sumR2 / sampleCount - meanR * meanR) / 255,
                Math.sqrt(sumG2 / sampleCount - meanG * meanG) / 255,
                Math.sqrt(sumB2 / sampleCount - meanB * meanB) / 255
            ],
            luma_variance: (sumLuma2 / sampleCount - meanLuma * meanLuma) / (255 * 255),
            unique_sampled_colors: sampledColors.size,
            is_all_zero: isAllZero,
            is_all_transparent: isAllTransparent,
            is_essentially_blank: isEssentiallyBlank,
            is_monochrome: sampledColors.size <= 1
        }

        // Get pass info
        const passes = (pipeline?.graph?.passes || []).map(pass => ({
            id: pass.id || pass.program,
            status: 'ok'
        }))

        return {
            status: 'ok',
            width,
            height,
            metrics,
            backendName,
            passes
        }
    }, { dsl, targetBackend, warmupFrames, uniforms: options.uniforms, timeout: STATUS_TIMEOUT })

    if (result.error) {
        return {
            status: 'error',
            frame: null,
            metrics: null,
            error: result.error,
            diagnostics: result.diagnostics || []
        }
    }

    return {
        status: result.status,
        backend: result.backendName,
        frame: {
            width: result.width,
            height: result.height
        },
        metrics: result.metrics,
        passes: result.passes
    }
}

/**
 * Benchmark effect FPS over a duration
 *
 * @param {import('@playwright/test').Page} page - Playwright page with demo loaded
 * @param {string} effectId - Effect identifier
 * @param {object} options
 * @param {'webgl2'|'webgpu'} options.backend - Rendering backend (REQUIRED)
 * @param {number} [options.targetFps=60] - Target FPS to compare against
 * @param {number} [options.durationSeconds=5] - Benchmark duration in seconds
 * @param {[number,number]} [options.resolution] - Resolution [width, height]
 * @param {boolean} [options.skipCompile=false] - Skip compilation if effect already loaded
 * @returns {Promise<{status: 'ok'|'error', backend: string, achieved_fps: number, meets_target: boolean, stats: object}>}
 */
export async function benchmarkEffectFps(page, effectId, options = {}) {
    if (!options.backend) {
        throw new Error('FATAL: backend parameter is REQUIRED. Pass { backend: "webgl2" } or { backend: "webgpu" }')
    }
    const targetFps = options.targetFps ?? 60
    const durationSeconds = options.durationSeconds ?? 5
    const backend = options.backend
    const skipCompile = options.skipCompile ?? false

    // Compile the effect (unless already done)
    if (!skipCompile) {
        const compileResult = await compileEffect(page, effectId, { backend })
        if (compileResult.status === 'error') {
            return {
                status: 'error',
                backend,
                achieved_fps: 0,
                meets_target: false,
                stats: null,
                error: compileResult.message
            }
        }
    }

    // Run the benchmark - sample the frame counter from the render loop
    const stats = await page.evaluate(async (durationMs) => {
        const startFrame = window.__noisemakerFrameCount || 0
        const startTime = performance.now()

        // Wait for the duration
        await new Promise(r => setTimeout(r, durationMs))

        const endFrame = window.__noisemakerFrameCount || 0
        const endTime = performance.now()

        const frameCount = endFrame - startFrame
        const totalTime = endTime - startTime

        return {
            frame_count: frameCount,
            total_time_ms: totalTime,
            avg_frame_time_ms: frameCount > 0 ? totalTime / frameCount : 0
        }
    }, durationSeconds * 1000)

    if (stats.error) {
        return {
            status: 'error',
            backend,
            achieved_fps: 0,
            meets_target: false,
            stats: null,
            error: stats.error
        }
    }

    const achievedFps = stats.frame_count / (stats.total_time_ms / 1000)

    return {
        status: 'ok',
        backend,
        achieved_fps: Math.round(achievedFps * 100) / 100,
        meets_target: achievedFps >= targetFps,
        stats: {
            frame_count: stats.frame_count,
            avg_frame_time_ms: Math.round(stats.avg_frame_time_ms * 100) / 100
        }
    }
}

/**
 * Describe an effect frame using AI vision
 *
 * @param {import('@playwright/test').Page} page - Playwright page with demo loaded
 * @param {string} effectId - Effect identifier
 * @param {string} prompt - Vision prompt
 * @param {object} options
 * @param {number} [options.time] - Time to render at
 * @param {[number,number]} [options.resolution] - Resolution [width, height]
 * @param {number} [options.seed] - Random seed
 * @param {Record<string,any>} [options.uniforms] - Uniform overrides
 * @param {string} [options.apiKey] - OpenAI API key (falls back to .openai file in project root)
 * @param {string} [options.model='gpt-4o'] - Vision model to use
 * @returns {Promise<{status: 'ok'|'error', frame: {image_uri: string}, vision: {description: string, tags: string[], notes?: string}}>}
 */
export async function describeEffectFrame(page, effectId, prompt, options = {}) {
    // First render the frame with image capture enabled
    const renderResult = await renderEffectFrame(page, effectId, { ...options, captureImage: true })
    if (renderResult.status === 'error') {
        return {
            status: 'error',
            frame: null,
            vision: null,
            error: renderResult.error
        }
    }

    const imageUri = renderResult.frame.image_uri
    if (!imageUri) {
        return {
            status: 'error',
            frame: null,
            vision: null,
            error: 'Failed to capture frame image'
        }
    }

    // Call OpenAI Vision API
    const apiKey = options.apiKey || getOpenAIApiKey()
    if (!apiKey) {
        return {
            status: 'error',
            frame: { image_uri: imageUri },
            vision: null,
            error: 'No OpenAI API key found. Create .openai file in project root.'
        }
    }

    const model = options.model || 'gpt-4o'

    const systemPrompt = `You are an expert at analyzing procedural graphics and shader effects.
Analyze the provided image and respond with a JSON object containing:
- description: A detailed description of what you see (2-3 sentences)
- tags: An array of relevant tags (e.g., "noise", "colorful", "abstract", "pattern", "gradient", etc.)
- notes: Any additional observations about the quality, artifacts, or issues (optional)

User prompt: ${prompt}`

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: systemPrompt },
                            {
                                type: 'image_url',
                                image_url: { url: imageUri }
                            }
                        ]
                    }
                ],
                max_tokens: 500,
                response_format: { type: 'json_object' }
            })
        })

        if (!response.ok) {
            const errorText = await response.text()
            return {
                status: 'error',
                frame: { image_uri: imageUri },
                vision: null,
                error: `OpenAI API error: ${response.status} - ${errorText}`
            }
        }

        const data = await response.json()
        const content = data.choices?.[0]?.message?.content

        if (!content) {
            return {
                status: 'error',
                frame: { image_uri: imageUri },
                vision: null,
                error: 'No response from vision model'
            }
        }

        const visionResult = JSON.parse(content)

        return {
            status: 'ok',
            frame: { image_uri: imageUri },
            vision: {
                description: visionResult.description || '',
                tags: visionResult.tags || [],
                notes: visionResult.notes
            }
        }
    } catch (err) {
        return {
            status: 'error',
            frame: { image_uri: imageUri },
            vision: null,
            error: `Vision API call failed: ${err.message}`
        }
    }
}

/**
 * Check if an effect is a filter-type effect (takes texture input).
 * Filter effects have an 'inputTex' texture binding in at least one pass.
 *
 * @param {string} effectId - Effect identifier (e.g., "classicNoisemaker/sobel")
 * @returns {Promise<boolean>}
 */
export async function isFilterEffect(effectId) {
    const [namespace, effectName] = effectId.split('/')
    const effectDir = path.join(PROJECT_ROOT, 'shaders', 'effects', namespace, effectName)
    const definitionPath = path.join(effectDir, 'definition.js')

    try {
        const source = fs.readFileSync(definitionPath, 'utf-8')

        // Look for inputTex in inputs section - can be a key OR a value
        // Pattern 1: inputs: { inputTex: ... } (inputTex as key)
        // Pattern 2: inputs: { tex0: "inputTex", ... } (inputTex as value)
        // Pattern 3: default: "inputTex" (surface type with inputTex default)
        const hasInputTexAsKey = /inputs:\s*\{[^}]*inputTex:/s.test(source)
        const hasInputTexAsValue = /inputs:\s*\{[^}]*:\s*["']inputTex["']/s.test(source)
        const hasInputTexDefault = /default:\s*["']inputTex["']/s.test(source)

        return hasInputTexAsKey || hasInputTexAsValue || hasInputTexDefault
    } catch {
        return false
    }
}

/**
 * Test that a filter effect does NOT simply pass through its input unchanged.
 * Passthrough/no-op/placeholder shaders are STRICTLY FORBIDDEN.
 *
 * This test:
 * 1. Verifies the effect is a filter-type (has inputTex)
 * 2. Captures both the input texture and output texture on the SAME frame
 * 3. Computes a similarity metric between them
 * 4. FAILS if the textures are too similar (indicating passthrough)
 *
 * @param {import('@playwright/test').Page} page - Playwright page with demo loaded
 * @param {string} effectId - Effect identifier (e.g., "classicNoisemaker/sobel")
 * @param {object} options
 * @param {'webgl2'|'webgpu'} options.backend - Rendering backend (REQUIRED)
 * @param {boolean} [options.skipCompile=false] - Skip compilation if effect already loaded
 * @returns {Promise<{status: 'ok'|'error'|'skipped'|'passthrough', isFilterEffect: boolean, similarity: number, details: string}>}
 */
export async function testNoPassthrough(page, effectId, options = {}) {
    if (!options.backend) {
        throw new Error('FATAL: backend parameter is REQUIRED. Pass { backend: "webgl2" } or { backend: "webgpu" }')
    }
    const backend = options.backend
    const skipCompile = options.skipCompile ?? false

    // Check if this is a filter effect
    const isFilter = await isFilterEffect(effectId)
    if (!isFilter) {
        return {
            status: 'skipped',
            isFilterEffect: false,
            similarity: null,
            details: 'Not a filter effect (no inputTex)'
        }
    }

    // Compile the effect if needed
    if (!skipCompile) {
        const compileResult = await compileEffect(page, effectId, { backend })
        if (compileResult.status === 'error') {
            return {
                status: 'error',
                isFilterEffect: true,
                similarity: null,
                details: compileResult.message
            }
        }
    }

    // Apply non-default uniform values to ensure the effect does something
    // Many effects have defaults that result in no-op (e.g., rotate angle=0)
    await page.evaluate(() => {
        const pipeline = window.__noisemakerRenderingPipeline
        const effect = window.__noisemakerCurrentEffect

        if (!pipeline || !effect?.instance?.globals) return { uniformsSet: [] }

        const globals = effect.instance.globals
        const uniformsSet = []

        for (const spec of Object.values(globals)) {
            if (!spec.uniform) continue
            if (spec.type !== 'float' && spec.type !== 'int') continue

            // Skip if no range defined
            if (typeof spec.min !== 'number' || typeof spec.max !== 'number') continue
            if (spec.min === spec.max) continue

            // Use mid-range value (or a value that will cause visible change)
            // For angle-like parameters, use a noticeable value
            const defaultVal = spec.default ?? spec.min
            let testVal

            // Use a value that's far enough from default to be visible
            if (defaultVal === spec.min) {
                testVal = spec.min + (spec.max - spec.min) * 0.5  // Mid-range
            } else if (defaultVal === spec.max) {
                testVal = spec.min + (spec.max - spec.min) * 0.5  // Mid-range
            } else {
                // Default is in the middle - move toward one extreme
                testVal = spec.max - (spec.max - spec.min) * 0.1  // Near max
            }

            // For int types, round
            if (spec.type === 'int') {
                testVal = Math.round(testVal)
            }

            // Use setUniform method if available (triggers texture resizing for dimension params)
            if (pipeline.setUniform) {
                pipeline.setUniform(spec.uniform, testVal)
                uniformsSet.push(`${spec.uniform}=${testVal} (via setUniform)`)
            } else {
                // Fallback: Apply to globalUniforms directly
                if (pipeline.globalUniforms) {
                    pipeline.globalUniforms[spec.uniform] = testVal
                }

                // Apply to all passes - create uniform if needed
                for (const pass of pipeline.graph?.passes || []) {
                    if (!pass.uniforms) pass.uniforms = {}
                    pass.uniforms[spec.uniform] = testVal
                    uniformsSet.push(`${pass.id || pass.program}:${spec.uniform}=${testVal}`)
                }
            }
        }

        return { uniformsSet }
    })

    // Wait for warmup frames to apply the uniform changes
    const FRAME_WAIT_TIMEOUT = 5000

    await page.evaluate(() => {
        delete window.__noisemakerTestBaselineFrame
    })

    try {
        await page.waitForFunction(({ warmupFrames }) => {
            const pipeline = window.__noisemakerRenderingPipeline
            if (!pipeline) return false
            const frameCount = window.__noisemakerFrameCount || 0
            if (window.__noisemakerTestBaselineFrame === undefined) {
                window.__noisemakerTestBaselineFrame = frameCount
            }
            return frameCount >= window.__noisemakerTestBaselineFrame + warmupFrames
        }, { warmupFrames: 10 }, { timeout: FRAME_WAIT_TIMEOUT })
    } catch (err) {
        return {
            status: 'error',
            isFilterEffect: true,
            similarity: null,
            details: `Frame wait timeout: ${err.message}`
        }
    }

    // Capture both input and output textures on the same frame
    // The pipeline uses ping-pong buffers, so we need to capture at the right moment
    // For filter effects using DSL like `noise(seed: 1).sobel().out(o0)`:
    // - The noise outputs to an intermediate texture
    // - That intermediate is bound to inputTex for the sobel pass
    // - The sobel outputs to o0
    //
    // To capture both, we read pixels from:
    // 1. The pass's inputTex binding (which points to the intermediate texture)
    // 2. The output surface (o0)

    const result = await page.evaluate(async () => {
        const pipeline = window.__noisemakerRenderingPipeline
        if (!pipeline) {
            return { error: 'Pipeline not available' }
        }

        // Debug: log current uniform values
        const uniformDebug = {}
        if (pipeline.globalUniforms) {
            for (const [k, v] of Object.entries(pipeline.globalUniforms)) {
                uniformDebug[k] = v
            }
        }

        // Also capture pass.uniforms for all passes
        const passUniformsDebug = {}
        for (const pass of pipeline.graph?.passes || []) {
            if (pass.uniforms) {
                passUniformsDebug[pass.id || pass.program] = { ...pass.uniforms }
            }
        }

        const backend = pipeline.backend
        const backendName = backend?.getName?.() || 'WebGL2'

        // Find the filter pass and its input texture
        // The filter pass is the one that:
        //   1. Has inputTex in its inputs (as key or resolved from inputTex)
        //   2. Or has an input that references a previous pass's output (for nd effects)
        //   3. And ultimately outputs to o0
        const passes = pipeline.graph?.passes || []
        let filterPass = null
        let inputTextureId = null

        // First, try to find a pass with inputTex as a key (nm effects)
        for (const pass of passes) {
            if (pass.inputs && pass.inputs.inputTex) {
                filterPass = pass
                inputTextureId = pass.inputs.inputTex
                break
            }
        }

        // If not found, look for the pass that outputs to o0 and find its input
        // This handles nd effects where inputTex is resolved during expansion
        if (!filterPass) {
            for (let i = passes.length - 1; i >= 0; i--) {
                const pass = passes[i]
                if (!pass.outputs) continue

                // Check if this pass outputs to o0
                const outputsToO0 = Object.values(pass.outputs).some(v =>
                    v === 'global_o0' || v === 'o0' || v.includes('_o0')
                )

                if (outputsToO0 && pass.inputs) {
                    filterPass = pass
                    // Find the first input that looks like a previous pass output or chain texture
                    // These typically look like: node_0_out, _chain_0, etc.
                    for (const value of Object.values(pass.inputs)) {
                        if (typeof value === 'string' && (
                            value.includes('node_') ||
                            value.includes('_chain_') ||
                            value.includes('_out') ||
                            /^global_o[0-7]$/.test(value)
                        )) {
                            inputTextureId = value
                            break
                        }
                    }
                    break
                }
            }
        }

        if (!filterPass || !inputTextureId) {
            // Debug: include available passes and inputs
            const passInfo = passes.map(p => ({
                id: p.id || p.program,
                inputs: p.inputs,
                outputs: p.outputs
            }))
            return {
                error: 'No filter pass with inputTex found in pipeline',
                debug: { passes: passInfo }
            }
        }

        // Get the output surface (o0)
        const outputSurface = pipeline.surfaces?.get('o0')
        if (!outputSurface) {
            return { error: 'Output surface o0 not found' }
        }

        // Read pixel data from both textures
        // We need to sample them on the same frame/state

        const readPixels = async (textureId, label) => {
            if (backendName === 'WebGPU') {
                try {
                    // For WebGPU, we need to find the texture
                    let texResult = null

                    // Try surfaces first (for global surfaces like o0, o1)
                    const surfaceMatch = textureId.match(/^global_(\w+)_(read|write)$/)
                    if (surfaceMatch) {
                        const surfaceName = surfaceMatch[1]
                        const surface = pipeline.surfaces?.get(surfaceName)
                        if (surface) {
                            texResult = await backend.readPixels(textureId)
                        }
                    }

                    // Try direct texture lookup
                    if (!texResult) {
                        texResult = await backend.readPixels(textureId)
                    }

                    if (!texResult || !texResult.data) {
                        return { error: `Failed to read ${label} from WebGPU` }
                    }

                    return { data: texResult.data, width: texResult.width, height: texResult.height }
                } catch (err) {
                    return { error: `WebGPU readPixels failed for ${label}: ${err.message}` }
                }
            } else {
                // WebGL2 path
                const gl = backend?.gl
                if (!gl) {
                    return { error: 'GL context not available' }
                }

                const textureInfo = backend.textures?.get(textureId)
                if (!textureInfo) {
                    return { error: `Texture info missing for ${label} (${textureId})` }
                }

                const width = textureInfo.width
                const height = textureInfo.height

                const fbo = gl.createFramebuffer()
                gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textureInfo.handle, 0)

                // Check framebuffer completeness
                const fbStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
                if (fbStatus !== gl.FRAMEBUFFER_COMPLETE) {
                    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
                    gl.deleteFramebuffer(fbo)
                    return { error: `Framebuffer not complete for ${label}: ${fbStatus}` }
                }

                // Query the implementation's preferred format for this framebuffer
                const implFormat = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT)
                const implType = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE)

                // Use the implementation's preferred format
                let data
                let readFormat = implFormat || gl.RGBA
                let readType = implType || gl.UNSIGNED_BYTE

                // Allocate appropriate array based on type
                if (readType === gl.FLOAT) {
                    data = new Float32Array(width * height * 4)
                } else if (readType === gl.HALF_FLOAT) {
                    // For half float, we still need Float32Array as there's no native Float16Array
                    data = new Float32Array(width * height * 4)
                    readType = gl.FLOAT // Fall back to FLOAT
                } else {
                    data = new Uint8Array(width * height * 4)
                }

                gl.readPixels(0, 0, width, height, readFormat, readType, data)

                // Normalize to 0-255 if we read floats
                let normalizedData
                if (readType === gl.FLOAT) {
                    normalizedData = new Uint8Array(width * height * 4)
                    for (let i = 0; i < data.length; i++) {
                        normalizedData[i] = Math.max(0, Math.min(255, Math.round(data[i] * 255)))
                    }
                } else {
                    normalizedData = data
                }

                gl.bindFramebuffer(gl.FRAMEBUFFER, null)
                gl.deleteFramebuffer(fbo)

                return { data: normalizedData, width, height }
            }
        }

        // Resolve actual texture ID for input
        // inputTextureId might be a reference that needs resolution via frame state
        let resolvedInputId = inputTextureId

        // Check if it's a surface reference (like "global_o1_read")
        // The pipeline resolves "inputTex" to actual texture IDs during execution
        // For the DSL `noise(seed: 1).sobel().out(o0)`, the intermediate is an auto-generated texture

        // Check if it's referring to a pass output
        // Look for passes that output to this texture
        for (let i = 0; i < passes.length; i++) {
            const pass = passes[i]
            if (pass === filterPass) break // Stop before the filter pass

            if (pass.outputs) {
                for (const outputId of Object.values(pass.outputs)) {
                    // The output of a previous pass becomes the input of the filter
                    // Check if this matches our inputTex reference
                    if (outputId === inputTextureId) {
                        // This pass outputs to our input texture
                        // The actual texture ID is the output
                        resolvedInputId = outputId
                    }
                }
            }
        }

        // If inputTextureId looks like a direct texture reference, use it
        // Otherwise, we need to find the actual texture from surfaces or textures map
        if (inputTextureId.startsWith('global_')) {
            // It's a global surface reference
            const surfaceName = inputTextureId.replace('global_', '').replace(/_read$/, '').replace(/_write$/, '')
            const surface = pipeline.surfaces?.get(surfaceName)
            if (surface) {
                // Use the read texture (what the filter pass would sample)
                const readTexId = pipeline.frameReadTextures?.get(surfaceName) || surface.read
                resolvedInputId = readTexId
            }
        }

        // For intermediate textures (like _chain_0), look in backend.textures
        if (!backend.textures?.has(resolvedInputId)) {
            // Try with the original ID
            if (backend.textures?.has(inputTextureId)) {
                resolvedInputId = inputTextureId
            }
        }

        // Get output texture ID
        const outputTextureId = outputSurface.read // Use read (what was just rendered)

        // Debug info
        const debugInfo = {
            inputTextureId,
            resolvedInputId,
            outputTextureId,
            availableTextures: Array.from(backend.textures?.keys() || []),
            surfaces: Array.from(pipeline.surfaces?.keys() || []),
            passes: passes.map(p => ({ id: p.id, program: p.program, inputs: p.inputs, outputs: p.outputs }))
        }

        // Read both textures
        const inputResult = await readPixels(resolvedInputId, 'input')
        if (inputResult.error) {
            return { error: inputResult.error, debug: debugInfo }
        }

        const outputResult = await readPixels(outputTextureId, 'output')
        if (outputResult.error) {
            return { error: outputResult.error, debug: debugInfo }
        }

        // Compare the textures
        // Compute Mean Absolute Difference (MAD) - simple and effective
        const inputData = inputResult.data
        const outputData = outputResult.data

        // Handle size mismatch by sampling at corresponding positions
        const inputWidth = inputResult.width
        const inputHeight = inputResult.height
        const outputWidth = outputResult.width
        const outputHeight = outputResult.height

        let totalDiff = 0
        let sampleCount = 0
        const stride = Math.max(1, Math.floor(Math.max(inputWidth * inputHeight, outputWidth * outputHeight) / 1000))

        for (let i = 0; i < Math.min(inputData.length, outputData.length); i += stride * 4) {
            const diffR = Math.abs(inputData[i] - outputData[i])
            const diffG = Math.abs(inputData[i + 1] - outputData[i + 1])
            const diffB = Math.abs(inputData[i + 2] - outputData[i + 2])

            totalDiff += (diffR + diffG + diffB) / 3
            sampleCount++
        }

        // Normalize to 0-1 range (0 = identical, 1 = completely different)
        const meanDiff = totalDiff / sampleCount / 255

        // Also compute a "similarity" score (1 = identical, 0 = completely different)
        const similarity = 1 - meanDiff

        return {
            similarity,
            meanDiff,
            inputTextureId: resolvedInputId,
            outputTextureId,
            inputSize: [inputWidth, inputHeight],
            outputSize: [outputWidth, outputHeight],
            sampleCount,
            debug: debugInfo,
            uniformDebug,
            passUniformsDebug
        }
    })

    if (result.error) {
        return {
            status: 'error',
            isFilterEffect: true,
            similarity: null,
            details: result.error,
            debug: result.debug
        }
    }

    // Determine pass/fail
    // A similarity > 0.99 (less than 1% difference) is considered passthrough
    // This threshold accounts for minor floating-point precision differences
    const PASSTHROUGH_THRESHOLD = 0.99

    const isPassthrough = result.similarity >= PASSTHROUGH_THRESHOLD

    // Reset all uniforms to their default values after the test
    await page.evaluate(() => {
        const pipeline = window.__noisemakerRenderingPipeline
        const effect = window.__noisemakerCurrentEffect

        if (!pipeline || !effect?.instance?.globals) return

        const globals = effect.instance.globals

        // Reset all uniforms to their default values
        for (const spec of Object.values(globals)) {
            if (!spec.uniform) continue

            const defaultVal = spec.default ?? spec.min ?? 0

            // Apply to all passes
            for (const pass of pipeline.graph?.passes || []) {
                if (pass.uniforms && spec.uniform in pass.uniforms) {
                    pass.uniforms[spec.uniform] = defaultVal
                }
            }
        }

        // Also reset built-in time to known values
        // NOTE: Do NOT reset seed here - it's an effect-specific parameter set by DSL
        for (const pass of pipeline.graph?.passes || []) {
            if (pass.uniforms) {
                if ('time' in pass.uniforms) pass.uniforms.time = 0
                if ('u_time' in pass.uniforms) pass.uniforms.u_time = 0
            }
        }
    })

    return {
        status: isPassthrough ? 'passthrough' : 'ok',
        isFilterEffect: true,
        similarity: result.similarity,
        meanDiff: result.meanDiff,
        details: isPassthrough
            ? `PASSTHROUGH DETECTED: similarity=${(result.similarity * 100).toFixed(2)}% (threshold: ${PASSTHROUGH_THRESHOLD * 100}%)`
            : `Filter modifies input: similarity=${(result.similarity * 100).toFixed(2)}%, diff=${(result.meanDiff * 100).toFixed(2)}%`,
        debug: result.debug,
        uniformDebug: result.uniformDebug,
        passUniformsDebug: result.passUniformsDebug
    }
}

/**
 * Effects that are exempt from compute pass requirements for multi-pass pipelines.
 * These are typically simple filter chains or effects where GPGPU provides no benefit.
 */
const COMPUTE_PASS_EXEMPT_EFFECTS = new Set([
    // Simple filter chains
    'classicBasics/blend', 'classicBasics/layer', 'classicBasics/mask', 'classicBasics/modulate',
    // Effects with legitimate multi-pass render pipelines (blur, bloom, etc.)
    'classicNoisemaker/blur',  // Multi-pass gaussian blur is fine as render passes
    'classicNoisemaker/bloom', // Blur + composite is fine
    // Add more as needed with justification
])

/**
 * Internal uniforms that should NOT be exposed as UI controls.
 * These are system-managed uniforms set by the runtime.
 * Note: 'speed' is allowed as a user-exposed uniform.
 */
const INTERNAL_UNIFORMS = new Set(['channels', 'time'])

/**
 * System uniforms that are auto-provided by the runtime.
 * Shaders may use these without declaring them in globals.
 *
 * Each entry maps the uniform name to its expected type in GLSL and WGSL:
 * - glslDecl: regex pattern for GLSL uniform declaration
 * - wgslDecl: regex pattern for WGSL uniform declaration
 * - usagePatterns: regex patterns that indicate the uniform is being used
 */
const SYSTEM_UNIFORMS = {
    resolution: {
        glslDecl: /uniform\s+vec2\s+resolution\s*;/,
        wgslDecl: /var<uniform>\s+resolution\s*:\s*vec2<f32>/,
        usagePatterns: [/\bresolution\b/]
    },
    time: {
        glslDecl: /uniform\s+float\s+time\s*;/,
        wgslDecl: /var<uniform>\s+time\s*:\s*f32/,
        usagePatterns: [/\btime\b/]
    },
    aspect: {
        glslDecl: /uniform\s+float\s+aspect\s*;/,
        wgslDecl: /var<uniform>\s+aspect\s*:\s*f32/,
        usagePatterns: [/\baspect\b/]
    },
    aspectRatio: {
        glslDecl: /uniform\s+float\s+aspectRatio\s*;/,
        wgslDecl: /var<uniform>\s+aspectRatio\s*:\s*f32/,
        usagePatterns: [/\baspectRatio\b/]
    },
    deltaTime: {
        glslDecl: /uniform\s+float\s+deltaTime\s*;/,
        wgslDecl: /var<uniform>\s+deltaTime\s*:\s*f32/,
        usagePatterns: [/\bdeltaTime\b/]
    },
    frame: {
        glslDecl: /uniform\s+int\s+frame\s*;/,
        wgslDecl: /var<uniform>\s+frame\s*:\s*(i32|u32)/,
        usagePatterns: [/\bframe\b/]
    },
    speed: {
        glslDecl: /uniform\s+float\s+speed\s*;/,
        wgslDecl: /var<uniform>\s+speed\s*:\s*f32/,
        usagePatterns: [/\bspeed\b/]
    }
}

/**
 * Check if a name is valid camelCase.
 *
 * Valid camelCase:
 * - Starts with lowercase letter
 * - No underscores (snake_case) or hyphens (kebab-case)
 * - No consecutive uppercase letters at the start (StudlyCaps/PascalCase)
 * - May contain digits
 *
 * Reserved names that are always valid (system names):
 * - inputTex, outputTex, fragColor, outState1-3, stateTex1-3, sourceTex, mixerTex, trailTex
 * - global_* prefixed internal textures (these use underscore by convention)
 *
 * @param {string} name - The name to check
 * @param {boolean} allowGlobalPrefix - Whether to allow global_ prefix (for internal textures)
 * @returns {{valid: boolean, reason?: string}}
 */
function checkCamelCase(name, allowGlobalPrefix = false) {
    // Handle global_ prefixed internal textures - the part after global_ should be checked
    if (allowGlobalPrefix && name.startsWith('global_')) {
        const suffix = name.slice(7) // Remove 'global_'
        // The suffix can have underscores for compound names like 'worms_state1'
        // Just check it's not empty and starts with lowercase
        if (suffix.length === 0) {
            return { valid: false, reason: 'empty suffix after global_' }
        }
        if (!/^[a-z]/.test(suffix)) {
            return { valid: false, reason: 'suffix must start with lowercase' }
        }
        return { valid: true }
    }

    // Empty or whitespace-only
    if (!name || !name.trim()) {
        return { valid: false, reason: 'empty name' }
    }

    // Must start with lowercase letter
    if (!/^[a-z]/.test(name)) {
        return { valid: false, reason: 'must start with lowercase letter (not StudlyCaps/PascalCase)' }
    }

    // No underscores (snake_case)
    if (name.includes('_')) {
        return { valid: false, reason: 'contains underscore (snake_case)' }
    }

    // No hyphens (kebab-case)
    if (name.includes('-')) {
        return { valid: false, reason: 'contains hyphen (kebab-case)' }
    }

    return { valid: true }
}

/**
 * Check if a texture/surface name is valid.
 *
 * Valid texture names:
 * - camelCase names (start with lowercase, no underscores/hyphens)
 * - global_ prefixed internal textures (e.g., global_worms_state1)
 * - _ prefixed internal textures (e.g., _bloomDownsample)
 * - Reserved system names: inputTex, outputTex, fragColor
 *
 * @param {string} name - The texture name to check
 * @returns {{valid: boolean, reason?: string}}
 */
function checkTextureName(name) {
    // Reserved system names - always valid
    const reservedNames = new Set([
        'inputTex', 'outputTex', 'fragColor',
        'outState1', 'outState2', 'outState3',
        'stateTex1', 'stateTex2', 'stateTex3',
        'sourceTex', 'mixerTex', 'trailTex'
    ])
    if (reservedNames.has(name)) {
        return { valid: true }
    }

    // global_ prefixed internal textures - check suffix starts with lowercase
    if (name.startsWith('global_')) {
        const suffix = name.slice(7)
        if (suffix.length === 0) {
            return { valid: false, reason: 'empty suffix after global_' }
        }
        if (!/^[a-z]/.test(suffix)) {
            return { valid: false, reason: 'global_ suffix must start with lowercase' }
        }
        return { valid: true }  // Allow underscores within global_ names
    }

    // _ prefixed internal textures (e.g., _bloomDownsample) - check rest is camelCase
    if (name.startsWith('_')) {
        const suffix = name.slice(1)
        if (suffix.length === 0) {
            return { valid: false, reason: 'empty suffix after _' }
        }
        // Internal textures starting with _ should have camelCase suffix
        return checkCamelCase(suffix)
    }

    // Regular texture name - must be camelCase
    return checkCamelCase(name)
}

/**
 * Check effect structure for unused files and compute pass requirements
 *
 * @param {string} effectId - Effect identifier (e.g., "classicNoisemaker/worms")
 * @param {object} options
 * @param {'webgl2'|'webgpu'} options.backend - Backend to check (REQUIRED - affects which shader dir to scan)
 * @returns {Promise<{unusedFiles: string[], multiPass: boolean, hasComputePass: boolean, passCount: number, passTypes: string[], computePassExempt: boolean, computePassExemptReason?: string, leakedInternalUniforms: string[], namingIssues: Array<{type: string, name: string, reason: string}>}>}
 */
export async function checkEffectStructure(effectId, options = {}) {
    if (!options.backend) {
        throw new Error('FATAL: backend parameter is REQUIRED. Pass { backend: "webgl2" } or { backend: "webgpu" }')
    }
    const backend = options.backend
    const shaderDir = backend === 'webgpu' ? 'wgsl' : 'glsl'
    const shaderExt = backend === 'webgpu' ? '.wgsl' : '.glsl'

    // Parse effect ID to get directory path
    const [namespace, effectName] = effectId.split('/')
    const effectDir = path.join(PROJECT_ROOT, 'shaders', 'effects', namespace, effectName)

    const result = {
        unusedFiles: [],
        multiPass: false,
        hasComputePass: false,
        passCount: 0,
        passTypes: [],
        computePassExempt: false,
        computePassExemptReason: null,
        leakedInternalUniforms: [],
        hasInlineShaders: false,
        inlineShaderLocations: [],
        // Split shader validation (GLSL only)
        splitShaderIssues: [],
        // Naming convention issues (camelCase validation)
        namingIssues: [],
        // Required uniform issues (system uniforms not properly declared)
        requiredUniformIssues: [],
        // Structural parity between GLSL and WGSL (1:1 file mapping)
        structuralParityIssues: [],
        // Missing description field in definition
        missingDescription: false
    }

    try {
        // Read definition.js to get passes
        const definitionPath = path.join(effectDir, 'definition.js')
        const definitionSource = fs.readFileSync(definitionPath, 'utf-8')

        // CRITICAL: Check for inline shader code in the definition
        // Inline shaders are FORBIDDEN - all shaders must be in separate files
        const inlineShaderPatterns = [
            // Direct shader source strings (multiline template literals or strings with shader keywords)
            { pattern: /\bglsl\s*:\s*`[\s\S]*?`/g, type: 'glsl template literal' },
            { pattern: /\bwgsl\s*:\s*`[\s\S]*?`/g, type: 'wgsl template literal' },
            { pattern: /\bsource\s*:\s*`[\s\S]*?`/g, type: 'source template literal' },
            { pattern: /\bfragment\s*:\s*`[\s\S]*?`/g, type: 'fragment template literal' },
            { pattern: /\bvertex\s*:\s*`[\s\S]*?`/g, type: 'vertex template literal' },
            // Shader code indicators within strings (GLSL)
            { pattern: /["'`][^"'`]*#version\s+\d+[^"'`]*["'`]/g, type: 'GLSL #version directive' },
            { pattern: /["'`][^"'`]*\bprecision\s+(highp|mediump|lowp)\b[^"'`]*["'`]/g, type: 'GLSL precision qualifier' },
            { pattern: /["'`][^"'`]*\bgl_FragColor\b[^"'`]*["'`]/g, type: 'GLSL gl_FragColor' },
            { pattern: /["'`][^"'`]*\buniform\s+\w+\s+\w+\s*;[^"'`]*["'`]/g, type: 'GLSL uniform declaration' },
            // Shader code indicators within strings (WGSL)
            { pattern: /["'`][^"'`]*@fragment[^"'`]*["'`]/g, type: 'WGSL @fragment' },
            { pattern: /["'`][^"'`]*@vertex[^"'`]*["'`]/g, type: 'WGSL @vertex' },
            { pattern: /["'`][^"'`]*@compute[^"'`]*["'`]/g, type: 'WGSL @compute' },
            { pattern: /["'`][^"'`]*@binding\s*\(\s*\d+\s*\)[^"'`]*["'`]/g, type: 'WGSL @binding' },
        ]

        for (const { pattern, type } of inlineShaderPatterns) {
            const matches = [...definitionSource.matchAll(pattern)]
            for (const match of matches) {
                // Find line number
                const beforeMatch = definitionSource.substring(0, match.index)
                const lineNumber = (beforeMatch.match(/\n/g) || []).length + 1
                result.hasInlineShaders = true
                result.inlineShaderLocations.push({ type, line: lineNumber, snippet: match[0].substring(0, 80) })
            }
        }

        // Check for required description field
        // Supports both object property (description: "...") and class property (description = "...")
        const hasDescription = /\bdescription\s*[=:]\s*["'][^"']+["']/.test(definitionSource)
        if (!hasDescription) {
            result.missingDescription = true
        }

        // Extract passes section from definition
        // Look for passes = [ ... ] or passes: [ ... ]
        // Match the entire passes array content, handling nested brackets
        // We look for the closing ] that's at the beginning of a line (with optional indentation)
        // or followed by newline/end-of-object patterns
        let passesSection = ''
        const passesStart = definitionSource.match(/passes\s*[=:]\s*\[/)
        if (passesStart) {
            const startIdx = passesStart.index + passesStart[0].length
            let depth = 1
            let i = startIdx
            while (i < definitionSource.length && depth > 0) {
                if (definitionSource[i] === '[') depth++
                else if (definitionSource[i] === ']') depth--
                i++
            }
            passesSection = definitionSource.substring(startIdx, i - 1)
        }

        // Extract pass programs and types from passes section only
        const referencedPrograms = new Set()
        const passTypes = []

        // Parse passes array - look for program: "name" patterns within passes section
        const programMatches = passesSection.matchAll(/program:\s*["']([^"']+)["']/g)
        for (const match of programMatches) {
            referencedPrograms.add(match[1])
        }

        // Parse pass types - look for type: "compute" or type: "render" patterns within passes section
        // Only match render|compute|gpgpu - valid pass types
        const typeMatches = passesSection.matchAll(/type:\s*["'](render|compute|gpgpu)["']/g)
        for (const match of typeMatches) {
            passTypes.push(match[1])
        }

        result.passCount = referencedPrograms.size
        result.passTypes = passTypes
        result.multiPass = referencedPrograms.size > 1
        result.hasComputePass = passTypes.includes('compute') || passTypes.includes('gpgpu')

        // Check if exempt from compute pass requirement
        if (COMPUTE_PASS_EXEMPT_EFFECTS.has(effectId)) {
            result.computePassExempt = true
            result.computePassExemptReason = 'explicitly exempt'
        } else if (!result.multiPass) {
            result.computePassExempt = true
            result.computePassExemptReason = 'single-pass effect'
        }

        // Check for leaked internal uniforms exposed as UI controls
        // Extract globals section from definition
        // Handle both multi-line globals and empty globals = {}
        let globalsSection = ''

        // First try to match empty globals on a single line
        const emptyGlobalsMatch = definitionSource.match(/globals\s*=\s*\{\s*\};/)
        if (emptyGlobalsMatch) {
            // Empty globals, nothing to check
            globalsSection = ''
        } else {
            // Try to match multi-line globals block
            // The block ends with }; at the same indent level as globals (2 spaces for class properties)
            const multiLineMatch = definitionSource.match(/globals\s*=\s*\{([\s\S]*?)\n {2}\};/)
            globalsSection = multiLineMatch ? multiLineMatch[1] : ''
        }

        // Look for global entries that expose internal uniforms as controls
        // An internal uniform is leaked if:
        // 1. It has a uniform property matching an internal name, AND
        // 2. It doesn't have ui.control set to false
        for (const internalName of INTERNAL_UNIFORMS) {
            // Check if there's a global with uniform: "internalName" or uniform: 'internalName'
            // and it doesn't have control: false in its ui section
            const uniformPattern = new RegExp(
                `(\\w+):\\s*\\{[^}]*uniform:\\s*["']${internalName}["'][^}]*\\}`,
                'g'
            )
            const matches = [...globalsSection.matchAll(uniformPattern)]

            for (const match of matches) {
                const globalBlock = match[0]
                // Check if ui.control is explicitly set to false
                const hasControlFalse = /ui:\s*\{[^}]*control:\s*false[^}]*\}/.test(globalBlock)
                if (!hasControlFalse) {
                    result.leakedInternalUniforms.push(internalName)
                }
            }
        }

        // =====================================================================
        // NAMING CONVENTION VALIDATION (camelCase)
        // =====================================================================

        // Note: Class names (the `name` property) use StudlyCaps/PascalCase - that's correct.
        // The canonical DSL name is the `func` property, which must be camelCase.
        // Disk directory names and shader file names must also be camelCase.

        // 1. Check that disk directory name is valid camelCase
        const diskCheck = checkCamelCase(effectName)
        if (!diskCheck.valid) {
            result.namingIssues.push({
                type: 'diskName',
                name: effectName,
                reason: diskCheck.reason
            })
        }

        // 2. Check func property (the canonical DSL name) - must be camelCase
        const funcMatch = definitionSource.match(/^\s*func\s*=\s*["']([^"']+)["']/m)
        if (funcMatch) {
            const funcName = funcMatch[1]
            const funcCheck = checkCamelCase(funcName)
            if (!funcCheck.valid) {
                result.namingIssues.push({
                    type: 'func',
                    name: funcName,
                    reason: funcCheck.reason
                })
            }

            // 3. Check that disk name matches func name (the canonical DSL name)
            if (funcCheck.valid && diskCheck.valid && effectName !== funcName) {
                result.namingIssues.push({
                    type: 'diskNameMismatch',
                    name: effectName,
                    expected: funcName,
                    reason: `disk name "${effectName}" does not match func "${funcName}"`
                })
            }
        }

        // 3. Check uniform names in globals section
        const uniformMatches = globalsSection.matchAll(/uniform:\s*["']([^"']+)["']/g)
        for (const match of uniformMatches) {
            const uniformName = match[1]
            const uniformCheck = checkCamelCase(uniformName)
            if (!uniformCheck.valid) {
                result.namingIssues.push({
                    type: 'uniform',
                    name: uniformName,
                    reason: uniformCheck.reason
                })
            }
        }

        // 4. Check global property names (keys in globals object)
        const globalKeyMatches = globalsSection.matchAll(/^\s{4}(\w+):\s*\{/gm)
        for (const match of globalKeyMatches) {
            const globalKey = match[1]
            const keyCheck = checkCamelCase(globalKey)
            if (!keyCheck.valid) {
                result.namingIssues.push({
                    type: 'globalKey',
                    name: globalKey,
                    reason: keyCheck.reason
                })
            }
        }

        // 5. Check in-class enum keys (choices object keys)
        // The choices object defines enum values like: choices: { none: 0, obedient: 1 }
        // All keys must be camelCase (starting with lowercase)
        //
        // SKIP validation for:
        // - Category headers ending with colon (e.g., "Shapes:")
        //
        // DO validate (and require camelCase for):
        // - Simple alphanumeric keys (circle, Linear → should be circle, linear)
        // - Keys with spaces (should be converted: "Random Mix" → randomMix)
        // - Keys with dashes/underscores (should be converted: "Catmull-Rom" → catmullRom)
        // - Keys with special chars (should be stripped: "32³" → size32, "Deriv+divide" → derivDivide)
        const choicesMatches = globalsSection.matchAll(/(?:["']?choices["']?)\s*:\s*\{([^}]+)\}/g)
        for (const choicesMatch of choicesMatches) {
            const choicesContent = choicesMatch[1]
            // Match both unquoted keys and quoted keys
            const keyMatches = choicesContent.matchAll(/(?:^|,)\s*(?:["']([^"']+)["']|(\w+))\s*:/gm)
            for (const keyMatch of keyMatches) {
                const enumKey = keyMatch[1] || keyMatch[2] // quoted or unquoted
                if (!enumKey) continue

                // Skip category headers (end with colon)
                if (enumKey.endsWith(':')) continue

                const keyCheck = checkCamelCase(enumKey)
                if (!keyCheck.valid) {
                    result.namingIssues.push({
                        type: 'enumKey',
                        name: enumKey,
                        reason: keyCheck.reason
                    })
                }
            }
        }

        // 6. Check texture/surface names in passes (inputs and outputs)
        // Parse inputs and outputs objects from passes
        const inputsMatches = passesSection.matchAll(/inputs:\s*\{([^}]+)\}/g)
        for (const inputsMatch of inputsMatches) {
            const inputsContent = inputsMatch[1]
            const textureRefs = inputsContent.matchAll(/(\w+):\s*["']([^"']+)["']/g)
            for (const ref of textureRefs) {
                const inputKey = ref[1]
                const textureName = ref[2]

                // Check the input key (e.g., stateTex1, mixerTex)
                const keyCheck = checkCamelCase(inputKey)
                if (!keyCheck.valid) {
                    result.namingIssues.push({
                        type: 'passInputKey',
                        name: inputKey,
                        reason: keyCheck.reason
                    })
                }

                // Check the texture name (allows global_, _ prefixes, and reserved names)
                const texCheck = checkTextureName(textureName)
                if (!texCheck.valid) {
                    result.namingIssues.push({
                        type: 'textureName',
                        name: textureName,
                        reason: texCheck.reason
                    })
                }
            }
        }

        const outputsMatches = passesSection.matchAll(/outputs:\s*\{([^}]+)\}/g)
        for (const outputsMatch of outputsMatches) {
            const outputsContent = outputsMatch[1]
            const textureRefs = outputsContent.matchAll(/(\w+):\s*["']([^"']+)["']/g)
            for (const ref of textureRefs) {
                const outputKey = ref[1]
                const textureName = ref[2]

                // Check the output key (e.g., fragColor, outState1)
                const keyCheck = checkCamelCase(outputKey)
                if (!keyCheck.valid) {
                    result.namingIssues.push({
                        type: 'passOutputKey',
                        name: outputKey,
                        reason: keyCheck.reason
                    })
                }

                // Check the texture name (allows global_, _ prefixes, and reserved names)
                const texCheck = checkTextureName(textureName)
                if (!texCheck.valid) {
                    result.namingIssues.push({
                        type: 'textureName',
                        name: textureName,
                        reason: texCheck.reason
                    })
                }
            }
        }

        // 7. Check pass names
        const passNameMatches = passesSection.matchAll(/name:\s*["']([^"']+)["']/g)
        for (const match of passNameMatches) {
            const passName = match[1]
            const passCheck = checkCamelCase(passName)
            if (!passCheck.valid) {
                result.namingIssues.push({
                    type: 'passName',
                    name: passName,
                    reason: passCheck.reason
                })
            }
        }

        // 8. Check program names (shader file references)
        for (const programName of referencedPrograms) {
            const progCheck = checkCamelCase(programName)
            if (!progCheck.valid) {
                result.namingIssues.push({
                    type: 'programName',
                    name: programName,
                    reason: progCheck.reason
                })
            }
        }

        // List shader files in the appropriate directory
        const shaderDirPath = path.join(effectDir, shaderDir)
        let shaderFiles = []

        try {
            const allFiles = fs.readdirSync(shaderDirPath)

            if (backend === 'webgl2') {
                // For GLSL, collect unique program names from:
                // - Combined shaders: name.glsl -> "name"
                // - Split shaders: name.vert + name.frag -> "name"
                const programNamesOnDisk = new Set()
                for (const f of allFiles) {
                    if (f.endsWith('.glsl')) {
                        programNamesOnDisk.add(f.replace('.glsl', ''))
                    } else if (f.endsWith('.vert') || f.endsWith('.frag')) {
                        programNamesOnDisk.add(f.replace(/\.(vert|frag)$/, ''))
                    }
                }
                shaderFiles = [...programNamesOnDisk]
            } else {
                // For WGSL, just .wgsl files
                shaderFiles = allFiles
                    .filter(f => f.endsWith(shaderExt))
                    .map(f => f.replace(shaderExt, ''))
            }
        } catch (err) {
            // Shader directory doesn't exist - that's a bigger problem, but not what we're testing here
            return result
        }

        // Find unused files (shader programs on disk that aren't referenced in passes)
        for (const file of shaderFiles) {
            if (!referencedPrograms.has(file)) {
                result.unusedFiles.push(file + (backend === 'webgl2' ? '.glsl (or .vert/.frag)' : shaderExt))
            }
        }

        // =====================================================================
        // REQUIRED UNIFORMS VALIDATION
        // =====================================================================
        // Check that shaders properly declare system uniforms they use.
        // System uniforms (resolution, time, aspect, etc.) are auto-provided by
        // the runtime, but shaders must still declare them to receive the values.

        const isGLSL = backend === 'webgl2'

        // Read all shader files and check for system uniform usage vs declaration
        for (const programName of referencedPrograms) {
            // Determine which files to check
            const filesToCheck = []

            if (isGLSL) {
                // Check for split shaders first (.vert/.frag), then combined (.glsl)
                const vertPath = path.join(shaderDirPath, `${programName}.vert`)
                const fragPath = path.join(shaderDirPath, `${programName}.frag`)
                const combinedPath = path.join(shaderDirPath, `${programName}.glsl`)

                if (fs.existsSync(vertPath)) filesToCheck.push({ path: vertPath, name: `${programName}.vert` })
                if (fs.existsSync(fragPath)) filesToCheck.push({ path: fragPath, name: `${programName}.frag` })
                if (fs.existsSync(combinedPath)) filesToCheck.push({ path: combinedPath, name: `${programName}.glsl` })
            } else {
                // WGSL - just .wgsl
                const wgslPath = path.join(shaderDirPath, `${programName}.wgsl`)
                if (fs.existsSync(wgslPath)) filesToCheck.push({ path: wgslPath, name: `${programName}.wgsl` })
            }

            for (const { path: filePath, name: fileName } of filesToCheck) {
                try {
                    const shaderSource = fs.readFileSync(filePath, 'utf-8')

                    // For each system uniform, check if it's used but not declared
                    for (const [uniformName, uniformSpec] of Object.entries(SYSTEM_UNIFORMS)) {
                        const declPattern = isGLSL ? uniformSpec.glslDecl : uniformSpec.wgslDecl
                        const hasDeclared = declPattern.test(shaderSource)

                        // Check if there's a local variable declaration that shadows this name
                        // GLSL: "float time = ..." or "vec2 resolution = ..."
                        // WGSL: "var time: f32 = ..." or "let resolution = ..."
                        const glslLocalDeclPattern = new RegExp(
                            `\\b(float|int|vec[234]|mat[234]|ivec[234]|uvec[234])\\s+${uniformName}\\s*[=;]`
                        )
                        const wgslLocalDeclPattern = new RegExp(
                            `\\b(var|let)\\s+${uniformName}\\s*[=:]`
                        )
                        const localDeclPattern = isGLSL ? glslLocalDeclPattern : wgslLocalDeclPattern
                        const hasLocalDecl = localDeclPattern.test(shaderSource)

                        // Check if there's a #define macro for this name (GLSL only)
                        // e.g., #define aspectRatio resolution.x / resolution.y
                        const hasDefine = isGLSL && new RegExp(`#define\\s+${uniformName}\\b`).test(shaderSource)

                        // Check if there's a function declaration for this name (WGSL)
                        // e.g., fn aspectRatio() -> f32 { ... }
                        const hasFunction = !isGLSL && new RegExp(`fn\\s+${uniformName}\\s*\\(`).test(shaderSource)

                        // Check if name is used as a function parameter (GLSL or WGSL)
                        // GLSL: func(float speed) or func(vec2 resolution)
                        // WGSL: func(speed: f32) or func(resolution: vec2f)
                        const glslParamPattern = new RegExp(`\\(\\s*[^)]*\\b(float|int|vec[234]|mat[234]|ivec[234]|uvec[234])\\s+${uniformName}\\b`)
                        const wgslParamPattern = new RegExp(`\\(\\s*[^)]*\\b${uniformName}\\s*:\\s*(f32|i32|u32|vec[234]f?|mat[234]x[234]f?)`)
                        const hasFunctionParam = (isGLSL ? glslParamPattern : wgslParamPattern).test(shaderSource)

                        // Check if name appears as a struct field (WGSL)
                        // e.g., "time : f32," or "resolution: vec2<f32>," inside a struct
                        // This covers uniforms passed via uniform structs
                        const wgslStructFieldPattern = new RegExp(`\\b${uniformName}\\s*:\\s*(f32|i32|u32|vec[234]<f32>|vec[234]f)\\s*,`)
                        const hasStructField = !isGLSL && wgslStructFieldPattern.test(shaderSource)

                        // If there's a local variable, #define, function, function param, or struct field with this name,
                        // it shadows any uniform so we don't need to check for uniform declaration
                        if (hasLocalDecl || hasDefine || hasFunction || hasFunctionParam || hasStructField) {
                            continue
                        }

                        // Check if any usage pattern matches in the code body
                        // We strip out comments to avoid false positives from commented code
                        let codeWithoutComments = shaderSource
                            // Remove multi-line comments first (before single-line)
                            .replace(/\/\*[\s\S]*?\*\//g, '')
                            // Remove single-line comments
                            .replace(/\/\/[^\n]*/g, '')

                        // Also strip the uniform declaration itself so we don't count it as "usage"
                        codeWithoutComments = codeWithoutComments
                            .replace(/uniform\s+\w+\s+\w+\s*;/g, '')
                            .replace(/@group\([^)]+\)\s*@binding\([^)]+\)\s*var<uniform>\s+\w+\s*:[^;]+;/g, '')

                        const isUsed = uniformSpec.usagePatterns.some(pattern => pattern.test(codeWithoutComments))

                        if (isUsed && !hasDeclared) {
                            result.requiredUniformIssues.push({
                                file: fileName,
                                uniform: uniformName,
                                message: `Shader uses '${uniformName}' but doesn't declare it as a uniform`
                            })
                        }
                    }
                } catch (readErr) {
                    // Can't read shader file - skip
                }
            }
        }

        // Validate split shader consistency (GLSL only)
        // When using custom vertex shaders (not the default full-screen triangle),
        // GLSL files must be split into .vert and .frag extensions
        if (backend === 'webgl2') {
            const glslPath = path.join(effectDir, 'glsl')
            try {
                const allGlslFiles = fs.readdirSync(glslPath)
                const vertFiles = allGlslFiles.filter(f => f.endsWith('.vert')).map(f => f.replace('.vert', ''))
                const fragFiles = allGlslFiles.filter(f => f.endsWith('.frag')).map(f => f.replace('.frag', ''))
                const combinedFiles = allGlslFiles.filter(f => f.endsWith('.glsl')).map(f => f.replace('.glsl', ''))

                for (const base of vertFiles) {
                    // Check: .vert file must have matching .frag file
                    if (!fragFiles.includes(base)) {
                        result.splitShaderIssues.push({
                            type: 'orphan_vert',
                            file: `${base}.vert`,
                            message: `Orphan vertex shader: ${base}.vert has no matching ${base}.frag`
                        })
                    }
                    // Check: .vert file must not have a matching .glsl file (would be ambiguous)
                    if (combinedFiles.includes(base)) {
                        result.splitShaderIssues.push({
                            type: 'ambiguous',
                            file: base,
                            message: `Ambiguous shader: both ${base}.vert and ${base}.glsl exist`
                        })
                    }
                    // Check: split shader must be referenced in the definition
                    if (!referencedPrograms.has(base)) {
                        result.splitShaderIssues.push({
                            type: 'unused_split',
                            file: `${base}.vert/.frag`,
                            message: `Split shader pair ${base}.vert/${base}.frag not referenced in passes`
                        })
                    }
                }

                for (const base of fragFiles) {
                    // Check: .frag file must have matching .vert file
                    if (!vertFiles.includes(base)) {
                        result.splitShaderIssues.push({
                            type: 'orphan_frag',
                            file: `${base}.frag`,
                            message: `Orphan fragment shader: ${base}.frag has no matching ${base}.vert`
                        })
                    }
                }
            } catch (err) {
                // GLSL directory doesn't exist - not a split shader issue
            }
        }

        // =====================================================================
        // STRUCTURAL PARITY VALIDATION (GLSL ↔ WGSL 1:1 mapping)
        // =====================================================================
        // Every GLSL shader program must have a corresponding WGSL shader and vice versa.
        // This enforces exact 1:1 structural parity across shader languages.

        const glslPath = path.join(effectDir, 'glsl')
        const wgslPath = path.join(effectDir, 'wgsl')

        let glslPrograms = new Set()
        let wgslPrograms = new Set()

        try {
            const glslFiles = fs.readdirSync(glslPath)
            // Get unique program names from GLSL files
            // .glsl files → program name is the base name
            // .vert/.frag files → program name is the base name (both must exist)
            for (const file of glslFiles) {
                if (file.endsWith('.glsl')) {
                    glslPrograms.add(file.replace('.glsl', ''))
                } else if (file.endsWith('.vert') || file.endsWith('.frag')) {
                    glslPrograms.add(file.replace(/\.(vert|frag)$/, ''))
                }
            }
        } catch (err) {
            // No GLSL directory
        }

        try {
            const wgslFiles = fs.readdirSync(wgslPath)
            for (const file of wgslFiles) {
                if (file.endsWith('.wgsl')) {
                    wgslPrograms.add(file.replace('.wgsl', ''))
                }
            }
        } catch (err) {
            // No WGSL directory
        }

        // Find programs that exist in GLSL but not in WGSL
        for (const program of glslPrograms) {
            if (!wgslPrograms.has(program)) {
                result.structuralParityIssues.push({
                    type: 'missing_wgsl',
                    program,
                    message: `GLSL program "${program}" has no corresponding WGSL shader`
                })
            }
        }

        // Find programs that exist in WGSL but not in GLSL
        for (const program of wgslPrograms) {
            if (!glslPrograms.has(program)) {
                result.structuralParityIssues.push({
                    type: 'missing_glsl',
                    program,
                    message: `WGSL program "${program}" has no corresponding GLSL shader`
                })
            }
        }

    } catch (err) {
        // Can't read definition - skip structure check
        result.error = err.message
    }

    return result
}

/**
 * Check algorithmic parity between GLSL and WGSL shader implementations.
 *
 * Uses OpenAI API to compare shader pairs and determine if they implement
 * equivalent algorithms, accounting for language differences between GLSL and WGSL.
 *
 * @param {string} effectId - Effect identifier (e.g., "classicBasics/noise")
 * @param {object} options
 * @param {string} [options.apiKey] - OpenAI API key (falls back to .openai file)
 * @param {string} [options.model='gpt-4o'] - Model to use for comparison
 * @returns {Promise<{status: 'ok'|'error'|'divergent', pairs: Array<{program: string, glsl: string, wgsl: string, parity: 'equivalent'|'divergent'|'missing', notes?: string}>, summary: string}>}
 */
export async function checkShaderParity(effectId, options = {}) {
    const apiKey = options.apiKey || getOpenAIApiKey()
    if (!apiKey) {
        return {
            status: 'error',
            pairs: [],
            summary: 'No OpenAI API key found. Create .openai file in project root.'
        }
    }

    const model = options.model || 'gpt-4o'

    // Parse effect ID to get directory path
    const [namespace, effectName] = effectId.split('/')
    const effectDir = path.join(PROJECT_ROOT, 'shaders', 'effects', namespace, effectName)

    const glslDir = path.join(effectDir, 'glsl')
    const wgslDir = path.join(effectDir, 'wgsl')

    // Check if both directories exist
    let glslFiles = []
    let wgslFiles = []

    try {
        glslFiles = fs.readdirSync(glslDir).filter(f => f.endsWith('.glsl') || f.endsWith('.vert') || f.endsWith('.frag'))
    } catch {
        // GLSL directory doesn't exist
    }

    try {
        wgslFiles = fs.readdirSync(wgslDir).filter(f => f.endsWith('.wgsl'))
    } catch {
        // WGSL directory doesn't exist
    }

    if (glslFiles.length === 0 && wgslFiles.length === 0) {
        return {
            status: 'error',
            pairs: [],
            summary: `No shader files found for ${effectId}`
        }
    }

    if (glslFiles.length === 0) {
        return {
            status: 'ok',
            pairs: [],
            summary: `${effectId}: WGSL-only effect (${wgslFiles.length} files), no parity check needed`
        }
    }

    if (wgslFiles.length === 0) {
        return {
            status: 'ok',
            pairs: [],
            summary: `${effectId}: GLSL-only effect (${glslFiles.length} files), no parity check needed`
        }
    }

    // Find matching pairs by base name
    // GLSL can have .glsl, .vert, .frag extensions
    // WGSL always has .wgsl extension
    const pairs = []
    const processedWgsl = new Set()

    for (const glslFile of glslFiles) {
        // Get base name (strip extension)
        const baseName = glslFile.replace(/\.(glsl|vert|frag)$/, '')
        const wgslFile = `${baseName}.wgsl`

        if (wgslFiles.includes(wgslFile)) {
            processedWgsl.add(wgslFile)

            const glslPath = path.join(glslDir, glslFile)
            const wgslPath = path.join(wgslDir, wgslFile)

            const glslSource = fs.readFileSync(glslPath, 'utf-8')
            const wgslSource = fs.readFileSync(wgslPath, 'utf-8')

            pairs.push({
                program: baseName,
                glslFile,
                wgslFile,
                glsl: glslSource,
                wgsl: wgslSource
            })
        }
    }

    // Note any unmatched files
    const unmatchedGlsl = glslFiles.filter(f => {
        const baseName = f.replace(/\.(glsl|vert|frag)$/, '')
        return !wgslFiles.includes(`${baseName}.wgsl`)
    })

    const unmatchedWgsl = wgslFiles.filter(f => !processedWgsl.has(f))

    if (pairs.length === 0) {
        const summary = []
        if (unmatchedGlsl.length > 0) summary.push(`GLSL-only: ${unmatchedGlsl.join(', ')}`)
        if (unmatchedWgsl.length > 0) summary.push(`WGSL-only: ${unmatchedWgsl.join(', ')}`)
        return {
            status: 'error',
            pairs: [],
            summary: `${effectId}: No matching shader pairs found. Cannot analyze parity. ${summary.join('. ')}`
        }
    }

    // Read the effect definition for context
    let definitionSource = ''
    try {
        const definitionPath = path.join(effectDir, 'definition.js')
        definitionSource = fs.readFileSync(definitionPath, 'utf-8')
    } catch {
        // Definition file doesn't exist or can't be read
    }

    // Compare each pair using OpenAI API
    const results = []
    let hasDivergent = false

    for (const pair of pairs) {
        const systemPrompt = `You are an expert shader programmer analyzing algorithmic equivalence between GLSL (WebGL2) and WGSL (WebGPU) shader implementations.

IMPORTANT CONTEXT about our shader pipeline:
- We use "type: compute" semantically for passes that do GPGPU-style work (simulations, state updates, multi-output)
- On WebGPU: These run as native @compute shaders
- On WebGL2: These are AUTOMATICALLY converted to render passes (fragment shaders with MRT)
- Therefore, a GLSL fragment shader and a WGSL compute shader for the same pass ARE expected to be equivalent
- The conversion handles: workgroup concepts → pixel iteration, storage textures → render targets
- Do NOT flag as divergent just because one is a fragment shader and one is a compute shader

Your task is to determine if these two shaders implement the SAME algorithm, accounting for:
- Language syntax differences (vec3 vs vec3<f32>, etc.)
- Built-in function name differences (mix vs mix, texture vs textureSample, etc.)
- Binding/uniform declaration differences
- Fragment shader vs compute shader structural differences (these are expected cross-backend)
- Minor numerical precision variations that are acceptable

Flag as DIVERGENT only if:
- The core algorithm is fundamentally different
- One has features the other lacks entirely
- Mathematical operations differ in ways that would produce notably different output
- Control flow logic differs substantially

Respond with JSON containing:
- parity: "equivalent" or "divergent"
- confidence: "high", "medium", or "low"
- notes: Brief explanation of your assessment (1-2 sentences)
- concerns: Array of specific concerns if any (empty array if none)`

        // Build context about this specific program from the definition
        let programContext = ''
        if (definitionSource) {
            // Extract the pass definition for this program
            const passPattern = new RegExp(`\\{[^}]*program:\\s*["']${pair.program}["'][^}]*\\}`, 's')
            const passMatch = definitionSource.match(passPattern)
            if (passMatch) {
                programContext = `\n\n=== Pass Definition for "${pair.program}" ===\n${passMatch[0]}`
            }
        }

        const userPrompt = `Compare these shader implementations for algorithmic equivalence:
${definitionSource ? `\n=== Effect Definition (for context) ===\n${definitionSource.slice(0, 2000)}${definitionSource.length > 2000 ? '\n... (truncated)' : ''}` : ''}
${programContext}

=== GLSL (${pair.glslFile}) ===
${pair.glsl}

=== WGSL (${pair.wgslFile}) ===
${pair.wgsl}

Are these implementations algorithmically equivalent?`

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    max_tokens: 500,
                    response_format: { type: 'json_object' }
                })
            })

            if (!response.ok) {
                const errorText = await response.text()
                results.push({
                    program: pair.program,
                    parity: 'error',
                    notes: `API error: ${response.status} - ${errorText.slice(0, 100)}`
                })
                continue
            }

            const data = await response.json()
            const content = data.choices?.[0]?.message?.content

            if (!content) {
                results.push({
                    program: pair.program,
                    parity: 'error',
                    notes: 'No response from model'
                })
                continue
            }

            const analysis = JSON.parse(content)
            const isDivergent = analysis.parity === 'divergent'
            if (isDivergent) hasDivergent = true

            results.push({
                program: pair.program,
                parity: analysis.parity,
                confidence: analysis.confidence,
                notes: analysis.notes,
                concerns: analysis.concerns || []
            })

        } catch (err) {
            results.push({
                program: pair.program,
                parity: 'error',
                notes: `Analysis failed: ${err.message}`
            })
        }
    }

    // Build summary
    const equivalent = results.filter(r => r.parity === 'equivalent').length
    const divergent = results.filter(r => r.parity === 'divergent').length
    const errors = results.filter(r => r.parity === 'error').length

    let summaryParts = [`${effectId}: ${pairs.length} shader pair(s) analyzed`]
    if (equivalent > 0) summaryParts.push(`${equivalent} equivalent`)
    if (divergent > 0) summaryParts.push(`${divergent} DIVERGENT`)
    if (errors > 0) summaryParts.push(`${errors} errors`)
    if (unmatchedGlsl.length > 0) summaryParts.push(`${unmatchedGlsl.length} GLSL-only`)
    if (unmatchedWgsl.length > 0) summaryParts.push(`${unmatchedWgsl.length} WGSL-only`)

    return {
        status: hasDivergent ? 'divergent' : 'ok',
        pairs: results,
        unmatchedGlsl,
        unmatchedWgsl,
        summary: summaryParts.join(', ')
    }
}

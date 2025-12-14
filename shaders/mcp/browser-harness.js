/**
 * Browser Harness for Shader Effect Testing
 *
 * Provides explicit setup/teardown lifecycle for browser-based shader testing.
 * Each tool invocation follows this pattern:
 *
 * 1. Setup: Launch browser, open fresh page, load demo UI
 * 2. Configure: Set backend (webgl2 or webgpu)
 * 3. Main loop: For each effect, load/compile and run the specific test
 * 4. Teardown: Close page, close browser, clean up resources
 *
 * This design ensures no stale browser state between invocations.
 */

import { chromium } from '@playwright/test'
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import {
    compileEffect,
    renderEffectFrame,
    runDslProgram,
    benchmarkEffectFps,
    describeEffectFrame,
    checkEffectStructure,
    checkShaderParity,
    testNoPassthrough,
    testPixelParity,
    isFilterEffect,
    isStatefulEffect,
    STATUS_TIMEOUT
} from './core-operations.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '../..')

/** Grace period between effect tests (ms) */
const GRACE_PERIOD_MS = 125

/**
 * Shared HTTP server management.
 * The server is started once and reused across harness instances.
 */
let sharedServerProcess = null
let sharedServerRefCount = 0
const SERVER_HOST = '127.0.0.1'
const SERVER_PORT = 4173

/**
 * Start the shared HTTP server if not already running.
 * @returns {Promise<void>}
 */
async function acquireServer() {
    if (sharedServerRefCount > 0) {
        sharedServerRefCount++
        return
    }

    return new Promise((resolve, reject) => {
        const serverScript = path.join(PROJECT_ROOT, 'shaders/scripts/serve.js')

        sharedServerProcess = spawn('node', [serverScript], {
            cwd: PROJECT_ROOT,
            env: {
                ...process.env,
                HOST: SERVER_HOST,
                PORT: String(SERVER_PORT)
            },
            stdio: ['ignore', 'pipe', 'pipe']
        })

        let started = false

        sharedServerProcess.stdout.on('data', (data) => {
            const output = data.toString()
            if (output.includes('listening') || !started) {
                started = true
            }
        })

        sharedServerProcess.stderr.on('data', () => {
            // Server logs to stderr
        })

        sharedServerProcess.on('error', (err) => {
            reject(new Error(`Failed to start server: ${err.message}`))
        })

        // Give server time to start
        setTimeout(() => {
            sharedServerRefCount++
            resolve()
        }, 1000)
    })
}

/**
 * Release the shared HTTP server reference.
 * Server is killed when last reference is released.
 */
function releaseServer() {
    sharedServerRefCount--
    if (sharedServerRefCount <= 0 && sharedServerProcess) {
        sharedServerProcess.kill('SIGTERM')
        sharedServerProcess.unref()
        sharedServerProcess = null
        sharedServerRefCount = 0
    }
}

/**
 * Launch browser options for WebGPU support.
 */
function getBrowserLaunchOptions(headless) {
    return {
        headless,
        args: [
            '--enable-unsafe-webgpu',
            '--enable-features=Vulkan',
            '--enable-webgpu-developer-features',
            '--disable-gpu-sandbox',
            process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=vulkan',
        ]
    }
}

/**
 * Browser Session - manages a single browser/page lifecycle.
 *
 * Each session has explicit setup() and teardown() methods.
 * No state persists between sessions.
 */
export class BrowserSession {
    constructor(options = {}) {
        this.options = {
            host: options.host || SERVER_HOST,
            port: options.port || SERVER_PORT,
            headless: options.headless !== false,
            backend: options.backend || 'webgl2',
            useBundles: options.useBundles || false,
            ...options
        }

        this.browser = null
        this.context = null
        this.page = null
        this.baseUrl = `http://${this.options.host}:${this.options.port}`
        this.consoleMessages = []
        this._isSetup = false
    }

    /**
     * Setup: Launch browser, open page, load demo, configure backend.
     */
    async setup() {
        if (this._isSetup) {
            throw new Error('Session already set up. Call teardown() first.')
        }

        // Ensure HTTP server is running
        await acquireServer()

        // Launch browser
        this.browser = await chromium.launch(getBrowserLaunchOptions(this.options.headless))

        // Use smaller viewport in CI for faster software rendering
        const viewportSize = process.env.CI ? { width: 256, height: 256 } : { width: 1280, height: 720 }
        this.context = await this.browser.newContext({
            viewport: viewportSize,
            ignoreHTTPSErrors: true
        })

        this.page = await this.context.newPage()
        this.page.setDefaultTimeout(STATUS_TIMEOUT)
        this.page.setDefaultNavigationTimeout(STATUS_TIMEOUT)

        // Capture console messages
        this.consoleMessages = []
        this.page.on('console', msg => {
            const text = msg.text()
            if (text.includes('Error') || text.includes('error') || text.includes('warning') ||
                text.includes('Storage') || text.includes('getOutput') ||
                text.includes('[bindTextures]') || text.includes('DSL') ||
                text.includes('[WebGPU') || text.includes('GPGPU') ||
                text.includes('[passthrough]') || text.includes('[DEBUG]') ||
                text.includes('[executePass]') || text.includes('[executeComputePass]') || text.includes('[copyBufferToTexture]') ||
                text.includes('[createBindGroup]') || text.includes('[createUniformBuffer]') ||
                text.includes('[compileEffect]') || text.includes('[expand]') || text.includes('[EXPANDER') ||
                text.includes('[Pipeline') || text.includes('[setUniform]') ||
                text.includes('[recreateTextures]') || text.includes('[updateParameterTextures]') ||
                text.includes('[MCP-UNIFORM]') ||
                msg.type() === 'error' || msg.type() === 'warning') {
                this.consoleMessages.push({ type: msg.type(), text })
            }
        })

        this.page.on('pageerror', error => {
            this.consoleMessages.push({ type: 'pageerror', text: error.message })
        })

        // Navigate to demo page (with bundles param if enabled)
        const demoUrl = this.options.useBundles
            ? `${this.baseUrl}/demo/shaders/?bundles=1`
            : `${this.baseUrl}/demo/shaders/`
        await this.page.goto(demoUrl, { waitUntil: 'networkidle' })

        // Wait for app to be ready
        await this.page.waitForFunction(() => {
            const app = document.getElementById('app-container')
            return !!app && window.getComputedStyle(app).display !== 'none'
        }, { timeout: STATUS_TIMEOUT })

        // Wait for effects to load (check either native select or custom component)
        await this.page.waitForFunction(
            () => {
                const select = document.getElementById('effect-select')
                if (!select) return false
                // Native select: check options
                if (select.options && select.options.length > 0) return true
                // Custom component: check if setEffects was called (has _flatOptions)
                if (select._flatOptions && select._flatOptions.length > 0) return true
                // Custom component: check shadow DOM for options
                if (select.shadowRoot) {
                    const options = select.shadowRoot.querySelectorAll('.option')
                    return options.length > 0
                }
                return false
            },
            { timeout: STATUS_TIMEOUT }
        )

        // Configure backend
        await this._setBackend(this.options.backend)

        this._isSetup = true
    }

    /**
     * Teardown: Close page, close browser, release resources.
     */
    async teardown() {
        if (this.page) {
            await this.page.close().catch(() => {})
            this.page = null
        }

        if (this.context) {
            await this.context.close().catch(() => {})
            this.context = null
        }

        if (this.browser) {
            await this.browser.close().catch(() => {})
            this.browser = null
        }

        releaseServer()
        this.consoleMessages = []
        this._isSetup = false
    }

    /**
     * Set the rendering backend.
     * @param {'webgl2'|'webgpu'} backend
     */
    async _setBackend(backend) {
        const targetBackend = backend === 'webgpu' ? 'wgsl' : 'glsl'

        await this.page.evaluate(async ({ targetBackend, timeout }) => {
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
        }, { targetBackend, timeout: STATUS_TIMEOUT })
    }

    /**
     * Clear console messages.
     */
    clearConsoleMessages() {
        this.consoleMessages = []
    }

    /**
     * Get console messages.
     */
    getConsoleMessages() {
        return this.consoleMessages || []
    }

    /**
     * List available effects.
     */
    async listEffects() {
        return await this.page.evaluate(() => {
            const select = document.getElementById('effect-select')
            if (!select) return []

            // Custom web component: use options property
            if (select.options && typeof select.options.map === 'function') {
                return select.options.map(opt => opt.value).filter(v => v)
            }

            // Native select fallback
            if (select.options) {
                return Array.from(select.options).map(opt => opt.value).filter(v => v)
            }

            return []
        })
    }

    /**
     * Get effect globals (parameters) for the currently loaded effect.
     */
    async getEffectGlobals() {
        return await this.page.evaluate(() => {
            const effect = window.__noisemakerCurrentEffect
            if (!effect || !effect.instance || !effect.instance.globals) {
                return {}
            }
            return effect.instance.globals
        })
    }

    /**
     * Reset all uniforms to their default values.
     */
    async resetUniformsToDefaults() {
        await this.page.evaluate(() => {
            const pipeline = window.__noisemakerRenderingPipeline
            const effect = window.__noisemakerCurrentEffect

            if (!pipeline || !effect?.instance?.globals) return

            const globals = effect.instance.globals

            for (const spec of Object.values(globals)) {
                if (!spec.uniform) continue

                const defaultVal = spec.default ?? spec.min ?? 0

                if (pipeline.setUniform) {
                    pipeline.setUniform(spec.uniform, defaultVal)
                } else {
                    if (pipeline.globalUniforms) {
                        pipeline.globalUniforms[spec.uniform] = defaultVal
                    }
                    for (const pass of pipeline.graph?.passes || []) {
                        if (pass.uniforms && spec.uniform in pass.uniforms) {
                            pass.uniforms[spec.uniform] = defaultVal
                        }
                    }
                }
            }

            // Reset time
            if (pipeline.setUniform) {
                if ('time' in (pipeline.globalUniforms || {})) pipeline.setUniform('time', 0)
                if ('u_time' in (pipeline.globalUniforms || {})) pipeline.setUniform('u_time', 0)
            } else if (pipeline.globalUniforms) {
                if ('time' in pipeline.globalUniforms) pipeline.globalUniforms.time = 0
                if ('u_time' in pipeline.globalUniforms) pipeline.globalUniforms.u_time = 0
            }
            for (const pass of pipeline.graph?.passes || []) {
                if (pass.uniforms) {
                    if ('time' in pass.uniforms) pass.uniforms.time = 0
                    if ('u_time' in pass.uniforms) pass.uniforms.u_time = 0
                }
            }
        })
    }

    // =========================================================================
    // Core test operations - wrap core-operations.js functions
    // =========================================================================

    /**
     * Compile an effect.
     */
    async compileEffect(effectId) {
        this.clearConsoleMessages()
        const result = await compileEffect(this.page, effectId, { backend: this.options.backend })
        if (this.consoleMessages.length > 0) {
            result.console_errors = this.consoleMessages.map(m => m.text)
        }
        return result
    }

    /**
     * Render an effect frame and compute metrics.
     */
    async renderEffectFrame(effectId, options = {}) {
        this.clearConsoleMessages()
        const result = await renderEffectFrame(this.page, effectId, {
            backend: this.options.backend,
            ...options
        })
        if (this.consoleMessages.length > 0) {
            result.console_errors = this.consoleMessages.map(m => m.text)
        }
        return result
    }

    /**
     * Run a DSL program and compute metrics.
     */
    async runDslProgram(dsl, options = {}) {
        this.clearConsoleMessages()
        const result = await runDslProgram(this.page, dsl, {
            backend: this.options.backend,
            ...options
        })
        if (this.consoleMessages.length > 0) {
            result.console_errors = this.consoleMessages.map(m => m.text)
        }
        return result
    }

    /**
     * Benchmark effect FPS.
     */
    async benchmarkEffectFps(effectId, options = {}) {
        // Benchmarks MUST run in headed mode for accurate GPU timing
        if (this.options.headless) {
            const headedBrowser = await chromium.launch(getBrowserLaunchOptions(false))

            try {
                const context = await headedBrowser.newContext({
                    viewport: { width: 1280, height: 720 },
                    ignoreHTTPSErrors: true
                })
                const page = await context.newPage()
                page.setDefaultTimeout(STATUS_TIMEOUT)

                const consoleMessages = []
                page.on('console', msg => {
                    const text = msg.text()
                    if (text.includes('Error') || text.includes('error') ||
                        text.includes('[compileEffect]') || text.includes('[expand]') ||
                        msg.type() === 'error' || msg.type() === 'warning') {
                        consoleMessages.push({ type: msg.type(), text })
                    }
                })

                await page.goto(`${this.baseUrl}/demo/shaders/`, { waitUntil: 'networkidle' })
                await page.waitForFunction(() => {
                    const app = document.getElementById('app-container')
                    return !!app && window.getComputedStyle(app).display !== 'none'
                }, { timeout: STATUS_TIMEOUT })
                await page.waitForFunction(
                    () => {
                        const select = document.getElementById('effect-select')
                        if (!select) return false
                        // Custom web component: check options.length
                        if (select.options && select.options.length > 0) return true
                        // Custom component: check shadow DOM for options
                        if (select.shadowRoot) {
                            const options = select.shadowRoot.querySelectorAll('.option')
                            return options.length > 0
                        }
                        return false
                    },
                    { timeout: STATUS_TIMEOUT }
                )

                const result = await benchmarkEffectFps(page, effectId, {
                    backend: this.options.backend,
                    ...options
                })

                if (consoleMessages.length > 0) {
                    result.console_errors = consoleMessages.map(m => m.text)
                }

                return result
            } finally {
                await headedBrowser.close()
            }
        }

        this.clearConsoleMessages()
        const result = await benchmarkEffectFps(this.page, effectId, {
            backend: this.options.backend,
            ...options
        })

        if (this.consoleMessages.length > 0) {
            result.console_errors = this.consoleMessages.map(m => m.text)
        }

        return result
    }

    /**
     * Describe effect frame with AI vision.
     */
    async describeEffectFrame(effectId, prompt, options = {}) {
        this.clearConsoleMessages()
        const result = await describeEffectFrame(this.page, effectId, prompt, {
            backend: this.options.backend,
            ...options
        })

        if (this.consoleMessages.length > 0) {
            result.console_errors = this.consoleMessages.map(m => m.text)
        }

        return result
    }

    /**
     * Test uniform responsiveness.
     */
    async testUniformResponsiveness(effectId, options = {}) {
        this.clearConsoleMessages()

        if (!options.skipCompile) {
            const compileResult = await this.compileEffect(effectId)
            if (compileResult.status === 'error') {
                return { status: 'error', tested_uniforms: [], details: compileResult.message }
            }
        }

        const globals = await this.getEffectGlobals()

        const testableUniforms = []
        for (const [name, spec] of Object.entries(globals)) {
            if (!spec.uniform) continue
            if (spec.type === 'boolean' || spec.type === 'button' || spec.type === 'member') continue

            if (typeof spec.min === 'number' && typeof spec.max === 'number' && spec.min !== spec.max) {
                testableUniforms.push({ name, uniformName: spec.uniform, spec })
            } else if (typeof spec.default === 'number' && (spec.type === 'float' || spec.type === 'int')) {
                const syntheticSpec = {
                    ...spec,
                    min: spec.default * 0.1,
                    max: spec.default * 2 + 1
                }
                testableUniforms.push({ name, uniformName: spec.uniform, spec: syntheticSpec })
            }
        }

        if (testableUniforms.length === 0) {
            return { status: 'skipped', tested_uniforms: [], details: 'No testable numeric uniforms' }
        }

        // Pause animation and lock to time=0 for deterministic testing
        await this.page.evaluate(() => {
            if (window.__noisemakerSetPaused) {
                window.__noisemakerSetPaused(true)
            }
            if (window.__noisemakerSetPausedTime) {
                window.__noisemakerSetPausedTime(0)
            }
        })

        // Helper function to render and capture mean RGB from the canvas
        const captureMetrics = async () => {
            return await this.page.evaluate(() => {
                const renderer = window.__noisemakerCanvasRenderer
                const pipeline = window.__noisemakerRenderingPipeline
                if (!renderer || !pipeline) return null
                
                // Force render at time=0
                renderer.render(0)
                
                // Read pixels directly from the canvas (default framebuffer)
                const canvas = renderer.canvas
                const gl = pipeline.backend?.gl
                if (!gl) {
                    // WebGPU path - not implemented
                    return null
                }
                
                const width = canvas.width
                const height = canvas.height
                const pixels = new Uint8Array(width * height * 4)
                
                // Bind default framebuffer and read
                gl.bindFramebuffer(gl.FRAMEBUFFER, null)
                gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
                
                // Compute mean RGB
                const pixelCount = width * height
                let sumR = 0, sumG = 0, sumB = 0
                for (let i = 0; i < pixels.length; i += 4) {
                    sumR += pixels[i] / 255
                    sumG += pixels[i + 1] / 255
                    sumB += pixels[i + 2] / 255
                }
                
                return {
                    mean_rgb: [sumR / pixelCount, sumG / pixelCount, sumB / pixelCount]
                }
            })
        }

        // Capture baseline metrics
        const baseMetrics = await captureMetrics()

        if (!baseMetrics) {
            // Resume and return error
            await this.page.evaluate(() => {
                if (window.__noisemakerSetPaused) window.__noisemakerSetPaused(false)
            })
            return { status: 'error', tested_uniforms: [], details: 'Failed to capture baseline metrics' }
        }

        const baseMeanRgb = baseMetrics.mean_rgb
        const baseMeanLuma = (baseMeanRgb[0] + baseMeanRgb[1] + baseMeanRgb[2]) / 3

        const testedUniforms = []
        let anyResponded = false

        // Context requirements for conditional uniforms
        // These uniforms only affect output when their parent controls are active
        const uniformContexts = {
            // LUT intensity needs a preset selected
            gradeLutIntensity: { gradeLutPreset: 1 },
            // Split tone balance needs a tint active
            gradeSplitToneBalance: { gradeShadowTint: [0.7, 0.5, 0.3] },
            // Wheel balance needs a wheel active
            gradeWheelBalance: { gradeWheelShadows: [0.7, 0.5, 0.3] },
            // HSL mask controls need enable + an adjustment + wide key to catch pixels
            gradeHslEnable: { gradeHslHueShift: 0.3, gradeHslHueRange: 0.5, gradeHslHueCenter: 0.5 },
            gradeHslHueCenter: { gradeHslEnable: 1, gradeHslHueShift: 0.3, gradeHslHueRange: 0.5 },
            gradeHslHueRange: { gradeHslEnable: 1, gradeHslHueShift: 0.3, gradeHslHueCenter: 0.5 },
            gradeHslSatMin: { gradeHslEnable: 1, gradeHslSatAdjust: 0.5, gradeHslHueRange: 0.5 },
            gradeHslSatMax: { gradeHslEnable: 1, gradeHslSatAdjust: 0.5, gradeHslHueRange: 0.5 },
            gradeHslLumMin: { gradeHslEnable: 1, gradeHslLumAdjust: 0.5, gradeHslHueRange: 0.5 },
            gradeHslLumMax: { gradeHslEnable: 1, gradeHslLumAdjust: 0.5, gradeHslHueRange: 0.5 },
            gradeHslFeather: { gradeHslEnable: 1, gradeHslHueShift: 0.3, gradeHslHueRange: 0.5 },
            gradeHslHueShift: { gradeHslEnable: 1, gradeHslHueRange: 0.5, gradeHslHueCenter: 0.5 },
            gradeHslSatAdjust: { gradeHslEnable: 1, gradeHslHueRange: 0.5, gradeHslHueCenter: 0.5 },
            gradeHslLumAdjust: { gradeHslEnable: 1, gradeHslHueRange: 0.5, gradeHslHueCenter: 0.5 },
            // Vignette shape controls need amount > 0
            gradeVignetteMidpoint: { gradeVignetteAmount: 0.5 },
            gradeVignetteRoundness: { gradeVignetteAmount: 0.5 },
            gradeVignetteFeather: { gradeVignetteAmount: 0.5 },
            gradeVignetteHighlightProtect: { gradeVignetteAmount: 0.5 },
        }

        // Test ALL uniforms, not just the first 3
        for (const { name, uniformName, spec } of testableUniforms) {
            const defaultVal = spec.default ?? spec.min
            const range = spec.max - spec.min
            let testVal

            if (range <= 0) {
                testVal = defaultVal
            } else if (defaultVal === spec.min) {
                testVal = spec.min + range * 0.75
            } else if (defaultVal === spec.max) {
                testVal = spec.min + range * 0.25
            } else {
                const distToMin = defaultVal - spec.min
                const distToMax = spec.max - defaultVal
                testVal = distToMax > distToMin
                    ? defaultVal + distToMax * 0.5
                    : defaultVal - distToMin * 0.5
            }

            if (spec.type === 'int') {
                testVal = Math.round(testVal)
            }

            // Set up context for conditional uniforms (e.g., HSL controls need hslEnable=1)
            const context = uniformContexts[uniformName] || {}
            const contextKeys = Object.keys(context)
            
            if (contextKeys.length > 0) {
                await this.page.evaluate((ctx) => {
                    const pipeline = window.__noisemakerRenderingPipeline
                    if (!pipeline) return
                    for (const [k, v] of Object.entries(ctx)) {
                        if (pipeline.setUniform) {
                            pipeline.setUniform(k, v)
                        } else if (pipeline.globalUniforms) {
                            pipeline.globalUniforms[k] = v
                        }
                    }
                }, context)
            }
            
            // Capture context baseline if we have context
            let contextBaseline = baseMeanRgb
            if (contextKeys.length > 0) {
                const ctxMetrics = await captureMetrics()
                if (ctxMetrics) {
                    contextBaseline = ctxMetrics.mean_rgb
                }
            }

            await this.page.evaluate(({ uniformName, testVal }) => {
                const pipeline = window.__noisemakerRenderingPipeline
                if (!pipeline) return

                // Use setUniform if available (preferred method)
                if (pipeline.setUniform) {
                    pipeline.setUniform(uniformName, testVal)
                } else if (pipeline.globalUniforms) {
                    // Fallback to direct globalUniforms access
                    pipeline.globalUniforms[uniformName] = testVal
                }
            }, { uniformName, testVal })

            // Capture test metrics using the same helper
            const testMetrics = await captureMetrics()

            if (testMetrics) {
                const testMeanRgb = testMetrics.mean_rgb
                const testMeanLuma = (testMeanRgb[0] + testMeanRgb[1] + testMeanRgb[2]) / 3
                const contextLuma = (contextBaseline[0] + contextBaseline[1] + contextBaseline[2]) / 3

                const lumaDiff = Math.abs(testMeanLuma - contextLuma)
                
                // Check per-channel differences to detect chromatic shifts
                // (e.g., temperature changes red/blue but preserves luma)
                const rDiff = Math.abs(testMeanRgb[0] - contextBaseline[0])
                const gDiff = Math.abs(testMeanRgb[1] - contextBaseline[1])
                const bDiff = Math.abs(testMeanRgb[2] - contextBaseline[2])
                const maxChannelDiff = Math.max(rDiff, gDiff, bDiff)

                // Use lower threshold (0.002) to catch subtle effects like vibrance, whites
                if (lumaDiff > 0.002 || maxChannelDiff > 0.002) {
                    anyResponded = true
                    testedUniforms.push(`${name}:✓`)
                } else {
                    testedUniforms.push(`${name}:✗`)
                }
            } else {
                testedUniforms.push(`${name}:?`)
            }

            // Restore to default value
            await this.page.evaluate(({ uniformName, defaultVal }) => {
                const pipeline = window.__noisemakerRenderingPipeline
                if (!pipeline) return

                if (pipeline.setUniform) {
                    pipeline.setUniform(uniformName, defaultVal)
                } else if (pipeline.globalUniforms) {
                    pipeline.globalUniforms[uniformName] = defaultVal
                }
            }, { uniformName, defaultVal })
            
            // Reset context uniforms to their defaults
            if (contextKeys.length > 0) {
                await this.page.evaluate((ctxKeys) => {
                    const pipeline = window.__noisemakerRenderingPipeline
                    if (!pipeline) return
                    for (const k of ctxKeys) {
                        // Reset to 0 or neutral (0.5 for color arrays)
                        const resetVal = k.includes('Tint') || k.includes('Wheel') ? [0.5, 0.5, 0.5] : 0
                        if (pipeline.setUniform) {
                            pipeline.setUniform(k, resetVal)
                        } else if (pipeline.globalUniforms) {
                            pipeline.globalUniforms[k] = resetVal
                        }
                    }
                }, contextKeys)
            }
        }

        await this.resetUniformsToDefaults()

        // Resume animation
        await this.page.evaluate(() => {
            if (window.__noisemakerSetPaused) {
                window.__noisemakerSetPaused(false)
            }
        })

        return {
            status: anyResponded ? 'ok' : 'error',
            tested_uniforms: testedUniforms,
            details: anyResponded ? 'Uniforms affect output' : 'No uniforms affected output'
        }
    }

    /**
     * Test that a filter effect does NOT pass through input unchanged.
     */
    async testNoPassthrough(effectId, options = {}) {
        this.clearConsoleMessages()
        const result = await testNoPassthrough(this.page, effectId, {
            backend: this.options.backend,
            ...options
        })

        if (this.consoleMessages.length > 0) {
            result.console_errors = this.consoleMessages.map(m => m.text)
        }

        return result
    }

    /**
     * Test pixel-for-pixel parity between GLSL and WGSL renderings.
     * Renders the effect at frame 0 with both backends and compares pixels.
     */
    async testPixelParity(effectId, options = {}) {
        this.clearConsoleMessages()
        const result = await testPixelParity(this.page, effectId, options)

        if (this.consoleMessages.length > 0) {
            result.console_errors = this.consoleMessages.map(m => m.text)
        }

        return result
    }

    /**
     * Check if an effect is a filter-type effect.
     */
    async isFilterEffect(effectId) {
        return await isFilterEffect(effectId)
    }

    /**
     * Check if an effect is stateful (uses feedback loops or accumulates state).
     */
    async isStatefulEffect(effectId) {
        return isStatefulEffect(effectId)
    }
}

// =========================================================================
// On-disk tools (no browser required)
// =========================================================================

/**
 * Check effect structure for unused files, naming issues, etc.
 * This is an on-disk operation - no browser needed.
 */
export async function checkEffectStructureOnDisk(effectId, options = {}) {
    return await checkEffectStructure(effectId, options)
}

/**
 * Check algorithmic parity between GLSL and WGSL.
 * This is an on-disk operation with AI analysis - no browser needed.
 */
export async function checkAlgEquivOnDisk(effectId, options = {}) {
    return await checkShaderParity(effectId, options)
}

/**
 * Match effect IDs against a pattern (glob or regex).
 * @param {string[]} effects - All available effect IDs
 * @param {string} pattern - Glob or regex pattern
 * @returns {string[]} Matching effect IDs
 */
export function matchEffects(effects, pattern) {
    // Regex pattern (starts with /)
    if (pattern.startsWith('/')) {
        const regexStr = pattern.slice(1, pattern.lastIndexOf('/'))
        const flags = pattern.slice(pattern.lastIndexOf('/') + 1)
        const regex = new RegExp(regexStr, flags)
        return effects.filter(e => regex.test(e))
    }

    // Glob pattern (contains * or ?)
    if (pattern.includes('*') || pattern.includes('?')) {
        const regexStr = pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.')
        const regex = new RegExp(`^${regexStr}$`)
        return effects.filter(e => regex.test(e))
    }

    // Exact match
    return effects.filter(e => e === pattern)
}

/**
 * Wait for a grace period between effects.
 */
export async function gracePeriod() {
    await new Promise(r => setTimeout(r, GRACE_PERIOD_MS))
}

// =========================================================================
// Legacy exports for backward compatibility
// =========================================================================

/**
 * @deprecated Use BrowserSession instead
 */
export class BrowserHarness extends BrowserSession {
    constructor(options = {}) {
        super(options)
    }

    async init() {
        await this.setup()
    }

    async close() {
        await this.teardown()
    }

    async reloadIfDirty() {
        // No-op in new model - each session starts fresh
    }

    // Delegate to checkEffectStructure for on-disk checks
    async checkEffectStructure(effectId, options = {}) {
        return await checkEffectStructureOnDisk(effectId, {
            backend: this.options.backend,
            ...options
        })
    }

    // Delegate to checkShaderParity for on-disk checks
    async checkShaderParity(effectId, options = {}) {
        return await checkAlgEquivOnDisk(effectId, options)
    }
}

/**
 * @deprecated Use new BrowserSession() and call setup() instead
 */
export async function createBrowserHarness(options = {}) {
    const harness = new BrowserHarness(options)
    await harness.init()
    return harness
}

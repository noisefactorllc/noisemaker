/**
 * CanvasRenderer - Reusable shader rendering pipeline manager
 *
 * Handles the rendering loop, pipeline lifecycle, lazy effect loading,
 * and all rendering-related state. Designed to be vendored and embedded
 * independently of the demo UI.
 *
 * @example
 * const renderer = new CanvasRenderer({
 *     canvas: document.getElementById('canvas'),
 *     width: 1024,
 *     height: 1024,
 *     basePath: '../../shaders',
 *     preferWebGPU: false
 * });
 *
 * await renderer.loadManifest();
 * await renderer.compile('noise().write(o0)');
 * renderer.start();
 */

import { registerOp } from '../lang/ops.js'
import { registerStarterOps } from '../lang/validator.js'
import { createRuntime, recompile } from '../runtime/compiler.js'
import { registerEffect, getEffect } from '../runtime/registry.js'
import { mergeIntoEnums } from '../lang/enums.js'
import { stdEnums } from '../lang/std_enums.js'

// Known 3D generator effects (self-initialize volumes)
const KNOWN_3D_GENERATORS = ['noise3d', 'cell3d', 'shape3d', 'fractal3d']

// Known 3D processor effects (modify volumes, need inputTex3d)
const KNOWN_3D_PROCESSORS = ['flow3d', 'rd3d', 'ca3d', 'render3d']

/**
 * Deep clone a parameter value
 * @param {*} value - Value to clone
 * @returns {*} Cloned value
 */
export function cloneParamValue(value) {
    if (Array.isArray(value)) {
        return value.map((item) => item)
    }
    if (value && typeof value === 'object') {
        try {
            return JSON.parse(JSON.stringify(value))
        } catch (_err) {
            return value
        }
    }
    return value
}

/**
 * Check if a name is a valid DSL identifier (can be used unquoted)
 * @param {string} name - Name to check
 * @returns {boolean}
 */
export function isValidIdentifier(name) {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)
}

/**
 * Sanitize a name to be a valid identifier
 * @param {string} name - Name to sanitize
 * @returns {string|null} Sanitized name or null if not possible
 */
export function sanitizeEnumName(name) {
    // Convert spaces to camelCase: "Cell Scale" -> "CellScale"
    let result = name.replace(/\s+(.)/g, (_, c) => c.toUpperCase()).replace(/\s+/g, '')
    // Remove any invalid characters
    result = result.replace(/[^a-zA-Z0-9_]/g, '')
    // Check if result is a valid identifier
    if (!isValidIdentifier(result)) {
        return null
    }
    return result
}

/**
 * Check if effect has a 'tex' surface parameter (mixer-type effects)
 * @param {object} effect - Effect object
 * @returns {boolean}
 */
export function hasTexSurfaceParam(effect) {
    if (!effect || !effect.instance || !effect.instance.globals) {
        return false
    }
    const texSpec = effect.instance.globals.tex
    return texSpec && texSpec.type === 'surface'
}

/**
 * Check if effect needs inputTex3d (3D consumer effects)
 * @param {object} effect - Effect object
 * @returns {boolean}
 */
export function needsInputTex3d(effect) {
    if (!effect || !effect.instance) return false
    const passes = effect.instance.passes || []
    for (const pass of passes) {
        if (!pass.inputs) continue
        const inputs = Object.values(pass.inputs)
        if (inputs.includes('inputTex3d')) {
            return true
        }
    }
    return false
}

/**
 * Check if effect is a 3D generator
 * @param {object} effect - Effect object
 * @returns {boolean}
 */
export function is3dGenerator(effect) {
    if (!effect || !effect.instance) return false
    const func = effect.instance.func
    return effect.instance.outputTex3d && KNOWN_3D_GENERATORS.includes(func)
}

/**
 * Check if effect is a 3D processor
 * @param {object} effect - Effect object
 * @returns {boolean}
 */
export function is3dProcessor(effect) {
    if (!effect || !effect.instance) return false
    const func = effect.instance.func
    return effect.instance.outputTex3d && KNOWN_3D_PROCESSORS.includes(func)
}

/**
 * Check if effect is a starter (doesn't need pipeline input)
 * @param {object} effect - Effect object
 * @returns {boolean}
 */
export function isStarterEffect(effect) {
    if (!effect.instance) return false

    const passes = effect.instance.passes || []
    if (passes.length === 0) return true

    const pipelineInputs = [
        'inputTex', 'inputTex3d', 'src',
        'o0', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7'
    ]

    for (const pass of passes) {
        if (!pass.inputs) continue
        const inputs = Object.values(pass.inputs)
        const hasPipelineInput = inputs.some(val => pipelineInputs.includes(val))
        if (hasPipelineInput) {
            return false
        }
    }

    return true
}

/**
 * CanvasRenderer class - manages shader rendering pipeline
 */
export class CanvasRenderer {
    /**
     * Create a new CanvasRenderer
     * @param {object} options - Configuration options
     * @param {HTMLCanvasElement} options.canvas - Target canvas element
     * @param {HTMLElement} [options.canvasContainer] - Container element for canvas reset
     * @param {number} [options.width=1024] - Render width
     * @param {number} [options.height=1024] - Render height
     * @param {string} [options.basePath='../../shaders'] - Base path for shader assets
     * @param {boolean} [options.preferWebGPU=false] - Use WebGPU backend
     * @param {boolean} [options.useBundles=false] - Load effects from pre-built bundles
     * @param {string} [options.bundlePath='../../dist/effects'] - Base path for effect bundles
     * @param {function} [options.onFrame] - Callback after each frame (receives frameCount)
     * @param {function} [options.onFPS] - Callback when FPS updates (receives fps value)
     * @param {function} [options.onError] - Callback on render error
     * @param {function} [options.onLoadingStart] - Callback when loading starts
     * @param {function} [options.onLoadingProgress] - Callback for loading progress
     * @param {function} [options.onLoadingEnd] - Callback when loading ends
     */
    constructor(options = {}) {
        this._canvas = options.canvas
        this._canvasContainer = options.canvasContainer || null
        this._width = options.width || 1024
        this._height = options.height || 1024
        this._basePath = options.basePath || '../../shaders'
        this._preferWebGPU = options.preferWebGPU || false

        // Bundle loading mode
        this._useBundles = options.useBundles || false
        this._bundlePath = options.bundlePath || '../../dist/effects'

        // Callbacks
        this._onFrame = options.onFrame || null
        this._onFPS = options.onFPS || null
        this._onError = options.onError || null
        this._onLoadingStart = options.onLoadingStart || null
        this._onLoadingProgress = options.onLoadingProgress || null
        this._onLoadingEnd = options.onLoadingEnd || null

        // Pipeline state
        this._pipeline = null
        this._currentDsl = ''
        this._currentEffect = null
        this._uniformBindings = new Map()

        // Animation loop state
        this._animationFrameId = null
        this._animationTimerId = null
        this._targetFPS = 60
        this._targetFrameTime = 1000 / 60
        this._loopDuration = 10
        this._lastFrameTime = performance.now()
        this._loopStartTime = performance.now()
        this._isRunning = false

        // Frame counting and FPS measurement
        this._frameCount = 0
        this._fpsFrameCount = 0
        this._fpsLastUpdateTime = performance.now()
        this._currentFPS = 0

        // Lazy loading infrastructure
        this._manifest = {}
        this._loadedEffects = new Map()
        this._effectLoadingPromises = new Map()

        // Enum registry (shared with lang system)
        this._enums = {}

        // Bound render loop for proper `this` context
        this._boundRenderLoop = this._renderLoop.bind(this)
    }

    // =========================================================================
    // Public Getters
    // =========================================================================

    /** @returns {string} Current backend ('glsl' or 'wgsl') */
    get backend() {
        return this._preferWebGPU ? 'wgsl' : 'glsl'
    }

    /** @returns {object|null} Current pipeline object */
    get pipeline() {
        return this._pipeline
    }

    /** @returns {number} Total frames rendered */
    get frameCount() {
        return this._frameCount
    }

    /** @returns {number} Current measured FPS */
    get currentFPS() {
        return this._currentFPS
    }

    /** @returns {boolean} Whether render loop is running */
    get isRunning() {
        return this._isRunning
    }

    /** @returns {number} Target FPS */
    get targetFPS() {
        return this._targetFPS
    }

    /** @returns {number} Loop duration in seconds */
    get loopDuration() {
        return this._loopDuration
    }

    /** @returns {string} Current DSL source */
    get currentDsl() {
        return this._currentDsl
    }

    /** @returns {object|null} Current effect object */
    get currentEffect() {
        return this._currentEffect
    }

    /** @returns {object} Shader manifest */
    get manifest() {
        return this._manifest
    }

    /** @returns {Map} Loaded effects cache */
    get loadedEffects() {
        return this._loadedEffects
    }

    /** @returns {object} Enum registry */
    get enums() {
        return this._enums
    }

    /** @returns {HTMLCanvasElement} Canvas element */
    get canvas() {
        return this._canvas
    }

    /** @returns {boolean} Whether using bundle mode */
    get useBundles() {
        return this._useBundles
    }

    /** @returns {string} Bundle path */
    get bundlePath() {
        return this._bundlePath
    }

    // =========================================================================
    // Public Setters
    // =========================================================================

    /** @param {object|null} effect - Set current effect */
    set currentEffect(effect) {
        this._currentEffect = effect
    }

    /** @param {string} dsl - Set current DSL */
    set currentDsl(dsl) {
        this._currentDsl = dsl
    }

    // =========================================================================
    // Configuration
    // =========================================================================

    /**
     * Set target FPS
     * @param {number} fps - Target frames per second
     */
    setTargetFPS(fps) {
        this._targetFPS = fps
        this._targetFrameTime = 1000 / fps
    }

    /**
     * Set loop duration
     * @param {number} duration - Duration in seconds
     */
    setLoopDuration(duration) {
        this._loopDuration = duration
        this._loopStartTime = performance.now() // Reset loop
    }

    /**
     * Set a uniform value across all passes
     * @param {string} name - Uniform name
     * @param {*} value - Uniform value
     */
    setUniform(name, value) {
        if (this._pipeline && this._pipeline.setUniform) {
            this._pipeline.setUniform(name, value)
        }
    }

    /**
     * Resize the renderer
     * @param {number} width - New width
     * @param {number} height - New height
     * @param {number} [zoom=1] - Zoom factor
     */
    resize(width, height, zoom = 1) {
        this._width = width
        this._height = height
        if (this._pipeline && this._pipeline.resize) {
            this._pipeline.resize(width, height, zoom)
        }
    }

    // =========================================================================
    // Render Loop
    // =========================================================================

    /**
     * Start the animation loop
     */
    start() {
        if (this._isRunning) return
        this._isRunning = true
        this._lastFrameTime = performance.now()
        this._scheduleNextFrame(this._lastFrameTime + this._targetFrameTime)
    }

    /**
     * Stop the animation loop
     */
    stop() {
        this._isRunning = false
        if (this._animationTimerId !== null) {
            clearTimeout(this._animationTimerId)
            this._animationTimerId = null
        }
        if (this._animationFrameId !== null) {
            cancelAnimationFrame(this._animationFrameId)
            this._animationFrameId = null
        }
    }

    /**
     * Render a single frame at a specific time
     * @param {number} normalizedTime - Time value 0-1
     */
    render(normalizedTime) {
        if (this._pipeline) {
            try {
                this._pipeline.render(normalizedTime)
                this._frameCount++
            } catch (err) {
                console.error('Render error:', err)
                if (this._onError) {
                    this._onError(err)
                }
            }
        }
    }

    /** @private Schedule next animation frame */
    _scheduleNextFrame(targetTime) {
        if (!this._isRunning) return

        if (this._animationTimerId !== null) {
            clearTimeout(this._animationTimerId)
        }

        const now = performance.now()
        const delay = Math.max(0, targetTime - now)

        this._animationTimerId = setTimeout(() => {
            this._animationFrameId = requestAnimationFrame(this._boundRenderLoop)
        }, delay)
    }

    /** @private Main render loop */
    _renderLoop(time) {
        const delta = time - this._lastFrameTime

        if (delta < this._targetFrameTime - 0.5) {
            this._scheduleNextFrame(this._lastFrameTime + this._targetFrameTime)
            return
        }

        if (this._pipeline) {
            try {
                const elapsedSeconds = (time - this._loopStartTime) / 1000
                const normalizedTime = (elapsedSeconds % this._loopDuration) / this._loopDuration
                this._pipeline.render(normalizedTime)
                this._frameCount++

                if (this._onFrame) {
                    this._onFrame(this._frameCount)
                }
            } catch (err) {
                console.error('Render loop error:', err)
                if (this._onError) {
                    this._onError(err)
                }
            }
        }

        // FPS measurement
        this._fpsFrameCount++
        const fpsElapsed = time - this._fpsLastUpdateTime
        if (fpsElapsed >= 1000) {
            this._currentFPS = Math.round((this._fpsFrameCount * 1000) / fpsElapsed)
            this._fpsFrameCount = 0
            this._fpsLastUpdateTime = time

            if (this._onFPS) {
                this._onFPS(this._currentFPS)
            }
        }

        this._lastFrameTime = time - (delta % this._targetFrameTime)
        this._scheduleNextFrame(this._lastFrameTime + this._targetFrameTime)
    }

    // =========================================================================
    // Pipeline Lifecycle
    // =========================================================================

    /**
     * Reset the canvas element (for backend switching)
     */
    resetCanvas() {
        if (!this._canvasContainer || !this._canvas) {
            return
        }

        const newCanvas = this._canvas.cloneNode(false)
        newCanvas.id = this._canvas.id
        newCanvas.width = this._canvas.width
        newCanvas.height = this._canvas.height

        this._canvasContainer.replaceChild(newCanvas, this._canvas)
        this._canvas = newCanvas
    }

    /**
     * Dispose of the current pipeline
     * @param {object} [options] - Disposal options
     * @param {boolean} [options.loseContext=false] - Force context loss
     * @param {boolean} [options.resetCanvas=false] - Reset canvas element
     */
    async dispose(options = {}) {
        const { loseContext = false, resetCanvas = false } = options

        if (!this._pipeline) {
            if (resetCanvas) {
                this.resetCanvas()
            }
            return
        }

        const oldPipeline = this._pipeline
        this._pipeline = null
        this._uniformBindings = new Map()

        try {
            oldPipeline.backend?.destroy?.({ loseContext })
        } catch (err) {
            console.warn('Failed to destroy pipeline backend', err)
        }

        if (resetCanvas) {
            this.resetCanvas()
        }
    }

    /**
     * Compile DSL and create pipeline
     * @param {string} dsl - DSL source code
     * @param {object} [options] - Compilation options
     * @param {number} [options.zoom=1] - Zoom factor
     * @param {object} [options.shaderOverrides] - Per-step shader overrides
     * @returns {Promise<object>} The created pipeline
     */
    async compile(dsl, options = {}) {
        const zoom = options.zoom || 1
        const shaderOverrides = options.shaderOverrides

        this._currentDsl = dsl

        if (!this._pipeline) {
            this._pipeline = await createRuntime(dsl, {
                canvas: this._canvas,
                width: this._width,
                height: this._height,
                preferWebGPU: this._preferWebGPU,
                zoom,
                shaderOverrides
            })
        } else {
            const newGraph = recompile(this._pipeline, dsl, { shaderOverrides })
            if (!newGraph) {
                const previousPipeline = this._pipeline
                this._pipeline = await createRuntime(dsl, {
                    canvas: this._canvas,
                    width: this._width,
                    height: this._height,
                    preferWebGPU: this._preferWebGPU,
                    zoom,
                    shaderOverrides
                })
                try {
                    previousPipeline?.backend?.destroy?.()
                } catch (err) {
                    console.warn('Failed to release previous pipeline backend', err)
                }
            } else {
                await this._pipeline.compilePrograms()
            }
        }

        this._uniformBindings = new Map()
        return this._pipeline
    }

    /**
     * Switch rendering backend
     * @param {string} backend - 'glsl' or 'wgsl'
     */
    async switchBackend(backend) {
        const preferWebGPU = backend === 'wgsl'
        if (preferWebGPU === this._preferWebGPU) {
            return
        }

        const previousBackend = this._preferWebGPU ? 'wgsl' : 'glsl'
        this._preferWebGPU = preferWebGPU

        await this.dispose({
            loseContext: previousBackend === 'glsl',
            resetCanvas: true
        })
    }

    // =========================================================================
    // Lazy Effect Loading
    // =========================================================================

    /**
     * Load the shader manifest
     * @returns {Promise<object>} The loaded manifest
     */
    async loadManifest() {
        try {
            const manifestRes = await fetch(`${this._basePath}/effects/manifest.json`)
            if (manifestRes.ok) {
                this._manifest = await manifestRes.json()
            }
        } catch (e) {
            console.warn('Failed to load shader manifest')
            throw new Error('Could not load shader manifest - lazy loading requires manifest.json')
        }

        // Initialize enums
        this._enums = await mergeIntoEnums(stdEnums)

        return this._manifest
    }

    /**
     * Initialize standard enums (call after loadManifest or standalone)
     */
    async initEnums() {
        this._enums = await mergeIntoEnums(stdEnums)
    }

    /**
     * Get effect names from manifest for a namespace
     * @param {string} namespace - Effect namespace
     * @returns {string[]} Effect names
     */
    getEffectsFromManifest(namespace) {
        const prefix = `${namespace}/`
        return Object.keys(this._manifest)
            .filter(key => key.startsWith(prefix))
            .map(key => key.slice(prefix.length))
            .sort()
    }

    /**
     * Get effect description from manifest
     * @param {string} effectId - Effect ID (namespace/name)
     * @returns {string|null} Description or null if not found
     */
    getEffectDescription(effectId) {
        const entry = this._manifest?.[effectId]
        return entry?.description ?? null
    }

    /**
     * Load effect definition
     * @param {string} namespace - Effect namespace
     * @param {string} effectName - Effect name
     * @returns {Promise<object>} Effect object
     */
    async loadEffectDefinition(namespace, effectName) {
        const effectId = `${namespace}/${effectName}`
        const basePath = `${this._basePath}/effects/${namespace}/${effectName}`

        try {
            const module = await import(`${basePath}/definition.js`)
            const exported = module.default

            if (!exported) {
                throw new Error(`No default export in ${effectId}/definition.js`)
            }

            // Support both patterns:
            // 1. new Effect({...}) - exported is already an Effect instance (has state property)
            // 2. class Foo extends Effect - exported is a class to instantiate (is a function)
            const instance = (typeof exported === 'function') ? new exported() : exported
            return { namespace, name: effectName, instance }
        } catch (err) {
            console.error(`Failed to load definition for ${effectId}:`, err)
            throw err
        }
    }

    /**
     * Load effect shaders
     * @param {object} effect - Effect object
     * @returns {Promise<void>}
     */
    async loadEffectShaders(effect) {
        const { namespace, name: effectName, instance } = effect
        const effectId = `${namespace}/${effectName}`
        const basePath = `${this._basePath}/effects/${namespace}/${effectName}`
        const effectManifest = this._manifest[effectId]

        if (!instance.passes || !effectManifest) return

        if (!instance.shaders) instance.shaders = {}

        const shaderPromises = []

        for (const pass of instance.passes) {
            if (!pass.program) continue

            const prog = pass.program
            const shaderBucket = instance.shaders[prog] ?? (instance.shaders[prog] = {})

            // GLSL loading
            const glslInfo = effectManifest.glsl?.[prog]
            if (glslInfo === 'combined') {
                shaderPromises.push(
                    fetch(`${basePath}/glsl/${prog}.glsl`)
                        .then(res => res.ok ? res.text() : null)
                        .then(text => { if (text) shaderBucket.glsl = text })
                )
            } else if (glslInfo) {
                if (glslInfo.v) {
                    shaderPromises.push(
                        fetch(`${basePath}/glsl/${prog}.vert`)
                            .then(res => res.ok ? res.text() : null)
                            .then(text => { if (text) shaderBucket.vertex = text })
                    )
                }
                if (glslInfo.f) {
                    shaderPromises.push(
                        fetch(`${basePath}/glsl/${prog}.frag`)
                            .then(res => res.ok ? res.text() : null)
                            .then(text => { if (text) shaderBucket.fragment = text })
                    )
                }
            }

            // WGSL loading
            if (effectManifest.wgsl?.[prog]) {
                shaderPromises.push(
                    fetch(`${basePath}/wgsl/${prog}.wgsl`)
                        .then(res => res.ok ? res.text() : null)
                        .then(text => { if (text) shaderBucket.wgsl = text })
                )
            }
        }

        await Promise.all(shaderPromises)
    }

    /**
     * Register effect with the runtime
     * @param {object} effect - Effect object
     * @returns {object|null} Choices to register as enums
     */
    registerEffectWithRuntime(effect) {
        const { namespace, name: effectName, instance } = effect

        // Register effect with multiple names for lookup flexibility
        registerEffect(instance.func, instance)
        registerEffect(`${namespace}.${instance.func}`, instance)
        registerEffect(`${namespace}/${effectName}`, instance)
        registerEffect(`${namespace}.${effectName}`, instance)

        // Register as operator
        if (instance.func) {
            const choicesToRegister = {}

            const args = Object.entries(instance.globals || {}).map(([key, spec]) => {
                let enumPath = spec.enum || spec.enumPath
                if (spec.choices && !enumPath) {
                    enumPath = `${namespace}.${instance.func}.${key}`

                    if (!choicesToRegister[namespace]) {
                        choicesToRegister[namespace] = {}
                    }
                    if (!choicesToRegister[namespace][instance.func]) {
                        choicesToRegister[namespace][instance.func] = {}
                    }
                    choicesToRegister[namespace][instance.func][key] = {}

                    for (const [name, val] of Object.entries(spec.choices)) {
                        if (name.endsWith(':')) continue
                        choicesToRegister[namespace][instance.func][key][name] = { type: 'Number', value: val }
                        const sanitized = sanitizeEnumName(name)
                        if (sanitized && sanitized !== name) {
                            choicesToRegister[namespace][instance.func][key][sanitized] = { type: 'Number', value: val }
                        }
                    }
                }
                return {
                    name: key,
                    type: spec.type === 'vec4' ? 'color' : spec.type,
                    default: spec.default,
                    enum: enumPath,
                    enumPath: enumPath,
                    min: spec.min,
                    max: spec.max,
                    uniform: spec.uniform
                }
            })

            const opSpec = {
                name: instance.func,
                args: args
            }
            registerOp(`${namespace}.${instance.func}`, opSpec)

            return choicesToRegister
        }
        return null
    }

    /**
     * Register a starter op for an effect
     * @param {object} effect - Effect object
     */
    registerStarterOpForEffect(effect) {
        if (!effect.instance || !isStarterEffect(effect)) return

        const func = effect.instance.func || effect.name
        const namespace = effect.namespace
        const starterNames = []

        if (func) {
            starterNames.push(func)
            if (namespace) {
                starterNames.push(`${namespace}.${func}`)
            }
        }

        if (starterNames.length > 0) {
            registerStarterOps(starterNames)
        }
    }

    /**
     * Load effect from a pre-built bundle (definition + shaders inlined)
     * @param {string} namespace - Effect namespace
     * @param {string} effectName - Effect name
     * @returns {Promise<object>} Effect object with shaders already attached
     */
    async loadEffectFromBundle(namespace, effectName) {
        const effectId = `${namespace}/${effectName}`
        const bundleUrl = `${this._bundlePath}/${namespace}/${effectName}.js`

        try {
            const module = await import(bundleUrl)
            const exported = module.default

            if (!exported) {
                throw new Error(`No default export in bundle ${effectId}`)
            }

            // The bundle exports an Effect instance with shaders already attached
            // For class-based definitions, shaders are added as a static property
            // on the class, so we need to copy them to the instance
            let instance
            if (typeof exported === 'function') {
                instance = new exported()
                // Copy shaders from class static property to instance
                if (exported.shaders && !instance.shaders) {
                    instance.shaders = exported.shaders
                }
                // Copy help from class static property to instance
                if (exported.help && !instance.help) {
                    instance.help = exported.help
                }
            } else {
                instance = exported
            }
            return { namespace, name: effectName, instance }
        } catch (err) {
            console.error(`Failed to load bundle for ${effectId}:`, err)
            throw err
        }
    }

    /**
     * Load a single effect on demand (with caching)
     * @param {string} effectId - Effect ID (namespace/name)
     * @param {object} [options] - Loading options
     * @param {function} [options.onProgress] - Progress callback
     * @returns {Promise<object>} Loaded effect
     */
    async loadEffect(effectId, options = {}) {
        // Check cache first
        if (this._loadedEffects.has(effectId)) {
            return this._loadedEffects.get(effectId)
        }

        // Check if already loading (deduplication)
        if (this._effectLoadingPromises.has(effectId)) {
            return this._effectLoadingPromises.get(effectId)
        }

        const [namespace, effectName] = effectId.split('/')
        if (!namespace || !effectName) {
            throw new Error(`Invalid effect ID: ${effectId}`)
        }

        const onProgress = options.onProgress || null

        const loadPromise = (async () => {
            try {
                let effect

                if (this._useBundles) {
                    // Bundle mode: single import with shaders inlined
                    if (onProgress) onProgress({ effectId, stage: 'bundle', status: 'loading' })
                    effect = await this.loadEffectFromBundle(namespace, effectName)
                    if (onProgress) onProgress({ effectId, stage: 'bundle', status: 'done' })
                } else {
                    // Hot-load mode: separate definition and shader fetches
                    if (onProgress) onProgress({ effectId, stage: 'definition', status: 'loading' })
                    effect = await this.loadEffectDefinition(namespace, effectName)
                    if (onProgress) onProgress({ effectId, stage: 'definition', status: 'done' })

                    if (onProgress) onProgress({ effectId, stage: 'shaders', status: 'loading' })
                    await this.loadEffectShaders(effect)
                    if (onProgress) onProgress({ effectId, stage: 'shaders', status: 'done' })
                }

                // Register with runtime
                const choicesToRegister = this.registerEffectWithRuntime(effect)
                if (choicesToRegister && Object.keys(choicesToRegister).length > 0) {
                    this._enums = await mergeIntoEnums(choicesToRegister)
                }

                // Register as starter op
                this.registerStarterOpForEffect(effect)

                // Cache the loaded effect
                this._loadedEffects.set(effectId, effect)

                return effect
            } catch (err) {
                if (onProgress) onProgress({ effectId, stage: 'error', status: 'error', error: err })
                throw err
            } finally {
                this._effectLoadingPromises.delete(effectId)
            }
        })()

        this._effectLoadingPromises.set(effectId, loadPromise)
        return loadPromise
    }

    /**
     * Load multiple effects in parallel
     * @param {string[]} effectIds - Array of effect IDs
     * @param {object} [options] - Loading options
     * @param {function} [options.onProgress] - Progress callback
     * @returns {Promise<object[]>} Loaded effects
     */
    async loadEffects(effectIds, options = {}) {
        if (effectIds.length === 0) return []

        // Filter out already loaded effects
        const needsLoading = effectIds.filter(id => !this._loadedEffects.has(id))

        if (needsLoading.length === 0) {
            return effectIds.map(id => this._loadedEffects.get(id))
        }

        if (this._onLoadingStart) {
            this._onLoadingStart(needsLoading)
        }

        try {
            const loadPromises = needsLoading.map(effectId =>
                this.loadEffect(effectId, options)
                    .catch(err => {
                        console.error(`Failed to load ${effectId}:`, err)
                        return null
                    })
            )

            await Promise.all(loadPromises)

            if (this._onLoadingEnd) {
                this._onLoadingEnd()
            }

            return effectIds.map(id => this._loadedEffects.get(id)).filter(Boolean)
        } catch (err) {
            if (this._onLoadingEnd) {
                this._onLoadingEnd()
            }
            throw err
        }
    }

    // =========================================================================
    // Bundle Loading
    // =========================================================================

    /**
     * Register effects from a pre-bundled namespace module.
     *
     * Use this as an alternative to lazy-loading when you've imported
     * a namespace bundle (e.g., noisemaker-shaders-filter.esm.js).
     *
     * @example
     * import filterBundle from './noisemaker-shaders-filter.esm.js';
     * await renderer.registerEffectsFromBundle(filterBundle);
     *
     * @param {object} bundle - Bundle module with { namespace, effects, registerAll }
     * @returns {number} Number of effects registered
     */
    registerEffectsFromBundle(bundle) {
        if (!bundle || !bundle.effects || !bundle.namespace) {
            console.warn('[registerEffectsFromBundle] Invalid bundle format')
            return 0
        }

        const namespace = bundle.namespace
        let count = 0

        for (const [effectName, effectDef] of Object.entries(bundle.effects)) {
            const effectId = `${namespace}/${effectName}`

            // Skip if already loaded
            if (this._loadedEffects.has(effectId)) {
                continue
            }

            // Create effect wrapper matching lazy-load structure
            const effect = {
                namespace,
                name: effectName,
                instance: effectDef
            }

            // Register with runtime
            const choicesToRegister = this.registerEffectWithRuntime(effect)
            if (choicesToRegister && Object.keys(choicesToRegister).length > 0) {
                // Synchronously update enums (async merge deferred)
                this._pendingEnumMerges = this._pendingEnumMerges || []
                this._pendingEnumMerges.push(choicesToRegister)
            }

            // Register as starter op if applicable
            this.registerStarterOpForEffect(effect)

            // Cache the loaded effect
            this._loadedEffects.set(effectId, effect)
            count++
        }

        // Process any pending enum merges
        if (this._pendingEnumMerges && this._pendingEnumMerges.length > 0) {
            const merges = this._pendingEnumMerges
            this._pendingEnumMerges = []
            Promise.all(merges.map(m => mergeIntoEnums(m)))
                .then(results => {
                    for (const result of results) {
                        if (result) this._enums = result
                    }
                })
        }

        return count
    }

    /**
     * Register effects from multiple bundles.
     *
     * @example
     * import filterBundle from './noisemaker-shaders-filter.esm.js';
     * import synthBundle from './noisemaker-shaders-synth.esm.js';
     * renderer.registerEffectsFromBundles([filterBundle, synthBundle]);
     *
     * @param {object[]} bundles - Array of bundle modules
     * @returns {number} Total number of effects registered
     */
    registerEffectsFromBundles(bundles) {
        let total = 0
        for (const bundle of bundles) {
            total += this.registerEffectsFromBundle(bundle)
        }
        return total
    }

    /**
     * Check if an effect is available (loaded from bundle or lazy-loaded).
     * @param {string} effectId - Effect ID (namespace/name)
     * @returns {boolean}
     */
    hasEffect(effectId) {
        return this._loadedEffects.has(effectId)
    }

    /**
     * Get all loaded effect IDs.
     * @returns {string[]}
     */
    getLoadedEffectIds() {
        return Array.from(this._loadedEffects.keys())
    }

    /**
     * Get loaded effect IDs for a specific namespace.
     * @param {string} namespace - Namespace to filter by
     * @returns {string[]}
     */
    getLoadedEffectIdsByNamespace(namespace) {
        const prefix = `${namespace}/`
        return Array.from(this._loadedEffects.keys())
            .filter(id => id.startsWith(prefix))
    }

    // =========================================================================
    // External Texture Handling (for media input effects)
    // =========================================================================

    /**
     * Update a texture from an external source (video, image, canvas).
     * This is used for media input effects that need to display camera/video content.
     * @param {string} texId - Texture ID from effect's externalTexture property
     * @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement|ImageBitmap} source - Media source
     * @param {object} [options] - Update options
     * @param {boolean} [options.flipY=true] - Whether to flip the Y axis
     * @returns {{ width: number, height: number }} Source dimensions
     */
    updateTextureFromSource(texId, source, options = {}) {
        if (!this._pipeline || !this._pipeline.backend) {
            console.warn('[updateTextureFromSource] Pipeline not ready')
            return { width: 0, height: 0 }
        }

        return this._pipeline.backend.updateTextureFromSource(texId, source, options)
    }

    // =========================================================================
    // Uniform/Parameter Handling
    // =========================================================================

    /**
     * Resolve an enum value from a path
     * @param {string} path - Enum path (e.g., "color.mono")
     * @returns {*} Resolved value or null
     */
    resolveEnumValue(path) {
        if (path === undefined || path === null) return null
        if (typeof path === 'number' || typeof path === 'boolean') return path
        if (typeof path !== 'string') return null

        const segments = path.split('.').filter(Boolean)
        let node = this._enums

        for (const segment of segments) {
            if (!node || node[segment] === undefined) {
                return null
            }
            node = node[segment]
        }

        if (typeof node === 'number' || typeof node === 'boolean') {
            return node
        }
        if (node && typeof node === 'object' && node.value !== undefined) {
            return node.value
        }

        return null
    }

    /**
     * Convert a parameter value for use as a uniform
     * @param {*} value - Parameter value
     * @param {object} spec - Parameter spec
     * @returns {*} Converted value
     */
    convertParameterForUniform(value, spec) {
        if (!spec) {
            return value
        }

        if ((spec.enum || spec.enumPath || spec.type === 'member') && typeof value === 'string') {
            let enumValue = this.resolveEnumValue(value)
            if ((enumValue === null || enumValue === undefined) && (spec.enum || spec.enumPath)) {
                const base = spec.enum || spec.enumPath
                enumValue = this.resolveEnumValue(`${base}.${value}`)
            }
            if (enumValue !== null && enumValue !== undefined) {
                return enumValue
            }
        }

        switch (spec.type) {
            case 'boolean':
            case 'button':
                return !!value
            case 'int':
                return typeof value === 'number' ? Math.round(value) : parseInt(value, 10)
            case 'float':
                return typeof value === 'number' ? value : parseFloat(value)
            case 'vec3':
            case 'vec4':
                if (Array.isArray(value)) {
                    return value.map((component) => (typeof component === 'number' ? component : parseFloat(component)))
                }
                break
            default:
                break
        }

        return value
    }

    /**
     * Build uniform bindings for the current effect
     * @param {object} effect - Effect object
     */
    buildUniformBindings(effect) {
        this._uniformBindings = new Map()

        if (!this._pipeline || !this._pipeline.graph || !Array.isArray(this._pipeline.graph.passes)) {
            return
        }

        if (!effect || !effect.instance || !effect.instance.globals) {
            return
        }

        const targetFunc = effect.instance.func
        const targetNamespace = effect.instance.namespace || effect.namespace || null

        this._pipeline.graph.passes.forEach((pass, index) => {
            if (!pass) return

            const passFunc = pass.effectFunc || pass.effectKey || null
            const passNamespace = pass.effectNamespace || null

            if (!passFunc || passFunc !== targetFunc) return
            if (targetNamespace && passNamespace && passNamespace !== targetNamespace) return

            for (const [paramName, spec] of Object.entries(effect.instance.globals)) {
                if (spec.type === 'surface') continue
                const uniformName = spec.uniform || paramName
                if (!pass.uniforms || !(uniformName in pass.uniforms)) continue

                if (!this._uniformBindings.has(paramName)) {
                    this._uniformBindings.set(paramName, [])
                }

                this._uniformBindings.get(paramName).push({
                    passIndex: index,
                    uniformName
                })
            }
        })
    }

    /**
     * Apply parameter values to the pipeline
     * @param {object} effect - Current effect
     * @param {object} parameterValues - Parameter values to apply
     */
    applyParameterValues(effect, parameterValues) {
        if (!this._pipeline || !effect || !effect.instance) {
            return
        }

        if (!this._uniformBindings.size) {
            this.buildUniformBindings(effect)
        }

        const globals = effect.instance.globals || {}

        for (const [paramName, spec] of Object.entries(globals)) {
            if (spec.type === 'surface') {
                continue
            }
            const bindings = this._uniformBindings.get(paramName)
            if (!bindings || bindings.length === 0) {
                continue
            }

            const currentValue = parameterValues[paramName]
            if (currentValue === undefined) {
                continue
            }
            const converted = this.convertParameterForUniform(currentValue, spec)

            for (const binding of bindings) {
                const pass = this._pipeline.graph.passes[binding.passIndex]
                if (!pass || !pass.uniforms) {
                    continue
                }
                pass.uniforms[binding.uniformName] = Array.isArray(converted) ? converted.slice() : converted
            }
        }
    }
}

// Re-export getEffect for convenience
export { getEffect }

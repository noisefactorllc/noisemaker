/**
 * Demo UI Module for Noisemaker Shader Demo
 *
 * Handles all UI-specific logic: controls, dialogs, selectors, DSL editing.
 * Works in conjunction with CanvasRenderer for the rendering pipeline.
 *
 * @example
 * import { UIController } from './lib/demo-ui.js';
 * import { CanvasRenderer } from '../../shaders/src/renderer/canvas.js';
 *
 * const renderer = new CanvasRenderer({ canvas, ... });
 * const ui = new UIController(renderer, {
 *     effectSelect: document.getElementById('effect-select'),
 *     dslEditor: document.getElementById('dsl-editor'),
 *     controlsContainer: document.getElementById('effect-controls-container'),
 *     statusEl: document.getElementById('status'),
 *     ...
 * });
 */

import { compile, unparse, lex, parse, unparseCall } from '../../../shaders/src/lang/index.js'
import {
    getEffect,
    cloneParamValue,
    isStarterEffect,
    hasTexSurfaceParam,
    is3dGenerator,
    is3dProcessor,
    sanitizeEnumName
} from '../../../shaders/src/renderer/canvas.js'
import { groupGlobalsByCategory } from '../../../shaders/src/runtime/effect.js'

/**
 * Convert camelCase to space-separated lowercase words
 * @param {string} str - camelCase string
 * @returns {string} Space-separated lowercase string
 * @example
 * camelToSpaceCase('someEffectName') // 'some effect name'
 * camelToSpaceCase('posterize') // 'posterize'
 */
export function camelToSpaceCase(str) {
    if (typeof str !== 'string') return ''
    return str
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .toLowerCase()
}

/**
 * Format enum name for DSL output - quote if not a valid identifier
 * @param {string} name - Name to format
 * @returns {string} Formatted name
 */
export function formatEnumName(name) {
    const sanitized = sanitizeEnumName(name)
    if (sanitized !== null) {
        return sanitized
    }
    // Can't be an identifier - quote it as a string
    return `"${name.replace(/"/g, '\\"')}"`
}

/**
 * Format a value for DSL output
 * @param {*} value - Value to format
 * @param {object} spec - Parameter spec
 * @param {object} enums - Enum registry
 * @returns {string} Formatted value
 */
export function formatValue(value, spec, enums = {}) {
    const type = spec?.type || (typeof spec === 'string' ? spec : 'float')

    // Handle variable reference marker - output just the variable name
    if (value && typeof value === 'object' && value._varRef) {
        return value._varRef
    }

    // Handle oscillator configuration objects
    if (value && typeof value === 'object' && value.oscillator === true) {
        const oscTypeNames = ['sine', 'tri', 'saw', 'sawInv', 'square', 'noise']
        const typeName = oscTypeNames[value.oscType] || 'sine'
        const parts = [`type: oscKind.${typeName}`]
        if (value.min !== undefined && value.min !== 0) {
            parts.push(`min: ${value.min}`)
        }
        if (value.max !== undefined && value.max !== 1) {
            parts.push(`max: ${value.max}`)
        }
        if (value.speed !== undefined && value.speed !== 1) {
            parts.push(`speed: ${value.speed}`)
        }
        if (value.offset !== undefined && value.offset !== 0) {
            parts.push(`offset: ${value.offset}`)
        }
        if (value.seed !== undefined && value.seed !== 1) {
            parts.push(`seed: ${value.seed}`)
        }
        return `osc(${parts.join(', ')})`
    }

    // If spec has inline choices, look up the enum name
    if (spec?.choices && typeof value === 'number') {
        for (const [name, val] of Object.entries(spec.choices)) {
            if (name.endsWith(':')) continue // skip group labels
            if (val === value) {
                return formatEnumName(name)
            }
        }
    }

    // If spec has enum (global enum reference), look up the name
    if (spec?.enum && typeof value === 'number') {
        const enumPath = spec.enum
        const parts = enumPath.split('.')
        let node = enums
        for (const part of parts) {
            if (node && node[part]) {
                node = node[part]
            } else {
                node = null
                break
            }
        }
        if (node && typeof node === 'object') {
            for (const [name, val] of Object.entries(node)) {
                const numVal = (val && typeof val === 'object' && 'value' in val) ? val.value : val
                if (numVal === value) {
                    return `${enumPath}.${name}`
                }
            }
        }
    }

    if (type === 'boolean' || type === 'button') {
        return value ? 'true' : 'false'
    }
    if (type === 'surface') {
        // Handle object surface references (e.g., {kind: 'output', name: 'o1'})
        if (value && typeof value === 'object' && value.name) {
            return `read(${value.name})`
        }
        if (typeof value !== 'string' || value.length === 0) {
            // Use spec default if available, otherwise use inputTex as the standard default
            const defaultSurface = spec?.default || 'inputTex'
            return `read(${defaultSurface})`
        }
        if (value.includes('(')) {
            return value
        }
        return `read(${value})`
    }
    if (type === 'member') {
        return value
    }
    if (type === 'vec4' && Array.isArray(value)) {
        const toHex = (n) => Math.round(n * 255).toString(16).padStart(2, '0')
        return `#${toHex(value[0])}${toHex(value[1])}${toHex(value[2])}${toHex(value[3])}`
    }
    if (type === 'vec3' && Array.isArray(value)) {
        return `vec3(${value.join(', ')})`
    }
    if (type === 'vec2' && Array.isArray(value)) {
        return `vec2(${value.join(', ')})`
    }
    if (type === 'palette' || type === 'string' || type === 'text') {
        return `"${value}"`
    }
    // float, int
    return value
}

/**
 * Extract effect names from DSL text without compiling (for lazy loading)
 * @param {string} dsl - DSL source
 * @param {object} manifest - Shader manifest
 * @returns {Array} Array of { effectId, namespace, name }
 */
export function extractEffectNamesFromDsl(dsl, manifest) {
    const effects = []
    if (!dsl || typeof dsl !== 'string') return effects

    const lines = dsl.split('\n')
    let searchNamespaces = []

    for (const line of lines) {
        const trimmed = line.trim()

        if (trimmed.startsWith('search ')) {
            searchNamespaces = trimmed.slice(7).split(',').map(s => s.trim())
            continue
        }

        if (!trimmed || trimmed.startsWith('//')) continue

        const callPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\s*\(/g
        let match

        while ((match = callPattern.exec(trimmed)) !== null) {
            const fullName = match[1]
            let namespace = null
            let name = fullName

            if (fullName.includes('.')) {
                const parts = fullName.split('.')
                namespace = parts[0]
                name = parts[1]
            }

            const builtins = ['read', 'out', 'vec2', 'vec3', 'vec4']
            if (builtins.includes(name)) continue

            if (!namespace && searchNamespaces.length > 0) {
                for (const ns of searchNamespaces) {
                    const testId = `${ns}/${name}`
                    if (manifest[testId]) {
                        namespace = ns
                        break
                    }
                }
            }

            if (!namespace) {
                for (const ns of ['classicNoisemaker', 'classicNoisedeck', 'filter', 'mixer', 'synth', 'stateful']) {
                    const testId = `${ns}/${name}`
                    if (manifest[testId]) {
                        namespace = ns
                        break
                    }
                }
            }

            if (namespace) {
                const effectId = `${namespace}/${name}`
                if (!effects.find(e => e.effectId === effectId)) {
                    effects.push({ effectId, namespace, name })
                }
            }
        }
    }

    return effects
}

/**
 * Extract effects from compiled DSL
 * @param {string} dsl - DSL source
 * @returns {Array} Array of effect info objects
 */
export function extractEffectsFromDsl(dsl) {
    const effects = []
    if (!dsl || typeof dsl !== 'string') return effects

    try {
        // Parse to get original AST with raw kwargs (before validation resolves variables)
        const tokens = lex(dsl)
        const ast = parse(tokens)

        // Also compile to get resolved args
        const result = compile(dsl)
        if (!result || !result.plans) return effects

        // Build a map from the original parsed AST to get raw kwargs
        const originalKwargs = []
        if (ast.plans) {
            for (const plan of ast.plans) {
                if (!plan.chain) continue
                for (const step of plan.chain) {
                    originalKwargs.push(step.kwargs || {})
                }
            }
        }

        let globalStepIndex = 0
        for (const plan of result.plans) {
            if (!plan.chain) continue
            for (const step of plan.chain) {
                const fullOpName = step.op
                const namespace = step.namespace?.namespace || step.namespace?.resolved || null

                let shortName = fullOpName
                if (fullOpName.includes('.')) {
                    shortName = fullOpName.split('.').pop()
                }

                effects.push({
                    effectKey: fullOpName,
                    namespace,
                    name: shortName,
                    fullName: fullOpName,
                    args: step.args || {},
                    rawKwargs: originalKwargs[globalStepIndex] || {},
                    stepIndex: globalStepIndex,
                    temp: step.temp
                })
                globalStepIndex++
            }
        }
    } catch (err) {
        console.warn('Failed to parse DSL for effect extraction:', err)
    }

    return effects
}

/**
 * Get backend from URL query parameter
 * @returns {string|null} Backend name or null
 */
export function getBackendFromURL() {
    const params = new URLSearchParams(window.location.search)
    return params.get('backend')
}

/**
 * Get bundle mode from URL query parameter
 * @returns {boolean} Whether to use pre-built bundles
 */
export function getUseBundlesFromURL() {
    const params = new URLSearchParams(window.location.search)
    return params.get('bundles') === '1' || params.get('bundles') === 'true'
}

/**
 * Get effect from URL query parameter
 * @returns {string|null} Effect path (namespace/name) or null
 */
export function getEffectFromURL() {
    const params = new URLSearchParams(window.location.search)
    const effectParam = params.get('effect')

    if (!effectParam) return null

    const parts = effectParam.split('.')
    if (parts.length === 2) {
        return `${parts[0]}/${parts[1]}`
    }

    return null
}

/**
 * UIController class - handles all UI interactions for the shader demo
 */
export class UIController {
    /**
     * Create a new UIController instance
     * @param {CanvasRenderer} renderer - The canvas renderer instance
     * @param {object} options - UI element references
     * @param {HTMLSelectElement} options.effectSelect - Effect selector element
     * @param {HTMLTextAreaElement} options.dslEditor - DSL editor element
     * @param {HTMLElement} options.controlsContainer - Effect controls container
     * @param {HTMLElement} options.statusEl - Status message element
     * @param {HTMLElement} [options.fpsCounterEl] - FPS counter display element
     * @param {HTMLDialogElement} [options.loadingDialog] - Loading dialog element
     * @param {HTMLElement} [options.loadingDialogTitle] - Loading dialog title
     * @param {HTMLElement} [options.loadingDialogStatus] - Loading dialog status
     * @param {HTMLElement} [options.loadingDialogProgress] - Loading dialog progress bar
     * @param {function} [options.onControlChange] - Callback when a control value changes
     */
    constructor(renderer, options = {}) {
        this._renderer = renderer

        // DOM elements
        this._effectSelect = options.effectSelect
        this._dslEditor = options.dslEditor
        this._controlsContainer = options.controlsContainer
        this._statusEl = options.statusEl
        this._fpsCounterEl = options.fpsCounterEl
        this._loadingDialog = options.loadingDialog
        this._loadingDialogTitle = options.loadingDialogTitle
        this._loadingDialogStatus = options.loadingDialogStatus
        this._loadingDialogProgress = options.loadingDialogProgress

        // Callbacks
        this._onControlChangeCallback = options.onControlChange || null

        // State
        this._parameterValues = {}
        this._effectParameterValues = {} // Map: step_N -> {param: value}
        this._dependentControls = [] // Array of {element, effectKey, paramKey, enabledBy, enabledByKey}
        this._shaderOverrides = {} // Map: stepIndex -> { programName: { glsl?, wgsl?, fragment?, vertex? } }
        this._writeTargetOverrides = {} // Map: planIndex -> surfaceName (e.g., 'o0', 'f1')
        this._writeStepTargetOverrides = {} // Map: stepIndex -> surfaceName for mid-chain writes
        this._readSourceOverrides = {} // Map: stepIndex -> surfaceName for read() source
        this._parsedDslStructure = []
        this._allEffects = []

        // Media input state per step
        // Map: stepIndex -> { source, stream, videoEl, imageEl, textureId, updateFrame }
        this._mediaInputs = new Map()
        this._mediaUpdateFrame = null

        // Loading state
        this._loadingState = {
            queue: [],
            completed: 0,
            total: 0
        }

        // Bind the formatValue function with enums context
        this._boundFormatValue = (value, spec) => formatValue(value, spec, this._renderer.enums)

        // Start the media update loop
        this._startMediaUpdateLoop()
    }

    // =========================================================================
    // Media Input Management
    // =========================================================================

    /**
     * Start the continuous media update loop
     * @private
     */
    _startMediaUpdateLoop() {
        if (this._mediaUpdateFrame) return

        const update = () => {
            this._updateAllMediaTextures()
            this._mediaUpdateFrame = requestAnimationFrame(update)
        }

        update()
    }

    /**
     * Stop the media update loop
     * @private
     */
    _stopMediaUpdateLoop() {
        if (this._mediaUpdateFrame) {
            cancelAnimationFrame(this._mediaUpdateFrame)
            this._mediaUpdateFrame = null
        }
    }

    /**
     * Update all media textures that need continuous updates (video/camera)
     * @private
     */
    _updateAllMediaTextures() {
        let anyUpdated = false
        for (const [stepIndex, media] of this._mediaInputs) {
            if (!media.source) continue

            // Only update video sources continuously
            if (media.source instanceof HTMLVideoElement) {
                if (!media.source.paused && media.source.videoWidth > 0) {
                    this._updateMediaTexture(stepIndex)
                    anyUpdated = true
                }
            }
        }

        // Apply step-specific parameter values (including imageSize) to the pipeline
        if (anyUpdated && this._renderer.applyStepParameterValues) {
            this._renderer.applyStepParameterValues(this._effectParameterValues)
        }
    }

    /**
     * Update a single media texture
     * @param {number} stepIndex - Step index
     * @private
     */
    _updateMediaTexture(stepIndex) {
        const media = this._mediaInputs.get(stepIndex)
        if (!media || !media.source || !this._renderer._pipeline) return

        const texId = media.textureId || 'imageTex'
        // Don't flip Y - the mediaInput shader handles UV flipping internally (st.y = 1.0 - st.y)
        const result = this._renderer.updateTextureFromSource(texId, media.source, { flipY: false })

        if (result.width > 0 && result.height > 0) {
            // Update imageSize uniform for this specific step (not globally)
            const effectKey = `step_${stepIndex}`
            if (this._effectParameterValues[effectKey]) {
                this._effectParameterValues[effectKey].imageSize = [result.width, result.height]
            }
        }
    }

    /**
     * Create media input controls section for an effect
     * @param {number} stepIndex - Step index for this effect
     * @param {string} textureId - Texture ID (e.g., 'imageTex')
     * @param {object} effectDef - Effect definition
     * @returns {HTMLElement} Media input controls container
     * @private
     */
    _createMediaInputSection(stepIndex, textureId) {
        const section = document.createElement('div')
        section.className = 'media-input-section'

        // Initialize media state for this step
        if (!this._mediaInputs.has(stepIndex)) {
            this._mediaInputs.set(stepIndex, {
                source: null,
                stream: null,
                videoEl: null,
                imageEl: null,
                textureId: textureId
            })
        }

        // Source type selector (file vs camera)
        const sourceGroup = document.createElement('div')
        sourceGroup.className = 'control-group'

        const sourceLabel = document.createElement('label')
        sourceLabel.className = 'control-label'
        sourceLabel.textContent = 'media source'
        sourceGroup.appendChild(sourceLabel)

        const sourceRadios = document.createElement('div')
        sourceRadios.className = 'media-source-radios'

        const radioName = `media-source-${stepIndex}`;

        ['file', 'camera'].forEach(type => {
            const radioLabel = document.createElement('label')

            const radio = document.createElement('input')
            radio.type = 'radio'
            radio.name = radioName
            radio.value = type
            radio.checked = type === 'file'

            radioLabel.appendChild(radio)
            radioLabel.appendChild(document.createTextNode(type))
            sourceRadios.appendChild(radioLabel)
        })

        sourceGroup.appendChild(sourceRadios)
        section.appendChild(sourceGroup)

        // File input group
        const fileGroup = document.createElement('div')
        fileGroup.className = 'control-group media-file-group'
        fileGroup.dataset.stepIndex = stepIndex

        const fileLabel = document.createElement('label')
        fileLabel.className = 'control-label'
        fileLabel.textContent = 'media file'
        fileGroup.appendChild(fileLabel)

        const fileInput = document.createElement('input')
        fileInput.type = 'file'
        fileInput.accept = 'image/*,video/*'
        fileInput.className = 'media-file-input'
        fileInput.dataset.stepIndex = stepIndex
        fileInput.dataset.textureId = textureId

        fileInput.addEventListener('change', (e) => this._handleMediaFileChange(e, stepIndex))

        fileGroup.appendChild(fileInput)
        section.appendChild(fileGroup)

        // Camera group (hidden by default)
        const cameraGroup = document.createElement('div')
        cameraGroup.className = 'control-group media-camera-group'
        cameraGroup.style.display = 'none'
        cameraGroup.dataset.stepIndex = stepIndex

        const cameraLabel = document.createElement('label')
        cameraLabel.className = 'control-label'
        cameraLabel.textContent = 'camera'
        cameraGroup.appendChild(cameraLabel)

        const cameraSelect = document.createElement('select')
        cameraSelect.className = 'control-select'
        cameraSelect.innerHTML = '<option value="">select camera...</option>'
        cameraSelect.dataset.stepIndex = stepIndex
        cameraGroup.appendChild(cameraSelect)

        const cameraButtons = document.createElement('div')
        cameraButtons.className = 'media-camera-buttons'

        const startBtn = document.createElement('button')
        startBtn.className = 'action-btn'
        startBtn.textContent = 'start'
        startBtn.addEventListener('click', () => this._startCamera(stepIndex, cameraSelect.value))

        const stopBtn = document.createElement('button')
        stopBtn.className = 'action-btn'
        stopBtn.textContent = 'stop'
        stopBtn.disabled = true
        stopBtn.addEventListener('click', () => this._stopCamera(stepIndex))

        cameraButtons.appendChild(startBtn)
        cameraButtons.appendChild(stopBtn)
        cameraGroup.appendChild(cameraButtons)

        // Store button refs in the section for later access
        cameraGroup._startBtn = startBtn
        cameraGroup._stopBtn = stopBtn
        cameraGroup._select = cameraSelect

        section.appendChild(cameraGroup)

        // Status display
        const statusGroup = document.createElement('div')
        statusGroup.className = 'control-group'

        const statusLabel = document.createElement('label')
        statusLabel.className = 'control-label'
        statusLabel.textContent = 'status'
        statusGroup.appendChild(statusLabel)

        const statusSpan = document.createElement('span')
        statusSpan.className = 'media-status'
        statusSpan.textContent = 'no media loaded'
        statusSpan.dataset.stepIndex = stepIndex

        statusGroup.appendChild(statusSpan)
        section.appendChild(statusGroup)

        // Hidden video/image elements for this step
        const video = document.createElement('video')
        video.style.display = 'none'
        video.loop = true
        video.muted = true
        video.playsInline = true
        section.appendChild(video)

        const image = document.createElement('img')
        image.style.display = 'none'
        section.appendChild(image)

        // Store refs in media state
        const mediaState = this._mediaInputs.get(stepIndex)
        mediaState.videoEl = video
        mediaState.imageEl = image
        mediaState.statusEl = statusSpan
        mediaState.cameraGroup = cameraGroup
        mediaState.fileGroup = fileGroup

        // Radio button change handler
        sourceRadios.addEventListener('change', (e) => {
            if (e.target.value === 'camera') {
                fileGroup.style.display = 'none'
                cameraGroup.style.display = 'block'
                this._populateCameraList(stepIndex, cameraSelect)
            } else {
                fileGroup.style.display = 'block'
                cameraGroup.style.display = 'none'
                this._stopCamera(stepIndex)
            }
        })

        // Load default test image
        this._loadDefaultMediaImage(stepIndex)

        return section
    }

    /**
     * Handle media file change
     * @private
     */
    _handleMediaFileChange(e, stepIndex) {
        const file = e.target.files[0]
        if (!file) return

        const media = this._mediaInputs.get(stepIndex)
        if (!media) return

        const url = URL.createObjectURL(file)

        if (file.type.startsWith('video/')) {
            media.videoEl.src = url
            media.videoEl.load()

            media.videoEl.onloadedmetadata = () => {
                media.source = media.videoEl
                media.statusEl.textContent = `video: ${media.videoEl.videoWidth}x${media.videoEl.videoHeight}`
                media.videoEl.play()
                this._updateMediaTexture(stepIndex)
                // Apply step-specific parameters to the pipeline
                if (this._renderer.applyStepParameterValues) {
                    this._renderer.applyStepParameterValues(this._effectParameterValues)
                }
            }
        } else if (file.type.startsWith('image/')) {
            media.imageEl.src = url
            media.imageEl.onload = () => {
                media.source = media.imageEl
                media.statusEl.textContent = `image: ${media.imageEl.naturalWidth}x${media.imageEl.naturalHeight}`
                this._updateMediaTexture(stepIndex)
                // Apply step-specific parameters to the pipeline
                if (this._renderer.applyStepParameterValues) {
                    this._renderer.applyStepParameterValues(this._effectParameterValues)
                }
            }
        }
    }

    /**
     * Populate camera list for a step
     * @private
     */
    async _populateCameraList(stepIndex, selectEl) {
        const media = this._mediaInputs.get(stepIndex)

        try {
            // First, request camera permission to get proper device labels
            // This triggers the browser's permission prompt if not already granted
            const tempStream = await navigator.mediaDevices.getUserMedia({ video: true })
            // Stop the temp stream immediately - we just needed permission
            tempStream.getTracks().forEach(track => track.stop())

            // Now enumerate devices - labels will be available after permission granted
            const devices = await navigator.mediaDevices.enumerateDevices()
            const videoDevices = devices.filter(d => d.kind === 'videoinput')

            selectEl.innerHTML = '<option value="">select camera...</option>'
            videoDevices.forEach((device, idx) => {
                const option = document.createElement('option')
                option.value = device.deviceId
                option.textContent = device.label || `Camera ${idx + 1}`
                selectEl.appendChild(option)
            })

            if (media?.statusEl) {
                media.statusEl.textContent = videoDevices.length > 0
                    ? `${videoDevices.length} camera(s) found`
                    : 'no cameras found'
            }
        } catch (err) {
            console.error('Failed to access camera:', err)
            if (media?.statusEl) {
                media.statusEl.textContent = `camera error: ${err.message}`
            }
            selectEl.innerHTML = '<option value="">camera access denied</option>'
        }
    }

    /**
     * Start camera for a step
     * @private
     */
    async _startCamera(stepIndex, deviceId) {
        if (!deviceId) {
            const media = this._mediaInputs.get(stepIndex)
            if (media?.statusEl) {
                media.statusEl.textContent = 'please select a camera'
            }
            return
        }

        const media = this._mediaInputs.get(stepIndex)
        if (!media) return

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: { exact: deviceId } }
            })

            media.stream = stream
            media.videoEl.srcObject = stream
            await media.videoEl.play()

            media.source = media.videoEl
            media.statusEl.textContent = `camera: ${media.videoEl.videoWidth}x${media.videoEl.videoHeight}`

            // Update button states
            if (media.cameraGroup) {
                media.cameraGroup._startBtn.disabled = true
                media.cameraGroup._stopBtn.disabled = false
            }

            this._updateMediaTexture(stepIndex)
            // Apply step-specific parameters to the pipeline
            if (this._renderer.applyStepParameterValues) {
                this._renderer.applyStepParameterValues(this._effectParameterValues)
            }
        } catch (err) {
            console.error('Failed to start camera:', err)
            media.statusEl.textContent = `camera error: ${err.message}`
        }
    }

    /**
     * Stop camera for a step
     * @private
     */
    _stopCamera(stepIndex) {
        const media = this._mediaInputs.get(stepIndex)
        if (!media) return

        if (media.stream) {
            media.stream.getTracks().forEach(track => track.stop())
            media.stream = null
        }

        media.videoEl.srcObject = null
        media.source = null
        media.statusEl.textContent = 'camera stopped'

        // Update button states
        if (media.cameraGroup) {
            media.cameraGroup._startBtn.disabled = false
            media.cameraGroup._stopBtn.disabled = true
        }
    }

    /**
     * Stop all cameras and clean up media state
     */
    stopAllMedia() {
        for (const [, media] of this._mediaInputs) {
            if (media.stream) {
                media.stream.getTracks().forEach(track => track.stop())
            }
        }
        this._mediaInputs.clear()
    }

    /**
     * Load default test image for a step
     * @private
     */
    async _loadDefaultMediaImage(stepIndex) {
        const media = this._mediaInputs.get(stepIndex)
        if (!media) return

        const img = new Image()
        img.onload = () => {
            media.source = img
            media.imageEl.src = img.src
            media.statusEl.textContent = `default: ${img.naturalWidth}x${img.naturalHeight}`
            this._updateMediaTexture(stepIndex)
            // Apply step-specific parameters to the pipeline
            if (this._renderer.applyStepParameterValues) {
                this._renderer.applyStepParameterValues(this._effectParameterValues)
            }
        }
        img.onerror = () => {
            media.statusEl.textContent = 'no media loaded'
        }
        img.src = 'img/testcard.png'
    }

    // =========================================================================
    // Getters
    // =========================================================================

    /** @returns {object} Current parameter values */
    get parameterValues() {
        return this._parameterValues
    }

    /** @returns {object} Effect parameter values by step */
    get effectParameterValues() {
        return this._effectParameterValues
    }

    /** @returns {object} Shader source overrides by step index */
    get shaderOverrides() {
        return this._shaderOverrides
    }

    /** @returns {Array} All effect placeholders */
    get allEffects() {
        return this._allEffects
    }

    // =========================================================================
    // Status Display
    // =========================================================================

    /**
     * Show a status message
     * @param {string} message - Message to display
     * @param {string} [type='info'] - Message type (info, success, error)
     */
    showStatus(message, type = 'info') {
        if (!this._statusEl) return

        this._statusEl.textContent = message
        this._statusEl.className = `status ${type}`
        this._statusEl.style.display = 'block'
        setTimeout(() => {
            this._statusEl.style.display = 'none'
        }, 3000)
    }

    /**
     * Update FPS counter display
     * @param {number} fps - Current FPS
     */
    updateFPSCounter(fps) {
        if (this._fpsCounterEl) {
            this._fpsCounterEl.textContent = `${fps} fps`
        }
    }

    // =========================================================================
    // Loading Dialog
    // =========================================================================

    /**
     * Show the loading dialog
     * @param {string} [title='loading effect...'] - Dialog title
     */
    showLoadingDialog(title = 'loading effect...') {
        if (!this._loadingDialog) return

        if (this._loadingDialogTitle) {
            this._loadingDialogTitle.textContent = title
        }
        if (this._loadingDialogStatus) {
            this._loadingDialogStatus.textContent = 'preparing...'
        }
        if (this._loadingDialogProgress) {
            this._loadingDialogProgress.style.width = '0%'
        }

        this._loadingState = { queue: [], completed: 0, total: 0 }
        this._loadingDialog.showModal()
    }

    /**
     * Hide the loading dialog
     */
    hideLoadingDialog() {
        if (this._loadingDialog) {
            this._loadingDialog.close()
        }
    }

    /**
     * Update loading status text
     * @param {string} status - Status message
     */
    updateLoadingStatus(status) {
        if (this._loadingDialogStatus) {
            this._loadingDialogStatus.textContent = status
        }
    }

    /**
     * Update loading progress
     */
    updateLoadingProgress() {
        if (!this._loadingDialogProgress) return

        const progress = this._loadingState.total > 0
            ? (this._loadingState.completed / this._loadingState.total) * 100
            : 0
        this._loadingDialogProgress.style.width = `${progress}%`
    }

    /**
     * Add item to loading queue
     * @param {string} id - Item ID
     * @param {string} label - Item label
     */
    addToLoadingQueue(id, label) {
        this._loadingState.queue.push({ id, label, status: 'pending' })
        this._loadingState.total++
    }

    /**
     * Update loading queue item status
     * @param {string} id - Item ID
     * @param {string} status - New status
     */
    updateLoadingQueueItem(id, status) {
        const item = this._loadingState.queue.find(i => i.id === id)
        if (item) {
            item.status = status
            if (status === 'done' || status === 'error') {
                this._loadingState.completed++
            }
            this.updateLoadingProgress()
        }
    }

    // =========================================================================
    // Effect Selector
    // =========================================================================

    /**
     * Populate the effect selector dropdown
     * @param {Array} effects - Array of effect objects with namespace, name, and optional description
     */
    populateEffectSelector(effects) {
        if (!this._effectSelect) return

        this._allEffects = effects

        // Check if this is a custom effect-select component
        if (typeof this._effectSelect.setEffects === 'function') {
            this._effectSelect.setEffects(effects)
        } else {
            // Fallback to native select element
            this._effectSelect.innerHTML = ''

            const grouped = {}
            effects.forEach(effect => {
                if (!grouped[effect.namespace]) {
                    grouped[effect.namespace] = []
                }
                grouped[effect.namespace].push(effect)
            })

            const sortedNamespaces = Object.keys(grouped).sort((a, b) => {
                const aIsClassic = a.startsWith('classic')
                const bIsClassic = b.startsWith('classic')
                if (aIsClassic && !bIsClassic) return 1
                if (!aIsClassic && bIsClassic) return -1
                return a.localeCompare(b)
            })

            sortedNamespaces.forEach(namespace => {
                const effectList = grouped[namespace]
                const optgroup = document.createElement('optgroup')
                optgroup.label = camelToSpaceCase(namespace)

                effectList.sort((a, b) => a.name.localeCompare(b.name)).forEach(effect => {
                    const option = document.createElement('option')
                    option.value = `${namespace}/${effect.name}`
                    const effectName = camelToSpaceCase(effect.name)
                    // Include description if available
                    if (effect.description) {
                        option.textContent = `${effectName}: ${effect.description}`
                    } else {
                        option.textContent = effectName
                    }
                    optgroup.appendChild(option)
                })

                this._effectSelect.appendChild(optgroup)
            })
        }
    }

    /**
     * Set the selected effect in the dropdown
     * @param {string} effectPath - Effect path (namespace/name)
     */
    setSelectedEffect(effectPath) {
        if (!this._effectSelect) return

        // Check if this is a custom effect-select component
        if (typeof this._effectSelect.setEffects === 'function') {
            this._effectSelect.value = effectPath
        } else {
            // Fallback to native select element
            for (let i = 0; i < this._effectSelect.options.length; i++) {
                if (this._effectSelect.options[i].value === effectPath) {
                    this._effectSelect.selectedIndex = i
                    break
                }
            }
        }
    }

    // =========================================================================
    // DSL Handling
    // =========================================================================

    /**
     * Get current DSL from editor
     * @returns {string} DSL content
     */
    getDsl() {
        return this._dslEditor ? this._dslEditor.value.trim() : ''
    }

    /**
     * Set DSL in editor
     * @param {string} dsl - DSL content
     */
    setDsl(dsl) {
        if (this._dslEditor) {
            this._dslEditor.value = dsl || ''
        }
    }

    /**
     * Format an effect call with parameters
     * @param {string} funcName - Function name
     * @param {object} kwargs - Object of parameter key-value pairs
     * @returns {string} Formatted call string
     */
    _formatEffectCall(funcName, kwargs) {
        return unparseCall({ name: funcName, kwargs, args: [] })
    }

    /**
     * Build kwargs object from effect globals and parameter values
     * @param {object} globals - Effect globals spec
     * @param {object} paramValues - Current parameter values
     * @param {function} formatValue - Value formatter function
     * @returns {object} kwargs object
     */
    _buildKwargs(globals, paramValues) {
        const kwargs = {}
        if (!globals) return kwargs

        for (const [key, spec] of Object.entries(globals)) {
            const value = paramValues[key]
            if (value === undefined || value === null) continue

            // Skip _skip: false
            if (key === '_skip' && value === false) continue

            // Check against default value
            if (spec.default !== undefined) {
                const formattedValue = this._boundFormatValue(value, spec)
                const formattedDefault = this._boundFormatValue(spec.default, spec)
                if (formattedValue === formattedDefault) continue
            }

            kwargs[key] = value
        }
        return kwargs
    }

    /**
     * Build DSL source from an effect and parameter values
     * @param {object} effect - Effect object
     * @returns {string} Generated DSL
     */
    buildDslSource(effect) {
        if (!effect || !effect.instance) {
            return ''
        }

        // Build search directive (with two line breaks after)
        // Classic namespaces stay in their lane - no cross-namespace search
        // classicNoisemaker needs synth for noise() starter (it has no noise module)
        let searchNs = effect.namespace
        if (effect.namespace === 'classicNoisemaker') {
            searchNs = 'classicNoisemaker, synth'
        } else if (['filter', 'mixer', 'stateful'].includes(effect.namespace)) {
            searchNs = `${effect.namespace}, synth`
        }
        const searchDirective = searchNs ? `search ${searchNs}\n\n` : ''
        const funcName = effect.instance.func

        const starter = isStarterEffect(effect)
        const hasTex = hasTexSurfaceParam(effect)

        // Helper to format a call
        const fmtCall = (name, kwargs) => this._formatEffectCall(name, kwargs)

        // Standard noise starter call
        const noiseCall = fmtCall('noise', { seed: 1, ridges: true })

        // 3D volume generators
        if (is3dGenerator(effect)) {
            const kwargs = this._buildKwargs(effect.instance.globals, this._parameterValues)
            const effectCall = fmtCall(funcName, kwargs)
            return `search vol\n\n${effectCall}\n  .render3d()\n  .write(o0)`
        }

        if (starter) {
            const kwargs = this._buildKwargs(effect.instance.globals, this._parameterValues)

            if (hasTex) {
                const sourceSurface = 'o1'
                const outputSurface = 'o0'
                // Add tex as first param for effects with texture input
                const kwargsWithTex = { tex: `read(${sourceSurface})`, ...kwargs }
                const effectCall = fmtCall(funcName, kwargsWithTex)
                return `${searchDirective}${noiseCall}\n  .write(${sourceSurface})\n\n${effectCall}\n  .write(${outputSurface})`
            }
            const effectCall = fmtCall(funcName, kwargs)
            return `${searchDirective}${effectCall}\n  .write(o0)`
        } else if (hasTex) {
            const kwargs = { tex: 'read(o1)' }
            if (effect.instance.globals) {
                for (const [key, spec] of Object.entries(effect.instance.globals)) {
                    if (key === 'tex' && spec.type === 'surface') continue
                    const value = this._parameterValues[key]
                    if (value === undefined || value === null) continue

                    // Skip _skip: false
                    if (key === '_skip' && value === false) continue

                    // Check against default value
                    if (spec.default !== undefined) {
                        const formattedValue = this._boundFormatValue(value, spec)
                        const formattedDefault = this._boundFormatValue(spec.default, spec)
                        if (formattedValue === formattedDefault) continue
                    }

                    kwargs[key] = value
                }
            }
            const effectCall = fmtCall(funcName, kwargs)
            const noiseCall2 = fmtCall('noise', { seed: 2, ridges: true })
            return `${searchDirective}${noiseCall}\n  .write(o1)\n\n${noiseCall2}\n  .${effectCall}\n  .write(o0)`
        } else if (is3dProcessor(effect)) {
            let consumerVolumeSize = 32
            const kwargs = {}
            if (effect.instance.globals) {
                for (const [key, spec] of Object.entries(effect.instance.globals)) {
                    const value = this._parameterValues[key]
                    if (value === undefined || value === null) continue
                    if (key === 'volumeSize') consumerVolumeSize = value

                    // Skip _skip: false
                    if (key === '_skip' && value === false) continue

                    // Check against default value
                    if (spec.default !== undefined) {
                        const formattedValue = this._boundFormatValue(value, spec)
                        const formattedDefault = this._boundFormatValue(spec.default, spec)
                        if (formattedValue === formattedDefault) continue
                    }

                    kwargs[key] = value
                }
            }
            const generatorCall = fmtCall('noise3d', { volumeSize: `x${consumerVolumeSize}` })
            const effectCall = fmtCall(funcName, kwargs)
            // render3d IS the renderer - don't append another .render3d() call
            const renderSuffix = funcName === 'render3d' ? '' : '\n  .render3d()'
            return `search vol\n\n${generatorCall}\n  .${effectCall}${renderSuffix}\n  .write(o0)`
        } else {
            const kwargs = this._buildKwargs(effect.instance.globals, this._parameterValues)
            const effectCall = fmtCall(funcName, kwargs)
            return `${searchDirective}${noiseCall}\n  .${effectCall}\n  .write(o0)`
        }
    }

    /**
     * Regenerate DSL from effect parameter values
     * @returns {string|null} Regenerated DSL or null on error
     */
    regenerateDslFromEffectParams() {
        const currentDslText = this.getDsl()
        if (!currentDslText) return null

        try {
            const compiled = compile(currentDslText)
            if (!compiled || !compiled.plans) return null

            const overrides = {}
            for (const [key, params] of Object.entries(this._effectParameterValues)) {
                const match = key.match(/^step_(\d+)$/)
                if (match) {
                    const stepIndex = parseInt(match[1], 10)
                    overrides[stepIndex] = params
                }
            }

            // Apply write target overrides
            for (const [planIndexStr, targetName] of Object.entries(this._writeTargetOverrides)) {
                const planIndex = parseInt(planIndexStr, 10)
                if (compiled.plans[planIndex]) {
                    const isOutput = targetName.startsWith('o')
                    compiled.plans[planIndex].write = {
                        type: isOutput ? 'OutputRef' : 'FeedbackRef',
                        name: targetName
                    }
                }
            }

            // Apply read source overrides
            if (this._readSourceOverrides) {
                let globalStepIndex = 0
                for (const plan of compiled.plans) {
                    if (!plan.chain) continue
                    for (const step of plan.chain) {
                        if (step.builtin && step.op === '_read' && this._readSourceOverrides[globalStepIndex] !== undefined) {
                            const targetName = this._readSourceOverrides[globalStepIndex]
                            const isOutput = targetName.startsWith('o')
                            step.args.tex = {
                                kind: isOutput ? 'output' : 'feedback',
                                name: targetName
                            }
                        }
                        globalStepIndex++
                    }
                }
            }

            // Apply mid-chain write target overrides (by stepIndex)
            if (this._writeStepTargetOverrides) {
                let globalStepIndex = 0
                for (const plan of compiled.plans) {
                    if (!plan.chain) continue
                    for (const step of plan.chain) {
                        if (step.builtin && step.op === '_write' && this._writeStepTargetOverrides[globalStepIndex] !== undefined) {
                            const targetName = this._writeStepTargetOverrides[globalStepIndex]
                            const isOutput = targetName.startsWith('o')
                            step.args.tex = {
                                kind: isOutput ? 'output' : 'feedback',
                                name: targetName
                            }
                        }
                        globalStepIndex++
                    }
                }
            }

            const searchMatch = currentDslText.match(/^search\s+(\S.*?)$/m)
            if (searchMatch) {
                compiled.searchNamespaces = searchMatch[1].split(/\s*,\s*/)
            }

            // Extract let declarations from original DSL to preserve them
            const letDeclarations = []
            const letRegex = /^let\s+(\w+)\s*=\s*(.+)$/gm
            let letMatch
            while ((letMatch = letRegex.exec(currentDslText)) !== null) {
                letDeclarations.push(letMatch[0])
            }

            const getEffectDefCallback = (effectName, namespace) => {
                let def = getEffect(effectName)
                if (def) return def

                if (namespace) {
                    def = getEffect(`${namespace}/${effectName}`) ||
                          getEffect(`${namespace}.${effectName}`)
                    if (def) return def
                }

                return null
            }

            let result = unparse(compiled, overrides, {
                customFormatter: this._boundFormatValue,
                getEffectDef: getEffectDefCallback
            })

            // Prepend let declarations after search directive
            if (letDeclarations.length > 0 && result) {
                const lines = result.split('\n')
                const searchLineIndex = lines.findIndex(l => l.trim().startsWith('search '))
                if (searchLineIndex >= 0) {
                    // Insert let declarations after search line
                    lines.splice(searchLineIndex + 1, 0, '', ...letDeclarations, '')
                } else {
                    // No search line, prepend let declarations
                    lines.unshift(...letDeclarations, '')
                }
                result = lines.join('\n')
            }

            return result
        } catch (err) {
            console.warn('Failed to regenerate DSL:', err)
            return null
        }
    }

    // =========================================================================
    // Effect Controls
    // =========================================================================

    /**
     * Create effect controls from DSL
     * @param {string} dsl - DSL source
     */
    createEffectControlsFromDsl(dsl) {
        if (!this._controlsContainer) return

        // Clean up existing media inputs before rebuilding controls
        this.stopAllMedia()

        // PRESERVE existing parameter values keyed by effectName+stepIndex
        const previousValues = {}
        const previousEffectNames = {}
        if (this._effectParameterValues) {
            for (const [key, values] of Object.entries(this._effectParameterValues)) {
                previousValues[key] = { ...values }
            }
        }
        if (this._parsedDslStructure) {
            for (const effectInfo of this._parsedDslStructure) {
                const key = `step_${effectInfo.stepIndex}`
                previousEffectNames[key] = effectInfo.effectKey || effectInfo.name
            }
        }

        this._controlsContainer.innerHTML = ''
        this._effectParameterValues = {}
        this._dependentControls = []
        this._writeTargetOverrides = {}
        this._writeStepTargetOverrides = {}
        this._readSourceOverrides = {}

        // Parse DSL to get plans with write targets
        let compiled = null
        try {
            compiled = compile(dsl)
        } catch (err) {
            console.warn('Failed to parse DSL for controls:', err)
            return
        }
        if (!compiled || !compiled.plans) return

        const effects = extractEffectsFromDsl(dsl)
        this._parsedDslStructure = effects
        if (effects.length === 0) return

        // Build a map of stepIndex -> planIndex for write module placement
        let globalStepIndex = 0
        const stepToPlan = new Map()
        for (let planIndex = 0; planIndex < compiled.plans.length; planIndex++) {
            const plan = compiled.plans[planIndex]
            if (!plan.chain) continue
            for (let i = 0; i < plan.chain.length; i++) {
                stepToPlan.set(globalStepIndex, planIndex)
                globalStepIndex++
            }
        }

        // Pre-compute which steps are mid-chain writes and which are followed by mid-chain writes
        const midChainWriteSteps = new Set()
        const stepsBeforeMidChainWrite = new Set()
        for (let i = 0; i < effects.length; i++) {
            const effectInfo = effects[i]
            if (effectInfo.effectKey === '_write') {
                const planIndex = stepToPlan.get(effectInfo.stepIndex)
                const isLastStepInPlan = effectInfo.stepIndex === Math.max(...effects.filter(e => stepToPlan.get(e.stepIndex) === planIndex).map(e => e.stepIndex))
                if (!isLastStepInPlan) {
                    midChainWriteSteps.add(effectInfo.stepIndex)
                    // Find the previous rendered step (skip _read builtins)
                    for (let j = i - 1; j >= 0; j--) {
                        const prev = effects[j]
                        if (prev.effectKey !== '_read' && prev.effectKey !== '_read3d') {
                            stepsBeforeMidChainWrite.add(prev.stepIndex)
                            break
                        }
                    }
                }
            }
        }

        let prevWasMidChainWrite = false

        for (const effectInfo of effects) {
            // Handle builtin _write steps - render as write module
            if (effectInfo.effectKey === '_write') {
                const planIndex = stepToPlan.get(effectInfo.stepIndex)
                // Get the write target from THIS step's args, not the plan's terminal write
                const writeTarget = effectInfo.args?.tex
                if (writeTarget) {
                    // Check if this is a mid-chain write (not the last step in the plan's chain)
                    const isLastStepInPlan = effectInfo.stepIndex === Math.max(...effects.filter(e => stepToPlan.get(e.stepIndex) === planIndex).map(e => e.stepIndex))
                    const isMidChain = !isLastStepInPlan

                    const writeModule = this._createWriteModule(planIndex, effectInfo.stepIndex, writeTarget, isMidChain)
                    this._controlsContainer.appendChild(writeModule)
                    prevWasMidChainWrite = isMidChain
                }
                continue
            }

            // Handle builtin _read steps - render as read module
            if (effectInfo.effectKey === '_read') {
                const readSource = effectInfo.args?.tex
                if (readSource) {
                    const readModule = this._createReadModule(effectInfo.stepIndex, readSource)
                    this._controlsContainer.appendChild(readModule)
                }
                continue
            }

            // Handle builtin _read3d steps - skip for now (no UI controls)
            if (effectInfo.effectKey === '_read3d') {
                continue
            }

            let effectDef = getEffect(effectInfo.effectKey)
            if (!effectDef && effectInfo.namespace) {
                effectDef = getEffect(`${effectInfo.namespace}.${effectInfo.name}`)
            }
            if (!effectDef) {
                effectDef = getEffect(effectInfo.name)
            }

            if (!effectDef || !effectDef.globals) continue

            const moduleDiv = document.createElement('div')
            moduleDiv.className = 'shader-module'
            moduleDiv.dataset.stepIndex = effectInfo.stepIndex
            moduleDiv.dataset.effectName = effectInfo.name

            // If previous module was a mid-chain write, remove top gap and radius
            if (prevWasMidChainWrite) {
                moduleDiv.style.marginTop = '0'
                moduleDiv.style.borderTopLeftRadius = '0'
                moduleDiv.style.borderTopRightRadius = '0'
            }

            // If this step is followed by a mid-chain write, remove bottom gap and radius
            if (stepsBeforeMidChainWrite.has(effectInfo.stepIndex)) {
                moduleDiv.style.marginBottom = '0'
                moduleDiv.style.borderBottomLeftRadius = '0'
                moduleDiv.style.borderBottomRightRadius = '0'
            }

            prevWasMidChainWrite = false

            const titleDiv = document.createElement('div')
            titleDiv.className = 'module-title'

            // Title text (click to expand/collapse, but not when skipped)
            const titleText = document.createElement('span')
            titleText.className = 'module-title-text'

            // Convert camelCase to space-separated lowercase
            const formatName = (name) => name.replace(/([A-Z])/g, ' $1').toLowerCase().trim()
            const formattedName = formatName(effectInfo.name)

            titleText.textContent = effectInfo.namespace
                ? `${effectInfo.namespace}.${formattedName}`
                : formattedName
            titleDiv.appendChild(titleText)

            // Spacer to push buttons to the right
            const spacer = document.createElement('span')
            spacer.style.flex = '1'
            titleDiv.appendChild(spacer)

            // Code button (for shader editing) - only if effect has shaders
            let codeBtn = null
            if (effectDef.shaders) {
                codeBtn = document.createElement('button')
                codeBtn.className = 'action-btn'
                codeBtn.textContent = 'code'
                codeBtn.title = 'Edit shader source code'
                titleDiv.appendChild(codeBtn)
            }

            // Reset button
            const resetBtn = document.createElement('button')
            resetBtn.className = 'action-btn'
            resetBtn.textContent = 'reset'
            resetBtn.title = 'Reset all parameters to defaults'
            resetBtn.addEventListener('click', (e) => {
                e.stopPropagation()

                const effectKey = `step_${effectInfo.stepIndex}`
                const wasSkipped = this._effectParameterValues[effectKey]?._skip

                // Reset parameters to defaults
                this._effectParameterValues[effectKey] = {}
                if (wasSkipped) {
                    this._effectParameterValues[effectKey]._skip = true
                }

                for (const [key, spec] of Object.entries(effectDef.globals)) {
                    if (spec.default !== undefined) {
                        this._effectParameterValues[effectKey][key] = cloneParamValue(spec.default)
                    }
                }

                // Update UI controls
                const controlsContainer = moduleDiv.querySelector(`#controls-${effectInfo.stepIndex}`)
                if (controlsContainer) {
                    controlsContainer.innerHTML = ''

                    // Render controls grouped by category
                    const grouped = groupGlobalsByCategory(effectDef.globals)
                    const categoryNames = Object.keys(grouped)
                    const showCategoryLabels = categoryNames.length > 1

                    for (let catIdx = 0; catIdx < categoryNames.length; catIdx++) {
                        const category = categoryNames[catIdx]
                        const items = grouped[category]
                        // const isLastCategory = catIdx === categoryNames.length - 1

                        // Create category group wrapper
                        const categoryGroup = document.createElement('div')
                        categoryGroup.className = 'category-group'
                        categoryGroup.dataset.category = category

                        // Add hover label if multiple categories
                        if (showCategoryLabels) {
                            const label = document.createElement('div')
                            label.className = 'category-label'
                            label.textContent = category
                            categoryGroup.appendChild(label)
                        }

                        for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
                            const [key, spec] = items[itemIdx]

                            const controlGroup = this._createControlGroup(
                                key,
                                spec,
                                { ...effectInfo, args: {} }, // Empty args forces use of defaults
                                effectKey
                            )
                            if (controlGroup) {
                                categoryGroup.appendChild(controlGroup)
                            }
                        }

                        controlsContainer.appendChild(categoryGroup)
                    }
                }

                this._updateDslFromEffectParams()
                this.showStatus(`reset ${effectInfo.name} to defaults`, 'success')
            })
            titleDiv.appendChild(resetBtn)

            // Delete button
            const deleteBtn = document.createElement('button')
            deleteBtn.className = 'action-btn'
            deleteBtn.textContent = 'delete'
            deleteBtn.title = 'Remove this effect from the pipeline'
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation()

                const currentDsl = this.getDsl()
                if (!currentDsl) return

                try {
                    const compiled = compile(currentDsl)
                    if (!compiled || !compiled.plans) return

                    // Preserve search namespaces
                    const searchMatch = currentDsl.match(/^search\s+(\S.*?)$/m)
                    if (searchMatch) {
                        compiled.searchNamespaces = searchMatch[1].split(/\s*,\s*/)
                    }

                    const targetStepIndex = effectInfo.stepIndex
                    let globalStepIndex = 0
                    let found = false

                    const getEffectDefCallback = (effectName, namespace) => {
                        let def = getEffect(effectName)
                        if (def) return def

                        if (namespace) {
                            def = getEffect(`${namespace}/${effectName}`) ||
                                  getEffect(`${namespace}.${effectName}`)
                            if (def) return def
                        }

                        return null
                    }

                    for (let p = 0; p < compiled.plans.length; p++) {
                        const plan = compiled.plans[p]
                        if (!plan.chain) continue

                        for (let s = 0; s < plan.chain.length; s++) {
                            if (globalStepIndex === targetStepIndex) {
                                plan.chain.splice(s, 1)

                                // If we removed the head of the chain and there are remaining steps,
                                // ensure the new head has a valid input source if needed.
                                if (s === 0 && plan.chain.length > 0) {
                                    const newHead = plan.chain[0]
                                    const isReadOp = newHead.builtin && (newHead.op === '_read' || newHead.op === '_read3d')

                                    if (!isReadOp) {
                                        const namespace = newHead.namespace?.namespace || newHead.namespace?.resolved || null
                                        const def = getEffectDefCallback(newHead.op, namespace)

                                        // If def found and NOT a starter effect, prepend read().
                                        // If def NOT found, assume it needs input (safer to have redundant read than invalid chain).
                                        const needsInput = !def || !isStarterEffect({ instance: def })

                                        if (needsInput) {
                                            // Try to find a sensible surface to read from:
                                            // 1. If there's a previous plan, read from its write target
                                            // 2. Otherwise, default to the current plan's write target (feedback pattern)
                                            // 3. Fall back to o0 if nothing else is available
                                            let readSurface = { kind: 'output', name: 'o0' }
                                            if (p > 0) {
                                                const prevPlan = compiled.plans[p - 1]
                                                if (prevPlan.write) {
                                                    readSurface = typeof prevPlan.write === 'object'
                                                        ? prevPlan.write
                                                        : { kind: 'output', name: prevPlan.write }
                                                }
                                            } else if (plan.write) {
                                                // Same plan's write target (useful for feedback loops)
                                                readSurface = typeof plan.write === 'object'
                                                    ? plan.write
                                                    : { kind: 'output', name: plan.write }
                                            }

                                            plan.chain.unshift({
                                                builtin: true,
                                                op: '_read',
                                                args: { tex: readSurface }
                                            })
                                        }
                                    }
                                }

                                if (plan.chain.length === 0) {
                                    compiled.plans.splice(p, 1)
                                }
                                found = true
                                break
                            }
                            globalStepIndex++
                        }
                        if (found) break
                    }

                    if (found) {
                        const newDsl = unparse(compiled, {}, {
                            customFormatter: this._boundFormatValue,
                            getEffectDef: getEffectDefCallback
                        })

                        this.setDsl(newDsl)
                        this._renderer.currentDsl = newDsl

                        this.createEffectControlsFromDsl(newDsl)
                        await this._recompilePipeline()
                    }
                } catch (err) {
                    console.error('Failed to delete effect:', err)
                    this.showStatus('failed to delete effect', 'error')
                }
            })
            titleDiv.appendChild(deleteBtn)

            // Skip button
            const skipBtn = document.createElement('button')
            skipBtn.className = 'action-btn'
            skipBtn.textContent = 'skip'
            skipBtn.title = 'Skip this effect in the pipeline'
            skipBtn.addEventListener('click', async (e) => {
                e.stopPropagation()
                const isSkipped = moduleDiv.classList.toggle('skipped')
                skipBtn.textContent = isSkipped ? 'unskip' : 'skip'
                skipBtn.classList.toggle('active', isSkipped)

                // When skipped, collapse the module; when unskipped, expand it
                if (isSkipped) {
                    moduleDiv.classList.add('collapsed')
                } else {
                    moduleDiv.classList.remove('collapsed')
                }

                // Update the effect parameter and regenerate DSL
                this._effectParameterValues[effectKey]._skip = isSkipped
                this._updateDslFromEffectParams()

                // _skip requires a recompile since it changes the pass structure
                await this._recompilePipeline()
            })
            titleDiv.appendChild(skipBtn)

            // Click on title bar to expand/collapse (skip button has stopPropagation)
            titleDiv.addEventListener('click', () => {
                // Don't expand if skipped
                if (moduleDiv.classList.contains('skipped')) {
                    return
                }
                moduleDiv.classList.toggle('collapsed')
            })

            // Check if this effect is already skipped (from parsed DSL)
            if (effectInfo.args?._skip === true) {
                moduleDiv.classList.add('skipped', 'collapsed')
                skipBtn.textContent = 'unskip'
                skipBtn.classList.add('active')
            }

            moduleDiv.appendChild(titleDiv)

            const contentDiv = document.createElement('div')
            contentDiv.className = 'module-content'

            const controlsDiv = document.createElement('div')
            controlsDiv.id = `controls-${effectInfo.stepIndex}`
            controlsDiv.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; column-gap: 1em;'

            const effectKey = `step_${effectInfo.stepIndex}`

            // Check if this step had the SAME effect before - if so, restore its values
            const currentEffectName = effectInfo.effectKey || effectInfo.name
            const previousEffectName = previousEffectNames[effectKey]
            if (previousEffectName === currentEffectName && previousValues[effectKey]) {
                // Same effect at same position - restore all previous values
                this._effectParameterValues[effectKey] = { ...previousValues[effectKey] }
            } else {
                // Different effect or new step - start fresh
                this._effectParameterValues[effectKey] = {}
            }

            // Initialize _skip from parsed args if present
            if (effectInfo.args?._skip === true) {
                this._effectParameterValues[effectKey]._skip = true
            }

            // Render controls grouped by category
            const grouped = groupGlobalsByCategory(effectDef.globals)
            const categoryNames = Object.keys(grouped)
            const showCategoryLabels = categoryNames.length > 1
            const hasMultipleCategories = categoryNames.length > 1

            // Create tag bar for collapsed categories (only if multiple categories)
            let tagBar = null
            if (hasMultipleCategories) {
                tagBar = document.createElement('div')
                tagBar.className = 'category-tag-bar'
                controlsDiv.appendChild(tagBar)
            }

            for (let catIdx = 0; catIdx < categoryNames.length; catIdx++) {
                const category = categoryNames[catIdx]
                const items = grouped[category]
                // const isLastCategory = catIdx === categoryNames.length - 1

                // Create category group wrapper
                const categoryGroup = document.createElement('div')
                categoryGroup.className = 'category-group'
                categoryGroup.dataset.category = category

                // Multi-category effects start collapsed (except first category)
                const isFirstCategory = catIdx === 0
                if (hasMultipleCategories) {
                    if (!isFirstCategory) {
                        categoryGroup.classList.add('collapsed')
                    }

                    // Create tag for this category
                    const tag = document.createElement('span')
                    tag.className = 'category-tag'
                    tag.textContent = category + '…'
                    tag.dataset.category = category
                    // First category tag starts hidden
                    if (isFirstCategory) {
                        tag.style.display = 'none'
                    }
                    tag.addEventListener('click', () => {
                        // Expand this category
                        categoryGroup.classList.remove('collapsed')
                        // Hide the tag
                        tag.style.display = 'none'
                        // Hide tag bar if all tags are hidden
                        const visibleTags = tagBar.querySelectorAll('.category-tag:not([style*="display: none"])')
                        if (visibleTags.length === 0) {
                            tagBar.style.display = 'none'
                        }
                    })
                    tagBar.appendChild(tag)
                }

                // Add category label with close button (if multiple categories)
                if (showCategoryLabels) {
                    const label = document.createElement('div')
                    label.className = 'category-label'

                    if (hasMultipleCategories) {
                        const closeBtn = document.createElement('span')
                        closeBtn.className = 'category-close'
                        closeBtn.textContent = '✕'
                        closeBtn.title = 'Collapse category'
                        closeBtn.addEventListener('click', () => {
                            // Collapse this category
                            categoryGroup.classList.add('collapsed')
                            // Show the tag again
                            const tag = tagBar.querySelector(`[data-category="${category}"]`)
                            if (tag) tag.style.display = ''
                            // Show tag bar
                            tagBar.style.display = ''
                        })
                        label.appendChild(closeBtn)
                    }

                    const labelText = document.createElement('span')
                    labelText.textContent = category
                    label.appendChild(labelText)

                    categoryGroup.appendChild(label)
                }

                for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
                    const [key, spec] = items[itemIdx]

                    const controlGroup = this._createControlGroup(
                        key,
                        spec,
                        effectInfo,
                        effectKey
                    )
                    if (controlGroup) {
                        categoryGroup.appendChild(controlGroup)
                    }
                }

                controlsDiv.appendChild(categoryGroup)
            }

            // Show message if effect has no controls
            if (controlsDiv.children.length === 0) {
                const noControlsMsg = document.createElement('div')
                noControlsMsg.className = 'no-controls-message'
                noControlsMsg.textContent = 'This effect has no controls.'
                noControlsMsg.style.cssText = 'grid-column: 1 / -1; color: var(--color5); font-size: 0.75rem; font-style: italic; padding: 0.5rem 0; text-align: center;'
                controlsDiv.appendChild(noControlsMsg)
            }

            contentDiv.appendChild(controlsDiv)

            // Add shader editor section if effect has shaders
            if (effectDef.shaders) {
                const shaderSection = this._createShaderEditorSection(effectInfo, effectDef, codeBtn)
                contentDiv.appendChild(shaderSection)
            }

            // Add media input section if effect has externalTexture
            // Use per-step texture ID (e.g., imageTex_step_0) to allow independent media per effect
            if (effectDef.externalTexture) {
                const stepTextureId = `${effectDef.externalTexture}_step_${effectInfo.stepIndex}`
                const mediaSection = this._createMediaInputSection(
                    effectInfo.stepIndex,
                    stepTextureId,
                    effectDef
                )
                contentDiv.appendChild(mediaSection)
            }

            moduleDiv.appendChild(contentDiv)
            this._controlsContainer.appendChild(moduleDiv)
        }

        // Update initial disabled state of dependent controls
        this._updateDependentControls()
    }

    /**
     * Create a write module for a plan
     * @private
     * @param {number} planIndex - The plan index
     * @param {number} stepIndex - The step index for this write
     * @param {object} writeTarget - The write target surface
     * @param {boolean} isMidChain - Whether this is a mid-chain write (not terminal)
     */
    _createWriteModule(planIndex, stepIndex, writeTarget, isMidChain = false) {
        const moduleDiv = document.createElement('div')
        moduleDiv.className = 'shader-module'
        moduleDiv.dataset.planIndex = planIndex
        moduleDiv.dataset.stepIndex = stepIndex
        moduleDiv.dataset.effectName = 'write'

        // Mark mid-chain writes with data attribute for CSS targeting
        if (isMidChain) {
            moduleDiv.dataset.midChain = 'true'
        }

        const titleDiv = document.createElement('div')
        titleDiv.className = 'module-title'
        titleDiv.textContent = 'write'
        titleDiv.addEventListener('click', () => {
            moduleDiv.classList.toggle('collapsed')
        })
        moduleDiv.appendChild(titleDiv)

        const contentDiv = document.createElement('div')
        contentDiv.className = 'module-content'

        const controlsDiv = document.createElement('div')
        controlsDiv.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;'

        // Create target dropdown
        const controlGroup = document.createElement('div')
        controlGroup.className = 'control-group'

        const header = document.createElement('div')
        header.className = 'control-header'

        const label = document.createElement('label')
        label.className = 'control-label'
        label.textContent = 'surface'
        header.appendChild(label)
        controlGroup.appendChild(header)

        const select = document.createElement('select')
        select.className = 'control-select'

        // Add output surfaces o0-o7
        for (let i = 0; i < 8; i++) {
            const option = document.createElement('option')
            option.value = `o${i}`
            option.textContent = `o${i}`
            select.appendChild(option)
        }
        // Add feedback surfaces f0-f3
        for (let i = 0; i < 4; i++) {
            const option = document.createElement('option')
            option.value = `f${i}`
            option.textContent = `f${i}`
            select.appendChild(option)
        }

        // Set current value
        const currentTarget = typeof writeTarget === 'string' ? writeTarget : writeTarget.name
        select.value = currentTarget

        select.addEventListener('change', (e) => {
            if (isMidChain) {
                // Mid-chain writes are tracked by stepIndex
                this._writeStepTargetOverrides[stepIndex] = e.target.value
            } else {
                // Terminal writes are tracked by planIndex
                this._writeTargetOverrides[planIndex] = e.target.value
            }
            this._onControlChange()
        })

        controlGroup.appendChild(select)
        controlsDiv.appendChild(controlGroup)
        contentDiv.appendChild(controlsDiv)
        moduleDiv.appendChild(contentDiv)

        return moduleDiv
    }

    /**
     * Create a read module for a step
     * @private
     * @param {number} stepIndex - The step index
     * @param {object} readSource - The read source surface
     */
    _createReadModule(stepIndex, readSource) {
        const moduleDiv = document.createElement('div')
        moduleDiv.className = 'shader-module'
        moduleDiv.dataset.stepIndex = stepIndex
        moduleDiv.dataset.effectName = 'read'

        const titleDiv = document.createElement('div')
        titleDiv.className = 'module-title'
        titleDiv.textContent = 'read'
        titleDiv.addEventListener('click', () => {
            moduleDiv.classList.toggle('collapsed')
        })
        moduleDiv.appendChild(titleDiv)

        const contentDiv = document.createElement('div')
        contentDiv.className = 'module-content'

        const controlsDiv = document.createElement('div')
        controlsDiv.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;'

        // Create source dropdown
        const controlGroup = document.createElement('div')
        controlGroup.className = 'control-group'

        const header = document.createElement('div')
        header.className = 'control-header'

        const label = document.createElement('label')
        label.className = 'control-label'
        label.textContent = 'surface'
        header.appendChild(label)
        controlGroup.appendChild(header)

        const select = document.createElement('select')
        select.className = 'control-select'

        // Add output surfaces o0-o7
        for (let i = 0; i < 8; i++) {
            const option = document.createElement('option')
            option.value = `o${i}`
            option.textContent = `o${i}`
            select.appendChild(option)
        }
        // Add feedback surfaces f0-f3
        for (let i = 0; i < 4; i++) {
            const option = document.createElement('option')
            option.value = `f${i}`
            option.textContent = `f${i}`
            select.appendChild(option)
        }

        // Set current value
        const currentSource = typeof readSource === 'string' ? readSource : readSource.name
        select.value = currentSource

        select.addEventListener('change', (e) => {
            // Store read source override and trigger recompile
            this._readSourceOverrides[stepIndex] = e.target.value
            this._onControlChange()
        })

        controlGroup.appendChild(select)
        controlsDiv.appendChild(controlGroup)
        contentDiv.appendChild(controlsDiv)
        moduleDiv.appendChild(contentDiv)

        return moduleDiv
    }

    /**
     * Create the shader editor section for an effect
     * @private
     * @param {object} effectInfo - Effect info
     * @param {object} effectDef - Effect definition
     * @param {HTMLButtonElement} toggleBtn - The code button in the title bar that toggles visibility
     */
    _createShaderEditorSection(effectInfo, effectDef, toggleBtn) {
        const section = document.createElement('div')
        section.className = 'shader-editor-section'
        section.style.cssText = 'display: none; margin-top: 0.75rem; padding-top: 0.75rem;'

        // Program selector
        const programNames = Object.keys(effectDef.shaders)
        if (programNames.length > 1) {
            const programSelect = document.createElement('select')
            programSelect.className = 'control-select'
            programSelect.style.cssText = 'margin-bottom: 0.5rem;'
            programNames.forEach(name => {
                const option = document.createElement('option')
                option.value = name
                option.textContent = name
                programSelect.appendChild(option)
            })
            section.appendChild(programSelect)

            programSelect.addEventListener('change', () => {
                this._updateShaderEditorContent(effectInfo, effectDef, programSelect.value, section)
            })
        }

        // Shader textarea
        const textarea = document.createElement('textarea')
        textarea.className = 'shader-source-editor'
        textarea.spellcheck = false
        textarea.style.cssText = 'width: 100%; min-height: 200px; resize: vertical; background: color-mix(in srgb, var(--color1) 60%, transparent 40%); border: 1px solid color-mix(in srgb, var(--accent3) 25%, transparent 75%); border-radius: var(--ui-corner-radius-small); font-family: ui-monospace, "Cascadia Mono", "Consolas", monospace; font-size: 0.625rem; line-height: 1.4; color: var(--color5); padding: 0.5rem; box-sizing: border-box;'
        section.appendChild(textarea)

        // Button container
        const btnContainer = document.createElement('div')
        btnContainer.style.cssText = 'display: flex; gap: 0.5rem; margin-top: 0.5rem;'
        section.appendChild(btnContainer)

        // Apply button
        const applyBtn = document.createElement('button')
        applyBtn.textContent = 'apply shader'
        applyBtn.style.cssText = 'flex: 1; padding: 0.375rem 0.75rem; background: color-mix(in srgb, var(--accent3) 30%, transparent 70%); border: 1px solid color-mix(in srgb, var(--accent3) 50%, transparent 50%); border-radius: var(--ui-corner-radius-small); color: var(--color6); font-family: Nunito, sans-serif; font-size: 0.6875rem; font-weight: 600; cursor: pointer;'
        btnContainer.appendChild(applyBtn)

        // Reset button
        const resetBtn = document.createElement('button')
        resetBtn.textContent = 'reset to original'
        resetBtn.style.cssText = 'flex: 1; padding: 0.375rem 0.75rem; background: transparent; border: 1px solid color-mix(in srgb, var(--accent3) 30%, transparent 70%); border-radius: var(--ui-corner-radius-small); color: var(--color5); font-family: Nunito, sans-serif; font-size: 0.6875rem; font-weight: 600; cursor: pointer;'
        btnContainer.appendChild(resetBtn)

        // Toggle visibility via the code button in title bar
        if (toggleBtn) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                const isVisible = section.style.display !== 'none'
                section.style.display = isVisible ? 'none' : 'block'
                toggleBtn.textContent = isVisible ? 'code' : 'hide'
                toggleBtn.classList.toggle('active', !isVisible)

                if (!isVisible) {
                    // Load current shader source
                    const programName = programNames.length > 1
                        ? section.querySelector('select').value
                        : programNames[0]
                    this._updateShaderEditorContent(effectInfo, effectDef, programName, section)
                }
            })
        }

        // Apply button handler
        applyBtn.addEventListener('click', () => {
            const programName = programNames.length > 1
                ? section.querySelector('select')?.value
                : programNames[0]
            const backend = this._renderer.backend
            const source = textarea.value

            this._applyShaderOverride(effectInfo.stepIndex, programName, backend, source, effectDef)
        })

        // Reset button handler
        resetBtn.addEventListener('click', () => {
            const programName = programNames.length > 1
                ? section.querySelector('select')?.value
                : programNames[0]

            this._resetShaderOverride(effectInfo.stepIndex, programName)
            this._updateShaderEditorContent(effectInfo, effectDef, programName, section)
        })

        return section
    }

    /**
     * Update the shader editor content for a specific program and backend
     * @private
     */
    _updateShaderEditorContent(effectInfo, effectDef, programName, container) {
        const textarea = container.querySelector('textarea')
        const backend = this._renderer.backend

        // Check if we have an override first
        const override = this._shaderOverrides[effectInfo.stepIndex]?.[programName]
        let source = ''

        if (override) {
            // Use override source
            if (backend === 'wgsl' && override.wgsl) {
                source = override.wgsl
            } else if (override.glsl) {
                source = override.glsl
            } else if (override.fragment) {
                source = override.fragment
            }
        }

        if (!source) {
            // Use original source from effect definition
            const shaders = effectDef.shaders[programName]
            if (shaders) {
                if (backend === 'wgsl' && shaders.wgsl) {
                    source = shaders.wgsl
                } else if (shaders.glsl) {
                    source = shaders.glsl
                } else if (shaders.fragment) {
                    source = shaders.fragment
                }
            }
        }

        textarea.value = source || '// No shader source available'
    }

    /**
     * Apply a shader override for a step
     * @private
     */
    _applyShaderOverride(stepIndex, programName, backend, source, effectDef) {
        if (!this._shaderOverrides[stepIndex]) {
            this._shaderOverrides[stepIndex] = {}
        }

        // Copy original shader structure and apply override
        const originalShaders = effectDef.shaders[programName] || {}
        const override = { ...originalShaders }

        if (backend === 'wgsl') {
            override.wgsl = source
        } else {
            // For GLSL, determine if it's combined or separate
            if (originalShaders.glsl) {
                override.glsl = source
            } else if (originalShaders.fragment) {
                override.fragment = source
            } else {
                // Default to glsl
                override.glsl = source
            }
        }

        this._shaderOverrides[stepIndex][programName] = override

        // Trigger recompilation with shader overrides
        this._recompileWithShaderOverrides()
    }

    /**
     * Reset a shader override to original
     * @private
     */
    _resetShaderOverride(stepIndex, programName) {
        if (this._shaderOverrides[stepIndex]) {
            delete this._shaderOverrides[stepIndex][programName]
            if (Object.keys(this._shaderOverrides[stepIndex]).length === 0) {
                delete this._shaderOverrides[stepIndex]
            }
        }

        // Trigger recompilation
        this._recompileWithShaderOverrides()
    }

    /**
     * Recompile the pipeline with current shader overrides
     * @private
     */
    async _recompileWithShaderOverrides() {
        const dsl = this.getDsl()
        if (!dsl) return

        try {
            await this._renderer.compile(dsl, {
                shaderOverrides: this._shaderOverrides
            })
            this.showStatus('shader applied', 'success')
        } catch (err) {
            console.error('Shader compilation failed:', err)
            this.showStatus('shader error: ' + this.formatCompilationError(err), 'error')
        }
    }

    /**
     * Recompile the pipeline after a structural change (e.g., _skip toggle)
     * @private
     */
    async _recompilePipeline() {
        const dsl = this.getDsl()
        if (!dsl) return

        try {
            await this._renderer.compile(dsl, {
                shaderOverrides: this._shaderOverrides
            })
            this.showStatus('pipeline updated', 'success')
        } catch (err) {
            console.error('Pipeline compilation failed:', err)
            this.showStatus('compilation error: ' + this.formatCompilationError(err), 'error')
        }
    }

    /**
     * Create a control group for a parameter
     * @private
     */
    _createControlGroup(key, spec, effectInfo, effectKey) {
        // Skip hidden controls (control: false hides from UI but preserves metadata)
        if (spec.ui?.control === false) {
            return null
        }

        const controlGroup = document.createElement('div')
        controlGroup.className = 'control-group'

        const label = document.createElement('label')
        label.className = 'control-label'
        label.textContent = spec.ui?.label || key

        // Add hint as tooltip if provided
        if (spec.ui?.hint) {
            label.title = spec.ui.hint
        }
        controlGroup.appendChild(label)

        // Track dependent controls for dynamic enable/disable
        if (spec.ui?.enabledBy) {
            this._dependentControls.push({
                element: controlGroup,
                effectKey,
                paramKey: key,
                enabledBy: spec.ui.enabledBy
            })
        }

        // Get value: prefer already-preserved value, then DSL args, then default
        let value
        const preservedValue = this._effectParameterValues[effectKey]?.[key]
        if (preservedValue !== undefined) {
            // Use preserved value from previous session (e.g., when adding another effect)
            value = preservedValue
        } else if (effectInfo.args[key] !== undefined) {
            value = effectInfo.args[key]
        } else {
            value = cloneParamValue(spec.default)
        }

        // Check original raw kwargs for variable reference
        const rawKwarg = effectInfo.rawKwargs?.[key]

        // If this param is controlled by an oscillator (or is a variable reference that
        // resolves to an oscillator), show "automatic" and store the ORIGINAL reference.
        if (value && typeof value === 'object' && value.oscillator === true) {
            // If the original was a variable reference (Ident), store that so we can
            // output "scale: o" instead of inlining the oscillator
            if (rawKwarg && rawKwarg.type === 'Ident') {
                this._effectParameterValues[effectKey][key] = { _varRef: rawKwarg.name }
            }
            // Otherwise don't store anything - let the original value pass through

            const autoLabel = document.createElement('span')
            autoLabel.className = 'control-value'
            autoLabel.textContent = 'automatic'
            autoLabel.style.fontStyle = 'italic'
            autoLabel.style.opacity = '0.7'
            controlGroup.appendChild(autoLabel)
            return controlGroup
        }

        this._effectParameterValues[effectKey][key] = value

        // Create control based on type
        // Check for button control first (momentary boolean button)
        if (spec.ui?.control === 'button') {
            this._createButtonControl(controlGroup, key, spec)
        } else if (spec.ui?.control === 'checkbox' || spec.type === 'boolean') {
            // checkbox control for int uniforms that act as booleans (0/1)
            this._createBooleanControl(controlGroup, key, value, effectKey, spec)
        } else if (spec.ui?.control === 'color' || spec.type === 'vec4' || spec.type === 'vec3') {
            // Color picker for vec3/vec4 or explicit color control
            this._createColorControl(controlGroup, key, value, effectKey, spec)
        } else if (spec.choices) {
            this._createChoicesControl(controlGroup, key, spec, value, effectKey)
        } else if (spec.enum && spec.type === 'int') {
            this._createEnumIntControl(controlGroup, key, spec, value, effectKey)
        } else if (spec.type === 'member') {
            this._createMemberControl(controlGroup, key, spec, value, effectKey)
        } else if (spec.type === 'float' || spec.type === 'int') {
            this._createSliderControl(controlGroup, key, spec, value, effectKey)
        } else if (spec.type === 'surface') {
            this._createSurfaceControl(controlGroup, key, spec, value, effectKey)
        }

        return controlGroup
    }

    /** @private */
    _createBooleanControl(container, key, value, effectKey, spec) {
        const toggle = document.createElement('toggle-switch')
        toggle.checked = !!value
        toggle.addEventListener('change', (e) => {
            this._effectParameterValues[effectKey][key] = e.target.checked
            this._onControlChange()
        })

        // Double-click to reset to default
        toggle.addEventListener('dblclick', () => {
            const defaultVal = spec?.default !== undefined ? !!spec.default : false
            toggle.checked = defaultVal
            this._effectParameterValues[effectKey][key] = defaultVal
            this._onControlChange()
        })

        container.appendChild(toggle)
    }

    /**
     * Create a momentary button control for boolean uniforms
     * Button sets uniform to true, then resets to false after one frame
     * @private
     */
    _createButtonControl(container, key, spec) {
        const button = document.createElement('button')
        button.className = 'control-button'
        button.textContent = spec.ui?.buttonLabel || 'reset'
        button.title = spec.ui?.label || key
        button.dataset.buttonType = spec.ui?.buttonLabel || 'reset'

        button.addEventListener('click', (e) => {
            e.stopPropagation()

            const pipeline = this._renderer.pipeline
            if (!pipeline) {
                return
            }

            const uniformName = spec.uniform || key

            // Set directly on globalUniforms (source of truth for runtime overrides)
            pipeline.globalUniforms[uniformName] = true

            // Also set on pass.uniforms for passes that have the uniform
            if (pipeline.graph && pipeline.graph.passes) {
                for (const pass of pipeline.graph.passes) {
                    if (pass.uniforms) {
                        pass.uniforms[uniformName] = true
                    }
                }
            }

            // Reset to false after render completes
            // Use 3 nested rAF to ensure: 1) sync to frame, 2) render happens, 3) reset after
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        pipeline.globalUniforms[uniformName] = false
                        if (pipeline.graph && pipeline.graph.passes) {
                            for (const pass of pipeline.graph.passes) {
                                if (pass.uniforms) {
                                    pass.uniforms[uniformName] = false
                                }
                            }
                        }
                    })
                })
            })
        })

        container.appendChild(button)
    }

    /** @private */
    _createChoicesControl(container, key, spec, value, effectKey) {
        const select = document.createElement('select')
        select.className = 'control-select'

        // Warn about spaces in enum keys (deprecated, should use camelCase)
        for (const name of Object.keys(spec.choices)) {
            if (name.includes(' ')) {
                console.warn(`[Noisemaker] Deprecated: spaces in enum key "${name}" for "${key}". Use camelCase instead.`)
            }
        }

        let selectedValue = null
        let optionIndex = 0

        Object.entries(spec.choices).forEach(([name, val]) => {
            if (name.endsWith(':')) return

            const option = document.createElement('option')
            option.value = String(optionIndex)
            option.textContent = name
            option.dataset.paramValue = JSON.stringify(val)
            if ((value === null && val === null) || value === val) {
                option.selected = true
                selectedValue = option.value
            }
            select.appendChild(option)
            optionIndex += 1
        })

        if (selectedValue !== null) {
            select.value = selectedValue
        }

        select.addEventListener('change', (e) => {
            const target = e.target
            const option = target.options[target.selectedIndex]
            const raw = option?.dataset?.paramValue

            let parsedValue = null
            if (raw !== undefined) {
                try {
                    parsedValue = JSON.parse(raw)
                } catch (_err) {
                    parsedValue = raw
                }
            }

            this._effectParameterValues[effectKey][key] = parsedValue
            this._onControlChange()
        })

        // Double-click to reset to default
        select.addEventListener('dblclick', () => {
            const defaultVal = spec.default
            // Find the option matching the default value
            for (let i = 0; i < select.options.length; i++) {
                const raw = select.options[i].dataset?.paramValue
                let optionVal = null
                if (raw !== undefined) {
                    try { optionVal = JSON.parse(raw) } catch (_) { optionVal = raw }
                }
                if ((defaultVal === null && optionVal === null) || defaultVal === optionVal) {
                    select.selectedIndex = i
                    break
                }
            }
            this._effectParameterValues[effectKey][key] = defaultVal
            this._onControlChange()
        })

        container.appendChild(select)
    }

    /** @private */
    _createEnumIntControl(container, key, spec, value, effectKey) {
        const enumPath = spec.enum
        const parts = enumPath.split('.')
        let node = this._renderer.enums
        for (const part of parts) {
            if (node && node[part]) {
                node = node[part]
            } else {
                node = null
                break
            }
        }

        if (node && typeof node === 'object') {
            const select = document.createElement('select')
            select.className = 'control-select'

            Object.entries(node).forEach(([name, val]) => {
                const option = document.createElement('option')
                const numVal = (val && typeof val === 'object' && 'value' in val) ? val.value : val
                option.value = numVal
                option.textContent = name
                option.selected = value === numVal
                select.appendChild(option)
            })

            select.addEventListener('change', (e) => {
                this._effectParameterValues[effectKey][key] = parseInt(e.target.value, 10)
                this._onControlChange()
            })

            // Double-click to reset to default
            select.addEventListener('dblclick', () => {
                const defaultVal = spec.default !== undefined ? spec.default : 0
                select.value = defaultVal
                this._effectParameterValues[effectKey][key] = defaultVal
                this._onControlChange()
            })

            container.appendChild(select)
        } else {
            // Fallback to slider
            const slider = document.createElement('input')
            slider.type = 'range'
            slider.min = spec.min || 0
            slider.max = spec.max || 10
            slider.value = value
            slider.addEventListener('change', (e) => {
                this._effectParameterValues[effectKey][key] = parseInt(e.target.value, 10)
                this._onControlChange()
            })

            // Double-click to reset to default
            slider.addEventListener('dblclick', () => {
                const defaultVal = spec.default !== undefined ? parseInt(spec.default, 10) : parseInt(slider.min, 10)
                slider.value = defaultVal
                this._effectParameterValues[effectKey][key] = defaultVal
                this._onControlChange()
            })

            container.appendChild(slider)
        }
    }

    /** @private */
    _createMemberControl(container, key, spec, value, effectKey) {
        let enumPath = spec.enum || spec.enumPath
        if (!enumPath && typeof spec.default === 'string') {
            const parts = spec.default.split('.')
            if (parts.length > 1) {
                enumPath = parts.slice(0, -1).join('.')
            }
        }

        if (enumPath) {
            const parts = enumPath.split('.')
            let node = this._renderer.enums
            for (const part of parts) {
                if (node && node[part]) {
                    node = node[part]
                } else {
                    node = null
                    break
                }
            }

            if (node) {
                const select = document.createElement('select')
                select.className = 'control-select'
                Object.keys(node).forEach(k => {
                    const option = document.createElement('option')
                    const fullPath = `${enumPath}.${k}`
                    option.value = fullPath
                    option.textContent = k
                    option.selected = fullPath === value
                    select.appendChild(option)
                })

                select.addEventListener('change', (e) => {
                    this._effectParameterValues[effectKey][key] = e.target.value
                    this._onControlChange()
                })

                // Double-click to reset to default
                select.addEventListener('dblclick', () => {
                    const defaultVal = spec.default
                    if (defaultVal !== undefined) {
                        select.value = defaultVal
                        this._effectParameterValues[effectKey][key] = defaultVal
                        this._onControlChange()
                    }
                })

                container.appendChild(select)
            }
        }
    }

    /** @private */
    _createSliderControl(container, key, spec, value, effectKey) {
        const slider = document.createElement('input')
        slider.className = 'control-slider'
        slider.type = 'range'
        slider.min = spec.min !== undefined ? spec.min : 0
        slider.max = spec.max !== undefined ? spec.max : 100
        slider.step = spec.step !== undefined ? spec.step : (spec.type === 'int' ? 1 : 0.01)
        slider.value = value !== null ? value : slider.min

        container.appendChild(slider)

        const valueDisplay = document.createElement('span')
        valueDisplay.className = 'control-value'
        const formatVal = (v, isInt) => isInt ? v : Number(v).toFixed(2)
        valueDisplay.textContent = value !== null ? formatVal(value, spec.type === 'int') : ''
        container.appendChild(valueDisplay)

        slider.addEventListener('input', (e) => {
            const numVal = spec.type === 'int' ? parseInt(e.target.value) : parseFloat(e.target.value)
            valueDisplay.textContent = formatVal(numVal, spec.type === 'int')
            this._effectParameterValues[effectKey][key] = numVal
            this._applyEffectParameterValues()
        })

        slider.addEventListener('change', () => {
            this._onControlChange()
        })

        // Double-click to reset to default
        slider.addEventListener('dblclick', () => {
            const defaultVal = spec.default !== undefined ? spec.default : parseFloat(slider.min)
            const numVal = spec.type === 'int' ? parseInt(defaultVal) : parseFloat(defaultVal)
            slider.value = numVal
            valueDisplay.textContent = formatVal(numVal, spec.type === 'int')
            this._effectParameterValues[effectKey][key] = numVal
            this._onControlChange()
        })
    }

    /** @private */
    _createColorControl(container, key, value, effectKey, spec) {
        const colorInput = document.createElement('input')
        colorInput.type = 'color'
        colorInput.className = 'control-color'

        if (Array.isArray(value)) {
            const toHex = (n) => Math.round(n * 255).toString(16).padStart(2, '0')
            colorInput.value = `#${toHex(value[0])}${toHex(value[1])}${toHex(value[2])}`
        }

        const isVec4 = spec?.type === 'vec4'

        colorInput.addEventListener('input', (e) => {
            const hex = e.target.value
            const r = parseInt(hex.slice(1, 3), 16) / 255
            const g = parseInt(hex.slice(3, 5), 16) / 255
            const b = parseInt(hex.slice(5, 7), 16) / 255

            if (isVec4) {
                // For vec4, preserve alpha or default to 1
                const currentVal = this._effectParameterValues[effectKey][key]
                const a = (Array.isArray(currentVal) && currentVal.length >= 4 && typeof currentVal[3] === 'number')
                    ? currentVal[3]
                    : 1
                this._effectParameterValues[effectKey][key] = [r, g, b, a]
            } else {
                // For vec3, only store 3 components
                this._effectParameterValues[effectKey][key] = [r, g, b]
            }
            this._onControlChange()
        })

        // Double-click to reset to default
        colorInput.addEventListener('dblclick', () => {
            const defaultVal = spec?.default
            if (Array.isArray(defaultVal)) {
                const toHex = (n) => Math.round(n * 255).toString(16).padStart(2, '0')
                colorInput.value = `#${toHex(defaultVal[0])}${toHex(defaultVal[1])}${toHex(defaultVal[2])}`
                this._effectParameterValues[effectKey][key] = [...defaultVal]
                this._onControlChange()
            }
        })

        container.appendChild(colorInput)
    }

    /** @private */
    _createSurfaceControl(container, key, spec, value, effectKey) {
        const select = document.createElement('select')
        select.className = 'control-select'

        // Available surfaces: o0-o7 for output surfaces, f0-f3 for feedback surfaces
        const surfaces = [
            { id: 'o0', label: 'o0 (output)' },
            { id: 'o1', label: 'o1' },
            { id: 'o2', label: 'o2' },
            { id: 'o3', label: 'o3' },
            { id: 'o4', label: 'o4' },
            { id: 'o5', label: 'o5' },
            { id: 'o6', label: 'o6' },
            { id: 'o7', label: 'o7' },
            { id: 'f0', label: 'f0 (feedback)' },
            { id: 'f1', label: 'f1' },
            { id: 'f2', label: 'f2' },
            { id: 'f3', label: 'f3' }
        ]

        // Parse current value to get the surface ID
        let currentSurface = spec.default || 'o1'
        if (typeof value === 'string') {
            // Handle read(o1) format or plain o1/f0 format
            const match = value.match(/read\(([^)]+)\)|^(o[0-7]|f[0-3])$/)
            if (match) {
                currentSurface = match[1] || match[2]
            } else if (value) {
                currentSurface = value
            }
        }

        surfaces.forEach(surface => {
            const option = document.createElement('option')
            option.value = surface.id
            option.textContent = surface.label
            option.selected = surface.id === currentSurface
            select.appendChild(option)
        })

        select.addEventListener('change', async (e) => {
            // Store as read(surfaceId) format for DSL
            this._effectParameterValues[effectKey][key] = `read(${e.target.value})`
            // Surface changes require a full pipeline recompile (not just uniform updates)
            this._updateDslFromEffectParams()
            await this._recompilePipeline()
        })

        container.appendChild(select)
    }

    /** @private Called when a control value changes */
    _onControlChange() {
        this._applyEffectParameterValues()
        this._updateDependentControls()
        this._updateDslFromEffectParams()
        if (this._onControlChangeCallback) {
            this._onControlChangeCallback()
        }
    }

    /**
     * Update disabled state of dependent controls based on their enabledBy values
     * @private
     */
    _updateDependentControls() {
        for (const dep of this._dependentControls) {
            const { element, effectKey, enabledBy } = dep
            const params = this._effectParameterValues[effectKey]
            if (!params) continue

            const enablerValue = params[enabledBy]
            const isEnabled = this._isControlEnabled(enablerValue)

            if (isEnabled) {
                element.classList.remove('disabled')
            } else {
                element.classList.add('disabled')
            }
        }
    }

    /**
     * Check if a control's enabler value means the dependent control should be enabled
     * @private
     */
    _isControlEnabled(value) {
        if (value === undefined || value === null) return false

        // Boolean: must be true
        if (typeof value === 'boolean') return value

        // Number: must be non-zero
        if (typeof value === 'number') return value !== 0

        // Array (vec3/vec4): check if any component differs from neutral 0.5
        if (Array.isArray(value)) {
            // For color wheels, neutral is [0.5, 0.5, 0.5] or [0.5, 0.5, 0.5, 1]
            return value.some((v, i) => {
                if (i === 3) return false // Alpha doesn't count
                return Math.abs(v - 0.5) > 0.01
            })
        }

        // String: non-empty
        if (typeof value === 'string') return value.length > 0

        // Object: truthy
        return !!value
    }

    /**
     * Apply effect parameter values to the running pipeline
     * @private
     */
    _applyEffectParameterValues() {
        const pipeline = this._renderer.pipeline
        if (!pipeline || !pipeline.graph || !pipeline.graph.passes) return

        let zoomChanged = false

        for (const [effectKey, params] of Object.entries(this._effectParameterValues)) {
            const match = effectKey.match(/^step_(\d+)$/)
            if (!match) continue
            const stepIndex = parseInt(match[1], 10)

            const stepPasses = pipeline.graph.passes.filter(pass => {
                if (!pass.id) return false
                const passMatch = pass.id.match(/^node_(\d+)_pass_/)
                return passMatch && parseInt(passMatch[1], 10) === stepIndex
            })

            if (stepPasses.length === 0) continue

            const firstPass = stepPasses[0]
            const passFunc = firstPass.effectFunc || firstPass.effectKey
            const passNamespace = firstPass.effectNamespace
            let effectDef = null
            if (passFunc) {
                if (passNamespace) {
                    effectDef = getEffect(`${passNamespace}.${passFunc}`) || getEffect(`${passNamespace}/${passFunc}`)
                }
                if (!effectDef) {
                    effectDef = getEffect(passFunc)
                }
            }

            for (const pass of stepPasses) {
                if (!pass.uniforms) continue

                for (const [paramName, value] of Object.entries(params)) {
                    if (value === undefined || value === null) continue

                    // Skip oscillator-controlled parameters - these use _varRef markers
                    // to preserve the original variable reference in DSL output, but the
                    // actual oscillator value is already stored in pass.uniforms and should
                    // not be overwritten
                    if (value && typeof value === 'object' && value._varRef) {
                        continue
                    }

                    if (paramName === 'zoom') {
                        zoomChanged = true
                    }

                    let spec = null
                    if (effectDef && effectDef.globals) {
                        spec = effectDef.globals[paramName]
                    }

                    const uniformName = spec?.uniform || paramName
                    const converted = this._renderer.convertParameterForUniform(value, spec)
                    const finalValue = Array.isArray(converted) ? converted.slice() : converted

                    // Update ONLY this step's pass.uniforms - NOT globalUniforms
                    // This prevents one effect from stomping another effect's uniforms
                    // when they share the same uniform names (e.g., two grade() effects)
                    if (uniformName in pass.uniforms) {
                        pass.uniforms[uniformName] = finalValue
                    }
                }
            }
        }

        if (zoomChanged && pipeline.resize) {
            let zoomValue = 1
            for (const params of Object.values(this._effectParameterValues)) {
                if (params.zoom !== undefined) {
                    zoomValue = params.zoom
                    break
                }
            }
            pipeline.resize(pipeline.width, pipeline.height, zoomValue)
        }

        for (const params of Object.values(this._effectParameterValues)) {
            if ('volumeSize' in params && pipeline.setUniform) {
                pipeline.setUniform('volumeSize', params.volumeSize)
                break
            }
        }
    }

    /**
     * Update DSL from effect parameter values
     * @private
     */
    _updateDslFromEffectParams() {
        this._applyEffectParameterValues()

        const newDsl = this.regenerateDslFromEffectParams()
        if (newDsl !== null && newDsl !== this.getDsl()) {
            this.setDsl(newDsl)
            this._renderer.currentDsl = newDsl
        }
    }

    // =========================================================================
    // Effect Selection and Pipeline Management
    // =========================================================================

    /**
     * Initialize parameter values from effect defaults
     * @param {object} effect - Effect object
     */
    initParameterValues(effect) {
        this._parameterValues = {}
        this._shaderOverrides = {} // Clear shader overrides when switching effects
        if (effect.instance && effect.instance.globals) {
            for (const [key, spec] of Object.entries(effect.instance.globals)) {
                if (spec.default !== undefined) {
                    this._parameterValues[key] = cloneParamValue(spec.default)
                }
            }
        }
    }

    /**
     * Clear all shader overrides
     */
    clearShaderOverrides() {
        this._shaderOverrides = {}
        this._writeTargetOverrides = {}
        this._writeStepTargetOverrides = {}
        this._readSourceOverrides = {}
    }

    /**
     * Get zoom value from parameters
     * @param {object} [effect] - Current effect
     * @returns {number} Zoom value
     */
    getZoomValue(effect) {
        return this._parameterValues.zoom ||
            (effect?.instance?.globals?.zoom?.default) || 1
    }

    /**
     * Format a compilation error for display
     * @param {Error} err - Error object
     * @returns {string} Formatted error message
     */
    formatCompilationError(err) {
        if (err.code === 'ERR_COMPILATION_FAILED' && Array.isArray(err.diagnostics)) {
            return err.diagnostics
                .filter(d => d.severity === 'error')
                .map(d => {
                    let msg = d.message || 'Unknown error'
                    if (d.location) {
                        msg += ` (line ${d.location.line}, col ${d.location.column})`
                    }
                    return msg
                })
                .join('; ') || 'Unknown compilation error'
        }
        return err.message || err.detail || (typeof err === 'object' ? JSON.stringify(err) : String(err))
    }
}

// Re-export utilities that might be needed externally
export { cloneParamValue, isStarterEffect, hasTexSurfaceParam, is3dGenerator, is3dProcessor, getEffect }

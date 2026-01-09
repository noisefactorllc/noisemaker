/**
 * ProgramState - Intermediate state layer for DSL/UI decoupling
 *
 * Single source of truth for effect parameter values across the program.
 * Emits events when state changes, enabling reactive UI updates.
 *
 * @module lib/program-state
 */

import { Emitter } from './emitter.js'
import { extractEffectsFromDsl } from './dsl-utils.js'
import { compile, unparse } from '../../../shaders/src/lang/index.js'
import { getEffect, cloneParamValue } from '../../../shaders/src/renderer/canvas.js'

/**
 * @typedef {object} StepState
 * @property {string} effectKey - Effect identifier (e.g., "synth.noise")
 * @property {object} effectDef - Effect definition with globals
 * @property {number} stepIndex - Step index in the chain
 * @property {Record<string, any>} values - Parameter values (may include oscillator bindings)
 */

/**
 * ProgramState class - manages effect parameter state for the entire program
 *
 * @extends Emitter
 *
 * @fires change - When a single parameter changes: { stepKey, paramName, value, previousValue }
 * @fires stepchange - When multiple params change on one step (batched): { stepKey, values, previousValues }
 * @fires structurechange - When effects are added/removed/reordered: { structure, previousStructure }
 * @fires reset - When a step is reset to defaults: { stepKey }
 * @fires load - When state is loaded from DSL or deserialized: { structure }
 *
 * @example
 * const state = new ProgramState({ renderer })
 * state.fromDsl('noise().grade().write(o0)')
 *
 * state.on('change', ({ stepKey, paramName, value }) => {
 *     console.log(`${stepKey}.${paramName} = ${value}`)
 * })
 *
 * state.setValue('step_0', 'scale', 2.0)
 */
export class ProgramState extends Emitter {
    /**
     * Create a new ProgramState instance
     * @param {object} [options={}] - Configuration options
     * @param {object} [options.renderer] - CanvasRenderer instance for pipeline integration
     */
    constructor(options = {}) {
        super()

        // Renderer reference (for pipeline integration)
        this._renderer = options.renderer || null

        // Core state
        /** @type {Map<string, StepState>} */
        this._stepStates = new Map()  // "step_0" -> StepState object

        /** @type {Array} */
        this._structure = []  // Parsed effect chain structure

        // Routing overrides
        this._writeTargetOverrides = new Map()
        this._writeStepTargetOverrides = new Map()
        this._readSourceOverrides = new Map()
        this._read3dVolOverrides = new Map()
        this._read3dGeoOverrides = new Map()
        this._write3dVolOverrides = new Map()
        this._write3dGeoOverrides = new Map()
        this._renderTargetOverride = null

        // Media metadata (resources managed by UI layer)
        this._mediaInputs = new Map()
        this._textInputs = new Map()

        // Batching state
        this._batchDepth = 0
        this._batchedChanges = []
    }

    // =========================================================================
    // Parameter Access Methods
    // =========================================================================

    /**
     * Get a single parameter value
     * @param {string} stepKey - Step identifier (e.g., "step_0")
     * @param {string} paramName - Parameter name
     * @returns {*} Parameter value or undefined
     */
    getValue(stepKey, paramName) {
        const stepState = this._stepStates.get(stepKey)
        if (!stepState) return undefined
        const value = stepState.values[paramName]
        // Unwrap oscillator bindings to return actual value
        if (value && typeof value === 'object' && value._varRef) {
            return value.value
        }
        return value
    }

    /**
     * Set a single parameter value
     * @param {string} stepKey - Step identifier
     * @param {string} paramName - Parameter name
     * @param {*} value - New value
     */
    setValue(stepKey, paramName, value) {
        let stepState = this._stepStates.get(stepKey)
        if (!stepState) {
            stepState = this._createEmptyStepState(stepKey)
            this._stepStates.set(stepKey, stepState)
        }

        const previousValue = this.getValue(stepKey, paramName)

        // Validate and coerce value
        const effectDef = stepState.effectDef
        if (effectDef?.globals?.[paramName]) {
            value = this._validateValue(value, effectDef.globals[paramName])
        }

        // Preserve oscillator binding if present
        const currentValue = stepState.values[paramName]
        if (currentValue && typeof currentValue === 'object' && currentValue._varRef) {
            stepState.values[paramName] = { ...currentValue, value }
        } else {
            stepState.values[paramName] = value
        }

        // Apply to pipeline immediately
        this._applyToPipeline()

        // Emit change event (or batch)
        this._emitChange({ stepKey, paramName, value, previousValue })
    }

    /**
     * Get all parameter values for a step
     * @param {string} stepKey - Step identifier
     * @returns {Record<string, *>} All parameter values
     */
    getStepValues(stepKey) {
        const stepState = this._stepStates.get(stepKey)
        if (!stepState) return {}

        // Unwrap oscillator bindings
        const result = {}
        for (const [key, value] of Object.entries(stepState.values)) {
            if (value && typeof value === 'object' && value._varRef) {
                result[key] = value.value
            } else {
                result[key] = value
            }
        }
        return result
    }

    /**
     * Set multiple parameter values for a step
     * @param {string} stepKey - Step identifier
     * @param {Record<string, *>} values - Parameter values to set
     */
    setStepValues(stepKey, values) {
        this.batch(() => {
            for (const [paramName, value] of Object.entries(values)) {
                this.setValue(stepKey, paramName, value)
            }
        })
    }

    // =========================================================================
    // Batching Support
    // =========================================================================

    /**
     * Execute a function with batched change events
     * Multiple setValue calls within the batch emit a single 'stepchange' event
     * @param {function} fn - Function to execute
     */
    batch(fn) {
        this._batchDepth++
        try {
            fn()
        } finally {
            this._batchDepth--
            if (this._batchDepth === 0 && this._batchedChanges.length > 0) {
                this._flushBatchedChanges()
            }
        }
    }

    /**
     * Emit change event or queue for batching
     * @private
     */
    _emitChange(change) {
        if (this._batchDepth > 0) {
            this._batchedChanges.push(change)
        } else {
            this.emit('change', change)
        }
    }

    /**
     * Flush batched changes as grouped events
     * @private
     */
    _flushBatchedChanges() {
        // Group by stepKey
        const byStep = new Map()
        for (const change of this._batchedChanges) {
            if (!byStep.has(change.stepKey)) {
                byStep.set(change.stepKey, { values: {}, previousValues: {} })
            }
            const group = byStep.get(change.stepKey)
            group.values[change.paramName] = change.value
            group.previousValues[change.paramName] = change.previousValue
        }

        // Emit stepchange for each affected step
        for (const [stepKey, data] of byStep) {
            this.emit('stepchange', { stepKey, ...data })
        }

        this._batchedChanges = []
    }

    // =========================================================================
    // DSL Synchronization
    // =========================================================================

    /**
     * Load state from DSL text
     * Parses DSL, extracts effect structure, and initializes step states
     * @param {string} dslText - DSL program text
     */
    fromDsl(dslText) {
        const previousStructure = [...this._structure]

        // Parse DSL to extract effects
        const effects = extractEffectsFromDsl(dslText)
        if (!effects || effects.length === 0) {
            console.warn('[ProgramState] Failed to parse DSL or empty program')
            return
        }

        // Check if structure changed
        const structureChanged = !this._structuresMatch(previousStructure, effects)

        // Preserve values by occurrence for structure changes
        const preservedValues = this._preserveValuesByOccurrence()

        // Update structure
        this._structure = effects

        // Rebuild step states
        if (structureChanged) {
            this._rebuildStepStates(effects, preservedValues)
            this.emit('structurechange', { structure: effects, previousStructure })
        } else {
            // Just update values from DSL args
            this._updateValuesFromDsl(effects)
        }

        // Apply to pipeline
        this._applyToPipeline()

        this.emit('load', { structure: effects })
    }

    /**
     * Generate DSL text from current state
     * @returns {string} DSL program text
     */
    toDsl() {
        if (!this._renderer?.currentDsl) return ''

        try {
            const compiled = compile(this._renderer.currentDsl)
            if (!compiled?.plans) return this._renderer.currentDsl

            // Apply parameter overrides from state
            const overrides = this._buildParameterOverrides()

            // Apply routing overrides
            this._applyRoutingOverridesToCompiled(compiled)

            // Unparse back to DSL text
            return unparse(compiled, overrides)
        } catch (err) {
            console.warn('[ProgramState] Failed to generate DSL:', err)
            return this._renderer?.currentDsl || ''
        }
    }

    /**
     * Check if DSL would change the effect structure
     * @param {string} dslText - DSL to check
     * @returns {boolean} True if structure would change
     */
    wouldChangeStructure(dslText) {
        const effects = extractEffectsFromDsl(dslText)
        if (!effects) return true
        return !this._structuresMatch(this._structure, effects)
    }

    // =========================================================================
    // Step Operations
    // =========================================================================

    /**
     * Reset step to default values
     * @param {string} stepKey - Step identifier
     */
    resetStep(stepKey) {
        const stepState = this._stepStates.get(stepKey)
        if (!stepState) return

        const effectDef = stepState.effectDef
        if (!effectDef?.globals) return

        // Preserve skip flag
        const wasSkipped = stepState.values._skip

        // Reset to defaults
        const newValues = {}
        for (const [paramName, spec] of Object.entries(effectDef.globals)) {
            if (spec.default !== undefined) {
                newValues[paramName] = this._cloneValue(spec.default)
            }
        }

        // Restore skip flag
        if (wasSkipped) {
            newValues._skip = true
        }

        stepState.values = newValues

        this._applyToPipeline()
        this.emit('reset', { stepKey })
    }

    /**
     * Set skip/bypass state for an effect
     * @param {string} stepKey - Step identifier
     * @param {boolean} skip - Whether to skip
     */
    setSkip(stepKey, skip) {
        const stepState = this._stepStates.get(stepKey)
        if (!stepState) return

        const previousValue = stepState.values._skip
        stepState.values._skip = skip
        this._applyToPipeline()
        this.emit('change', { stepKey, paramName: '_skip', value: skip, previousValue })
    }

    /**
     * Check if effect is skipped
     * @param {string} stepKey - Step identifier
     * @returns {boolean}
     */
    isSkipped(stepKey) {
        return this._stepStates.get(stepKey)?.values._skip === true
    }

    // =========================================================================
    // Structure Access Methods
    // =========================================================================

    /**
     * Get effect chain structure
     * @returns {Array} Array of EffectInfo objects
     */
    getStructure() {
        return [...this._structure]
    }

    /**
     * Get effect definition for a step
     * @param {string} stepKey - Step identifier
     * @returns {object|null} Effect definition or null
     */
    getEffectDef(stepKey) {
        return this._stepStates.get(stepKey)?.effectDef || null
    }

    /**
     * Get step count
     * @returns {number}
     */
    get stepCount() {
        return this._stepStates.size
    }

    /**
     * Get all step keys
     * @returns {string[]}
     */
    getStepKeys() {
        return [...this._stepStates.keys()]
    }

    // =========================================================================
    // Routing Override Methods
    // =========================================================================

    /**
     * Set write target override for a plan
     * @param {number} planIndex - Plan index
     * @param {string} target - Target surface name
     */
    setWriteTarget(planIndex, target) {
        this._writeTargetOverrides.set(planIndex, target)
        this.emit('change', { type: 'routing', key: 'writeTarget', planIndex, value: target })
    }

    /**
     * Get write target override for a plan
     * @param {number} planIndex - Plan index
     * @returns {string|undefined}
     */
    getWriteTarget(planIndex) {
        return this._writeTargetOverrides.get(planIndex)
    }

    /**
     * Set read source override for a step
     * @param {number} stepIndex - Step index
     * @param {string} source - Source surface name
     */
    setReadSource(stepIndex, source) {
        this._readSourceOverrides.set(stepIndex, source)
        this.emit('change', { type: 'routing', key: 'readSource', stepIndex, value: source })
    }

    /**
     * Get read source override for a step
     * @param {number} stepIndex - Step index
     * @returns {string|undefined}
     */
    getReadSource(stepIndex) {
        return this._readSourceOverrides.get(stepIndex)
    }

    /**
     * Set 3D volume read override
     * @param {number} stepIndex - Step index
     * @param {string} volume - Volume name
     */
    setRead3dVolume(stepIndex, volume) {
        this._read3dVolOverrides.set(stepIndex, volume)
    }

    /**
     * Set 3D geometry read override
     * @param {number} stepIndex - Step index
     * @param {string} geometry - Geometry name
     */
    setRead3dGeometry(stepIndex, geometry) {
        this._read3dGeoOverrides.set(stepIndex, geometry)
    }

    /**
     * Set 3D volume write override
     * @param {number} stepIndex - Step index
     * @param {string} volume - Volume name
     */
    setWrite3dVolume(stepIndex, volume) {
        this._write3dVolOverrides.set(stepIndex, volume)
    }

    /**
     * Set 3D geometry write override
     * @param {number} stepIndex - Step index
     * @param {string} geometry - Geometry name
     */
    setWrite3dGeometry(stepIndex, geometry) {
        this._write3dGeoOverrides.set(stepIndex, geometry)
    }

    /**
     * Set render target override
     * @param {string} target - Target surface name
     */
    setRenderTarget(target) {
        this._renderTargetOverride = target
    }

    /**
     * Get render target override
     * @returns {string|null}
     */
    getRenderTarget() {
        return this._renderTargetOverride
    }

    // =========================================================================
    // Media Metadata
    // =========================================================================

    /**
     * Set media input metadata for a step.
     * Stores metadata only - actual resources managed by UI layer.
     * @param {number} stepIndex - Step index
     * @param {object} metadata - Media metadata
     * @param {string} metadata.type - Media type ('image', 'video', 'camera')
     * @param {string} metadata.textureId - Texture identifier
     * @param {number[]} [metadata.dimensions] - [width, height]
     * @param {string} [metadata.filename] - Original filename (for images/videos)
     */
    setMediaInput(stepIndex, metadata) {
        this._mediaInputs.set(stepIndex, metadata)
        this.emit('mediachange', { stepIndex, metadata })
    }

    /**
     * Get media input metadata for a step
     * @param {number} stepIndex - Step index
     * @returns {object|undefined} Media metadata
     */
    getMediaInput(stepIndex) {
        return this._mediaInputs.get(stepIndex)
    }

    /**
     * Remove media input metadata for a step
     * @param {number} stepIndex - Step index
     */
    removeMediaInput(stepIndex) {
        this._mediaInputs.delete(stepIndex)
        this.emit('mediachange', { stepIndex, metadata: null })
    }

    /**
     * Get all media input metadata
     * @returns {Map<number, object>}
     */
    getAllMediaInputs() {
        return new Map(this._mediaInputs)
    }

    /**
     * Set text input metadata for a step.
     * Stores text canvas state - actual canvas managed by UI layer.
     * @param {number} stepIndex - Step index
     * @param {object} metadata - Text metadata
     * @param {string} metadata.text - Text content
     * @param {string} metadata.font - Font name
     * @param {string} [metadata.fontStyle] - Font style/weight
     * @param {number} [metadata.size] - Font size
     * @param {string} [metadata.color] - Text color
     * @param {string} [metadata.justify] - Text alignment
     * @param {number[]} [metadata.dimensions] - Canvas [width, height]
     */
    setTextInput(stepIndex, metadata) {
        this._textInputs.set(stepIndex, metadata)
        this.emit('textchange', { stepIndex, metadata })
    }

    /**
     * Get text input metadata for a step
     * @param {number} stepIndex - Step index
     * @returns {object|undefined} Text metadata
     */
    getTextInput(stepIndex) {
        return this._textInputs.get(stepIndex)
    }

    /**
     * Remove text input metadata for a step
     * @param {number} stepIndex - Step index
     */
    removeTextInput(stepIndex) {
        this._textInputs.delete(stepIndex)
        this.emit('textchange', { stepIndex, metadata: null })
    }

    /**
     * Get all text input metadata
     * @returns {Map<number, object>}
     */
    getAllTextInputs() {
        return new Map(this._textInputs)
    }

    // =========================================================================
    // Pipeline Integration
    // =========================================================================

    /**
     * Set renderer reference
     * @param {object} renderer - CanvasRenderer instance
     */
    setRenderer(renderer) {
        this._renderer = renderer
    }

    /**
     * Apply current state to pipeline uniforms
     * Called automatically after state changes
     */
    applyToPipeline() {
        this._applyToPipeline()
    }

    /**
     * Internal: Apply state to pipeline
     * @private
     */
    _applyToPipeline() {
        if (!this._renderer?.pipeline?.graph?.passes) return

        const pipeline = this._renderer.pipeline

        for (const [stepKey, stepState] of this._stepStates) {
            const match = stepKey.match(/^step_(\d+)$/)
            if (!match) continue
            const stepIndex = parseInt(match[1], 10)

            // Find passes for this step
            const stepPasses = pipeline.graph.passes.filter(pass => {
                if (!pass.id) return false
                const passMatch = pass.id.match(/^node_(\d+)_pass_/)
                return passMatch && parseInt(passMatch[1], 10) === stepIndex
            })

            if (stepPasses.length === 0) continue

            const effectDef = stepState.effectDef

            for (const pass of stepPasses) {
                if (!pass.uniforms) continue

                for (const [paramName, value] of Object.entries(stepState.values)) {
                    if (value === undefined || value === null) continue
                    if (paramName.startsWith('_')) continue  // Skip internal flags

                    // Skip oscillator-controlled params (oscillator manages the value)
                    if (value && typeof value === 'object' && value._varRef) {
                        continue
                    }

                    const spec = effectDef?.globals?.[paramName]
                    const uniformName = spec?.uniform || paramName

                    // Convert value for uniform if renderer has the method
                    let converted = value
                    if (this._renderer.convertParameterForUniform) {
                        converted = this._renderer.convertParameterForUniform(value, spec)
                    }

                    if (uniformName in pass.uniforms) {
                        pass.uniforms[uniformName] = Array.isArray(converted)
                            ? converted.slice()
                            : converted
                    }
                }
            }
        }

        // Handle zoom changes if the renderer supports it
        this._handleZoomChanges()
    }

    /**
     * Handle zoom parameter changes
     * @private
     */
    _handleZoomChanges() {
        // Check if any step has a zoom parameter that changed
        // This is used by the renderer to update camera/viewport
        if (!this._renderer?.handleZoomChange) return

        for (const [stepKey, stepState] of this._stepStates) {
            const zoom = stepState.values.zoom
            if (zoom !== undefined) {
                this._renderer.handleZoomChange(stepKey, zoom)
            }
        }
    }

    // =========================================================================
    // Serialization
    // =========================================================================

    /**
     * Serialize full state for persistence
     * @returns {object} Serialized state
     */
    serialize() {
        const stepStates = {}
        for (const [key, state] of this._stepStates) {
            stepStates[key] = {
                effectKey: state.effectKey,
                values: { ...state.values },
                _skip: state.values._skip
            }
        }

        return {
            version: 1,
            dsl: this._renderer?.currentDsl || '',
            stepStates,
            overrides: {
                writeTargets: Object.fromEntries(this._writeTargetOverrides),
                writeStepTargets: Object.fromEntries(this._writeStepTargetOverrides),
                readSources: Object.fromEntries(this._readSourceOverrides),
                read3dVol: Object.fromEntries(this._read3dVolOverrides),
                read3dGeo: Object.fromEntries(this._read3dGeoOverrides),
                write3dVol: Object.fromEntries(this._write3dVolOverrides),
                write3dGeo: Object.fromEntries(this._write3dGeoOverrides),
                renderTarget: this._renderTargetOverride
            },
            mediaInputs: Object.fromEntries(this._mediaInputs),
            textInputs: Object.fromEntries(this._textInputs)
        }
    }

    /**
     * Deserialize state from persistence
     * @param {object} data - Serialized state
     */
    deserialize(data) {
        if (data.version !== 1) {
            console.warn('[ProgramState] Unknown serialization version:', data.version)
        }

        // Restore overrides
        this._writeTargetOverrides = new Map(Object.entries(data.overrides?.writeTargets || {}))
        this._writeStepTargetOverrides = new Map(Object.entries(data.overrides?.writeStepTargets || {}))
        this._readSourceOverrides = new Map(Object.entries(data.overrides?.readSources || {}))
        this._read3dVolOverrides = new Map(Object.entries(data.overrides?.read3dVol || {}))
        this._read3dGeoOverrides = new Map(Object.entries(data.overrides?.read3dGeo || {}))
        this._write3dVolOverrides = new Map(Object.entries(data.overrides?.write3dVol || {}))
        this._write3dGeoOverrides = new Map(Object.entries(data.overrides?.write3dGeo || {}))
        this._renderTargetOverride = data.overrides?.renderTarget || null

        // Restore media/text metadata
        this._mediaInputs = new Map(Object.entries(data.mediaInputs || {}))
        this._textInputs = new Map(Object.entries(data.textInputs || {}))

        // Load DSL (this rebuilds stepStates from structure)
        if (data.dsl) {
            this.fromDsl(data.dsl)
        }

        // Override stepState values from serialized data
        for (const [key, savedState] of Object.entries(data.stepStates || {})) {
            const stepState = this._stepStates.get(key)
            if (stepState) {
                stepState.values = { ...stepState.values, ...savedState.values }
            }
        }

        this._applyToPipeline()
        this.emit('load', { structure: this._structure })
    }

    // =========================================================================
    // Validation and Helper Methods
    // =========================================================================

    /**
     * Validate and coerce a value based on parameter spec
     * @param {*} value - Value to validate
     * @param {object} spec - Parameter specification
     * @returns {*} Validated/coerced value
     * @private
     */
    _validateValue(value, spec) {
        if (!spec) return value

        switch (spec.type) {
            case 'float':
                value = parseFloat(value)
                if (isNaN(value)) value = spec.default ?? 0
                if (spec.min !== undefined) value = Math.max(spec.min, value)
                if (spec.max !== undefined) value = Math.min(spec.max, value)
                return value

            case 'int':
                value = parseInt(value, 10)
                if (isNaN(value)) value = spec.default ?? 0
                if (spec.min !== undefined) value = Math.max(spec.min, value)
                if (spec.max !== undefined) value = Math.min(spec.max, value)
                return value

            case 'boolean':
                return Boolean(value)

            case 'vec2':
                if (!Array.isArray(value)) return spec.default || [0, 0]
                return value.slice(0, 2).map(v => parseFloat(v) || 0)

            case 'vec3':
                if (!Array.isArray(value)) return spec.default || [0, 0, 0]
                return value.slice(0, 3).map(v => parseFloat(v) || 0)

            case 'vec4':
                if (!Array.isArray(value)) return spec.default || [0, 0, 0, 0]
                return value.slice(0, 4).map(v => parseFloat(v) || 0)

            default:
                return value
        }
    }

    /**
     * Clone a value (for defaults)
     * @param {*} value - Value to clone
     * @returns {*} Cloned value
     * @private
     */
    _cloneValue(value) {
        if (Array.isArray(value)) return [...value]
        if (value && typeof value === 'object') return { ...value }
        return value
    }

    /**
     * Check if two structures match (same effects in same order)
     * @param {Array} a - First structure
     * @param {Array} b - Second structure
     * @returns {boolean} True if structures match
     * @private
     */
    _structuresMatch(a, b) {
        if (!a || !b) return false
        if (a.length !== b.length) return false
        for (let i = 0; i < a.length; i++) {
            if (a[i].effectKey !== b[i].effectKey) return false
        }
        return true
    }

    /**
     * Create an empty step state for a step key
     * @param {string} stepKey - Step identifier
     * @returns {StepState} Empty step state
     * @private
     */
    _createEmptyStepState(stepKey) {
        const match = stepKey.match(/^step_(\d+)$/)
        const stepIndex = match ? parseInt(match[1], 10) : 0

        return {
            effectKey: '',
            effectDef: null,
            stepIndex,
            values: {}
        }
    }

    /**
     * Preserve values by occurrence for structure rebuilding
     * @returns {Map} Map of effectKey -> array of value objects
     * @private
     */
    _preserveValuesByOccurrence() {
        const preserved = new Map()
        for (const [stepKey, stepState] of this._stepStates) {
            const effectKey = stepState.effectKey
            if (!preserved.has(effectKey)) {
                preserved.set(effectKey, [])
            }
            preserved.get(effectKey).push({ ...stepState.values })
        }
        return preserved
    }

    /**
     * Rebuild step states from new effect structure
     * @param {Array} effects - Effect info array from DSL parsing
     * @param {Map} preservedValues - Preserved values from previous structure
     * @private
     */
    _rebuildStepStates(effects, preservedValues) {
        const newStepStates = new Map()
        const occurrenceCounts = new Map()

        for (const effect of effects) {
            const stepKey = `step_${effect.stepIndex}`
            const effectKey = effect.effectKey

            // Get effect definition
            const effectDef = getEffect(effectKey)

            // Track occurrence of this effect type
            const occurrence = occurrenceCounts.get(effectKey) || 0
            occurrenceCounts.set(effectKey, occurrence + 1)

            // Try to restore preserved values for this occurrence
            const preservedForEffect = preservedValues.get(effectKey)
            const preservedVals = preservedForEffect?.[occurrence] || {}

            // Initialize values from defaults, then override with DSL args, then preserved
            const values = {}

            // Start with defaults from effect definition
            if (effectDef?.globals) {
                for (const [paramName, spec] of Object.entries(effectDef.globals)) {
                    if (spec.default !== undefined) {
                        values[paramName] = this._cloneValue(spec.default)
                    }
                }
            }

            // Override with values from DSL args
            if (effect.args) {
                for (const [paramName, value] of Object.entries(effect.args)) {
                    values[paramName] = this._cloneValue(value)
                }
            }

            // Override with preserved values (but not if they're defaults)
            for (const [paramName, value] of Object.entries(preservedVals)) {
                if (paramName.startsWith('_') || value !== undefined) {
                    values[paramName] = this._cloneValue(value)
                }
            }

            newStepStates.set(stepKey, {
                effectKey,
                effectDef,
                stepIndex: effect.stepIndex,
                values
            })
        }

        this._stepStates = newStepStates
    }

    /**
     * Update values from DSL without rebuilding structure
     * @param {Array} effects - Effect info array from DSL parsing
     * @private
     */
    _updateValuesFromDsl(effects) {
        for (const effect of effects) {
            const stepKey = `step_${effect.stepIndex}`
            const stepState = this._stepStates.get(stepKey)

            if (stepState && effect.args) {
                for (const [paramName, value] of Object.entries(effect.args)) {
                    // Only update if different (avoid unnecessary events)
                    const currentValue = stepState.values[paramName]
                    if (JSON.stringify(currentValue) !== JSON.stringify(value)) {
                        stepState.values[paramName] = this._cloneValue(value)
                    }
                }
            }
        }
    }

    /**
     * Build parameter overrides for DSL generation
     * @returns {object} Parameter overrides keyed by step index
     * @private
     */
    _buildParameterOverrides() {
        const overrides = {}

        for (const [stepKey, stepState] of this._stepStates) {
            const match = stepKey.match(/^step_(\d+)$/)
            if (!match) continue
            const stepIndex = parseInt(match[1], 10)

            const stepOverrides = {}
            for (const [paramName, value] of Object.entries(stepState.values)) {
                if (paramName.startsWith('_')) continue  // Skip internal flags

                // Unwrap oscillator bindings for DSL (use varRef, not value)
                if (value && typeof value === 'object' && value._varRef) {
                    stepOverrides[paramName] = { _varRef: value._varRef }
                } else {
                    stepOverrides[paramName] = value
                }
            }

            overrides[stepIndex] = stepOverrides
        }

        return overrides
    }

    /**
     * Apply routing overrides to compiled DSL structure
     * @param {object} compiled - Compiled DSL object
     * @private
     */
    _applyRoutingOverridesToCompiled(compiled) {
        // Apply write target overrides
        for (const [planIndex, target] of this._writeTargetOverrides) {
            if (compiled.plans?.[planIndex]) {
                compiled.plans[planIndex].writeTarget = target
            }
        }

        // Apply render target override
        if (this._renderTargetOverride && compiled.render) {
            compiled.render.target = this._renderTargetOverride
        }
    }

    /**
     * Get a proxy object for backward compatibility with _effectParameterValues
     * @returns {object} Proxy that delegates to stepStates
     * @deprecated Use getValue/setValue instead
     */
    getEffectParameterValuesProxy() {
        const self = this
        return new Proxy({}, {
            get(target, stepKey) {
                if (typeof stepKey !== 'string') return undefined
                const stepState = self._stepStates.get(stepKey)
                if (!stepState) return undefined
                // Return proxy for step values
                return new Proxy(stepState.values, {
                    get(t, paramName) {
                        return self.getValue(stepKey, paramName)
                    },
                    set(t, paramName, value) {
                        self.setValue(stepKey, paramName, value)
                        return true
                    }
                })
            },
            set(target, stepKey, values) {
                if (typeof stepKey === 'string' && typeof values === 'object') {
                    self.setStepValues(stepKey, values)
                }
                return true
            },
            has(target, stepKey) {
                return self._stepStates.has(stepKey)
            },
            ownKeys() {
                return [...self._stepStates.keys()]
            },
            getOwnPropertyDescriptor(target, stepKey) {
                if (self._stepStates.has(stepKey)) {
                    return { configurable: true, enumerable: true }
                }
                return undefined
            }
        })
    }
}

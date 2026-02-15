/**
 * ProgramState - Intermediate state layer for DSL/UI decoupling
 *
 * Single source of truth for effect parameter values across the program.
 * Emits events when state changes, enabling reactive UI updates.
 *
 * @module lib/program-state
 */

import { Emitter } from './emitter.js'
import { expandPalette } from '../../../shaders/src/runtime/palette-expansion.js'
import { extractEffectsFromDsl } from './dsl-utils.js'
import { compile, unparse, formatValue } from '../../../shaders/src/lang/index.js'
import { getEffect, isStarterEffect } from '../../../shaders/src/renderer/canvas.js'

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

        // Cached compiled program (for routing, plan indices, etc.)
        this._compiled = null

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
        // Unwrap automation bindings (oscillator, midi, audio) to return actual value
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

        // Preserve automation binding (_varRef) if present (for oscillator, midi, audio)
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

        // Unwrap automation bindings (oscillator, midi, audio)
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

        // Cache compiled program for getCompiled()
        try {
            this._compiled = compile(dslText)
        } catch (err) {
            this._compiled = null
        }

        // Parse DSL to extract effects
        const effects = extractEffectsFromDsl(dslText)
        if (!effects) {
            console.warn('[ProgramState] Failed to parse DSL')
            return
        }

        // Empty effects array is valid (e.g., just "render(o0)" with no effect chain)
        // We should still process it to clear any existing structure

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

            // Unparse back to DSL text with custom formatter for arrays/colors/etc.
            const enums = this._renderer?.enums || {}

            // Create effect def callback for proper parameter spec lookup
            const getEffectDefCallback = (effectName, namespace) => {
                // Try direct lookup first
                let def = getEffect(effectName)
                if (def) return def

                // Try with "/" instead of "." (e.g., "filter/grade")
                if (effectName.includes('.')) {
                    def = getEffect(effectName.replace('.', '/'))
                    if (def) return def
                }

                // If namespace provided separately, try combining
                if (namespace) {
                    def = getEffect(`${namespace}/${effectName}`) ||
                          getEffect(`${namespace}.${effectName}`)
                    if (def) return def
                }

                return null
            }

            return unparse(compiled, overrides, {
                customFormatter: (value, spec) => formatValue(value, spec, { enums }),
                getEffectDef: getEffectDefCallback
            })
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

    /**
     * Delete a step from the program
     * @param {number} stepIndex - Global step index to delete
     * @returns {{success: boolean, newDsl?: string, deletedSurfaceName?: string, error?: string}}
     */
    deleteStep(stepIndex) {
        if (!this._renderer?.currentDsl) {
            return { success: false, error: 'no DSL available' }
        }

        const currentDsl = this._renderer.currentDsl

        let compiled
        try {
            compiled = compile(currentDsl)
        } catch (err) {
            return { success: false, error: `DSL syntax error: ${err.message}` }
        }

        if (!compiled?.plans) {
            return { success: false, error: 'compilation failed' }
        }

        // Preserve search namespaces
        const searchMatch = currentDsl.match(/^search\s+(\S.*?)$/m)
        if (searchMatch) {
            compiled.searchNamespaces = searchMatch[1].split(/\s*,\s*/)
        }

        let globalStepIndex = 0
        let found = false
        let deletedSurfaceName = null

        for (let p = 0; p < compiled.plans.length; p++) {
            const plan = compiled.plans[p]
            if (!plan.chain) continue

            for (let s = 0; s < plan.chain.length; s++) {
                if (globalStepIndex === stepIndex) {
                    const deletedStep = plan.chain[s]

                    // Deleting a starter effect should remove the entire chain
                    if (s === 0 && deletedStep && !deletedStep.builtin) {
                        const namespace = deletedStep.namespace?.namespace || deletedStep.namespace?.resolved || null
                        const def = getEffect(deletedStep.op) ||
                                   (namespace ? getEffect(`${namespace}/${deletedStep.op}`) : null)
                        const deletedIsStarter = !!(def && isStarterEffect({ instance: def }))

                        if (deletedIsStarter) {
                            // Track the surface this chain was writing to
                            if (plan.write) {
                                deletedSurfaceName = typeof plan.write === 'object' ? plan.write.name : plan.write
                            }
                            compiled.plans.splice(p, 1)
                            found = true
                            break
                        }
                    }

                    plan.chain.splice(s, 1)

                    if (plan.chain.length === 0) {
                        // Track the surface this chain was writing to
                        if (plan.write) {
                            deletedSurfaceName = typeof plan.write === 'object' ? plan.write.name : plan.write
                        }
                        compiled.plans.splice(p, 1)
                    } else {
                        // Check if only _write nodes remain - if so, delete the plan
                        const hasNonWriteStep = plan.chain.some(step =>
                            !(step.builtin && step.op === '_write')
                        )
                        if (!hasNonWriteStep) {
                            if (plan.write) {
                                deletedSurfaceName = typeof plan.write === 'object' ? plan.write.name : plan.write
                            }
                            compiled.plans.splice(p, 1)
                        }
                    }
                    found = true
                    break
                }
                globalStepIndex++
            }
            if (found) break
        }

        if (!found) {
            return { success: false, error: 'step not found' }
        }

        // Regenerate DSL
        const newDsl = unparse(compiled, {}, {
            getEffectDef: (name, ns) => {
                let def = getEffect(name)
                if (!def && ns) {
                    def = getEffect(`${ns}/${name}`) || getEffect(`${ns}.${name}`)
                }
                return def
            }
        })

        // Update state (this will emit structurechange)
        this.fromDsl(newDsl)

        return { success: true, newDsl, deletedSurfaceName }
    }

    /**
     * Insert a step into the program
     * @param {number} afterStepIndex - Insert after this step (-1 for beginning of first chain)
     * @param {string} effectId - Effect identifier (e.g., "filter/bloom")
     * @returns {{success: boolean, newDsl?: string, newStepIndex?: number, error?: string}}
     */
    insertStep(afterStepIndex, effectId) {
        if (!this._renderer?.currentDsl) {
            return { success: false, error: 'no DSL available' }
        }

        const currentDsl = this._renderer.currentDsl

        let compiled
        try {
            compiled = compile(currentDsl)
        } catch (err) {
            return { success: false, error: `DSL syntax error: ${err.message}` }
        }

        if (!compiled?.plans) {
            return { success: false, error: 'compilation failed' }
        }

        // Preserve search namespaces
        const searchMatch = currentDsl.match(/^search\s+(\S.*?)$/m)
        if (searchMatch) {
            compiled.searchNamespaces = searchMatch[1].split(/\s*,\s*/)
        }

        // Parse effect ID to get namespace and name
        const slashIndex = effectId.indexOf('/')
        const namespace = slashIndex > -1 ? effectId.substring(0, slashIndex) : null
        const effectName = slashIndex > -1 ? effectId.substring(slashIndex + 1) : effectId

        // Check if effect is a starter (can only begin chains)
        const effectDef = getEffect(effectId) || getEffect(effectName) ||
                         (namespace ? getEffect(`${namespace}.${effectName}`) : null)
        if (effectDef && isStarterEffect({ instance: effectDef })) {
            return { success: false, error: `Cannot insert starter effect '${effectId}' mid-chain` }
        }

        // Ensure namespace is in search directives
        if (namespace && (!compiled.searchNamespaces || !compiled.searchNamespaces.includes(namespace))) {
            if (!compiled.searchNamespaces) {
                compiled.searchNamespaces = []
            }
            compiled.searchNamespaces.push(namespace)
        }

        // Find the target step location
        let globalStepIndex = 0
        let targetPlanIndex = -1
        let targetChainIndex = -1

        for (let p = 0; p < compiled.plans.length; p++) {
            const plan = compiled.plans[p]
            if (!plan.chain) continue

            for (let s = 0; s < plan.chain.length; s++) {
                if (globalStepIndex === afterStepIndex) {
                    targetPlanIndex = p
                    targetChainIndex = s
                    break
                }
                globalStepIndex++
            }
            if (targetPlanIndex >= 0) break
        }

        if (targetPlanIndex < 0 && afterStepIndex >= 0) {
            return { success: false, error: `Step index ${afterStepIndex} not found` }
        }

        // Handle special case: afterStepIndex = -1 means insert at beginning
        if (afterStepIndex < 0) {
            targetPlanIndex = 0
            targetChainIndex = -1  // Will insert at position 0
        }

        const targetChain = compiled.plans[targetPlanIndex]?.chain
        if (!targetChain) {
            return { success: false, error: 'Target chain not found' }
        }

        // Find max temp index for new step
        let maxTemp = 0
        for (const plan of compiled.plans) {
            if (!plan.chain) continue
            for (const step of plan.chain) {
                if (typeof step.temp === 'number' && step.temp > maxTemp) {
                    maxTemp = step.temp
                }
            }
        }

        // Create the new step AST node
        const newStep = {
            op: effectName,
            args: {},
            temp: maxTemp + 1
        }

        // Add namespace if present
        if (namespace) {
            newStep.namespace = { namespace }
        }

        // Determine insert position (after target, before any _write)
        let insertPosition = targetChainIndex + 1
        if (targetChain[targetChainIndex]?.builtin && targetChain[targetChainIndex]?.op === '_write') {
            insertPosition = targetChainIndex
        }

        // Insert the new step
        targetChain.splice(insertPosition, 0, newStep)

        // Regenerate DSL
        const newDsl = unparse(compiled, {}, {
            getEffectDef: (name, ns) => {
                let def = getEffect(name)
                if (!def && ns) {
                    def = getEffect(`${ns}/${name}`) || getEffect(`${ns}.${name}`)
                }
                return def
            }
        })

        // Update state (this will emit structurechange)
        this.fromDsl(newDsl)

        // Calculate the new step's global index
        let newStepIndex = 0
        for (let p = 0; p < targetPlanIndex; p++) {
            newStepIndex += compiled.plans[p]?.chain?.length || 0
        }
        newStepIndex += insertPosition

        return { success: true, newDsl, newStepIndex }
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
     * Get the compiled program (for routing, plan indices, etc.)
     * @returns {object|null} Compiled program or null
     */
    getCompiled() {
        return this._compiled
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

    /**
     * Get all step values as a plain object keyed by stepKey
     * Used for passing to renderer.applyStepParameterValues()
     * @returns {Object<string, Object<string, any>>}
     */
    getAllStepValues() {
        const result = {}
        for (const [stepKey, stepState] of this._stepStates) {
            result[stepKey] = { ...stepState.values }
        }
        return result
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
     * Set write target override for a mid-chain write step
     * @param {number} stepIndex - Step index
     * @param {string} target - Target surface name
     */
    setWriteStepTarget(stepIndex, target) {
        this._writeStepTargetOverrides.set(stepIndex, target)
        this.emit('change', { type: 'routing', key: 'writeStepTarget', stepIndex, value: target })
    }

    /**
     * Get write target override for a mid-chain write step
     * @param {number} stepIndex - Step index
     * @returns {string|undefined}
     */
    getWriteStepTarget(stepIndex) {
        return this._writeStepTargetOverrides.get(stepIndex)
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
        this.emit('change', { type: 'routing', key: 'renderTarget', value: target })
    }

    /**
     * Get render target override
     * @returns {string|null}
     */
    getRenderTarget() {
        return this._renderTargetOverride
    }

    /**
     * Clear all routing overrides
     */
    clearRoutingOverrides() {
        this._writeTargetOverrides.clear()
        this._writeStepTargetOverrides.clear()
        this._readSourceOverrides.clear()
        this._read3dVolOverrides.clear()
        this._read3dGeoOverrides.clear()
        this._write3dVolOverrides.clear()
        this._write3dGeoOverrides.clear()
        this._renderTargetOverride = null
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
                const passMatch = pass.id.match(/^node_(\d+)_/)
                return passMatch && parseInt(passMatch[1], 10) === stepIndex
            })

            if (stepPasses.length === 0) continue

            const effectDef = stepState.effectDef

            for (const pass of stepPasses) {
                if (!pass.uniforms) continue

                // Deferred palette expansion: collect during param loop, apply after
                // so expanded values aren't overwritten by default param values
                let paletteExpansion = null

                for (const [paramName, value] of Object.entries(stepState.values)) {
                    if (value === undefined || value === null) continue
                    if (paramName.startsWith('_')) continue  // Skip internal flags

                    // Skip automation-controlled params (oscillator, midi, audio manage the value)
                    if (value && typeof value === 'object' && (
                        value._varRef ||
                        value.type === 'Oscillator' || value._ast?.type === 'Oscillator' ||
                        value.type === 'Midi' || value._ast?.type === 'Midi' ||
                        value.type === 'Audio' || value._ast?.type === 'Audio'
                    )) {
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

                    // Legacy classicNoisedeck palette expansion:
                    // Defer to after param loop so expanded values take precedence
                    if (spec?.type === 'palette') {
                        paletteExpansion = expandPalette(converted)
                    }
                }

                // Apply palette expansion after all params are written
                if (paletteExpansion) {
                    for (const [uName, uValue] of Object.entries(paletteExpansion)) {
                        if (uName in pass.uniforms) {
                            pass.uniforms[uName] = Array.isArray(uValue)
                                ? uValue.slice()
                                : uValue
                        }
                    }
                }
            }
        }

        // Handle zoom → pipeline.resize()
        if (pipeline.resize) {
            for (const [, stepState] of this._stepStates) {
                const zoom = stepState.values.zoom
                if (zoom !== undefined) {
                    pipeline.resize(pipeline.width, pipeline.height, zoom)
                    break // only one zoom value applies
                }
            }
        }

        // Handle volumeSize → pipeline.setUniform('volumeSize', ...)
        if (pipeline.setUniform) {
            for (const [, stepState] of this._stepStates) {
                if ('volumeSize' in stepState.values) {
                    pipeline.setUniform('volumeSize', stepState.values.volumeSize)
                    break
                }
            }

            // Handle stateSize → scoped pipeline.setUniform('stateSize_node_N', ...)
            // Each pointsEmit has its own particle pipeline with scoped textures
            for (const [stepKey, stepState] of this._stepStates) {
                if ('stateSize' in stepState.values) {
                    const match = stepKey.match(/^step_(\d+)$/)
                    if (match) {
                        pipeline.setUniform(`stateSize_node_${match[1]}`, stepState.values.stateSize)
                    }
                }
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

        // Preserve automation configs (oscillator, midi, audio) untouched
        if (value && typeof value === 'object' && (
            value.type === 'Oscillator' || value._ast?.type === 'Oscillator' ||
            value.type === 'Midi' || value._ast?.type === 'Midi' ||
            value.type === 'Audio' || value._ast?.type === 'Audio'
        )) {
            return value
        }

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

            case 'color':
                // Color type: ensure value is a vec3 array
                // Handle hex strings (from UI) by converting to array
                if (Array.isArray(value)) {
                    return value.slice(0, 3).map(v => parseFloat(v) || 0)
                }
                if (typeof value === 'string' && value.startsWith('#')) {
                    const hex = value.slice(1)
                    return [
                        parseInt(hex.slice(0, 2), 16) / 255,
                        parseInt(hex.slice(2, 4), 16) / 255,
                        parseInt(hex.slice(4, 6), 16) / 255
                    ]
                }
                return spec.default || [0, 0, 0]

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
        for (const [, stepState] of this._stepStates) {
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

            // Override with preserved values ONLY for params NOT specified in DSL
            // This preserves slider tweaks for params the user didn't change in DSL,
            // but respects explicit values from pasted/edited DSL
            for (const [paramName, value] of Object.entries(preservedVals)) {
                // Skip if DSL explicitly specifies this param (use DSL value instead)
                if (effect.args && paramName in effect.args) {
                    continue
                }

                if (paramName.startsWith('_') || value !== undefined) {
                    // Don't overwrite automation bindings from DSL with preserved scalar values
                    const dslArg = effect.args?.[paramName]
                    if (dslArg && typeof dslArg === 'object' && (
                        dslArg.type === 'Oscillator' || dslArg._ast?.type === 'Oscillator' ||
                        dslArg.type === 'Midi' || dslArg._ast?.type === 'Midi' ||
                        dslArg.type === 'Audio' || dslArg._ast?.type === 'Audio'
                    )) {
                        continue
                    }
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

            // Get original effect info to check for automated parameters
            const effectInfo = this._structure[stepIndex]

            const stepOverrides = {}
            for (const [paramName, value] of Object.entries(stepState.values)) {
                // Skip internal flags EXCEPT _skip which is a DSL argument
                if (paramName.startsWith('_') && paramName !== '_skip') continue

                // Check if this param is automated in the original DSL
                const rawKwarg = effectInfo?.rawKwargs?.[paramName]
                const isAutomatedInDsl = rawKwarg && typeof rawKwarg === 'object' && (
                    rawKwarg.type === 'Oscillator' ||
                    rawKwarg.type === 'Midi' ||
                    rawKwarg.type === 'Audio'
                )

                // Skip automated parameters - let original DSL pass through
                if (isAutomatedInDsl) {
                    continue
                }

                // Unwrap automation bindings for DSL (use varRef, not value)
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
        if (!compiled?.plans) return

        // Apply write target overrides (end of chain)
        for (const [planIndex, target] of this._writeTargetOverrides) {
            if (compiled.plans[planIndex]) {
                const isOutput = target.startsWith('o')
                compiled.plans[planIndex].write = {
                    type: isOutput ? 'OutputRef' : 'FeedbackRef',
                    name: target
                }
            }
        }

        // Apply mid-chain write step target overrides
        if (this._writeStepTargetOverrides.size > 0) {
            let globalStepIndex = 0
            for (const plan of compiled.plans) {
                if (!plan.chain) continue
                for (const step of plan.chain) {
                    if (step.builtin && step.op === '_write' && this._writeStepTargetOverrides.has(globalStepIndex)) {
                        const target = this._writeStepTargetOverrides.get(globalStepIndex)
                        const isOutput = target.startsWith('o')
                        step.args.tex = {
                            kind: isOutput ? 'output' : 'feedback',
                            name: target
                        }
                    }
                    globalStepIndex++
                }
            }
        }

        // Apply read source overrides
        if (this._readSourceOverrides.size > 0) {
            let globalStepIndex = 0
            for (const plan of compiled.plans) {
                if (!plan.chain) continue
                for (const step of plan.chain) {
                    if (step.builtin && step.op === '_read' && this._readSourceOverrides.has(globalStepIndex)) {
                        const source = this._readSourceOverrides.get(globalStepIndex)
                        const isOutput = source.startsWith('o')
                        step.args.tex = {
                            kind: isOutput ? 'output' : 'feedback',
                            name: source
                        }
                    }
                    globalStepIndex++
                }
            }
        }

        // Apply read3d volume and geometry overrides
        if (this._read3dVolOverrides.size > 0 || this._read3dGeoOverrides.size > 0) {
            let globalStepIndex = 0
            for (const plan of compiled.plans) {
                if (!plan.chain) continue
                for (const step of plan.chain) {
                    if (step.builtin && step.op === '_read3d') {
                        if (this._read3dVolOverrides.has(globalStepIndex)) {
                            const volName = this._read3dVolOverrides.get(globalStepIndex)
                            step.args.tex3d = { kind: 'vol', name: volName }
                        }
                        if (this._read3dGeoOverrides.has(globalStepIndex)) {
                            const geoName = this._read3dGeoOverrides.get(globalStepIndex)
                            step.args.geo = { kind: 'geo', name: geoName }
                        }
                    }
                    globalStepIndex++
                }
            }
        }

        // Apply write3d volume and geometry overrides
        if (this._write3dVolOverrides.size > 0 || this._write3dGeoOverrides.size > 0) {
            let globalStepIndex = 0
            for (const plan of compiled.plans) {
                if (!plan.chain) continue
                for (const step of plan.chain) {
                    if (step.builtin && step.op === '_write3d') {
                        if (this._write3dVolOverrides.has(globalStepIndex)) {
                            const volName = this._write3dVolOverrides.get(globalStepIndex)
                            step.args.tex3d = { kind: 'vol', name: volName }
                        }
                        if (this._write3dGeoOverrides.has(globalStepIndex)) {
                            const geoName = this._write3dGeoOverrides.get(globalStepIndex)
                            step.args.geo = { kind: 'geo', name: geoName }
                        }
                    }
                    globalStepIndex++
                }
            }
        }

        // Apply render target override
        if (this._renderTargetOverride) {
            if (typeof compiled.render === 'string') {
                compiled.render = this._renderTargetOverride
            } else if (compiled.render) {
                compiled.render.target = this._renderTargetOverride
            }
        }
    }
}

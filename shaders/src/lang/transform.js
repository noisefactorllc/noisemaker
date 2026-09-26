/**
 * DSL Transform - Functions for transforming compiled programs.
 *
 * Provides utilities for modifying compiled DSL programs programmatically,
 * such as replacing effects within chains.
 */

import { isStarterOp } from './validator.js'
import { ops } from './ops.js'
import { getEffect, getAllEffects } from '../runtime/registry.js'
import { getParamAliases } from './paramAliases.js'

/**
 * Deep clone a compiled program structure
 * @param {object} obj - Object to clone
 * @returns {object} Cloned object
 */
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj
    }
    if (Array.isArray(obj)) {
        return obj.map(deepClone)
    }
    const cloned = {}
    for (const key of Object.keys(obj)) {
        cloned[key] = deepClone(obj[key])
    }
    return cloned
}

/**
 * Find a step in the compiled program by its temp index
 * @param {object} compiled - Compiled program from compile()
 * @param {number} stepIndex - The temp index of the step to find
 * @returns {object|null} { planIndex, chainIndex, step } or null if not found
 */
function findStepByIndex(compiled, stepIndex) {
    if (!compiled?.plans) return null

    for (let planIndex = 0; planIndex < compiled.plans.length; planIndex++) {
        const plan = compiled.plans[planIndex]
        if (!plan?.chain) continue

        for (let chainIndex = 0; chainIndex < plan.chain.length; chainIndex++) {
            const step = plan.chain[chainIndex]
            if (!step.builtin && step.temp === stepIndex) {
                return { planIndex, chainIndex, step }
            }
        }
    }
    return null
}

/**
 * Check if an effect is a starter effect
 * @param {string} effectName - Effect name (may include namespace)
 * @param {Array<string>} searchOrder - Namespace search order
 * @returns {boolean} True if the effect is a starter
 */
function checkIsStarter(effectName, searchOrder = []) {
    // Direct check
    if (isStarterOp(effectName)) return true

    // Check with each namespace prefix if bare name
    if (!effectName.includes('.') && searchOrder.length > 0) {
        for (const ns of searchOrder) {
            if (isStarterOp(`${ns}.${effectName}`)) return true
        }
    }

    return false
}

/**
 * Get the effect spec for a given effect name
 * @param {string} effectName - Effect name (may include namespace)
 * @param {Array<string>} searchOrder - Namespace search order
 * @returns {object|null} Effect spec or null
 */
function getEffectSpec(effectName, searchOrder = []) {
    // Direct lookup
    if (ops[effectName]) return ops[effectName]

    // Try with namespace prefixes
    if (!effectName.includes('.') && searchOrder.length > 0) {
        for (const ns of searchOrder) {
            const namespacedName = `${ns}.${effectName}`
            if (ops[namespacedName]) return ops[namespacedName]
        }
    }

    return null
}

// ============================================================================
// Replacement preflight prediction (GAP-008)
// ============================================================================

/**
 * Look up the full effect instance for a resolved effect name.
 * Returns null when the runtime registry has never been populated
 * (lang-only usage) AND for names that were never registered.
 * @param {string} resolvedName - Namespaced effect name
 * @returns {object|null} Effect instance or null
 */
function getEffectInstance(resolvedName) {
    return getEffect(resolvedName) || null
}

/**
 * Check whether the runtime effect registry has been populated at all.
 * When empty, per-effect availability is unknown (the lang layer may be
 * used standalone, where only op specs are registered).
 * @returns {boolean} True if at least one effect instance is registered
 */
function runtimeRegistryPopulated() {
    return getAllEffects().size > 0
}

/**
 * Check a provided value against an effect argument definition's declared type.
 * Only clear mismatches are flagged; unknown/loose types pass.
 * @param {*} value - Provided value
 * @param {string} type - Declared type ('float', 'int', 'color', 'bool', 'surface', ...)
 * @returns {boolean} True if the value is compatible with the type
 */
function typeMatches(value, type) {
    if (value === null || value === undefined) return true
    switch (type) {
        case 'float':
        case 'int':
        case 'number':
            return typeof value === 'number'
        case 'color':
            return typeof value === 'string' && value.startsWith('#')
        case 'bool':
        case 'boolean':
            return typeof value === 'boolean'
        case 'surface':
        case 'tex':
            return typeof value === 'string'
        default:
            return true
    }
}

/**
 * Collect the set of accepted argument names for an effect: spec args,
 * instance globals, and their registered param aliases.
 * @param {object} spec - Op spec (may be null)
 * @param {object|null} instance - Effect instance (may be null)
 * @param {object} aliases - Param alias map { oldName: newName }
 * @returns {Set<string>} Accepted argument names
 */
function collectAcceptedArgNames(spec, instance, aliases) {
    const accepted = new Set()
    for (const def of (spec?.args || [])) {
        if (def?.name) accepted.add(def.name)
    }
    if (instance?.globals) {
        for (const key of Object.keys(instance.globals)) accepted.add(key)
    }
    for (const name of Object.keys(aliases)) accepted.add(name)
    for (const name of Object.values(aliases)) accepted.add(name)
    return accepted
}

/**
 * Build the alias map for an op from the param-alias registry.
 * @param {string} resolvedName - Namespaced effect name
 * @returns {object} { oldName: newName } (possibly empty)
 */
function aliasMapFor(resolvedName) {
    return getParamAliases(resolvedName)
}

/**
 * Predict backend support for an effect instance from a shader manifest
 * (the object served at effects/manifest.json).
 * @param {object|null} instance - Effect instance
 * @param {string} resolvedName - Namespaced effect name
 * @param {object|null} manifest - Shader manifest (or null/undefined)
 * @returns {object|undefined} { webgl2, webgpu } booleans, or undefined when unknown
 */
function predictBackendSupport(instance, resolvedName, manifest) {
    if (!manifest || !instance || !instance.passes) return undefined
    const namespace = instance.namespace || resolvedName.split('.')[0]
    const candidates = [instance.name, instance.func, resolvedName.split('.').pop()]
    let entry = null
    for (const displayName of candidates) {
        if (displayName && manifest[`${namespace}/${displayName}`]) {
            entry = manifest[`${namespace}/${displayName}`]
            break
        }
    }
    if (!entry) return { webgl2: false, webgpu: false }
    const programs = instance.passes.map(p => p?.program).filter(Boolean)
    const cover = (table) => {
        if (!table) return false
        if (programs.length === 0) return undefined
        const hits = programs.filter(p => p in table).length
        if (hits === 0) return false
        return hits === programs.length ? true : 'partial'
    }
    return { webgl2: cover(entry.glsl), webgpu: cover(entry.wgsl) }
}

/**
 * Summarize the sampler topology of an effect instance.
 * @param {object|null} instance - Effect instance
 * @returns {object|undefined} { internalTextures, passInputs } or undefined
 */
function predictSamplerTopology(instance) {
    if (!instance) return undefined
    const internalTextures = instance.textures ? Object.keys(instance.textures) : []
    const passInputs = []
    for (const pass of (instance.passes || [])) {
        for (const value of Object.values(pass?.inputs || {})) {
            if (typeof value === 'string' && !passInputs.includes(value)) {
                passInputs.push(value)
            }
        }
    }
    return { internalTextures, passInputs }
}

/**
 * Summarize the pass/output shape of an effect instance.
 * @param {object|null} instance - Effect instance
 * @returns {object|undefined} { passes, outputs } or undefined
 */
function predictPassesAndOutputs(instance) {
    if (!instance) return undefined
    const passes = (instance.passes || []).map(pass => ({
        name: pass?.name,
        program: pass?.program,
        inputs: pass?.inputs ? { ...pass.inputs } : {},
        outputs: pass?.outputs ? { ...pass.outputs } : {},
        drawBuffers: pass?.drawBuffers
    }))
    const outputs = {
        geo: instance.outputGeo ?? null,
        tex3d: instance.outputTex3d ?? null
    }
    return { passes, outputs }
}

/**
 * Predict a candidate replacement's compatibility dimensions before mutation.
 *
 * Covered dimensions: shader availability, arguments (unknown/missing),
 * types, ranges (min/max/choices), passes, outputs, sampler topology, and
 * backend support (from an optional shader manifest). Dimensions whose data
 * is unavailable are reported as `undefined` ("unknown"), never invented.
 *
 * @param {string} resolvedName - Namespaced effect name
 * @param {object} spec - Op spec for the candidate (may be null)
 * @param {object} newArgs - Caller-provided arguments
 * @param {object|null} oldInstance - Effect instance of the replaced step (may be null)
 * @param {object} [options={}] - { manifest }
 * @returns {object} Prediction with `issues` (hard problems) and informative fields
 */
export function predictReplacement(resolvedName, spec, newArgs, oldInstance, options = {}) {
    const instance = getEffectInstance(resolvedName)
    const prediction = {
        effect: resolvedName,
        available: undefined,
        arguments: { unknown: [], missing: [] },
        types: [],
        ranges: [],
        passes: undefined,
        outputs: undefined,
        samplerTopology: undefined,
        backendSupport: undefined,
        issues: []
    }

    // Shader availability
    if (instance) {
        prediction.available = true
    } else if (runtimeRegistryPopulated()) {
        prediction.available = false
        prediction.issues.push({
            dimension: 'shader-availability',
            message: `No registered effect definition for '${resolvedName}'`
        })
    }

    const aliases = aliasMapFor(resolvedName)
    const accepted = collectAcceptedArgNames(spec, instance, aliases)

    const provided = newArgs || {}
    const providedCanonical = new Set(Object.keys(provided).map(key => aliases[key] || key))
    for (const key of Object.keys(provided)) {
        const canonical = aliases[key] || key
        if (!accepted.has(canonical)) {
            prediction.arguments.unknown.push(key)
        }
    }
    const knownDefs = new Map()
    for (const def of (spec?.args || [])) knownDefs.set(def.name, def)
    if (instance?.globals) {
        for (const [key, def] of Object.entries(instance.globals)) {
            if (!knownDefs.has(key)) knownDefs.set(key, def)
        }
    }
    for (const [key, def] of knownDefs) {
        if (def?.default === undefined && !providedCanonical.has(key)) {
            prediction.arguments.missing.push(key)
        }
    }
    if (prediction.arguments.unknown.length > 0) {
        prediction.issues.push({
            dimension: 'arguments',
            message: `Unknown argument(s) for '${resolvedName}': ${prediction.arguments.unknown.join(', ')}`
        })
    }

    // Type and range checks
    for (const [key, value] of Object.entries(provided)) {
        const canonical = aliases[key] || key
        const def = knownDefs.get(canonical)
        if (!def) continue
        const declaredType = def.type === 'color' ? 'color' : def.type
        if (!typeMatches(value, declaredType)) {
            prediction.types.push({ arg: key, expected: declaredType, actual: typeof value })
        }
        if (typeof value === 'number') {
            if (def.min !== undefined && value < def.min) {
                prediction.ranges.push({ arg: canonical, value, min: def.min, max: def.max })
            }
            if (def.max !== undefined && value > def.max) {
                prediction.ranges.push({ arg: canonical, value, min: def.min, max: def.max })
            }
        }
        if (def.choices && typeof value === 'number') {
            const allowed = Object.values(def.choices)
            if (!allowed.includes(value)) {
                prediction.ranges.push({ arg: canonical, value, choices: allowed })
            }
        }
    }
    if (prediction.types.length > 0) {
        prediction.issues.push({
            dimension: 'types',
            message: prediction.types.map(t => `Argument '${t.arg}' for '${resolvedName}' expects ${t.expected}, got ${t.actual}`).join('; ')
        })
    }
    if (prediction.ranges.length > 0) {
        prediction.issues.push({
            dimension: 'ranges',
            message: prediction.ranges.map(r => {
                if (r.choices) {
                    return `Argument '${r.arg}' for '${resolvedName}' value ${r.value} is not one of ${r.choices.join(', ')}`
                }
                return `Argument '${r.arg}' for '${resolvedName}' value ${r.value} outside range [${r.min}, ${r.max}]`
            }).join('; ')
        })
    }

    // Structure predictions (informative when data is available)
    prediction.passes = predictPassesAndOutputs(instance)
    prediction.samplerTopology = predictSamplerTopology(instance)
    if (prediction.samplerTopology && oldInstance) {
        const oldTopology = predictSamplerTopology(oldInstance)
        if (oldTopology) {
            prediction.samplerTopology.changedFrom = {
                internalTextures: oldTopology.internalTextures,
                passInputs: oldTopology.passInputs
            }
        }
    }
    prediction.backendSupport = predictBackendSupport(instance, resolvedName, options.manifest)

    return prediction
}

/**
 * Replace an effect at a specific step index in a compiled program.
 *
 * This function replaces an effect in a compiled DSL program with a new effect.
 * The replacement must be "like for like":
 * - Starting effects can only be replaced with other starting effects
 * - Non-starting effects can only be replaced with other non-starting effects
 *
 * @param {object} compiled - Compiled program from compile()
 * @param {number} stepIndex - The temp index of the step to replace
 * @param {string} newEffectName - The name of the replacement effect
 * @param {object} [newArgs={}] - Optional arguments for the replacement effect
 * @param {object} [options={}] - Options
 * @param {Array<string>} [options.searchOrder] - Namespace search order (defaults to compiled.searchNamespaces)
 * @param {boolean} [options.preflight] - Opt-in: refuse mutation when the candidate's
 *   prediction finds hard issues (shader availability, unknown arguments, type
 *   mismatches, out-of-range values). Without it, behavior is unchanged and the
 *   prediction is returned as `prediction`.
 * @param {object} [options.manifest] - Shader manifest (effects/manifest.json shape) for backend-support prediction
 * @returns {object} { success, program?, prediction?, error? }
 *   - success: boolean indicating if replacement succeeded
 *   - program: the new compiled program (only if success)
 *   - prediction: preflight prediction of the candidate's compatibility dimensions
 *   - error: error message (only if !success)
 */
export function replaceEffect(compiled, stepIndex, newEffectName, newArgs = {}, options = {}) {
    if (!compiled?.plans) {
        return { success: false, error: 'Invalid compiled program: missing plans' }
    }

    const searchOrder = options.searchOrder || compiled.searchNamespaces || []

    // Find the step to replace
    const location = findStepByIndex(compiled, stepIndex)
    if (!location) {
        return { success: false, error: `Step with index ${stepIndex} not found` }
    }

    const { planIndex, chainIndex, step } = location
    const oldEffectName = step.op

    // A step is in "starter position" if it is either:
    // (a) the first step in the chain (chainIndex === 0), OR
    // (b) an inline surface producer — a registered starter effect with no
    //     pipeline predecessor (from === null/undefined), which the compiler
    //     flattened into the chain as a dependency of a surface-type parameter.
    const currentIsStarter = checkIsStarter(step.op, searchOrder)
    const isStarterPosition = chainIndex === 0
        || (currentIsStarter && (step.from === null || step.from === undefined))

    // Check if new effect is a starter
    const newIsStarter = checkIsStarter(newEffectName, searchOrder)

    // Verify the new effect exists
    const newSpec = getEffectSpec(newEffectName, searchOrder)
    if (!newSpec) {
        return { success: false, error: `Effect '${newEffectName}' not found` }
    }

    // Enforce like-for-like replacement
    // If the step is in starter position (first in chain), new effect must be a starter
    // If the step is not in starter position, new effect must NOT be a starter
    if (isStarterPosition && !newIsStarter) {
        return {
            success: false,
            error: `Cannot replace starter effect '${oldEffectName}' with non-starter effect '${newEffectName}'. ` +
                   `The first effect in a chain must be a starting effect.`
        }
    }
    if (!isStarterPosition && newIsStarter) {
        return {
            success: false,
            error: `Cannot replace non-starter effect '${oldEffectName}' with starter effect '${newEffectName}'. ` +
                   `Starting effects can only appear at the beginning of a chain.`
        }
    }

    // Clone the program for immutability
    const newProgram = deepClone(compiled)

    // Build new args with defaults from effect spec
    const finalArgs = {}
    const specArgs = newSpec.args || []

    // First, set defaults for all params
    // Use def.name (DSL parameter name), NOT def.uniform (shader uniform name)
    for (const def of specArgs) {
        if (def.default !== undefined) {
            finalArgs[def.name] = def.default
        }
    }

    // Apply provided args (with rounding for floats - max 3 decimal places)
    for (const [key, value] of Object.entries(newArgs)) {
        if (typeof value === 'number' && !Number.isInteger(value)) {
            finalArgs[key] = Math.round(value * 1000) / 1000
        } else {
            finalArgs[key] = value
        }
    }

    // Get the resolved effect name (with namespace if needed)
    let resolvedNewName = newEffectName
    let effectNamespace = null

    if (newEffectName.includes('.')) {
        // Already namespaced - extract namespace
        const parts = newEffectName.split('.')
        effectNamespace = parts[0]
        // Verify it exists
        if (!ops[newEffectName]) {
            return { success: false, error: `Effect '${newEffectName}' not found` }
        }
    } else {
        // Try to find the namespaced version
        for (const ns of searchOrder) {
            const namespacedName = `${ns}.${newEffectName}`
            if (ops[namespacedName]) {
                resolvedNewName = namespacedName
                effectNamespace = ns
                break
            }
        }
        // If not found in search order, try all registered ops
        if (!effectNamespace) {
            for (const opName of Object.keys(ops)) {
                if (opName.endsWith(`.${newEffectName}`)) {
                    resolvedNewName = opName
                    effectNamespace = opName.split('.')[0]
                    break
                }
            }
        }
    }

    // Preflight prediction of the candidate's compatibility dimensions
    // (availability, arguments, types, ranges, passes, outputs, sampler
    // topology, backend support) BEFORE any mutation, using the resolved
    // namespaced effect name.
    const prediction = predictReplacement(
        resolvedNewName,
        newSpec,
        newArgs,
        getEffectInstance(oldEffectName),
        options
    )
    if (options.preflight === true && prediction.issues.length > 0) {
        const messages = prediction.issues.map(issue => issue.message)
        return {
            success: false,
            error: `Replacement preflight failed: ${messages.join('; ')}`,
            prediction
        }
    }

    // Ensure the namespace is in searchNamespaces so unparser can strip it
    if (effectNamespace && !newProgram.searchNamespaces.includes(effectNamespace)) {
        newProgram.searchNamespaces = [...newProgram.searchNamespaces, effectNamespace]
    }

    // Update the step
    const newStep = newProgram.plans[planIndex].chain[chainIndex]
    newStep.op = resolvedNewName
    newStep.args = finalArgs

    // Update namespace info — reset to clean state for the new effect
    // This clears stale from() overrides from the old step
    newStep.namespace = effectNamespace
        ? { resolved: effectNamespace }
        : null

    return { success: true, program: newProgram, prediction }
}

/**
 * List all steps in a compiled program with their metadata.
 *
 * Useful for understanding the structure of a program before calling replaceEffect.
 *
 * @param {object} compiled - Compiled program from compile()
 * @param {object} [options={}] - Options
 * @param {Array<string>} [options.searchOrder] - Namespace search order
 * @returns {Array<object>} Array of step info objects
 */
export function listSteps(compiled, options = {}) {
    if (!compiled?.plans) return []

    const searchOrder = options.searchOrder || compiled.searchNamespaces || []
    const steps = []

    for (let planIndex = 0; planIndex < compiled.plans.length; planIndex++) {
        const plan = compiled.plans[planIndex]
        if (!plan?.chain) continue

        for (let chainIndex = 0; chainIndex < plan.chain.length; chainIndex++) {
            const step = plan.chain[chainIndex]
            if (step.builtin) continue

            const isStarter = checkIsStarter(step.op, searchOrder)
            const isStarterPosition = chainIndex === 0
                || (isStarter && (step.from === null || step.from === undefined))

            steps.push({
                stepIndex: step.temp,
                planIndex,
                chainIndex,
                effectName: step.op,
                isStarter,
                isStarterPosition,
                canReplaceWithStarter: isStarterPosition,
                canReplaceWithNonStarter: !isStarterPosition,
                args: step.args || {}
            })
        }
    }

    return steps
}

/**
 * Get compatible replacement effects for a given step.
 *
 * Returns a list of effect names that can legally replace the effect at the given step.
 *
 * Each result also carries a `predictions` map keyed by effect name, predicting
 * the candidate's availability, arguments, types, ranges, passes, outputs,
 * sampler topology, and backend support before mutation. Listing-time
 * predictions use empty arguments, so "requires arguments" never blocks:
 * missing no-default arguments are reported informatively and only
 * availability/unknown-argument/type/range findings are hard issues. With the
 * explicit `preflight: true` opt-in, candidates whose prediction found hard
 * issues are moved out of `compatible` into `blocked` with the reasons attached.
 *
 * @param {object} compiled - Compiled program from compile()
 * @param {number} stepIndex - The temp index of the step
 * @param {object} [options={}] - Options
 * @param {Array<string>} [options.searchOrder] - Namespace search order
 * @param {boolean} [options.preflight] - Opt-in strict filtering of candidates with predicted issues
 * @param {object} [options.manifest] - Shader manifest (effects/manifest.json shape) for backend-support prediction
 * @returns {object} { success, compatible?, incompatible?, blocked?, predictions?, error? }
 */
export function getCompatibleReplacements(compiled, stepIndex, options = {}) {
    if (!compiled?.plans) {
        return { success: false, error: 'Invalid compiled program: missing plans' }
    }

    const searchOrder = options.searchOrder || compiled.searchNamespaces || []

    const location = findStepByIndex(compiled, stepIndex)
    if (!location) {
        return { success: false, error: `Step with index ${stepIndex} not found` }
    }

    const { chainIndex, step } = location
    const currentIsStarter = checkIsStarter(step.op, searchOrder)
    const isStarterPosition = chainIndex === 0
        || (currentIsStarter && (step.from === null || step.from === undefined))
    const oldInstance = getEffectInstance(step.op)

    // Collect all registered ops
    const starters = []
    const nonStarters = []
    const predictions = {}

    for (const opName of Object.keys(ops)) {
        const isStarter = checkIsStarter(opName, searchOrder)
        predictions[opName] = predictReplacement(
            opName,
            ops[opName],
            {},
            oldInstance,
            options
        )
        if (isStarter) {
            starters.push(opName)
        } else {
            nonStarters.push(opName)
        }
    }

    if (options.preflight === true) {
        // Opt-in: move candidates whose prediction found hard issues out of
        // the compatible list, with the reason attached.
        const blocked = []
        const filterIssues = (names) => {
            const ok = []
            for (const name of names) {
                if (predictions[name].issues.length > 0) {
                    blocked.push({ effect: name, issues: predictions[name].issues })
                } else {
                    ok.push(name)
                }
            }
            return ok
        }
        if (isStarterPosition) {
            return {
                success: true,
                compatible: filterIssues(starters),
                incompatible: nonStarters,
                blocked,
                predictions
            }
        }
        return {
            success: true,
            compatible: filterIssues(nonStarters),
            incompatible: starters,
            blocked,
            predictions
        }
    }

    // Default (unchanged) classification, plus per-candidate predictions so
    // callers can inspect availability, arguments, types, ranges, passes,
    // outputs, sampler topology, and backend support before mutating.
    if (isStarterPosition) {
        return { success: true, compatible: starters, incompatible: nonStarters, predictions }
    } else {
        return { success: true, compatible: nonStarters, incompatible: starters, predictions }
    }
}

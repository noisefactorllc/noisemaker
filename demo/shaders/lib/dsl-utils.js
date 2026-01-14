/**
 * DSL Utilities for Noisemaker
 *
 * Shared utilities for parsing and extracting information from DSL text.
 * Extracted to avoid circular dependencies between program-state.js and demo-ui.js.
 *
 * @module lib/dsl-utils
 */

import { compile, lex, parse, formatDslError, isDslSyntaxError } from '../../../shaders/src/lang/index.js'

/**
 * @typedef {object} EffectInfo
 * @property {string} effectKey - Full effect identifier (e.g., "synth.noise")
 * @property {string|null} namespace - Effect namespace (e.g., "synth")
 * @property {string} name - Short effect name (e.g., "noise")
 * @property {string} fullName - Full operation name
 * @property {object} args - Resolved argument values
 * @property {object} rawKwargs - Original kwargs from AST (before validation)
 * @property {number} stepIndex - Global step index in the chain
 * @property {number} temp - Temporary texture index for this step
 */

/**
 * Extract effect information from DSL text
 *
 * Parses DSL to extract the chain of effects with their arguments,
 * step indices, and other metadata needed for UI generation.
 *
 * @param {string} dsl - DSL source text
 * @returns {EffectInfo[]} Array of effect info objects, empty array on parse failure
 *
 * @example
 * const effects = extractEffectsFromDsl('noise().grade().write(o0)')
 * // Returns:
 * // [
 * //   { effectKey: 'synth.noise', name: 'noise', stepIndex: 0, ... },
 * //   { effectKey: 'filter.grade', name: 'grade', stepIndex: 1, ... },
 * //   { effectKey: 'render.write', name: 'write', stepIndex: 2, ... }
 * // ]
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

                // Preserve automation bindings even if validation normalized them to scalars
                const rawArgs = originalKwargs[globalStepIndex] || {}
                const args = step.args ? { ...step.args } : {}
                for (const [paramName, rawVal] of Object.entries(rawArgs)) {
                    const isRawAutomation = rawVal && typeof rawVal === 'object' && (
                        rawVal.type === 'Oscillator' || rawVal.type === 'Midi' || rawVal.type === 'Audio' ||
                        rawVal._ast?.type === 'Oscillator' || rawVal._ast?.type === 'Midi' || rawVal._ast?.type === 'Audio'
                    )
                    const currentVal = args[paramName]
                    const isArgAutomation = currentVal && typeof currentVal === 'object' && (
                        currentVal.type === 'Oscillator' || currentVal.type === 'Midi' || currentVal.type === 'Audio' ||
                        currentVal._ast?.type === 'Oscillator' || currentVal._ast?.type === 'Midi' || currentVal._ast?.type === 'Audio'
                    )
                    if (isRawAutomation && !isArgAutomation) {
                        args[paramName] = rawVal
                    }
                }

                effects.push({
                    effectKey: fullOpName,
                    namespace,
                    name: shortName,
                    fullName: fullOpName,
                    args,
                    rawKwargs: rawArgs,
                    stepIndex: globalStepIndex,
                    temp: step.temp
                })
                globalStepIndex++
            }
        }
    } catch (err) {
        if (isDslSyntaxError(err)) {
            console.warn('DSL Syntax Error:\n' + formatDslError(dsl, err))
        } else {
            console.warn('Failed to parse DSL for effect extraction:', err)
        }
    }

    return effects
}

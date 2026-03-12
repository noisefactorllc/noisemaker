/**
 * Manages deprecated effect name aliases.
 *
 * Hidden effects that have been replaced by newer effects register here
 * so the validator can emit deprecation warnings when they are used.
 * The old effects still work — they just warn.
 */

import { ALIAS_EOL_DATE } from './paramAliases.js'

/**
 * Internal registry.  Shape: { [oldOpName]: newEffectName }
 * @type {Object<string, string>}
 */
const registry = Object.create(null)

/**
 * Register a deprecated effect alias.
 *
 * @param {string} oldOpName  Fully-qualified old op name, e.g. 'filter.hs'
 * @param {string} newName    Human-readable replacement name, e.g. 'adjust'
 */
export function registerEffectAlias(oldOpName, newName) {
    registry[oldOpName] = newName
}

/**
 * Check whether an op is a deprecated effect alias.
 *
 * @param {string} opName  Fully-qualified op name
 * @returns {string|null}  Deprecation warning string, or null if not deprecated
 */
export function checkEffectAlias(opName) {
    const newName = registry[opName]
    if (!newName) return null
    const oldName = opName.includes('.') ? opName.split('.').pop() : opName
    return `effect '${oldName}' is deprecated, use '${newName}' instead. Aliases will be removed on ${ALIAS_EOL_DATE}.`
}

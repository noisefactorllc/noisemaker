/**
 * Manages deprecated parameter name aliases for shader effects.
 *
 * Part of the parameter standardization effort. Old param names are
 * remapped to new names at runtime with deprecation warnings. All
 * aliases will be hard-removed on ALIAS_EOL_DATE.
 */

/** Hard removal date for all parameter aliases. */
export const ALIAS_EOL_DATE = '2026-09-01'

/**
 * Internal registry.  Shape: { [opName]: { oldName: newName, ... } }
 * @type {Object<string, Object<string, string>>}
 */
const registry = Object.create(null)

/**
 * Register alias mappings for a given op.
 *
 * @param {string} opName   Fully-qualified op name, e.g. 'synth.noise'
 * @param {Object<string, string>} aliases  { oldParamName: newParamName }
 */
export function registerParamAliases(opName, aliases) {
    if (!registry[opName]) {
        registry[opName] = Object.create(null)
    }
    Object.assign(registry[opName], aliases)
}

/**
 * Resolve any deprecated param names in `kwargs` for the given op,
 * mutating the object in place.
 *
 * - If only the old key is present, it is renamed to the new key.
 * - If both old and new keys are present, the new key's value wins
 *   and the old key is deleted.
 * - A warning string is produced for every alias hit.
 *
 * @param {string} opName   Fully-qualified op name
 * @param {Object}  kwargs  Keyword-argument object to mutate
 * @returns {string[]} Array of deprecation warning strings
 */
export function resolveParamAliases(opName, kwargs) {
    const warnings = []
    const aliases = registry[opName]
    if (!aliases) return warnings

    for (const oldName in aliases) {
        if (!(oldName in kwargs)) continue

        const newName = aliases[oldName]

        // If the new name is NOT already present, migrate the value.
        if (!(newName in kwargs)) {
            kwargs[newName] = kwargs[oldName]
        }

        // Always remove the old key.
        delete kwargs[oldName]

        // Always produce a warning.
        warnings.push(
            `param '${oldName}' is deprecated, use '${newName}' instead. Aliases will be removed on ${ALIAS_EOL_DATE}.`
        )
    }

    return warnings
}

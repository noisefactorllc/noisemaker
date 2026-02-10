/**
 * Validates an Effect Definition against the specification.
 * @param {object} def The effect definition object or class instance.
 * @returns {Array} List of error strings. Empty if valid.
 */
export function validateEffectDefinition(def) {
    const errors = []

    if (!def) {
        return ['Effect definition is null or undefined']
    }

    if (typeof def.name !== 'string' || !def.name) {
        errors.push('Missing or invalid "name" property')
    }

    if (!def.passes || !Array.isArray(def.passes) || def.passes.length === 0) {
        errors.push('Missing or empty "passes" array')
    } else {
        for (let index = 0; index < def.passes.length; index++) {
            const pass = def.passes[index]
            if (!pass.program || typeof pass.program !== 'string') {
                errors.push(`Pass ${index}: Missing "program" string`)
            }
            if (pass.inputs && typeof pass.inputs !== 'object') {
                errors.push(`Pass ${index}: "inputs" must be an object`)
            }
            if (pass.outputs && typeof pass.outputs !== 'object') {
                errors.push(`Pass ${index}: "outputs" must be an object`)
            }
        }
    }

    if (def.globals) {
        if (typeof def.globals !== 'object') {
            errors.push('"globals" must be an object')
        } else {
            for (const [key, spec] of Object.entries(def.globals)) {
                if (!spec.type) {
                    errors.push(`Global '${key}': Missing "type"`)
                }
            }
        }
    }

    return errors
}

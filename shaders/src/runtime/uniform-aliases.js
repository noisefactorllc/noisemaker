/**
 * Pass-level uniform aliases.
 *
 * A pass definition can feed a shader uniform from a differently named global
 * (`uniforms: { layoutMode: "layout" }`). The expander resolves that once, at
 * compile time, and records the mapping on the pass as `uniformAliases`
 * (`{ shaderUniform: globalName }`). The runtime parameter paths write a
 * changed parameter under its own uniform name; this writes it to the aliased
 * shader uniforms too, so a live change reaches the shader exactly as a
 * recompile would.
 *
 * @module runtime/uniform-aliases
 */

/**
 * @param {object} pass - Pipeline graph pass
 * @param {string} paramName - Global parameter name
 * @param {string} uniformName - The parameter's own uniform name
 * @param {*} value - Converted uniform value
 * @returns {boolean} True if any aliased uniform was written
 */
export function writeUniformAliases(pass, paramName, uniformName, value) {
    const aliases = pass?.uniformAliases
    if (!aliases || !pass.uniforms) return false
    let wrote = false
    for (const [shaderName, globalName] of Object.entries(aliases)) {
        if (globalName !== paramName && globalName !== uniformName) continue
        pass.uniforms[shaderName] = Array.isArray(value) ? value.slice() : value
        wrote = true
    }
    return wrote
}

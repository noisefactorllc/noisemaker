/**
 * DSL Unparser - Converts AST back to source code.
 *
 * This module takes a parsed/validated AST and serializes it back to valid DSL source.
 * It preserves the semantic structure while regenerating the text representation.
 */

/**
 * Map oscillator type number to oscKind enum name
 */
const oscKindNames = ['sine', 'tri', 'saw', 'sawInv', 'square', 'noise']

/**
 * Format an AST expression node back to DSL
            if (expr.oscType?.type === 'Ident') {
                typeName = expr.oscType.name;
            } else if (expr.oscType?.type === 'Member') {
                typeName = expr.oscType.path[expr.oscType.path.length - 1];
            }
            const parts = [`type: oscKind.${typeName}`];
            if (expr.min?.type === 'Number' && expr.min.value !== 0) {
                parts.push(`min: ${expr.min.value}`);
            }
            if (expr.max?.type === 'Number' && expr.max.value !== 1) {
                parts.push(`max: ${expr.max.value}`);
            }
            if (expr.speed?.type === 'Number' && expr.speed.value !== 1) {
                parts.push(`speed: ${expr.speed.value}`);
            }
            if (expr.offset?.type === 'Number' && expr.offset.value !== 0) {
                parts.push(`offset: ${expr.offset.value}`);
            }
            if (expr.seed?.type === 'Number' && expr.seed.value !== 1) {
                parts.push(`seed: ${expr.seed.value}`);
            }
            return `osc(${parts.join(', ')})`;
        }
        default:
            // Fallback for other expression types
            return String(expr);
    }
}

/**
 * Format an oscillator value for DSL output
 * @param {object} osc - Oscillator configuration object
 * @returns {string} DSL representation of the oscillator
 */
function formatOscillator(osc) {
    const typeName = oscKindNames[osc.oscType] || 'sine'
    const parts = [`type: oscKind.${typeName}`]

    // Only include non-default values
    if (osc.min !== 0) {
        parts.push(`min: ${osc.min}`)
    }
    if (osc.max !== 1) {
        parts.push(`max: ${osc.max}`)
    }
    if (osc.speed !== 1) {
        parts.push(`speed: ${osc.speed}`)
    }
    if (osc.offset !== 0) {
        parts.push(`offset: ${osc.offset}`)
    }
    if (osc.seed !== 1 && osc.oscType === 5) {  // Only include seed for noise type
        parts.push(`seed: ${osc.seed}`)
    }

    return `osc(${parts.join(', ')})`
}

/**
 * Format an enum name - remove 'Enum' suffix if present
 * @param {string} name - Enum constant name
 * @returns {string} Cleaned name
 */
function formatEnumName(name) {
    if (name.endsWith('Enum')) {
        return name.slice(0, -4)
    }
    return name
}

/**
 * Format a value for DSL output
 * @param {any} value - The value to format
 * @param {object} spec - Optional parameter spec for type hints
 * @param {object} options - Optional options { customFormatter, enums }
 * @returns {string} Formatted string representation
 */
function formatValue(value, spec, options = {}) {
    const { customFormatter, enums = {} } = typeof options === 'function'
        ? { customFormatter: options } // Legacy: 3rd arg was customFormatter
        : options

    // Try custom formatter first if provided
    if (customFormatter) {
        const custom = customFormatter(value, spec)
        if (custom !== null && custom !== undefined) {
            return custom
        }
    }

    if (value === null || value === undefined) {
        return 'null'
    }

    // Handle variable reference marker - output just the variable name
    if (value && typeof value === 'object' && value._varRef) {
        return value._varRef
    }

    if (typeof value === 'boolean') {
        return value ? 'true' : 'false'
    }

    const type = spec?.type

    // Handle inline choices - look up enum name from numeric value
    if (spec?.choices && typeof value === 'number') {
        for (const [name, val] of Object.entries(spec.choices)) {
            if (name.endsWith(':')) continue // skip group labels
            if (val === value) {
                return formatEnumName(name)
            }
        }
    }

    // Handle global enum reference (e.g., spec.enum = "palette")
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

    // Handle surface type
    if (type === 'surface') {
        // Handle object surface references (e.g., {kind: 'output', name: 'o1'})
        if (value && typeof value === 'object' && value.name) {
            if (value.name === 'none') {
                return 'none'
            }
            return `read(${value.name})`
        }
        if (typeof value !== 'string' || value.length === 0) {
            const defaultSurface = spec?.default || 'inputTex'
            if (defaultSurface === 'none') {
                return 'none'
            }
            return `read(${defaultSurface})`
        }
        if (value === 'none') {
            return 'none'
        }
        if (value.includes('(')) {
            return value
        }
        return `read(${value})`
    }

    // Handle volume type
    if (type === 'volume') {
        if (value && typeof value === 'object' && value.name) {
            return value.name
        }
        if (typeof value !== 'string' || value.length === 0) {
            return spec?.default || 'vol0'
        }
        return value
    }

    // Handle geometry type
    if (type === 'geometry') {
        if (value && typeof value === 'object' && value.name) {
            return value.name
        }
        if (typeof value !== 'string' || value.length === 0) {
            return spec?.default
        }
        return value
    }

    // Handle member type (enum path already formatted)
    if (type === 'member') {
        return value
    }

    // Handle palette type
    if (type === 'palette') {
        return value
    }

    if (typeof value === 'number') {
        // Format numbers nicely - limit to 3 decimal places
        if (Number.isInteger(value)) {
            return String(value)
        }
        // Round to 3 decimal places
        const rounded = Math.round(value * 1000) / 1000
        return String(rounded)
    }

    if (typeof value === 'string') {
        // Strings are identifiers or enum paths - never quote them
        return value
    }

    // Handle both regular arrays and typed arrays (Float32Array, etc.)
    const isArrayLike = Array.isArray(value) || ArrayBuffer.isView(value)
    if (isArrayLike) {
        // Convert typed arrays to regular arrays for processing
        const arr = Array.isArray(value) ? value : Array.from(value)

        // Handle vec2 explicitly if spec says so
        if (type === 'vec2' && arr.length === 2 && arr.every(v => typeof v === 'number')) {
            return `vec2(${arr.map(v => formatValue(v, null, options)).join(', ')})`
        }

        // Handle vec3 explicitly if spec says so
        if (type === 'vec3' && arr.length === 3 && arr.every(v => typeof v === 'number')) {
            return `vec3(${arr.map(v => formatValue(v, null, options)).join(', ')})`
        }

        // Handle vec4 explicitly if spec says so - format as hex color
        if (type === 'vec4' && arr.length === 4 && arr.every(v => typeof v === 'number')) {
            const toHex = (n) => Math.round(n * 255).toString(16).padStart(2, '0')
            return `#${toHex(arr[0])}${toHex(arr[1])}${toHex(arr[2])}${toHex(arr[3])}`
        }

        // Infer type from array length for numeric arrays
        if (arr.every(v => typeof v === 'number')) {
            if (arr.length === 2) {
                return `vec2(${arr.map(v => formatValue(v, null, options)).join(', ')})`
            }
            if (arr.length === 3) {
                return `vec3(${arr.map(v => formatValue(v, null, options)).join(', ')})`
            }
            if (arr.length === 4) {
                // 4 elements - hex color
                const toHex = (n) => Math.max(0, Math.min(255, Math.round(n * 255))).toString(16).padStart(2, '0')
                return `#${toHex(arr[0])}${toHex(arr[1])}${toHex(arr[2])}${toHex(arr[3])}`
            }
        }
        // Fallback for other arrays - this should not happen in valid DSL
        return `vec3(${arr.slice(0, 3).map(v => formatValue(v, null, options)).join(', ')})`
    }

    if (typeof value === 'object') {
        // Handle oscillator configuration
        if (value.oscillator === true) {
            return formatOscillator(value)
        }
        // Handle oscillator AST from _ast property
        if (value._ast && value._ast.type === 'Oscillator') {
            return formatOscillator(value)
        }
        // Handle special AST node types
        if (value.type === 'Oscillator') {
            // This is a raw Oscillator AST node - format it
            const typePath = value.oscType
            let typeName = 'sine'
            if (typePath && typePath.type === 'Member' && typePath.path) {
                typeName = typePath.path[typePath.path.length - 1]
            } else if (typePath && typePath.type === 'Ident') {
                typeName = typePath.name
            }
            const parts = [`type: oscKind.${typeName}`]
            if (value.min && value.min.type === 'Number' && value.min.value !== 0) {
                parts.push(`min: ${value.min.value}`)
            }
            if (value.max && value.max.type === 'Number' && value.max.value !== 1) {
                parts.push(`max: ${value.max.value}`)
            }
            if (value.speed && value.speed.type === 'Number' && value.speed.value !== 1) {
                parts.push(`speed: ${value.speed.value}`)
            }
            if (value.offset && value.offset.type === 'Number' && value.offset.value !== 0) {
                parts.push(`offset: ${value.offset.value}`)
            }
            if (value.seed && value.seed.type === 'Number' && value.seed.value !== 1) {
                parts.push(`seed: ${value.seed.value}`)
            }
            return `osc(${parts.join(', ')})`
        }
        // Handle Read node (pipeline built-in)
        if (value.type === 'Read') {
            const surfaceName = value.surface?.name || value.surface
            return `read(${surfaceName})`
        }
        // Handle Read3D node (pipeline built-in)
        // 1 arg: read3d(vol0) - for param use
        // 2 args: read3d(vol0, geo0) - starter node
        if (value.type === 'Read3D') {
            const tex3dName = value.tex3d?.name || value.tex3d
            if (value.geo) {
                const geoName = value.geo?.name || value.geo
                return `read3d(${tex3dName}, ${geoName})`
            } else {
                return `read3d(${tex3dName})`
            }
        }
        if (value.type === 'OutputRef') {
            return value.name
        }
        if (value.type === 'SourceRef') {
            return value.name
        }
        if (value.type === 'VolRef') {
            return value.name
        }
        if (value.type === 'GeoRef') {
            return value.name
        }
        if (value.type === 'Member') {
            return value.path.join('.')
        }
        if (value.type === 'Number') {
            return formatValue(value.value, spec, options)
        }
        if (value.type === 'Boolean') {
            return value.value ? 'true' : 'false'
        }
        // Surface reference - wrap in read() if spec indicates surface type
        if (value.kind === 'output' || value.kind === 'feedback' || value.kind === 'source') {
            if (spec && spec.type === 'surface') {
                return `read(${value.name})`
            }
            return value.name
        }
    }

    // SAFETY: Never let arrays become raw comma-separated strings
    // This catches any array-like that slipped through earlier checks
    if (value && typeof value === 'object' && typeof value.length === 'number') {
        const arr = Array.from(value)
        if (arr.length >= 2 && arr.length <= 4 && arr.every(v => typeof v === 'number')) {
            if (arr.length === 2) return `vec2(${arr.join(', ')})`
            if (arr.length === 3) return `vec3(${arr.join(', ')})`
            // 4 elements - hex color
            const toHex = (n) => Math.max(0, Math.min(255, Math.round(n * 255))).toString(16).padStart(2, '0')
            return `#${toHex(arr[0])}${toHex(arr[1])}${toHex(arr[2])}${toHex(arr[3])}`
        }
    }

    return String(value)
}

/**
 * Unparse a Call node
 * @param {object} call - Call AST node
 * @param {object} options - Unparse options (includes customFormatter, multilineKwargs)
 * @returns {string} DSL source for the call
 */
function unparseCall(call, options = {}) {
    const name = call.name
    const parts = []
    const specs = options.specs || {}
    const multilineKwargs = options.multilineKwargs !== false // default true
    const baseIndent = Number.isFinite(options.indent) ? options.indent : 0
    const parentIndent = ' '.repeat(Math.max(0, baseIndent))
    const childIndent = ' '.repeat(Math.max(0, baseIndent + 2))

    // Handle kwargs (named arguments)
    if (call.kwargs && Object.keys(call.kwargs).length > 0) {
        for (const [key, value] of Object.entries(call.kwargs)) {
            // Skip _skip: false
            if (key === '_skip' && value === false) continue

            // Get spec from options if available
            const spec = specs[key] || null

            // Check against default value
            if (spec && spec.default !== undefined) {
                const formattedValue = formatValue(value, spec, options)
                const formattedDefault = formatValue(spec.default, spec, options)

                // For surface params, 'none' must always be explicit when set
                // (so the expander binds the blank texture)
                const isExplicitNone = spec.type === 'surface' && formattedValue === 'none'

                if (formattedValue === formattedDefault && !isExplicitNone) {
                    continue
                }
            }

            parts.push(`${key}: ${formatValue(value, spec, options)}`)
        }
    }

    // Handle positional args
    if (call.args && call.args.length > 0) {
        for (const arg of call.args) {
            parts.push(formatValue(arg, null, options))
        }
    }

    // Use multiline formatting only if more than 2 kwargs; 1-2 params stay inline
    const hasKwargs = call.kwargs && Object.keys(call.kwargs).length > 0 && parts.length > 0
    if (multilineKwargs && hasKwargs && parts.length > 2) {
        // Multiline format: args indented 1 level (2 spaces) below parent's indent level
        // Parent indent is 0 for first call in chain, 2 for subsequent chained calls.
        return `${name}(\n${parts.map(p => `${childIndent}${p}`).join(',\n')}\n${parentIndent})`
    }

    return `${name}(${parts.join(', ')})`
}

/**
 * Unparse a chain of calls
 * @param {Array} chain - Array of Call nodes
 * @param {object} options - Unparse options
 * @returns {string} DSL source for the chain
 */
function unparseChain(chain, options = {}) {
    const parts = chain.map((call, idx) => unparseCall(call, { ...options, indent: idx === 0 ? 0 : 2 }))
    // Join with line break after closing paren, 2-space indent on next line
    return parts.join('\n  .')
}

/**
 * Unparse a plan (statement with chain and optional output)
 * @param {object} plan - Plan object from validator
 * @param {object} options - Unparse options
 * @returns {string} DSL source for the plan
 */
function unparsePlan(plan, options = {}) {
    if (!plan.chain || plan.chain.length === 0) {
        return ''
    }

    // Build chains from steps
    // read() is a starter node - it MUST start a new chain, never be chained inline
    const chains = []  // Array of chain arrays
    let currentChain = []

    for (const step of plan.chain) {
        // Handle built-in _read step - MUST start a new chain
        if (step.op === '_read' && step.builtin) {
            // Flush current chain if not empty
            if (currentChain.length > 0) {
                chains.push(currentChain)
                currentChain = []
            }
            const texName = step.args?.tex?.name || step.args?.tex
            currentChain.push(`read(${texName})`)
            continue
        }
        // Handle built-in _read3d step - MUST start a new chain
        if (step.op === '_read3d' && step.builtin) {
            // Flush current chain if not empty
            if (currentChain.length > 0) {
                chains.push(currentChain)
                currentChain = []
            }
            const tex3dName = step.args?.tex3d?.name || step.args?.tex3d
            const geoName = step.args?.geo?.name || step.args?.geo
            currentChain.push(`read3d(${tex3dName}, ${geoName})`)
            continue
        }
        // Handle built-in _write step (mid-chain writes)
        if (step.op === '_write' && step.builtin) {
            const texName = step.args?.tex?.name || step.args?.tex
            currentChain.push(`write(${texName})`)
            continue
        }

        const call = {
            name: step.op,
            kwargs: {},
            args: []
        }

        // Convert step.args back to kwargs format
        if (step.args) {
            for (const [key, value] of Object.entries(step.args)) {
                // Skip internal properties
                if (key === 'from' || key === 'temp') continue

                // Handle surface references
                if (value && typeof value === 'object' && value.kind) {
                    call.kwargs[key] = value.name
                } else {
                    call.kwargs[key] = value
                }
            }
        }

        currentChain.push(unparseCall(call, { ...options, indent: currentChain.length === 0 ? 0 : 2 }))
    }

    // Flush final chain
    if (currentChain.length > 0) {
        chains.push(currentChain)
    }

    // Join each chain's parts with line break and 2-space indent, then join chains with blank line
    let result = chains.map(chain => chain.join('\n  .')).join('\n\n')

    // Check if chain already ends with a _write step (chainable writes are now inline)
    const lastStep = plan.chain[plan.chain.length - 1]
    const chainEndsWithWrite = lastStep && lastStep.builtin && lastStep.op === '_write'

    // Add write directive only if chain doesn't already end with _write
    if (plan.write && !chainEndsWithWrite) {
        result += `\n  .write(${plan.write})`
    }
    // Add write3d directive
    if (plan.write3d) {
        const tex3d = plan.write3d.tex3d?.name || plan.write3d.tex3d
        const geo = plan.write3d.geo?.name || plan.write3d.geo
        result += `\n  .write3d(${tex3d}, ${geo})`
    }

    return result
}

/**
 * Unparse an entire program
 * @param {object} compiled - Compiled result from compile()
 * @param {object} overrides - Map of stepIndex -> parameter overrides
 * @param {object} options - Unparse options
 *   - customFormatter: function(value, spec) => string|null
 *   - getEffectDef: function(effectName, namespace) => effectDef|null
 * @returns {string} Complete DSL source
 */
export function unparse(compiled, overrides = {}, options = {}) {
    const lines = []
    const getEffectDef = options.getEffectDef || null
    const searchNamespaces = compiled.searchNamespaces || []

    // Add search directive if present (with two line breaks after)
    if (searchNamespaces.length > 0) {
        lines.push(`search ${searchNamespaces.join(', ')}`)
        lines.push('') // First blank line after search
    }

    // Track global step index across all plans
    let globalStepIndex = 0

    // Process each plan
    const plans = compiled.plans || []
    for (let planIndex = 0; planIndex < plans.length; planIndex++) {
        const plan = plans[planIndex]
        if (!plan.chain || plan.chain.length === 0) continue

        // Build chains from steps
        // read() is a starter node - it MUST start a new chain, never be chained inline
        const chains = []  // Array of chain arrays
        let currentChain = []

        for (const step of plan.chain) {
            // Handle builtin read operations - MUST start a new chain
            if (step.builtin && step.op === '_read') {
                // Flush current chain if not empty
                if (currentChain.length > 0) {
                    chains.push(currentChain)
                    currentChain = []
                }
                const texName = step.args?.tex?.name || step.args?.tex
                currentChain.push(`read(${texName})`)
                globalStepIndex++
                continue
            }
            if (step.builtin && step.op === '_read3d') {
                // Flush current chain if not empty
                if (currentChain.length > 0) {
                    chains.push(currentChain)
                    currentChain = []
                }
                const tex3d = step.args?.tex3d?.name || step.args?.tex3d
                const geo = step.args?.geo?.name || step.args?.geo
                currentChain.push(`read3d(${tex3d}, ${geo})`)
                globalStepIndex++
                continue
            }
            // Handle builtin write operations (mid-chain writes)
            if (step.builtin && step.op === '_write') {
                const texName = step.args?.tex?.name || step.args?.tex
                currentChain.push(`write(${texName})`)
                globalStepIndex++
                continue
            }

            // Check for parameter overrides for this step
            const stepOverrides = overrides[globalStepIndex] || {}

            // Get effect definition if callback provided
            let effectDef = null
            if (getEffectDef) {
                const namespace = step.namespace?.namespace || step.namespace?.resolved || null
                effectDef = getEffectDef(step.op, namespace)
            }

            // Determine the call name - strip namespace prefix if it's in search namespaces
            let callName = step.op
            for (const ns of searchNamespaces) {
                const prefix = `${ns}.`
                if (callName.startsWith(prefix)) {
                    callName = callName.slice(prefix.length)
                    break
                }
            }

            const call = {
                name: callName,
                kwargs: {},
                args: []
            }

            // Start with original args (already keyed by param names)
            if (step.args) {
                for (const [key, value] of Object.entries(step.args)) {
                    // Skip internal properties
                    if (key === 'from' || key === 'temp') continue

                    // Skip _skip: false (only include when true)
                    if (key === '_skip' && value !== true) continue

                    // Handle surface references
                    if (value && typeof value === 'object' && value.kind) {
                        call.kwargs[key] = value.name
                    } else {
                        call.kwargs[key] = value
                    }
                }
            }

            // Apply overrides
            for (const [key, value] of Object.entries(stepOverrides)) {
                call.kwargs[key] = value
            }

            // Build specs map from effect definition
            const specs = effectDef?.globals || {}

            currentChain.push(unparseCall(call, { ...options, specs, indent: currentChain.length === 0 ? 0 : 2 }))
            globalStepIndex++
        }

        // Flush final chain
        if (currentChain.length > 0) {
            chains.push(currentChain)
        }

        // Join each chain's parts with line break and 2-space indent
        // Then join chains with blank line (read() starts new chain)
        let line = chains.map(chain => chain.join('\n  .')).join('\n\n')

        // Check if chain already ends with a _write step (chainable writes are now inline)
        const lastStep = plan.chain[plan.chain.length - 1]
        const chainEndsWithWrite = lastStep && lastStep.builtin && lastStep.op === '_write'

        // Add write directive only if chain doesn't already end with _write
        if (plan.write && !chainEndsWithWrite) {
            const writeName = typeof plan.write === 'string' ? plan.write : plan.write.name
            line += `\n  .write(${writeName})`
        }
        // Add write3d directive
        if (plan.write3d) {
            const tex3d = plan.write3d.tex3d?.name || plan.write3d.tex3d
            const geo = plan.write3d.geo?.name || plan.write3d.geo
            line += `\n  .write3d(${tex3d}, ${geo})`
        }

        lines.push(line)

        // Add blank line after chain statement (two line breaks between chains)
        // Don't add after the last plan
        if (planIndex < plans.length - 1) {
            lines.push('')
        }
    }

    // Add render directive if present (surface name: o0-o7)
    if (compiled.render) {
        lines.push('')
        lines.push(`render(${compiled.render})`)
    }

    return lines.join('\n')
}

/**
 * Apply parameter updates to a compiled DSL and regenerate source
 * @param {string} originalDsl - Original DSL source
 * @param {object} compile - The compile function
 * @param {object} parameterUpdates - Map of stepIndex -> {paramName: value}
 * @returns {string} Updated DSL source
 */
export function applyParameterUpdates(originalDsl, compileFn, parameterUpdates) {
    // Parse the original DSL
    const compiled = compileFn(originalDsl)
    if (!compiled || !compiled.plans) {
        return originalDsl
    }

    // Extract search namespaces from original source
    const searchMatch = originalDsl.match(/^search\s+(\S.*?)$/m)
    if (searchMatch) {
        compiled.searchNamespaces = searchMatch[1].split(/\s*,\s*/)
    }

    // Generate new source with overrides
    return unparse(compiled, parameterUpdates, {})
}

export { formatValue, unparseCall, unparseChain, unparsePlan }

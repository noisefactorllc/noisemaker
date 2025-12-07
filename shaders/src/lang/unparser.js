/**
 * DSL Unparser - Converts AST back to source code.
 * 
 * This module takes a parsed/validated AST and serializes it back to valid DSL source.
 * It preserves the semantic structure while regenerating the text representation.
 */

/**
 * Map oscillator type number to oscKind enum name
 */
const oscKindNames = ['sine', 'tri', 'saw', 'sawInv', 'square', 'noise'];

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
    const typeName = oscKindNames[osc.oscType] || 'sine';
    const parts = [`type: oscKind.${typeName}`];
    
    // Only include non-default values
    if (osc.min !== 0) {
        parts.push(`min: ${osc.min}`);
    }
    if (osc.max !== 1) {
        parts.push(`max: ${osc.max}`);
    }
    if (osc.speed !== 1) {
        parts.push(`speed: ${osc.speed}`);
    }
    if (osc.offset !== 0) {
        parts.push(`offset: ${osc.offset}`);
    }
    if (osc.seed !== 1 && osc.oscType === 5) {  // Only include seed for noise type
        parts.push(`seed: ${osc.seed}`);
    }
    
    return `osc(${parts.join(', ')})`;
}

/**
 * Format a value for DSL output
 * @param {any} value - The value to format
 * @param {object} spec - Optional parameter spec for type hints
 * @param {function} customFormatter - Optional custom formatter function(value, spec) => string|null
 * @returns {string} Formatted string representation
 */
function formatValue(value, spec, customFormatter) {
    // Try custom formatter first if provided
    if (customFormatter) {
        const custom = customFormatter(value, spec);
        if (custom !== null && custom !== undefined) {
            return custom;
        }
    }
    
    if (value === null || value === undefined) {
        return 'null';
    }
    
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    
    if (typeof value === 'number') {
        // Format numbers nicely - avoid excessive precision
        if (Number.isInteger(value)) {
            return String(value);
        }
        // Round to reasonable precision
        const rounded = Math.round(value * 1000000) / 1000000;
        return String(rounded);
    }
    
    if (typeof value === 'string') {
        // Check if it's an enum path (contains dots and no spaces)
        if (value.includes('.') && !value.includes(' ')) {
            return value; // Enum path, no quotes
        }
        // Regular string, quote it
        return `"${value.replace(/"/g, '\\"')}"`;
    }
    
    if (Array.isArray(value)) {
        // Color array [r, g, b] or [r, g, b, a]
        if (value.length >= 3 && value.length <= 4 && value.every(v => typeof v === 'number')) {
            // Convert to hex color
            const toHex = (n) => {
                const clamped = Math.max(0, Math.min(255, Math.round(n * 255)));
                return clamped.toString(16).padStart(2, '0');
            };
            const hex = `#${toHex(value[0])}${toHex(value[1])}${toHex(value[2])}`;
            return hex;
        }
        return `[${value.map(v => formatValue(v, null, customFormatter)).join(', ')}]`;
    }
    
    if (typeof value === 'object') {
        // Handle oscillator configuration
        if (value.oscillator === true) {
            return formatOscillator(value);
        }
        // Handle oscillator AST from _ast property
        if (value._ast && value._ast.type === 'Oscillator') {
            return formatOscillator(value);
        }
        // Handle special AST node types
        if (value.type === 'Oscillator') {
            // This is a raw Oscillator AST node - format it
            const typePath = value.oscType;
            let typeName = 'sine';
            if (typePath && typePath.type === 'Member' && typePath.path) {
                typeName = typePath.path[typePath.path.length - 1];
            } else if (typePath && typePath.type === 'Ident') {
                typeName = typePath.name;
            }
            const parts = [`type: oscKind.${typeName}`];
            if (value.min && value.min.type === 'Number' && value.min.value !== 0) {
                parts.push(`min: ${value.min.value}`);
            }
            if (value.max && value.max.type === 'Number' && value.max.value !== 1) {
                parts.push(`max: ${value.max.value}`);
            }
            if (value.speed && value.speed.type === 'Number' && value.speed.value !== 1) {
                parts.push(`speed: ${value.speed.value}`);
            }
            if (value.offset && value.offset.type === 'Number' && value.offset.value !== 0) {
                parts.push(`offset: ${value.offset.value}`);
            }
            if (value.seed && value.seed.type === 'Number' && value.seed.value !== 1) {
                parts.push(`seed: ${value.seed.value}`);
            }
            return `osc(${parts.join(', ')})`;
        }
        // Handle Read node (pipeline built-in)
        if (value.type === 'Read') {
            const surfaceName = value.surface?.name || value.surface;
            return `read(${surfaceName})`;
        }
        // Handle Read3D node (pipeline built-in)
        if (value.type === 'Read3D') {
            const tex3dName = value.tex3d?.name || value.tex3d;
            const geoName = value.geo?.name || value.geo;
            return `read3d(${tex3dName}, ${geoName})`;
        }
        if (value.type === 'OutputRef') {
            return value.name;
        }
        if (value.type === 'FeedbackRef') {
            return value.name;
        }
        if (value.type === 'SourceRef') {
            return value.name;
        }
        if (value.type === 'Member') {
            return value.path.join('.');
        }
        if (value.type === 'Number') {
            return formatValue(value.value, spec, customFormatter);
        }
        if (value.type === 'String') {
            return formatValue(value.value, spec, customFormatter);
        }
        if (value.type === 'Boolean') {
            return value.value ? 'true' : 'false';
        }
        // Surface reference - wrap in src() if spec indicates surface type
        if (value.kind === 'output' || value.kind === 'feedback' || value.kind === 'source') {
            if (spec && spec.type === 'surface') {
                return `src(${value.name})`;
            }
            return value.name;
        }
    }
    
    return String(value);
}

/**
 * Unparse a Call node
 * @param {object} call - Call AST node
 * @param {object} options - Unparse options (includes customFormatter)
 * @returns {string} DSL source for the call
 */
function unparseCall(call, options = {}) {
    const name = call.name;
    const parts = [];
    const customFormatter = options.customFormatter || null;
    const specs = options.specs || {};
    
    // Handle kwargs (named arguments)
    if (call.kwargs && Object.keys(call.kwargs).length > 0) {
        for (const [key, value] of Object.entries(call.kwargs)) {
            // Skip _skip: false
            if (key === '_skip' && value === false) continue;

            // Get spec from options if available
            const spec = specs[key] || null;

            // Check against default value
            if (spec && spec.default !== undefined) {
                const formattedValue = formatValue(value, spec, customFormatter);
                const formattedDefault = formatValue(spec.default, spec, customFormatter);
                
                if (formattedValue === formattedDefault) {
                    continue;
                }
            }

            parts.push(`${key}: ${formatValue(value, spec, customFormatter)}`);
        }
    }
    
    // Handle positional args
    if (call.args && call.args.length > 0) {
        for (const arg of call.args) {
            parts.push(formatValue(arg, null, customFormatter));
        }
    }
    
    return `${name}(${parts.join(', ')})`;
}

/**
 * Unparse a chain of calls
 * @param {Array} chain - Array of Call nodes
 * @param {object} options - Unparse options
 * @returns {string} DSL source for the chain
 */
function unparseChain(chain, options = {}) {
    return chain.map(call => unparseCall(call, options)).join('.');
}

/**
 * Unparse a plan (statement with chain and optional output)
 * @param {object} plan - Plan object from validator
 * @param {object} options - Unparse options
 * @returns {string} DSL source for the plan
 */
function unparsePlan(plan, options = {}) {
    if (!plan.chain || plan.chain.length === 0) {
        return '';
    }
    
    let result = '';
    
    // Build chain from steps
    const callParts = [];
    for (const step of plan.chain) {
        // Handle built-in _read step
        if (step.op === '_read' && step.builtin) {
            const texName = step.args?.tex?.name || step.args?.tex;
            callParts.push(`read(${texName})`);
            continue;
        }
        // Handle built-in _read3d step
        if (step.op === '_read3d' && step.builtin) {
            const tex3dName = step.args?.tex3d?.name || step.args?.tex3d;
            const geoName = step.args?.geo?.name || step.args?.geo;
            callParts.push(`read3d(${tex3dName}, ${geoName})`);
            continue;
        }
        
        const call = {
            name: step.op,
            kwargs: {},
            args: []
        };
        
        // Convert step.args back to kwargs format
        if (step.args) {
            for (const [key, value] of Object.entries(step.args)) {
                // Skip internal properties
                if (key === 'from' || key === 'temp') continue;
                
                // Handle surface references
                if (value && typeof value === 'object' && value.kind) {
                    call.kwargs[key] = value.name;
                } else {
                    call.kwargs[key] = value;
                }
            }
        }
        
        callParts.push(unparseCall(call, options));
    }
    
    result = callParts.join('.');
    
    // Add write directive
    if (plan.write) {
        result += `.write(${plan.write})`;
    }
    // Add write3d directive
    if (plan.write3d) {
        const tex3d = plan.write3d.tex3d?.name || plan.write3d.tex3d;
        const geo = plan.write3d.geo?.name || plan.write3d.geo;
        result += `.write3d(${tex3d}, ${geo})`;
    }
    
    return result;
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
    const lines = [];
    const customFormatter = options.customFormatter || null;
    const getEffectDef = options.getEffectDef || null;
    const searchNamespaces = compiled.searchNamespaces || [];
    
    // Add search directive if present
    if (searchNamespaces.length > 0) {
        lines.push(`search ${searchNamespaces.join(', ')}`);
    }
    
    // Track global step index across all plans
    let globalStepIndex = 0;
    
    // Process each plan
    for (const plan of (compiled.plans || [])) {
        if (!plan.chain || plan.chain.length === 0) continue;
        
        const callParts = [];
        
        for (const step of plan.chain) {
            // Handle builtin read operations specially
            if (step.builtin && step.op === '_read') {
                const texName = step.args?.tex?.name || step.args?.tex;
                callParts.push(`read(${texName})`);
                globalStepIndex++;
                continue;
            }
            if (step.builtin && step.op === '_read3d') {
                const tex3d = step.args?.tex3d?.name || step.args?.tex3d;
                const geo = step.args?.geo?.name || step.args?.geo;
                callParts.push(`read3d(${tex3d}, ${geo})`);
                globalStepIndex++;
                continue;
            }
            
            // Check for parameter overrides for this step
            const stepOverrides = overrides[globalStepIndex] || {};
            
            // Get effect definition if callback provided
            let effectDef = null;
            if (getEffectDef) {
                const namespace = step.namespace?.namespace || step.namespace?.resolved || null;
                effectDef = getEffectDef(step.op, namespace);
            }
            
            // Determine the call name - strip namespace prefix if it's in search namespaces
            let callName = step.op;
            for (const ns of searchNamespaces) {
                const prefix = `${ns}.`;
                if (callName.startsWith(prefix)) {
                    callName = callName.slice(prefix.length);
                    break;
                }
            }
            
            const call = {
                name: callName,
                kwargs: {},
                args: []
            };
            
            // Build reverse mapping from uniform names to param names
            const uniformToParam = {};
            if (effectDef?.globals) {
                for (const [paramName, spec] of Object.entries(effectDef.globals)) {
                    if (spec.uniform && spec.uniform !== paramName) {
                        uniformToParam[spec.uniform] = paramName;
                    }
                }
            }
            
            // Start with original args
            if (step.args) {
                for (const [key, value] of Object.entries(step.args)) {
                    // Skip internal properties
                    if (key === 'from' || key === 'temp') continue;
                    
                    // Skip _skip: false (only include when true)
                    if (key === '_skip' && value !== true) continue;
                    
                    // Translate uniform name back to param name if needed
                    const paramKey = uniformToParam[key] || key;
                    
                    // Handle surface references
                    if (value && typeof value === 'object' && value.kind) {
                        call.kwargs[paramKey] = value.name;
                    } else {
                        call.kwargs[paramKey] = value;
                    }
                }
            }
            
            // Apply overrides
            for (const [key, value] of Object.entries(stepOverrides)) {
                call.kwargs[key] = value;
            }
            
            // Build specs map from effect definition
            const specs = effectDef?.globals || {};
            
            callParts.push(unparseCall(call, { customFormatter, specs }));
            globalStepIndex++;
        }
        
        let line = callParts.join('.');
        
        // Add write directive
        if (plan.write) {
            const writeName = typeof plan.write === 'string' ? plan.write : plan.write.name;
            line += `.write(${writeName})`;
        }
        // Add write3d directive
        if (plan.write3d) {
            const tex3d = plan.write3d.tex3d?.name || plan.write3d.tex3d;
            const geo = plan.write3d.geo?.name || plan.write3d.geo;
            line += `.write3d(${tex3d}, ${geo})`;
        }
        
        lines.push(line);
    }
    
    // Add render directive if present
    if (compiled.render) {
        lines.push(`render(${compiled.render.name})`);
    }
    
    return lines.join('\n');
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
    const compiled = compileFn(originalDsl);
    if (!compiled || !compiled.plans) {
        return originalDsl;
    }
    
    // Extract search namespaces from original source
    const searchMatch = originalDsl.match(/^search\s+(\S.*?)$/m);
    if (searchMatch) {
        compiled.searchNamespaces = searchMatch[1].split(/\s*,\s*/);
    }
    
    // Generate new source with overrides
    return unparse(compiled, parameterUpdates, {});
}

export { formatValue, unparseCall, unparseChain, unparsePlan };

/**
 * Capability descriptors, and the check of a package's capability
 * declarations against them.
 *
 * A descriptor is the data part of a capability: the options and bindings it
 * accepts, the bound parameters and resources whose values start a
 * regeneration, how its canvas uploads to a texture, and the methods it adds
 * to the effect. A host registers a descriptor with its provider code. A
 * package may also carry descriptors as files, and a tool may be given them,
 * so that a package's declarations can be checked where no provider exists.
 *
 * A descriptor is JSON data. It is read through its own data properties: a
 * function, function source, an accessor, a symbol, or any value that is not
 * a plain object, an array, a string, a finite number, a boolean or null is
 * refused, and nothing it holds is called. Whether a host can run a capability
 * is a separate check, made when it registers the effect.
 *
 * A descriptor:
 *
 *   {
 *     "id": "<owner>/<name>", "version": 1, "description": "...",
 *     "options": { "<name>": <option schema>, ... },
 *     "bindings": {
 *       "parameters": { "<role>": { "types": ["float", "int"], "required": true } },
 *       "textures": { "<role>": { "required": true } }
 *     },
 *     "dependencies": { "parameters": ["<role>", ...], "resources": ["<role>", ...] },
 *     "uploadOrientation": "flipY",
 *     "methods": ["<name>", ...]
 *   }
 *
 * An option schema is modelled on JSON Schema, with `required` as a flag on
 * the option itself: type (number, integer, string, boolean, object or
 * array), enum, minimum and maximum for a number or an integer, required,
 * description, properties for an object and items for an array. An object
 * option accepts only the properties it lists. A descriptor that binds a
 * texture states its uploadOrientation. A texture role binds a texture that
 * the package declares in textures or in textures3d.
 */

import * as grammar from './grammar.js'

const {
    CAPABILITY_ID_PATTERN, DESCRIPTOR_KEYS, OPTION_SCHEMA_KEYS, OPTION_TYPES, BINDING_KINDS,
    BINDING_SLOT_KEYS, DEPENDENCY_KINDS, UPLOAD_ORIENTATIONS, GLOBAL_TYPES, IDENTIFIER_PATTERN,
    LIFECYCLE_KEYS, TOP_LEVEL_KEYS, PACKAGE_ONLY_KEYS, RESERVED_KEYS,
} = grammar

const CAPABILITY_ID = new RegExp(CAPABILITY_ID_PATTERN)
const IDENTIFIER = new RegExp(IDENTIFIER_PATTERN)
// A method a capability adds must not stand in for a lifecycle hook or for a
// field of the effect.
const RESERVED_METHODS = new Set([...LIFECYCLE_KEYS, ...TOP_LEVEL_KEYS, ...PACKAGE_ONLY_KEYS, ...RESERVED_KEYS])
// Source text of a function, which data must not carry.
const FUNCTION_SOURCE = /^\s*(async\s+)?function\b|^\s*(async\s*)?\([^)]*\)\s*=>|^\s*(async\s+)?[A-Za-z_$][\w$]*\s*=>/
const NUMERIC = new Set(['number', 'integer'])

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function diagnostic(code, path, message) {
    return { code, path, message }
}

function join(path, key) {
    return path ? `${path}.${key}` : String(key)
}

/**
 * A copy of a value that must be JSON data, read through its own data
 * properties only, or undefined when it is not data. Each problem is a
 * diagnostic: a function or an accessor, function source, a symbol, a key
 * that reaches an object prototype, and a value of another kind.
 */
function readData(value, path, diagnostics, seen = new Set()) {
    if (value === null || typeof value === 'boolean') return value
    if (typeof value === 'string') {
        if (FUNCTION_SOURCE.test(value)) {
            diagnostics.push(diagnostic('function-string', path, `${path || 'the descriptor'} holds function source; a descriptor holds data only`))
            return undefined
        }
        return value
    }
    if (typeof value === 'number') {
        if (Number.isFinite(value)) return value
        diagnostics.push(diagnostic('invalid-value', path, `${path || 'the descriptor'} is not a finite number`))
        return undefined
    }
    if (typeof value === 'function') {
        diagnostics.push(diagnostic('function-value', path, `${path || 'the descriptor'} is a function; a descriptor holds data only`))
        return undefined
    }
    if (typeof value !== 'object') {
        diagnostics.push(diagnostic('invalid-value', path, `${path || 'the descriptor'} is a ${typeof value}, which is not JSON data`))
        return undefined
    }
    const prototype = Object.getPrototypeOf(value)
    const array = Array.isArray(value)
    if (!array && prototype !== Object.prototype && prototype !== null) {
        diagnostics.push(diagnostic('invalid-value', path, `${path || 'the descriptor'} is not a plain object`))
        return undefined
    }
    if (seen.has(value)) {
        diagnostics.push(diagnostic('invalid-value', path, `${path || 'the descriptor'} refers to itself`))
        return undefined
    }
    seen.add(value)
    const copy = array ? [] : {}
    for (const key of Reflect.ownKeys(value)) {
        if (typeof key === 'symbol') {
            diagnostics.push(diagnostic('invalid-value', path, `${path || 'the descriptor'} has a symbol key, which is not JSON data`))
            continue
        }
        if (array && key === 'length') continue
        const childPath = join(path, key)
        if (RESERVED_KEYS.includes(key)) {
            diagnostics.push(diagnostic('reserved-key', childPath, `${childPath} uses the reserved key ${key}`))
            continue
        }
        const property = Object.getOwnPropertyDescriptor(value, key)
        if (!('value' in property)) {
            diagnostics.push(diagnostic('accessor-value', childPath, `${childPath} is an accessor; a descriptor holds data only`))
            continue
        }
        const child = readData(property.value, childPath, diagnostics, seen)
        if (child !== undefined) copy[key] = child
    }
    seen.delete(value)
    return copy
}

// A value's JSON form with object keys in sorted order, so that two values
// compare equal whatever order their keys were written in.
function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
    if (isRecord(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    return JSON.stringify(value)
}

function unknownFields(value, known, path, diagnostics, of) {
    for (const key of Object.keys(value)) {
        if (!known.includes(key)) {
            diagnostics.push(diagnostic('unknown-field', join(path, key), `${join(path, key)} is not a field of ${of}`))
        }
    }
}

function typeMatches(value, type) {
    switch (type) {
    case 'integer': return Number.isInteger(value)
    case 'number': return typeof value === 'number' && Number.isFinite(value)
    case 'string': return typeof value === 'string'
    case 'boolean': return typeof value === 'boolean'
    case 'object': return isRecord(value)
    case 'array': return Array.isArray(value)
    default: return false
    }
}

function checkOptionSchema(schema, path, diagnostics) {
    if (!isRecord(schema)) {
        diagnostics.push(diagnostic('invalid-value', path, `${path} must be an option schema object`))
        return
    }
    unknownFields(schema, OPTION_SCHEMA_KEYS, path, diagnostics, 'an option schema')
    const typed = OPTION_TYPES.includes(schema.type)
    if (!typed) {
        diagnostics.push(diagnostic('invalid-value', `${path}.type`, `${path}.type must be one of ${OPTION_TYPES.join(', ')}`))
    }
    for (const key of ['minimum', 'maximum']) {
        if (schema[key] === undefined) continue
        if (!NUMERIC.has(schema.type)) {
            diagnostics.push(diagnostic('invalid-value', `${path}.${key}`, `${path}.${key} belongs to a number or integer option`))
        } else if (typeof schema[key] !== 'number') {
            diagnostics.push(diagnostic('invalid-value', `${path}.${key}`, `${path}.${key} must be a number`))
        }
    }
    if (typeof schema.minimum === 'number' && typeof schema.maximum === 'number' && schema.minimum > schema.maximum) {
        diagnostics.push(diagnostic('invalid-value', `${path}.minimum`, `${path}.minimum is greater than its maximum`))
    }
    if (schema.required !== undefined && typeof schema.required !== 'boolean') {
        diagnostics.push(diagnostic('invalid-value', `${path}.required`, `${path}.required must be true or false`))
    }
    if (schema.description !== undefined && typeof schema.description !== 'string') {
        diagnostics.push(diagnostic('invalid-value', `${path}.description`, `${path}.description must be a string`))
    }
    if (schema.enum !== undefined) {
        if (!Array.isArray(schema.enum) || schema.enum.length === 0) {
            diagnostics.push(diagnostic('invalid-value', `${path}.enum`, `${path}.enum must be a non-empty list of values`))
        } else if (typed) {
            schema.enum.forEach((option, index) => {
                if (!typeMatches(option, schema.type)) {
                    diagnostics.push(diagnostic('invalid-value', `${path}.enum.${index}`, `${path}.enum.${index} is not a ${schema.type}`))
                }
            })
        }
    }
    if (schema.properties !== undefined) {
        if (schema.type !== 'object' || !isRecord(schema.properties)) {
            diagnostics.push(diagnostic('invalid-value', `${path}.properties`, `${path}.properties belongs to an object option, as an object of option schemas`))
        } else {
            for (const [name, child] of Object.entries(schema.properties)) {
                if (!IDENTIFIER.test(name)) diagnostics.push(diagnostic('invalid-name', `${path}.properties.${name}`, `${path}.properties.${name}: an option name is an identifier`))
                checkOptionSchema(child, `${path}.properties.${name}`, diagnostics)
            }
        }
    }
    if (schema.items !== undefined) {
        if (schema.type !== 'array') {
            diagnostics.push(diagnostic('invalid-value', `${path}.items`, `${path}.items belongs to an array option`))
        } else {
            checkOptionSchema(schema.items, `${path}.items`, diagnostics)
        }
    }
}

function checkIdentity(raw, diagnostics) {
    if (typeof raw.id !== 'string' || !CAPABILITY_ID.test(raw.id)) {
        diagnostics.push(diagnostic('invalid-value', 'id', 'id must be <owner>/<name>, in lower case letters, digits and hyphens'))
    }
    if (!Number.isInteger(raw.version) || raw.version < 1) {
        diagnostics.push(diagnostic('invalid-value', 'version', 'version must be a positive integer, the contract version'))
    }
}

function checkBindingSlots(bindings, diagnostics) {
    if (bindings === undefined) return
    if (!isRecord(bindings)) {
        diagnostics.push(diagnostic('invalid-value', 'bindings', 'bindings must be an object of binding kinds'))
        return
    }
    unknownFields(bindings, BINDING_KINDS, 'bindings', diagnostics, 'descriptor bindings')
    for (const kind of BINDING_KINDS) {
        const slots = bindings[kind]
        if (slots === undefined) continue
        if (!isRecord(slots)) {
            diagnostics.push(diagnostic('invalid-value', `bindings.${kind}`, `bindings.${kind} must map role names to slots`))
            continue
        }
        for (const [role, slot] of Object.entries(slots)) {
            const path = `bindings.${kind}.${role}`
            if (!IDENTIFIER.test(role)) diagnostics.push(diagnostic('invalid-name', path, `${path}: a role name is an identifier`))
            if (!isRecord(slot)) {
                diagnostics.push(diagnostic('invalid-value', path, `${path} must be a slot object`))
                continue
            }
            unknownFields(slot, BINDING_SLOT_KEYS, path, diagnostics, 'a binding slot')
            if (slot.types !== undefined) {
                if (kind !== 'parameters' || !Array.isArray(slot.types) || slot.types.length === 0 ||
                    slot.types.some(type => !GLOBAL_TYPES.includes(type))) {
                    diagnostics.push(diagnostic('invalid-value', `${path}.types`,
                        `${path}.types is a non-empty list of global types (${GLOBAL_TYPES.join(', ')}), for a parameter role`))
                }
            }
            if (slot.required !== undefined && typeof slot.required !== 'boolean') {
                diagnostics.push(diagnostic('invalid-value', `${path}.required`, `${path}.required must be true or false`))
            }
            if (slot.description !== undefined && typeof slot.description !== 'string') {
                diagnostics.push(diagnostic('invalid-value', `${path}.description`, `${path}.description must be a string`))
            }
        }
    }
}

function checkNameList(list, path, diagnostics, check) {
    if (!Array.isArray(list)) {
        diagnostics.push(diagnostic('invalid-value', path, `${path} must be a list of names`))
        return
    }
    const seen = new Set()
    list.forEach((name, index) => {
        if (seen.has(name)) {
            diagnostics.push(diagnostic('duplicate-name', `${path}.${index}`, `${path}.${index}: ${JSON.stringify(name)} is listed twice`))
            return
        }
        seen.add(name)
        check(name, `${path}.${index}`)
    })
}

function checkDependencies(raw, diagnostics) {
    const dependencies = raw.dependencies
    if (dependencies === undefined) return
    if (!isRecord(dependencies)) {
        diagnostics.push(diagnostic('invalid-value', 'dependencies', 'dependencies must be an object of dependency kinds'))
        return
    }
    unknownFields(dependencies, DEPENDENCY_KINDS, 'dependencies', diagnostics, 'descriptor dependencies')
    const roles = {
        parameters: isRecord(raw.bindings?.parameters) ? Object.keys(raw.bindings.parameters) : [],
        resources: isRecord(raw.bindings?.textures) ? Object.keys(raw.bindings.textures) : [],
    }
    for (const kind of DEPENDENCY_KINDS) {
        if (dependencies[kind] === undefined) continue
        checkNameList(dependencies[kind], `dependencies.${kind}`, diagnostics, (role, path) => {
            if (!roles[kind].includes(role)) {
                diagnostics.push(diagnostic('unknown-binding', path,
                    `${path}: ${JSON.stringify(role)} is not a ${kind === 'parameters' ? 'parameter' : 'texture'} role of bindings`))
            }
        })
    }
}

/**
 * Read a capability descriptor. Never throws, and calls nothing the input holds.
 * @param {object} raw - The descriptor, as data
 * @returns {{descriptor: object|null, diagnostics: Array<{code: string, path: string, message: string}>}}
 */
export function normalizeCapabilityDescriptor(raw) {
    const diagnostics = []
    const data = readData(raw, '', diagnostics)
    if (diagnostics.length > 0) return { descriptor: null, diagnostics }
    if (!isRecord(data)) return { descriptor: null, diagnostics: [diagnostic('invalid-value', '', 'a capability descriptor is an object')] }
    unknownFields(data, DESCRIPTOR_KEYS, '', diagnostics, 'a capability descriptor')
    checkIdentity(data, diagnostics)
    if (data.description !== undefined && typeof data.description !== 'string') {
        diagnostics.push(diagnostic('invalid-value', 'description', 'description must be a string'))
    }
    if (data.options !== undefined) {
        if (!isRecord(data.options)) {
            diagnostics.push(diagnostic('invalid-value', 'options', 'options must be an object of option schemas'))
        } else {
            for (const [name, schema] of Object.entries(data.options)) {
                if (!IDENTIFIER.test(name)) diagnostics.push(diagnostic('invalid-name', `options.${name}`, `options.${name}: an option name is an identifier`))
                checkOptionSchema(schema, `options.${name}`, diagnostics)
            }
        }
    }
    checkBindingSlots(data.bindings, diagnostics)
    checkDependencies(data, diagnostics)
    const bindsTextures = isRecord(data.bindings?.textures) && Object.keys(data.bindings.textures).length > 0
    if (data.uploadOrientation !== undefined || bindsTextures) {
        if (!UPLOAD_ORIENTATIONS.includes(data.uploadOrientation)) {
            diagnostics.push(diagnostic('invalid-value', 'uploadOrientation',
                `uploadOrientation must be ${UPLOAD_ORIENTATIONS.join(' or ')}; a descriptor that binds a texture states it`))
        }
    }
    if (data.methods !== undefined) {
        checkNameList(data.methods, 'methods', diagnostics, (name, path) => {
            if (typeof name !== 'string' || !IDENTIFIER.test(name) || RESERVED_METHODS.has(name)) {
                diagnostics.push(diagnostic('invalid-name', path,
                    `${path}: a method name is an identifier that is not a lifecycle hook or a field of an effect`))
            }
        })
    }
    if (diagnostics.length > 0) return { descriptor: null, diagnostics }
    return { descriptor: data, diagnostics }
}

/**
 * Two descriptors that state the same data, whatever their key order.
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
export function sameDescriptor(a, b) {
    return canonical(a) === canonical(b)
}

/**
 * Read a list of descriptors, as normalizeCapabilityDescriptor() does. The
 * same ID and version twice is accepted when the two state the same data, and
 * refused when they differ.
 * @param {Array<object>|undefined|null} list
 * @param {string|Function} [pathOf] - The path of the list, or a function from
 *   an entry's index to its path, for the diagnostics
 * @returns {{descriptors: Array<object>, diagnostics: Array}}
 */
export function normalizeCapabilityDescriptors(list, pathOf = 'capabilityDescriptors') {
    const descriptors = []
    const diagnostics = []
    const at = typeof pathOf === 'function' ? pathOf : index => `${pathOf}.${index}`
    if (list === undefined || list === null) return { descriptors, diagnostics }
    if (!Array.isArray(list)) {
        return { descriptors, diagnostics: [diagnostic('invalid-value', typeof pathOf === 'string' ? pathOf : '', 'capability descriptors are a list')] }
    }
    const sources = []
    list.forEach((raw, index) => {
        const path = at(index)
        const result = normalizeCapabilityDescriptor(raw)
        for (const entry of result.diagnostics) diagnostics.push({ ...entry, path: entry.path ? join(path, entry.path) : path })
        if (!result.descriptor) return
        const other = descriptors.findIndex(entry => entry.id === result.descriptor.id && entry.version === result.descriptor.version)
        if (other >= 0) {
            if (!sameDescriptor(descriptors[other], result.descriptor)) {
                diagnostics.push(diagnostic('conflicting-descriptor', path,
                    `${path}: ${result.descriptor.id} version ${result.descriptor.version} differs from its descriptor at ${sources[other]}`))
            }
            return
        }
        descriptors.push(result.descriptor)
        sources.push(path)
    })
    return { descriptors, diagnostics }
}

function checkOptionValue(value, schema, path, diagnostics) {
    if (!typeMatches(value, schema.type)) {
        diagnostics.push(diagnostic('invalid-option', path, `${path} must be ${schema.type === 'integer' || schema.type === 'object' || schema.type === 'array' ? 'an' : 'a'} ${schema.type}`))
        return
    }
    if (schema.enum && !schema.enum.some(option => canonical(option) === canonical(value))) {
        diagnostics.push(diagnostic('invalid-option', path, `${path} must be one of ${schema.enum.map(option => JSON.stringify(option)).join(', ')}`))
    }
    if (schema.minimum !== undefined && value < schema.minimum) {
        diagnostics.push(diagnostic('invalid-option', path, `${path} must be at least ${schema.minimum}`))
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
        diagnostics.push(diagnostic('invalid-option', path, `${path} must be at most ${schema.maximum}`))
    }
    if (schema.type === 'object') checkOptionObject(value, schema.properties ?? {}, path, diagnostics)
    if (schema.type === 'array' && schema.items) {
        value.forEach((item, index) => checkOptionValue(item, schema.items, `${path}.${index}`, diagnostics))
    }
}

function checkOptionObject(value, properties, path, diagnostics) {
    for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) {
            diagnostics.push(diagnostic('unknown-option', `${path}.${key}`, `${path}.${key} is not an option of this capability`))
        }
    }
    for (const [key, schema] of Object.entries(properties)) {
        if (Object.hasOwn(value, key)) {
            checkOptionValue(value[key], schema, `${path}.${key}`, diagnostics)
        } else if (schema.required) {
            diagnostics.push(diagnostic('missing-option', `${path}.${key}`, `${path}.${key} is required by this capability`))
        }
    }
}

function checkBindings(declaration, descriptor, globals, path, diagnostics) {
    for (const kind of BINDING_KINDS) {
        const slots = descriptor.bindings?.[kind] ?? {}
        const bound = isRecord(declaration.bindings?.[kind]) ? declaration.bindings[kind] : {}
        for (const [role, name] of Object.entries(bound)) {
            const rolePath = `${path}.bindings.${kind}.${role}`
            if (!Object.hasOwn(slots, role)) {
                diagnostics.push(diagnostic('unknown-binding', rolePath, `${rolePath}: ${descriptor.id} version ${descriptor.version} has no ${kind} role ${role}`))
                continue
            }
            const types = slots[role].types
            const type = globals?.[name]?.type
            if (kind === 'parameters' && types && !types.includes(type)) {
                diagnostics.push(diagnostic('invalid-binding', rolePath, `${rolePath}: the role takes a ${types.join(' or ')} global, and ${name} is ${type}`))
            }
        }
        for (const [role, slot] of Object.entries(slots)) {
            if (slot.required && !Object.hasOwn(bound, role)) {
                diagnostics.push(diagnostic('missing-binding', `${path}.bindings.${kind}.${role}`,
                    `${path}.bindings.${kind}.${role}: ${descriptor.id} version ${descriptor.version} needs this role bound`))
            }
        }
    }
}

/**
 * Check a definition's capability declarations against descriptors. A
 * declaration whose capability has no descriptor here passes the structural
 * check only: the result is then incomplete, and names it in `unresolved`.
 * A declaration of a version that no descriptor of its ID describes is refused.
 * Runs no provider code.
 * @param {object} definition - A normalized definition (normalizePortableDefinition)
 * @param {Array<object>} [descriptors] - Descriptors, as data
 * @param {string|Function} [pathOf] - The descriptors' paths, as normalizeCapabilityDescriptors() takes them
 * @returns {{diagnostics: Array, complete: boolean, unresolved: Array<{id: string, version: number}>, descriptors: Array<object>}}
 */
export function checkCapabilityDeclarations(definition, descriptors = [], pathOf = 'capabilityDescriptors') {
    const read = normalizeCapabilityDescriptors(descriptors, pathOf)
    const diagnostics = [...read.diagnostics]
    const unresolved = []
    const declarations = Array.isArray(definition?.capabilities) ? definition.capabilities : []
    declarations.forEach((declaration, index) => {
        const path = `capabilities.${index}`
        const sameId = read.descriptors.filter(entry => entry.id === declaration.id)
        const match = sameId.find(entry => entry.version === declaration.version)
        if (!match) {
            if (sameId.length > 0) {
                diagnostics.push(diagnostic('unsupported-capability-version', `${path}.version`,
                    `${path}.version: ${declaration.id} is described for version ${sameId.map(entry => entry.version).join(', ')}, not ${declaration.version}`))
            } else {
                unresolved.push({ id: declaration.id, version: declaration.version })
            }
            return
        }
        checkOptionObject(isRecord(declaration.options) ? declaration.options : {}, match.options ?? {}, `${path}.options`, diagnostics)
        checkBindings(declaration, match, definition.globals, path, diagnostics)
    })
    return { diagnostics, complete: diagnostics.length === 0 && unresolved.length === 0, unresolved, descriptors: read.descriptors }
}

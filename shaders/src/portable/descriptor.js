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
 * Nothing here runs provider code. A descriptor that holds a function, or
 * function source, is refused. Whether a host can run a capability is a
 * separate check, made when it registers the effect.
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
 * An option schema is a subset of JSON Schema: type (number, integer, string,
 * boolean, object or array), enum, minimum, maximum, required, description,
 * properties for an object and items for an array. An object option accepts
 * only the properties it lists. A descriptor that binds a texture states its
 * uploadOrientation.
 */

import * as grammar from './grammar.js'
import { scanValues } from './definition.js'

const {
    CAPABILITY_ID_PATTERN, DESCRIPTOR_KEYS, OPTION_SCHEMA_KEYS, OPTION_TYPES, BINDING_KINDS,
    BINDING_SLOT_KEYS, DEPENDENCY_KINDS, UPLOAD_ORIENTATIONS, GLOBAL_TYPES, IDENTIFIER_PATTERN,
    LIFECYCLE_KEYS, TOP_LEVEL_KEYS, RESERVED_KEYS,
} = grammar

const CAPABILITY_ID = new RegExp(CAPABILITY_ID_PATTERN)
const IDENTIFIER = new RegExp(IDENTIFIER_PATTERN)
// A method a capability adds must not stand in for a lifecycle hook or for a
// field of the effect.
const RESERVED_METHODS = new Set([...LIFECYCLE_KEYS, ...TOP_LEVEL_KEYS, ...RESERVED_KEYS])

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function diagnostic(code, path, message) {
    return { code, path, message }
}

function join(path, key) {
    return path ? `${path}.${key}` : String(key)
}

function unknownFields(value, known, path, diagnostics) {
    for (const key of Object.keys(value)) {
        if (!known.includes(key) && !RESERVED_KEYS.includes(key)) {
            diagnostics.push(diagnostic('unknown-field', join(path, key), `${join(path, key)} is not a field of a capability descriptor`))
        }
    }
}

function checkOptionSchema(schema, path, diagnostics) {
    if (!isRecord(schema)) {
        diagnostics.push(diagnostic('invalid-value', path, `${path} must be an option schema object`))
        return
    }
    unknownFields(schema, OPTION_SCHEMA_KEYS, path, diagnostics)
    if (!OPTION_TYPES.includes(schema.type)) {
        diagnostics.push(diagnostic('invalid-value', `${path}.type`, `${path}.type must be one of ${OPTION_TYPES.join(', ')}`))
    }
    for (const key of ['minimum', 'maximum']) {
        if (schema[key] !== undefined && typeof schema[key] !== 'number') {
            diagnostics.push(diagnostic('invalid-value', `${path}.${key}`, `${path}.${key} must be a number`))
        }
    }
    if (schema.required !== undefined && typeof schema.required !== 'boolean') {
        diagnostics.push(diagnostic('invalid-value', `${path}.required`, `${path}.required must be true or false`))
    }
    if (schema.description !== undefined && typeof schema.description !== 'string') {
        diagnostics.push(diagnostic('invalid-value', `${path}.description`, `${path}.description must be a string`))
    }
    if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0)) {
        diagnostics.push(diagnostic('invalid-value', `${path}.enum`, `${path}.enum must be a non-empty list of values`))
    }
    if (schema.properties !== undefined) {
        if (schema.type !== 'object' || !isRecord(schema.properties)) {
            diagnostics.push(diagnostic('invalid-value', `${path}.properties`, `${path}.properties belongs to an object option, as an object of option schemas`))
        } else {
            for (const [name, child] of Object.entries(schema.properties)) checkOptionSchema(child, `${path}.properties.${name}`, diagnostics)
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
    unknownFields(bindings, BINDING_KINDS, 'bindings', diagnostics)
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
            unknownFields(slot, BINDING_SLOT_KEYS, path, diagnostics)
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
        }
    }
}

function checkDependencies(raw, diagnostics) {
    const dependencies = raw.dependencies
    if (dependencies === undefined) return
    if (!isRecord(dependencies)) {
        diagnostics.push(diagnostic('invalid-value', 'dependencies', 'dependencies must be an object of dependency kinds'))
        return
    }
    unknownFields(dependencies, DEPENDENCY_KINDS, 'dependencies', diagnostics)
    const roles = {
        parameters: isRecord(raw.bindings?.parameters) ? Object.keys(raw.bindings.parameters) : [],
        resources: isRecord(raw.bindings?.textures) ? Object.keys(raw.bindings.textures) : [],
    }
    for (const kind of DEPENDENCY_KINDS) {
        const list = dependencies[kind]
        if (list === undefined) continue
        if (!Array.isArray(list)) {
            diagnostics.push(diagnostic('invalid-value', `dependencies.${kind}`, `dependencies.${kind} must be a list of role names`))
            continue
        }
        list.forEach((role, index) => {
            if (!roles[kind].includes(role)) {
                diagnostics.push(diagnostic('unknown-binding', `dependencies.${kind}.${index}`,
                    `dependencies.${kind}.${index}: ${JSON.stringify(role)} is not a ${kind === 'parameters' ? 'parameter' : 'texture'} role of bindings`))
            }
        })
    }
}

/**
 * Read a capability descriptor. Never throws, and calls nothing in the input.
 * @param {object} raw - The descriptor, as data
 * @returns {{descriptor: object|null, diagnostics: Array<{code: string, path: string, message: string}>}}
 */
export function normalizeCapabilityDescriptor(raw) {
    if (!isRecord(raw)) return { descriptor: null, diagnostics: [diagnostic('invalid-value', '', 'a capability descriptor is an object')] }
    const diagnostics = []
    scanValues(raw, '', diagnostics)
    if (diagnostics.length > 0) return { descriptor: null, diagnostics }
    unknownFields(raw, DESCRIPTOR_KEYS, '', diagnostics)
    checkIdentity(raw, diagnostics)
    if (raw.description !== undefined && typeof raw.description !== 'string') {
        diagnostics.push(diagnostic('invalid-value', 'description', 'description must be a string'))
    }
    if (raw.options !== undefined) {
        if (!isRecord(raw.options)) {
            diagnostics.push(diagnostic('invalid-value', 'options', 'options must be an object of option schemas'))
        } else {
            for (const [name, schema] of Object.entries(raw.options)) {
                if (!IDENTIFIER.test(name)) diagnostics.push(diagnostic('invalid-name', `options.${name}`, `options.${name}: an option name is an identifier`))
                checkOptionSchema(schema, `options.${name}`, diagnostics)
            }
        }
    }
    checkBindingSlots(raw.bindings, diagnostics)
    checkDependencies(raw, diagnostics)
    const bindsTextures = isRecord(raw.bindings?.textures) && Object.keys(raw.bindings.textures).length > 0
    if (raw.uploadOrientation !== undefined || bindsTextures) {
        if (!UPLOAD_ORIENTATIONS.includes(raw.uploadOrientation)) {
            diagnostics.push(diagnostic('invalid-value', 'uploadOrientation',
                `uploadOrientation must be ${UPLOAD_ORIENTATIONS.join(' or ')}; a descriptor that binds a texture states it`))
        }
    }
    if (raw.methods !== undefined) {
        if (!Array.isArray(raw.methods)) {
            diagnostics.push(diagnostic('invalid-value', 'methods', 'methods must be a list of method names'))
        } else {
            raw.methods.forEach((name, index) => {
                if (typeof name !== 'string' || !IDENTIFIER.test(name) || RESERVED_METHODS.has(name)) {
                    diagnostics.push(diagnostic('invalid-name', `methods.${index}`,
                        `methods.${index}: a method name is an identifier that is not a lifecycle hook or a field of an effect`))
                }
            })
        }
    }
    if (diagnostics.length > 0) return { descriptor: null, diagnostics }
    return { descriptor: structuredClone(raw), diagnostics }
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

function checkOptionValue(value, schema, path, diagnostics) {
    if (!typeMatches(value, schema.type)) {
        diagnostics.push(diagnostic('invalid-option', path, `${path} must be ${schema.type === 'integer' ? 'an' : 'a'} ${schema.type}`))
        return
    }
    if (schema.enum && !schema.enum.some(option => JSON.stringify(option) === JSON.stringify(value))) {
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
 * Read a list of descriptors, as normalizeCapabilityDescriptor() does, and
 * refuse two for one ID and version.
 * @param {Array<object>} list
 * @param {string} [prefix] - The path of the list, for the diagnostics
 * @returns {{descriptors: Array<object>, diagnostics: Array}}
 */
export function normalizeCapabilityDescriptors(list, prefix = 'capabilityDescriptors') {
    const descriptors = []
    const diagnostics = []
    if (!Array.isArray(list)) {
        return { descriptors, diagnostics: [diagnostic('invalid-value', prefix, `${prefix} must be a list of capability descriptors`)] }
    }
    list.forEach((raw, index) => {
        const result = normalizeCapabilityDescriptor(raw)
        for (const entry of result.diagnostics) diagnostics.push({ ...entry, path: join(`${prefix}.${index}`, entry.path) })
        if (!result.descriptor) return
        if (descriptors.some(other => other.id === result.descriptor.id && other.version === result.descriptor.version)) {
            diagnostics.push(diagnostic('duplicate-descriptor', `${prefix}.${index}`,
                `${prefix}.${index}: ${result.descriptor.id} version ${result.descriptor.version} is described twice`))
            return
        }
        descriptors.push(result.descriptor)
    })
    return { descriptors, diagnostics }
}

/**
 * Check a definition's capability declarations against descriptors. A
 * declaration whose capability has no descriptor here passes the structural
 * check only: the result is then incomplete, and names it in `unresolved`.
 * A declaration of a version that no descriptor of its ID describes is refused.
 * Runs no provider code.
 * @param {object} definition - A normalized definition (normalizePortableDefinition)
 * @param {Array<object>} [descriptors] - Descriptors, as data
 * @returns {{diagnostics: Array, complete: boolean, unresolved: Array<{id: string, version: number}>}}
 */
export function checkCapabilityDeclarations(definition, descriptors = []) {
    const read = normalizeCapabilityDescriptors(descriptors)
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
    return { diagnostics, complete: diagnostics.length === 0 && unresolved.length === 0, unresolved }
}

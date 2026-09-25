/**
 * Validates an Effect Definition against the definition grammar consumed by
 * the runtime: effect.js (metadata, globals, lifecycle hooks), expander.js
 * (passes, bindings, textures, uniform layouts, compile-time defines),
 * compiler.js (texture specs), pipeline.js/backends (uniform packing,
 * conditions, counts, workgroups), and the UI control layer.
 *
 * Contract: deterministic and side-effect-free. Returns an array of error
 * strings; [] for valid input. Never throws for malformed/null/array/
 * non-object containers, never mutates the input, never invokes lifecycle
 * hooks, and never sorts runtime globals. Declaration/schema validation is
 * distinct from shader compilation, GPU capability, and runtime behavior.
 * @param {object} def The effect definition object or class instance.
 * @returns {Array} List of error strings. Empty if valid.
 */
import { Effect } from './effect.js'
import { VALID_TAGS } from './tags.js'
import { stdEnums } from '../lang/std_enums.js'

const GLOBAL_TYPES = [
    'float', 'int', 'boolean', 'vec2', 'vec3', 'vec4', 'mat3',
    'color', 'surface', 'volume', 'geometry', 'member', 'palette', 'button',
    'string'
]

const UI_CONTROLS = ['slider', 'checkbox', 'dropdown', 'color', 'button', 'vector3', 'vec3']

const UI_KEYS = ['label', 'control', 'category', 'hidden', 'hint', 'format', 'buttonLabel', 'enabledBy', 'multiline']

const ENABLED_BY_OPS = ['eq', 'neq', 'lt', 'gt', 'gte', 'lte', 'in', 'notIn']

const GLOBAL_SPEC_KEYS = [
    'type', 'default', 'uniform', 'define', 'choices', 'enum',
    'min', 'max', 'step', 'zero', 'randMin', 'randMax', 'randChance', 'randChoices',
    'colorModeUniform', 'ui'
]

const PASS_KEYS = [
    'name', 'program', 'type', 'entryPoint', 'drawMode', 'drawBuffers',
    'count', 'countUniform', 'repeat', 'blend', 'workgroups',
    'storageBuffers', 'storageTextures', 'viewport', 'conditions',
    'defines', 'uniforms', 'inputs', 'outputs'
]

const TEXTURE_SPEC_KEYS = ['width', 'height', 'depth', 'format', 'is3D']

const CONDITION_CONTAINER_KEYS = ['runIf', 'skipIf']

const DIM_KEYWORDS = ['screen', 'auto', 'input', 'resolution']

const FORMATS = ['rgba16f', 'rgba16float', 'rgba8', 'rgba8unorm', 'rgba32f', 'rgba32float']

const DRAW_MODES = ['points', 'triangles', 'billboards']

const PASS_TYPES = ['render', 'compute']

const LAYOUT_ENTRY_KEYS = new Set(['name', 'slot', 'components'])

const BYTE_LAYOUT_KEYS = new Set(['name', 'offset', 'size', 'type'])

const DIM_SPEC_KEYS = new Set(['param', 'power', 'multiply', 'default', 'paramDefault', 'screenDivide', 'scale', 'clamp', 'inputOverride'])

const TOP_LEVEL_KEYS = new Set([
    'name', 'namespace', 'func', 'description', 'tags', 'globals', 'passes',
    'textures', 'textures3d', 'shaders', 'uniformLayout', 'uniformLayouts',
    'paramAliases', 'openCategories', 'defaultProgram', 'hidden', 'deprecatedBy',
    'externalTexture', 'externalMesh', 'builtinMeshes', 'outputTex3d', 'outputGeo',
    'state', 'uniforms', 'onInit', 'onUpdate', 'onDestroy', 'asyncInit'
])

const PIPELINE_INPUTS = new Set([
    'inputTex', 'inputTex3d', 'inputGeo', 'inputXyz', 'inputVel', 'inputRgba',
    'noise', 'midiNoteGrid', 'feedback', 'selfTex', 'outputTex', 'none'
])

const PIPELINE_OUTPUTS = new Set(['outputTex', 'outputTex3d', 'outputXyz', 'outputVel', 'outputRgba'])

const PERCENT_PATTERN = /^[\d.]+$/

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

function isObj(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Resolve a std enum path. Returns { kind: 'table' | 'leaf', ... } or null.
 */
function resolveStdEnum(pathStr) {
    if (typeof pathStr !== 'string' || pathStr.length === 0) return null
    let node = stdEnums
    for (const part of pathStr.split('.')) {
        if (node && typeof node === 'object' && node[part] !== undefined) {
            node = node[part]
        } else {
            return null
        }
    }
    if (node && typeof node === 'object' && node.value !== undefined) {
        return { kind: 'leaf', value: node.value }
    }
    if (node && typeof node === 'object') {
        return { kind: 'table', node }
    }
    return null
}

/**
 * Validate a dimension expression consumed by pipeline.resolveDimension():
 * positive number, dynamic keyword, percentage, {param...}, {screenDivide...},
 * or {scale, clamp} spec objects.
 */
function validateDimSpec(spec, errors, label) {
    if (typeof spec === 'number') {
        if (!isFiniteNumber(spec) || spec <= 0) {
            errors.push(`${label}: dimension must be a positive finite number, keyword, percentage, or dimension expression`)
        }
        return
    }
    if (typeof spec === 'string') {
        if (DIM_KEYWORDS.includes(spec)) return
        if (spec.endsWith('%') && PERCENT_PATTERN.test(spec.slice(0, -1))) {
            const percent = parseFloat(spec)
            if (!isFiniteNumber(percent) || percent <= 0) {
                errors.push(`${label}: invalid percentage '${spec}'`)
            }
            return
        }
        errors.push(`${label}: invalid dimension '${spec}'`)
        return
    }
    if (isObj(spec)) {
        for (const key of Object.keys(spec)) {
            if (!DIM_SPEC_KEYS.has(key)) {
                errors.push(`${label}: unknown dimension field '${key}'`)
            }
        }
        if (spec.param !== undefined) {
            if (typeof spec.param !== 'string' || !spec.param) {
                errors.push(`${label}: "param" must be a non-empty string`)
            }
            if (spec.power !== undefined && !isFiniteNumber(spec.power)) {
                errors.push(`${label}: "power" must be a finite number`)
            }
            if (spec.multiply !== undefined && !isFiniteNumber(spec.multiply)) {
                errors.push(`${label}: "multiply" must be a finite number`)
            }
            if (spec.default !== undefined && !isFiniteNumber(spec.default)) {
                errors.push(`${label}: "default" must be a finite number`)
            }
            if (spec.paramDefault !== undefined && !isFiniteNumber(spec.paramDefault)) {
                errors.push(`${label}: "paramDefault" must be a finite number`)
            }
            if (spec.inputOverride !== undefined &&
                (typeof spec.inputOverride !== 'string' || !spec.inputOverride)) {
                errors.push(`${label}: "inputOverride" must be a non-empty string`)
            }
            return
        }
        if (spec.screenDivide !== undefined) {
            if (typeof spec.screenDivide !== 'string' || !spec.screenDivide) {
                errors.push(`${label}: "screenDivide" must be a non-empty string`)
            }
            if (spec.default !== undefined && !isFiniteNumber(spec.default)) {
                errors.push(`${label}: "default" must be a finite number`)
            }
            return
        }
        if (spec.scale !== undefined) {
            if (!isFiniteNumber(spec.scale)) {
                errors.push(`${label}: "scale" must be a finite number`)
            }
            if (spec.clamp !== undefined) {
                if (!isObj(spec.clamp)) {
                    errors.push(`${label}: "clamp" must be an object`)
                } else {
                    if (spec.clamp.min !== undefined && !isFiniteNumber(spec.clamp.min)) {
                        errors.push(`${label}: "clamp.min" must be a finite number`)
                    }
                    if (spec.clamp.max !== undefined && !isFiniteNumber(spec.clamp.max)) {
                        errors.push(`${label}: "clamp.max" must be a finite number`)
                    }
                    for (const key of Object.keys(spec.clamp)) {
                        if (key !== 'min' && key !== 'max') {
                            errors.push(`${label}: unknown clamp field '${key}'`)
                        }
                    }
                }
            }
            return
        }
        errors.push(`${label}: dimension object must reference "param", "screenDivide", or "scale"`)
        return
    }
    errors.push(`${label}: invalid dimension specification`)
}

/**
 * Validate a uniform layout in any consumed form: named-key map
 * ({name: {slot, components}}), array of {name, slot, components}, or the
 * byte form ({type: 'byte', layout: [{name, offset, size, type}]}).
 * Duplicate or overlapping slot/component claims are conflicts.
 */
function validateUniformLayout(layout, errors, label) {
    if (Array.isArray(layout)) {
        const entries = []
        for (let i = 0; i < layout.length; i++) {
            if (isObj(layout[i])) entries.push(layout[i])
            validateLayoutEntry(layout[i], errors, `${label}[${i}]`)
        }
        checkLayoutConflicts(entries, errors, label)
        return
    }
    if (!isObj(layout)) {
        errors.push(`${label}: must be an object or array layout`)
        return
    }
    if (layout.type === 'byte') {
        if (!Array.isArray(layout.layout)) {
            errors.push(`${label}: byte layout requires a "layout" array`)
            return
        }
        for (const key of Object.keys(layout)) {
            if (key !== 'type' && key !== 'layout') {
                errors.push(`${label}: unknown byte-layout field '${key}'`)
            }
        }
        const byteEntries = []
        for (let i = 0; i < layout.layout.length; i++) {
            const entry = layout.layout[i]
            const entryLabel = `${label}.layout[${i}]`
            if (!isObj(entry)) {
                errors.push(`${entryLabel}: entry must be an object`)
                continue
            }
            for (const key of Object.keys(entry)) {
                if (!BYTE_LAYOUT_KEYS.has(key) && key !== 'components') {
                    errors.push(`${entryLabel}: unknown field '${key}'`)
                }
            }
            if (typeof entry.name !== 'string' || !entry.name) {
                errors.push(`${entryLabel}: missing "name" string`)
            }
            if (!Number.isInteger(entry.offset) || entry.offset < 0) {
                errors.push(`${entryLabel}: "offset" must be a non-negative integer`)
            }
            if (!Number.isInteger(entry.size) || entry.size <= 0) {
                errors.push(`${entryLabel}: "size" must be a positive integer`)
            }
            if (typeof entry.type !== 'string' || !entry.type) {
                errors.push(`${entryLabel}: missing "type" string`)
            }
            if (typeof entry.name === 'string' && entry.name &&
                Number.isInteger(entry.offset) && entry.offset >= 0 &&
                Number.isInteger(entry.size) && entry.size > 0) {
                byteEntries.push(entry)
            }
        }
        checkByteLayoutConflicts(byteEntries, errors, label)
        return
    }
    const entries = []
    for (const [name, spec] of Object.entries(layout)) {
        const entryLabel = `${label}['${name}']`
        if (!isObj(spec)) {
            errors.push(`${entryLabel}: layout entry must be an object`)
            continue
        }
        validateLayoutEntry({ name, ...spec }, errors, entryLabel)
        if (Number.isInteger(spec.slot)) {
            entries.push({ name, slot: spec.slot, components: spec.components })
        }
    }
    checkLayoutConflicts(entries, errors, label)
}

// Semantic component order consumed by the backends' uniform packing
// ({x: 0, y: 1, z: 2, w: 3}); ASCII codes do not follow xyzw order.
const COMPONENT_ORDER = { x: 0, y: 1, z: 2, w: 3 }

function validateLayoutEntry(entry, errors, label) {
    if (!isObj(entry)) {
        errors.push(`${label}: layout entry must be an object`)
        return
    }
    for (const key of Object.keys(entry)) {
        if (!LAYOUT_ENTRY_KEYS.has(key)) {
            errors.push(`${label}: unknown field '${key}'`)
        }
    }
    if (typeof entry.name !== 'string' || !entry.name) {
        errors.push(`${label}: missing "name" string`)
    }
    if (!Number.isInteger(entry.slot) || entry.slot < 0) {
        errors.push(`${label}: "slot" must be a non-negative integer`)
    }
    if (typeof entry.components !== 'string' || !/^[xyzw]{1,4}$/.test(entry.components)) {
        errors.push(`${label}: "components" must be 1-4 characters from xyzw`)
        return
    }
    for (let i = 1; i < entry.components.length; i++) {
        if (COMPONENT_ORDER[entry.components[i]] <= COMPONENT_ORDER[entry.components[i - 1]]) {
            errors.push(`${label}: "components" '${entry.components}' must be in ascending xyzw order`)
            break
        }
    }
}

function checkByteLayoutConflicts(entries, errors, label) {
    for (let i = 0; i < entries.length; i++) {
        const a = entries[i]
        for (let j = i + 1; j < entries.length; j++) {
            const b = entries[j]
            if (a.name === b.name) {
                errors.push(`${label}: duplicate byte-layout entries '${a.name}' (offsets ${a.offset} and ${b.offset})`)
                continue
            }
            const aStart = a.offset
            const aEnd = a.offset + a.size
            const bStart = b.offset
            const bEnd = b.offset + b.size
            if (aStart < bEnd && bStart < aEnd) {
                errors.push(`${label}: byte layout conflict: '${a.name}' (offset ${a.offset}, size ${a.size}) overlaps '${b.name}' (offset ${b.offset}, size ${b.size})`)
            }
        }
    }
}

function checkLayoutConflicts(entries, errors, label) {
    for (let i = 0; i < entries.length; i++) {
        const a = entries[i]
        if (!isObj(a) || !Number.isInteger(a.slot) || typeof a.components !== 'string') continue
        for (let j = i + 1; j < entries.length; j++) {
            const b = entries[j]
            if (!isObj(b) || !Number.isInteger(b.slot) || typeof b.components !== 'string') continue
            if (a.slot !== b.slot) continue
            const overlap = [...a.components].some(c => b.components.includes(c))
            if (a.components === b.components) {
                errors.push(`${label}: duplicate layout entries '${a.name}' and '${b.name}' claim slot ${a.slot} components '${a.components}'`)
            } else if (overlap) {
                errors.push(`${label}: layout conflict at slot ${a.slot}: '${a.name}' (${a.components}) overlaps '${b.name}' (${b.components})`)
            }
        }
    }
}

/**
 * Validate an enabledBy condition: global name string, {param, op} condition,
 * or {and: [...]}/{or: [...]} groups. References must name declared globals.
 */
function validateEnabledBy(cond, errors, label, context) {
    if (typeof cond === 'string') {
        if (!context.globalKeys.has(cond)) {
            errors.push(`${label}: enabledBy references unknown global '${cond}'`)
        }
        return
    }
    if (!isObj(cond)) {
        errors.push(`${label}: "enabledBy" must be a global name or condition object`)
        return
    }
    if (cond.and !== undefined || cond.or !== undefined) {
        for (const key of Object.keys(cond)) {
            if (key !== 'and' && key !== 'or') {
                errors.push(`${label}: unknown enabledBy field '${key}'`)
            }
        }
        for (const branch of ['and', 'or']) {
            if (cond[branch] !== undefined) {
                if (!Array.isArray(cond[branch])) {
                    errors.push(`${label}: "enabledBy.${branch}" must be an array`)
                } else {
                    for (const sub of cond[branch]) {
                        validateEnabledBy(sub, errors, label, context)
                    }
                }
            }
        }
        return
    }
    for (const key of Object.keys(cond)) {
        if (key !== 'param' && !ENABLED_BY_OPS.includes(key)) {
            errors.push(`${label}: unknown enabledBy field '${key}'`)
        }
    }
    if (typeof cond.param !== 'string' || !cond.param) {
        errors.push(`${label}: "enabledBy" requires a "param" string`)
        return
    }
    if (!context.globalKeys.has(cond.param)) {
        errors.push(`${label}: enabledBy references unknown global '${cond.param}'`)
    }
    if (!ENABLED_BY_OPS.some(op => cond[op] !== undefined)) {
        errors.push(`${label}: "enabledBy" requires one of eq/neq/lt/gt/in/notIn`)
    }
    if (cond.in !== undefined && !Array.isArray(cond.in)) {
        errors.push(`${label}: "enabledBy.in" must be an array`)
    }
    if (cond.notIn !== undefined && !Array.isArray(cond.notIn)) {
        errors.push(`${label}: "enabledBy.notIn" must be an array`)
    }
}

function validateUi(ui, errors, label, context) {
    if (!isObj(ui)) {
        errors.push(`${label}: must be an object`)
        return
    }
    for (const key of Object.keys(ui)) {
        if (!UI_KEYS.includes(key)) {
            errors.push(`${label}: unknown field '${key}'`)
        }
    }
    if (ui.label !== undefined && (typeof ui.label !== 'string' || !ui.label)) {
        errors.push(`${label}: "label" must be a non-empty string`)
    }
    if (ui.control !== undefined && ui.control !== false && !UI_CONTROLS.includes(ui.control)) {
        errors.push(`${label}: unknown control '${ui.control}'`)
    }
    if (ui.category !== undefined && (typeof ui.category !== 'string' || !ui.category)) {
        errors.push(`${label}: "category" must be a non-empty string`)
    }
    if (ui.hidden !== undefined && typeof ui.hidden !== 'boolean') {
        errors.push(`${label}: "hidden" must be a boolean`)
    }
    if (ui.multiline !== undefined && typeof ui.multiline !== 'boolean') {
        errors.push(`${label}: "multiline" must be a boolean`)
    }
    for (const key of ['hint', 'format', 'buttonLabel']) {
        if (ui[key] !== undefined && (typeof ui[key] !== 'string' || !ui[key])) {
            errors.push(`${label}: "${key}" must be a non-empty string`)
        }
    }
    if (ui.enabledBy !== undefined) {
        validateEnabledBy(ui.enabledBy, errors, label, context)
    }
}

function validateDefault(spec, errors, label) {
    const type = typeof spec.type === 'string' ? spec.type : null
    const value = spec.default

    switch (type) {
        case 'float':
        case 'palette':
        case 'button':
            if (!isFiniteNumber(value)) errors.push(`${label}: "default" must be a finite number`)
            break
        case 'int':
            if (!isFiniteNumber(value) || !Number.isInteger(value)) errors.push(`${label}: "default" must be a finite integer`)
            break
        case 'boolean':
            if (typeof value !== 'boolean') errors.push(`${label}: "default" must be a boolean`)
            break
        case 'vec2':
        case 'vec3':
        case 'vec4':
        case 'mat3': {
            const dims = type === 'vec2' ? 2 : type === 'vec3' ? 3 : type === 'vec4' ? 4 : 9
            if (!Array.isArray(value) || value.length !== dims || !value.every(isFiniteNumber)) {
                errors.push(`${label}: "default" must be an array of ${dims} finite numbers`)
            }
            break
        }
        case 'color':
            if (Array.isArray(value)) {
                if (value.length !== 3 || !value.every(isFiniteNumber)) {
                    errors.push(`${label}: "default" must be a 3-component color array`)
                }
            } else if (typeof value !== 'string' || !HEX_COLOR.test(value)) {
                errors.push(`${label}: "default" must be a 3-component color array or '#rrggbb' string`)
            }
            break
        case 'string':
            if (typeof value !== 'string') {
                errors.push(`${label}: "default" must be a string`)
            }
            break
        case 'surface':
        case 'volume':
        case 'geometry':
        case 'member':
            if (typeof value !== 'string') {
                errors.push(`${label}: "default" must be a string`)
            } else if (type === 'member') {
                const resolved = resolveStdEnum(value)
                if (!resolved || resolved.kind !== 'leaf') {
                    errors.push(`${label}: "default" '${value}' does not resolve to a std enum value`)
                }
            }
            break
        default:
            // Unknown type already reported separately.
            break
    }
}

/**
 * Resolve the component count a min/max/default array must have for a global
 * type. Non-vector types are scalar (1); color behaves as a 3-component
 * vector; mat3 carries 9 components.
 */
function rangeDims(type) {
    if (type === 'vec2') return 2
    if (type === 'vec3' || type === 'color') return 3
    if (type === 'vec4') return 4
    if (type === 'mat3') return 9
    return 1
}

/**
 * Validate min/max range bounds: each bound must be a finite number (broadcast
 * across the type's components) or an array of exactly the type's component
 * count of finite numbers. min and max must agree on scalar-vs-array form,
 * min must not exceed max (componentwise for arrays), and a numeric default
 * must fall inside the declared range.
 */
function validateRangeBounds(spec, errors, label) {
    const type = typeof spec.type === 'string' ? spec.type : null
    const dims = rangeDims(type)

    const boundValues = {}
    for (const field of ['min', 'max']) {
        const value = spec[field]
        if (value === undefined) continue
        if (isFiniteNumber(value)) {
            boundValues[field] = [value]
        } else if (Array.isArray(value) && value.length === dims && value.every(isFiniteNumber)) {
            boundValues[field] = value
        } else if (Array.isArray(value)) {
            errors.push(`${label}: "${field}" must be an array of ${dims} finite numbers for type '${type ?? 'unknown'}'`)
        } else {
            errors.push(`${label}: "${field}" must be a finite number or an array of ${dims} finite numbers`)
        }
    }

    if (boundValues.min !== undefined && boundValues.max !== undefined) {
        const sameForm = (boundValues.min.length === 1) === (boundValues.max.length === 1)
        if (!sameForm) {
            errors.push(`${label}: "min" and "max" must both be scalars or both be arrays`)
        } else {
            const min = boundValues.min
            const max = boundValues.max
            for (let i = 0; i < min.length; i++) {
                if (min[i] > max[i]) {
                    errors.push(`${label}: "min" must not exceed "max"`)
                    break
                }
            }
        }
    }

    // Default containment: broadcast scalar bounds, compare componentwise.
    const dflt = spec.default
    if (Array.isArray(dflt) && dflt.every(isFiniteNumber) &&
        boundValues.min !== undefined && boundValues.max !== undefined) {
        for (let i = 0; i < dflt.length; i++) {
            const min = boundValues.min.length === 1 ? boundValues.min[0] : boundValues.min[i]
            const max = boundValues.max.length === 1 ? boundValues.max[0] : boundValues.max[i]
            if (dflt[i] < min || dflt[i] > max) {
                errors.push(`${label}: default [${dflt.join(', ')}] is outside the declared range`)
                break
            }
        }
    } else if (isFiniteNumber(dflt) &&
        boundValues.min !== undefined && boundValues.max !== undefined &&
        boundValues.min.length === 1 && boundValues.max.length === 1) {
        if (dflt < boundValues.min[0] || dflt > boundValues.max[0]) {
            errors.push(`${label}: default ${dflt} is outside the declared range [${boundValues.min[0]}, ${boundValues.max[0]}]`)
        }
    }
}

function validateGlobals(globals, errors, context) {
    if (globals === undefined || globals === null) {
        return
    }
    if (!isObj(globals)) {
        errors.push('"globals" must be an object')
        return
    }

    const uniformOwners = new Map()
    for (const [key, spec] of Object.entries(globals)) {
        const label = `Global '${key}'`
        if (!isObj(spec)) {
            errors.push(`${label}: must be an object`)
            continue
        }

        for (const field of Object.keys(spec)) {
            if (!GLOBAL_SPEC_KEYS.includes(field)) {
                errors.push(`${label}: unknown field '${field}'`)
            }
        }

        if (!spec.type) {
            errors.push(`${label}: Missing "type"`)
        } else if (typeof spec.type !== 'string' || !GLOBAL_TYPES.includes(spec.type)) {
            errors.push(`${label}: Unknown type '${String(spec.type)}'`)
        }

        if (spec.default !== undefined) {
            validateDefault(spec, errors, label)
        }

        if (spec.min !== undefined || spec.max !== undefined) {
            validateRangeBounds(spec, errors, label)
        }

        for (const field of ['step', 'zero', 'randMin', 'randMax', 'randChance']) {
            if (spec[field] !== undefined && !isFiniteNumber(spec[field])) {
                errors.push(`${label}: "${field}" must be a finite number`)
            }
        }
        if (spec.randChoices !== undefined) {
            if (!Array.isArray(spec.randChoices) || !spec.randChoices.every(isFiniteNumber)) {
                errors.push(`${label}: "randChoices" must be an array of finite numbers`)
            }
        }

        if (spec.uniform !== undefined && (typeof spec.uniform !== 'string' || !spec.uniform)) {
            errors.push(`${label}: "uniform" must be a non-empty string`)
        } else if (typeof spec.uniform === 'string' && spec.uniform) {
            const owner = uniformOwners.get(spec.uniform)
            if (owner) {
                errors.push(`${label}: uniform '${spec.uniform}' conflicts with global '${owner}'`)
            } else {
                uniformOwners.set(spec.uniform, key)
            }
        }

        if (spec.define !== undefined && (typeof spec.define !== 'string' || !spec.define)) {
            errors.push(`${label}: "define" must be a non-empty string`)
        }

        if (spec.colorModeUniform !== undefined && (typeof spec.colorModeUniform !== 'string' || !spec.colorModeUniform)) {
            errors.push(`${label}: "colorModeUniform" must be a non-empty string`)
        }

        if (spec.choices !== undefined) {
            if (!isObj(spec.choices)) {
                errors.push(`${label}: "choices" must be an object mapping names to values`)
            } else {
                const numeric = []
                const stringType = spec.type === 'string'
                for (const [choiceName, value] of Object.entries(spec.choices)) {
                    if (value === null) continue // Section headers in dropdown menus.
                    if (stringType) {
                        // String-typed globals carry string-valued choices
                        // (e.g. font families); consumed by the UI control layer.
                        if (typeof value !== 'string') {
                            errors.push(`${label}: choices['${choiceName}'] must be a string for type 'string'`)
                        }
                        continue
                    }
                    if (!isFiniteNumber(value)) {
                        errors.push(`${label}: choices['${choiceName}'] must be a number or null`)
                    } else {
                        numeric.push(value)
                    }
                }
                if (numeric.length > 0 && isFiniteNumber(spec.default) && !numeric.includes(spec.default)) {
                    errors.push(`${label}: default ${spec.default} is not among the declared choice values`)
                }
            }
        }

        if (spec.enum !== undefined) {
            if (typeof spec.enum !== 'string' || !spec.enum) {
                errors.push(`${label}: "enum" must be a non-empty string`)
            } else {
                const resolved = resolveStdEnum(spec.enum)
                if (!resolved || resolved.kind !== 'table') {
                    errors.push(`${label}: enum '${spec.enum}' does not resolve to a std enum table`)
                }
            }
        }

        if (spec.ui !== undefined) {
            validateUi(spec.ui, errors, `${label}.ui`, context)
        }
    }
}

function validateTextureMap(textures, errors, containerName) {
    if (textures === undefined) {
        return
    }
    if (!isObj(textures)) {
        errors.push(`"${containerName}" must be an object`)
        return
    }
    for (const [name, spec] of Object.entries(textures)) {
        const label = `Texture '${name}'`
        if (!isObj(spec)) {
            errors.push(`${label}: must be an object`)
            continue
        }
        for (const key of Object.keys(spec)) {
            if (!TEXTURE_SPEC_KEYS.includes(key)) {
                errors.push(`${label}: unknown field '${key}'`)
            }
        }
        for (const dim of ['width', 'height']) {
            if (spec[dim] !== undefined) {
                validateDimSpec(spec[dim], errors, `${label}.${dim}`)
            }
        }
        if (spec.depth !== undefined && (!isFiniteNumber(spec.depth) || spec.depth <= 0)) {
            errors.push(`${label}: "depth" must be a positive finite number`)
        }
        if (spec.format !== undefined) {
            if (typeof spec.format !== 'string' || !FORMATS.includes(spec.format)) {
                errors.push(`${label}: unknown format '${spec.format}'`)
            }
        }
        if (spec.is3D !== undefined && typeof spec.is3D !== 'boolean') {
            errors.push(`${label}: "is3D" must be a boolean`)
        }
    }
}

function referencesGlobal(name, context) {
    return context.globalKeys.has(name) || context.globalUniformNames.has(name)
}

function validatePass(source, pass, index, errors, context) {
    const label = `Pass ${index}`
    if (!isObj(pass)) {
        errors.push(`${label}: must be an object`)
        return
    }

    if (!pass.program || typeof pass.program !== 'string') {
        errors.push(`${label}: Missing "program" string`)
    }

    for (const key of Object.keys(pass)) {
        if (!PASS_KEYS.includes(key)) {
            errors.push(`${label}: unknown field '${key}'`)
        }
    }

    if (pass.name !== undefined && (typeof pass.name !== 'string' || !pass.name)) {
        errors.push(`${label}: "name" must be a non-empty string`)
    }
    if (pass.entryPoint !== undefined && (typeof pass.entryPoint !== 'string' || !pass.entryPoint)) {
        errors.push(`${label}: "entryPoint" must be a non-empty string`)
    }
    if (pass.type !== undefined && !PASS_TYPES.includes(pass.type)) {
        errors.push(`${label}: unknown pass type '${pass.type}'`)
    }
    if (pass.drawMode !== undefined && !DRAW_MODES.includes(pass.drawMode)) {
        errors.push(`${label}: unknown drawMode '${pass.drawMode}'`)
    }
    if (pass.drawBuffers !== undefined &&
        (!Number.isInteger(pass.drawBuffers) || pass.drawBuffers < 1)) {
        errors.push(`${label}: "drawBuffers" must be a positive integer`)
    }
    if (pass.count !== undefined) {
        if (typeof pass.count === 'string') {
            if (!['auto', 'screen', 'input'].includes(pass.count)) {
                errors.push(`${label}: unknown count '${pass.count}'`)
            }
        } else if (!Number.isInteger(pass.count) || pass.count < 1) {
            errors.push(`${label}: "count" must be a positive integer, 'auto', 'screen', or 'input'`)
        }
    }
    if (pass.countUniform !== undefined) {
        if (typeof pass.countUniform !== 'string' || !pass.countUniform) {
            errors.push(`${label}: "countUniform" must be a non-empty string`)
        } else if (!referencesGlobal(pass.countUniform, context)) {
            errors.push(`${label}: countUniform '${pass.countUniform}' does not reference a declared global`)
        }
    }
    if (pass.repeat !== undefined) {
        if (typeof pass.repeat === 'string') {
            if (!pass.repeat) {
                errors.push(`${label}: "repeat" string must name a uniform`)
            }
        } else if (!Number.isInteger(pass.repeat) || pass.repeat < 1) {
            errors.push(`${label}: "repeat" must be a positive integer or a uniform name string`)
        }
    }
    if (pass.blend !== undefined) {
        if (typeof pass.blend !== 'boolean' &&
            (!Array.isArray(pass.blend) || pass.blend.length !== 2 ||
                !pass.blend.every(v => typeof v === 'string' && v))) {
            errors.push(`${label}: "blend" must be a boolean or [src, dst] factor strings`)
        }
    }
    if (pass.workgroups !== undefined) {
        if (!Array.isArray(pass.workgroups) || pass.workgroups.length < 1 || pass.workgroups.length > 3 ||
            !pass.workgroups.every(v => isFiniteNumber(v) || (typeof v === 'string' && v))) {
            errors.push(`${label}: "workgroups" must be an array of 1-3 numbers or uniform names`)
        }
    }
    if (pass.storageBuffers !== undefined && !isObj(pass.storageBuffers)) {
        errors.push(`${label}: "storageBuffers" must be an object`)
    }
    if (pass.storageTextures !== undefined && !isObj(pass.storageTextures)) {
        errors.push(`${label}: "storageTextures" must be an object`)
    }
    if (pass.viewport !== undefined) {
        if (!isObj(pass.viewport)) {
            errors.push(`${label}: "viewport" must be an object`)
        } else {
            for (const key of Object.keys(pass.viewport)) {
                if (key === 'width' || key === 'height') {
                    validateDimSpec(pass.viewport[key], errors, `${label}.viewport.${key}`)
                } else if (['x', 'y', 'w', 'h'].includes(key)) {
                    if (!isFiniteNumber(pass.viewport[key])) {
                        errors.push(`${label}.viewport.${key} must be a finite number`)
                    }
                } else {
                    errors.push(`${label}.viewport: unknown field '${key}'`)
                }
            }
        }
    }
    if (pass.conditions !== undefined) {
        if (!isObj(pass.conditions)) {
            errors.push(`${label}: "conditions" must be an object`)
        } else {
            for (const key of Object.keys(pass.conditions)) {
                if (!CONDITION_CONTAINER_KEYS.includes(key)) {
                    errors.push(`${label}.conditions: unknown field '${key}'`)
                }
            }
            for (const listKey of CONDITION_CONTAINER_KEYS) {
                const list = pass.conditions[listKey]
                if (list === undefined) continue
                if (!Array.isArray(list)) {
                    errors.push(`${label}.conditions.${listKey} must be an array`)
                    continue
                }
                for (const condition of list) {
                    if (!isObj(condition)) {
                        errors.push(`${label}.conditions.${listKey}: condition must be an object`)
                        continue
                    }
                    for (const key of Object.keys(condition)) {
                        if (key !== 'uniform' && key !== 'equals') {
                            errors.push(`${label}.conditions.${listKey}: unknown condition field '${key}'`)
                        }
                    }
                    if (typeof condition.uniform !== 'string' || !condition.uniform) {
                        errors.push(`${label}.conditions.${listKey}: "uniform" must be a non-empty string`)
                    } else if (!referencesGlobal(condition.uniform, context)) {
                        errors.push(`${label}.conditions.${listKey}: uniform '${condition.uniform}' does not reference a declared global`)
                    }
                    if (condition.equals === undefined) {
                        errors.push(`${label}.conditions.${listKey}: condition requires an "equals" value`)
                    }
                }
            }
        }
    }

    if (pass.uniforms !== undefined) {
        if (!isObj(pass.uniforms)) {
            errors.push(`${label}: "uniforms" must be an object`)
        } else {
            for (const [uniformName, value] of Object.entries(pass.uniforms)) {
                // Numeric literals are preserved; strings name runtime uniforms.
                if (!isFiniteNumber(value) && (typeof value !== 'string' || !value)) {
                    errors.push(`${label}: uniforms['${uniformName}'] must be a finite number or a non-empty string`)
                }
            }
        }
    }

    if (pass.defines !== undefined) {
        if (!isObj(pass.defines)) {
            errors.push(`${label}: "defines" must be an object`)
        } else {
            for (const [key, value] of Object.entries(pass.defines)) {
                if (typeof value !== 'string' && !isFiniteNumber(value)) {
                    errors.push(`${label}: defines['${key}'] must be a string or finite number`)
                }
            }
        }
    }

    const declaredTextures = new Set([
        ...Object.keys(source.textures || {}),
        ...Object.keys(source.textures3d || {})
    ])

    if (pass.inputs !== undefined) {
        if (!isObj(pass.inputs)) {
            errors.push(`${label}: "inputs" must be an object`)
        } else {
            for (const [uniformName, texRef] of Object.entries(pass.inputs)) {
                if (typeof texRef !== 'string' || !texRef) {
                    errors.push(`${label}: inputs['${uniformName}'] must be a non-empty texture reference string`)
                    continue
                }
                if (PIPELINE_INPUTS.has(texRef)) continue
                if (/^o[0-7]$/.test(texRef)) continue
                if (texRef.startsWith('global_')) continue
                if (declaredTextures.has(texRef)) continue
                if (context.globalKeys.has(texRef)) continue
                if (typeof source.externalTexture === 'string' && texRef === source.externalTexture) continue
                errors.push(`${label}: inputs['${uniformName}'] references unsupported texture '${texRef}'`)
            }
        }
    }

    if (pass.outputs !== undefined) {
        if (!isObj(pass.outputs)) {
            errors.push(`${label}: "outputs" must be an object`)
        } else {
            for (const [attachment, texRef] of Object.entries(pass.outputs)) {
                if (typeof texRef !== 'string' || !texRef) {
                    errors.push(`${label}: outputs['${attachment}'] must be a non-empty texture reference string`)
                    continue
                }
                if (PIPELINE_OUTPUTS.has(texRef)) continue
                if (texRef.startsWith('global_')) continue
                if (declaredTextures.has(texRef)) continue
                errors.push(`${label}: outputs['${attachment}'] references unsupported output '${texRef}'`)
            }
        }
    }
}

export function validateEffectDefinition(def) {
    const errors = []

    if (!def) {
        return ['Effect definition is null or undefined']
    }

    if (Array.isArray(def)) {
        errors.push('Effect definition must be a plain object or Effect instance, not an array')
        return errors
    }

    if (!isObj(def) && typeof def !== 'function') {
        errors.push(`Effect definition must be a plain object or Effect instance, not ${typeof def}`)
        return errors
    }

    // Effect instances and subclass constructors carry legitimate extra state
    // (runtime caches, counters, prototype methods, loaded shaders), so
    // top-level unknown-field diagnosis runs on plain definition objects only.
    // Nested declarative containers (globals/passes/textures/ui) are fully
    // diagnosed on every input shape.
    let source = def
    let diagnoseTopLevelUnknowns = true
    if (typeof def === 'function' && def.prototype instanceof Effect) {
        diagnoseTopLevelUnknowns = false
        const merged = Object.create(null)
        for (const key of Object.getOwnPropertyNames(def.prototype)) {
            if (key !== 'constructor') merged[key] = def.prototype[key]
        }
        for (const key of Object.getOwnPropertyNames(def)) {
            merged[key] = def[key]
        }
        source = merged
    } else if (def instanceof Effect) {
        diagnoseTopLevelUnknowns = false
        source = def
    }

    const context = {
        globalKeys: new Set(isObj(source.globals) ? Object.keys(source.globals) : []),
        globalUniformNames: new Set()
    }
    if (isObj(source.globals)) {
        for (const spec of Object.values(source.globals)) {
            if (isObj(spec) && typeof spec.uniform === 'string' && spec.uniform) {
                context.globalUniformNames.add(spec.uniform)
            }
        }
    }

    // --- name (existing message preserved) ---
    if (typeof source.name !== 'string' || !source.name) {
        errors.push('Missing or invalid "name" property')
    }

    // --- simple typed metadata ---
    if (source.namespace !== undefined && (typeof source.namespace !== 'string' || !source.namespace)) {
        errors.push('"namespace" must be a non-empty string')
    }
    if (source.func !== undefined && (typeof source.func !== 'string' || !source.func)) {
        errors.push('"func" must be a non-empty string')
    }
    if (source.description !== undefined && typeof source.description !== 'string') {
        errors.push('"description" must be a string')
    }
    if (source.tags !== undefined) {
        if (!Array.isArray(source.tags)) {
            errors.push('"tags" must be an array of tag strings')
        } else {
            for (const tag of source.tags) {
                if (typeof tag !== 'string' || !tag) {
                    errors.push('"tags" must contain non-empty strings')
                } else if (!VALID_TAGS.includes(tag)) {
                    errors.push(`Unknown tag '${tag}'`)
                }
            }
        }
    }
    if (source.openCategories !== undefined) {
        if (!Array.isArray(source.openCategories) || !source.openCategories.every(c => typeof c === 'string')) {
            errors.push('"openCategories" must be an array of strings')
        }
    }
    if (source.defaultProgram !== undefined && typeof source.defaultProgram !== 'string') {
        errors.push('"defaultProgram" must be a string')
    }
    if (source.hidden !== undefined && typeof source.hidden !== 'boolean') {
        errors.push('"hidden" must be a boolean')
    }
    if (source.deprecatedBy !== undefined && (typeof source.deprecatedBy !== 'string' || !source.deprecatedBy)) {
        errors.push('"deprecatedBy" must be a non-empty string')
    }
    if (source.externalTexture !== undefined && (typeof source.externalTexture !== 'string' || !source.externalTexture)) {
        errors.push('"externalTexture" must be a non-empty string')
    }
    if (source.externalMesh !== undefined && (typeof source.externalMesh !== 'string' || !source.externalMesh)) {
        errors.push('"externalMesh" must be a non-empty string')
    }
    if (source.builtinMeshes !== undefined) {
        if (!isObj(source.builtinMeshes)) {
            errors.push('"builtinMeshes" must be an object')
        } else {
            for (const [key, value] of Object.entries(source.builtinMeshes)) {
                if (typeof value !== 'string' || !value) {
                    errors.push(`builtinMeshes['${key}'] must be a non-empty string`)
                }
            }
        }
    }
    if (source.outputTex3d !== undefined && (typeof source.outputTex3d !== 'string' || !source.outputTex3d)) {
        errors.push('"outputTex3d" must be a non-empty string')
    }
    if (source.outputGeo !== undefined && (typeof source.outputGeo !== 'string' || !source.outputGeo)) {
        errors.push('"outputGeo" must be a non-empty string')
    }

    // --- lifecycle hooks must be functions ---
    for (const hook of ['onInit', 'onUpdate', 'onDestroy', 'asyncInit']) {
        const value = source[hook]
        if (value !== undefined && typeof value !== 'function') {
            errors.push(`"${hook}" must be a function`)
        }
    }

    // --- globals ---
    validateGlobals(source.globals, errors, context)

    // --- passes ---
    if (!source.passes || !Array.isArray(source.passes) || source.passes.length === 0) {
        errors.push('Missing or empty "passes" array')
    } else {
        for (let index = 0; index < source.passes.length; index++) {
            validatePass(source, source.passes[index], index, errors, context)
        }
    }

    // --- textures ---
    validateTextureMap(source.textures, errors, 'textures')
    validateTextureMap(source.textures3d, errors, 'textures3d')

    // --- shaders ---
    if (source.shaders !== undefined) {
        if (!isObj(source.shaders)) {
            errors.push('"shaders" must be an object mapping program names to shader maps')
        } else {
            for (const [prog, shaders] of Object.entries(source.shaders)) {
                if (!isObj(shaders)) {
                    errors.push(`shaders['${prog}'] must be an object`)
                }
            }
        }
    }

    // --- uniform layouts ---
    if (source.uniformLayout !== undefined) {
        validateUniformLayout(source.uniformLayout, errors, 'uniformLayout')
    }
    if (source.uniformLayouts !== undefined) {
        if (!isObj(source.uniformLayouts)) {
            errors.push('"uniformLayouts" must be an object mapping program names to layouts')
        } else {
            for (const [prog, layout] of Object.entries(source.uniformLayouts)) {
                validateUniformLayout(layout, errors, `uniformLayouts['${prog}']`)
            }
        }
    }

    // --- param aliases ---
    if (source.paramAliases !== undefined) {
        if (!isObj(source.paramAliases)) {
            errors.push('"paramAliases" must be an object mapping aliases to global names')
        } else {
            for (const [alias, target] of Object.entries(source.paramAliases)) {
                if (typeof target !== 'string' || !target) {
                    errors.push(`paramAliases['${alias}'] must be a non-empty string`)
                } else if (!context.globalKeys.has(target)) {
                    errors.push(`paramAliases['${alias}'] references unknown global '${target}'`)
                }
            }
        }
    }

    // --- top-level unknown-field diagnosis (plain definition objects only) ---
    if (diagnoseTopLevelUnknowns) {
        for (const key of Object.keys(def)) {
            if (!TOP_LEVEL_KEYS.has(key)) {
                errors.push(`Unknown definition field '${key}'`)
            }
        }
    }

    return errors
}

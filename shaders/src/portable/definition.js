/**
 * Portable effect packages: the format marker, the version 2 authoring profile
 * and the legacy path.
 *
 * A package that carries `format: "noisemaker-portable-effect"` is a version 2
 * package. It must state `version: 2`. Its passes are an object keyed by DSL
 * identifier, in declaration order. Every field is checked against the shared
 * grammar (./grammar.js), and an unknown field is a diagnostic with its path.
 * Older cores reject a version 2 package outright, because they read passes
 * only as an array.
 *
 * A package with no `format` takes the legacy path: it is returned unchanged,
 * with no diagnostics. So every package that registered before keeps
 * registering, through the checks of registerPortableEffect itself. A legacy
 * `version` field is the package's own metadata, and the normalizer does not
 * read it.
 *
 * normalizePortableDefinition() never throws, never mutates its input and runs
 * no code from a package. It returns the definition in the form the runtime
 * reads (passes as an array, each with its name) with the diagnostics.
 */

import * as grammar from './grammar.js'
import { validateEffectDefinition } from '../runtime/effect-validator.js'

const {
    PORTABLE_FORMAT, PORTABLE_VERSION, MARKER_KEYS, DECLARATIVE_TOP_LEVEL_KEYS,
    LIFECYCLE_KEYS, RUNTIME_STATE_KEYS, GLOBAL_SPEC_KEYS, GLOBAL_TYPES, UI_KEYS,
    UI_CONTROLS, PASS_KEYS, PASS_TYPES, DRAW_MODES, TEXTURE_SPEC_KEYS, FORMATS,
    TEXTURE_FILTERS, RESERVED_KEYS, IDENTIFIER_PATTERN, INERT_PASS_KEYS, INERT_PIPELINE_INPUTS,
} = grammar

const IDENTIFIER = new RegExp(IDENTIFIER_PATTERN)

/** The top-level fields of a version 2 package, in the order the schema lists them. */
export const PACKAGE_KEYS = Object.freeze([...MARKER_KEYS, ...DECLARATIVE_TOP_LEVEL_KEYS, 'starter'])

// Source text of a function, which a declarative package must not carry.
const FUNCTION_SOURCE = /^\s*(async\s+)?function\b|^\s*(async\s*)?\([^)]*\)\s*=>|^\s*(async\s+)?[A-Za-z_$][\w$]*\s*=>/

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// A copy of a record without the given keys, in the record's key order.
function omit(record, keys) {
    return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)))
}

function diagnostic(code, path, message) {
    return { code, path, message }
}

function join(path, key) {
    return path ? `${path}.${key}` : String(key)
}

// Reserved keys and executable values, at any depth.
function scanValues(value, path, diagnostics, seen = new Set()) {
    if (typeof value === 'function') {
        diagnostics.push(diagnostic('function-value', path, `${path || 'the package'} is a function; a package holds data only`))
        return
    }
    if (typeof value === 'string') {
        if (FUNCTION_SOURCE.test(value)) {
            diagnostics.push(diagnostic('function-string', path, `${path} holds function source; a package holds data only`))
        }
        return
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    for (const key of Object.keys(value)) {
        const childPath = join(path, key)
        if (RESERVED_KEYS.includes(key)) {
            diagnostics.push(diagnostic('reserved-key', childPath, `${childPath} uses the reserved key ${key}`))
            continue
        }
        scanValues(value[key], childPath, diagnostics, seen)
    }
}

// The number of single-character edits between two names.
function editDistance(a, b) {
    const row = Array.from({ length: b.length + 1 }, (_, index) => index)
    for (let i = 1; i <= a.length; i++) {
        let previous = row[0]
        row[0] = i
        for (let j = 1; j <= b.length; j++) {
            const current = row[j]
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
            previous = current
        }
    }
    return row[b.length]
}

// "is not a field", with the nearest known field when one is close.
function unknownFieldMessage(path, key, known) {
    const nearest = known
        .map((candidate) => [candidate, editDistance(key.toLowerCase(), candidate.toLowerCase())])
        .filter(([, distance]) => distance <= 2)
        .sort((x, y) => x[1] - y[1])[0]
    return `${path} is not a field of a version 2 package${nearest ? `; did you mean ${nearest[0]}?` : ''}`
}

function unknownFields(value, known, path, diagnostics) {
    for (const key of Object.keys(value)) {
        if (!known.includes(key) && !RESERVED_KEYS.includes(key)) {
            diagnostics.push(diagnostic('unknown-field', join(path, key), unknownFieldMessage(join(path, key), key, known)))
        }
    }
}

const IDENTIFIER_RULE = 'letters, digits and underscores, not starting with a digit'

function checkEnum(value, allowed, path, diagnostics) {
    if (value !== undefined && !allowed.includes(value)) {
        diagnostics.push(diagnostic('invalid-value', path, `${path} must be one of ${allowed.join(', ')}`))
    }
}

function checkGlobals(globals, diagnostics) {
    if (globals === undefined) return
    if (!isRecord(globals)) {
        diagnostics.push(diagnostic('invalid-value', 'globals', 'globals must be an object of parameters'))
        return
    }
    for (const [name, spec] of Object.entries(globals)) {
        const path = `globals.${name}`
        if (!IDENTIFIER.test(name)) diagnostics.push(diagnostic('invalid-name', path, `${path}: a parameter name is a DSL identifier (${IDENTIFIER_RULE})`))
        if (!isRecord(spec)) {
            diagnostics.push(diagnostic('invalid-value', path, `${path} must be a parameter object`))
            continue
        }
        unknownFields(spec, GLOBAL_SPEC_KEYS, path, diagnostics)
        if (spec.type === undefined) diagnostics.push(diagnostic('missing-field', `${path}.type`, `${path}.type is required`))
        checkEnum(spec.type, GLOBAL_TYPES, `${path}.type`, diagnostics)
        if (spec.ui !== undefined) {
            if (!isRecord(spec.ui)) {
                diagnostics.push(diagnostic('invalid-value', `${path}.ui`, `${path}.ui must be an object`))
            } else {
                unknownFields(spec.ui, UI_KEYS, `${path}.ui`, diagnostics)
                // false hides the parameter's control.
                if (spec.ui.control !== false) checkEnum(spec.ui.control, UI_CONTROLS, `${path}.ui.control`, diagnostics)
            }
        }
    }
}

function checkTextures(textures, field, diagnostics) {
    if (textures === undefined) return
    if (!isRecord(textures)) {
        diagnostics.push(diagnostic('invalid-value', field, `${field} must be an object of texture descriptors`))
        return
    }
    for (const [name, spec] of Object.entries(textures)) {
        const path = `${field}.${name}`
        if (!isRecord(spec)) {
            diagnostics.push(diagnostic('invalid-value', path, `${path} must be a texture descriptor`))
            continue
        }
        unknownFields(spec, TEXTURE_SPEC_KEYS, path, diagnostics)
        checkEnum(spec.format, FORMATS, `${path}.format`, diagnostics)
        checkEnum(spec.filter, TEXTURE_FILTERS, `${path}.filter`, diagnostics)
    }
}

// Version 2 passes: an object keyed by DSL identifier, in declaration order.
function normalizePasses(passes, diagnostics) {
    if (!isRecord(passes) || Object.keys(passes).length === 0) {
        diagnostics.push(diagnostic('invalid-passes', 'passes',
            Array.isArray(passes)
                ? 'passes is an array, the legacy form; in version 2 it is an object keyed by pass name: { "main": { "program": "..." } }'
                : 'passes must be a non-empty object keyed by pass name: { "main": { "program": "..." } }'))
        return []
    }
    const list = []
    for (const [name, pass] of Object.entries(passes)) {
        const path = `passes.${name}`
        if (!IDENTIFIER.test(name)) diagnostics.push(diagnostic('invalid-name', path, `${path}: a pass name is a DSL identifier (${IDENTIFIER_RULE})`))
        if (!isRecord(pass)) {
            diagnostics.push(diagnostic('invalid-value', path, `${path} must be a pass object`))
            continue
        }
        unknownFields(pass, PASS_KEYS, path, diagnostics)
        for (const key of INERT_PASS_KEYS) {
            if (pass[key] !== undefined) {
                diagnostics.push(diagnostic('unsupported-field', `${path}.${key}`,
                    `${path}.${key} has no effect: the backends allocate storage buffers from the shader bindings; remove it`))
            }
        }
        if (isRecord(pass.inputs)) {
            for (const [binding, texture] of Object.entries(pass.inputs)) {
                if (INERT_PIPELINE_INPUTS.includes(texture)) {
                    diagnostics.push(diagnostic('unsupported-field', `${path}.inputs.${binding}`,
                        `${path}.inputs.${binding}: the ${texture} input has no effect, because nothing writes it and it always reads blank`))
                }
            }
        }
        if (Array.isArray(pass.workgroups) && pass.workgroups.some(value => typeof value === 'string')) {
            diagnostics.push(diagnostic('unsupported-field', `${path}.workgroups`,
                `${path}.workgroups: a uniform name has no effect, because the dispatch size is never resolved from one; give positive integers`))
        }
        if (pass.name !== undefined && pass.name !== name) {
            diagnostics.push(diagnostic('invalid-value', `${path}.name`, `${path}.name must equal its key, or be left out`))
        }
        if (typeof pass.program !== 'string' || pass.program.length === 0) {
            diagnostics.push(diagnostic('missing-field', `${path}.program`, `${path}.program must name a shader program`))
        }
        checkEnum(pass.type, PASS_TYPES, `${path}.type`, diagnostics)
        checkEnum(pass.drawMode, DRAW_MODES, `${path}.drawMode`, diagnostics)
        list.push({ name, ...omit(pass, ['name']) })
    }
    return list
}

/**
 * Read a Portable package.
 * @param {object} pkg - The package, as parsed JSON
 * @param {object} [options]
 * @param {boolean} [options.loadedShaders=false] - The package carries the
 *   shader sources a host loaded beside it (registerPortableEffect's input)
 * @returns {{profile: 'legacy'|'v2'|null, definition: object|null, diagnostics: Array<{code: string, path: string, message: string}>}}
 */
export function normalizePortableDefinition(pkg, { loadedShaders = false } = {}) {
    if (!isRecord(pkg)) {
        return { profile: null, definition: null, diagnostics: [diagnostic('not-an-object', '', 'a package is a JSON object')] }
    }
    if (pkg.format === undefined) {
        // Passes keyed by name are the version 2 form, which no core ever
        // registered without its marker: say so here, instead of leaving the
        // author with the legacy path's "passes must be a nonempty array".
        if (isRecord(pkg.passes)) {
            return {
                profile: 'legacy',
                definition: null,
                diagnostics: [diagnostic('missing-format', 'format',
                    `passes is keyed by name, the version 2 form, but the package has no format marker; add "format": "${PORTABLE_FORMAT}" and "version": ${PORTABLE_VERSION}`)],
            }
        }
        return { profile: 'legacy', definition: pkg, diagnostics: [] }
    }

    const diagnostics = []
    if (pkg.format !== PORTABLE_FORMAT) {
        diagnostics.push(diagnostic('unsupported-format', 'format', `format must be "${PORTABLE_FORMAT}"`))
        return { profile: null, definition: null, diagnostics }
    }
    if (pkg.version !== PORTABLE_VERSION) {
        diagnostics.push(diagnostic('unsupported-version', 'version',
            pkg.version === undefined
                ? `a package with a format marker states version ${PORTABLE_VERSION}`
                : `version ${JSON.stringify(pkg.version)} is not supported; this core reads version ${PORTABLE_VERSION}. ` +
                    'A legacy package carries neither format nor version'))
        return { profile: null, definition: null, diagnostics }
    }

    const { shaders, ...declared } = pkg
    scanValues(omit(declared, LIFECYCLE_KEYS), '', diagnostics)
    for (const key of Object.keys(declared)) {
        if (PACKAGE_KEYS.includes(key) || RESERVED_KEYS.includes(key)) continue
        if (key === 'paramAliases') {
            diagnostics.push(diagnostic('unsupported-field', 'paramAliases', 'paramAliases is not supported in a Portable package; rename the parameter instead'))
        } else if (LIFECYCLE_KEYS.includes(key) || RUNTIME_STATE_KEYS.includes(key)) {
            diagnostics.push(diagnostic('unsupported-field', key, `${key} belongs to JS definitions; a package holds data only`))
        } else {
            diagnostics.push(diagnostic('unknown-field', key, unknownFieldMessage(key, key, PACKAGE_KEYS)))
        }
    }
    if (shaders !== undefined && !loadedShaders) {
        diagnostics.push(diagnostic('unknown-field', 'shaders', 'shaders is not a field of a version 2 package: shader sources are files beside it'))
    }
    const func = declared.func ?? declared.name
    if (typeof func !== 'string' || !IDENTIFIER.test(func)) {
        diagnostics.push(diagnostic('missing-field', declared.func === undefined ? 'name' : 'func', 'func, or name when func is left out, must be a DSL identifier'))
    }
    if (declared.starter !== undefined && typeof declared.starter !== 'boolean') {
        diagnostics.push(diagnostic('invalid-value', 'starter', 'starter must be true or false'))
    }
    checkGlobals(declared.globals, diagnostics)
    checkTextures(declared.textures, 'textures', diagnostics)
    checkTextures(declared.textures3d, 'textures3d', diagnostics)
    const passes = normalizePasses(declared.passes, diagnostics)
    if (diagnostics.length > 0) return { profile: 'v2', definition: null, diagnostics }

    const definition = { ...omit(declared, MARKER_KEYS), passes }
    // starter is a package field that registration reads; an effect definition has none.
    for (const message of validateEffectDefinition(omit(definition, ['starter']))) {
        const pass = /^Pass (\d+)((?:\.[A-Za-z]+)*)(?:: | )(.*)$/s.exec(message)
        const name = pass ? passes[Number(pass[1])]?.name : undefined
        const global = /^Global '([^']+)': (.*)$/s.exec(message)
        const texture = /^Texture '([^']+)'((?:\.[A-Za-z]+)*): (.*)$/s.exec(message)
        const field = /^"([A-Za-z0-9_]+)" (.*)$/s.exec(message)
        if (name) {
            const path = `passes.${name}${pass[2] ?? ''}`
            diagnostics.push(diagnostic('invalid-declaration', path, `${path}: ${pass[3]}`))
        } else if (texture) {
            const table = isRecord(declared.textures3d) && Object.hasOwn(declared.textures3d, texture[1]) ? 'textures3d' : 'textures'
            const path = `${table}.${texture[1]}${texture[2]}`
            diagnostics.push(diagnostic('invalid-declaration', path, `${path}: ${texture[3]}`))
        } else if (field && DECLARATIVE_TOP_LEVEL_KEYS.includes(field[1])) {
            diagnostics.push(diagnostic('invalid-declaration', field[1], `${field[1]} ${field[2]}`))
        } else if (global) {
            diagnostics.push(diagnostic('invalid-declaration', `globals.${global[1]}`, `globals.${global[1]}: ${global[2]}`))
        } else if (/^Unknown tag /.test(message)) {
            diagnostics.push(diagnostic('invalid-declaration', 'tags', message))
        } else {
            diagnostics.push(diagnostic('invalid-declaration', '', message))
        }
    }
    if (diagnostics.length > 0) return { profile: 'v2', definition: null, diagnostics }
    if (shaders !== undefined) definition.shaders = shaders
    return { profile: 'v2', definition, diagnostics }
}

/**
 * Write a declaration in the version 2 form: the marker first, then its
 * declarative fields in their order, with passes keyed by name. The
 * declaration's passes must each have a unique DSL identifier name.
 * @param {object} declaration - A definition in the runtime form
 * @returns {object}
 */
export function toPortablePackage(declaration) {
    const pkg = { format: PORTABLE_FORMAT, version: PORTABLE_VERSION }
    for (const key of Object.keys(declaration)) {
        if (!PACKAGE_KEYS.includes(key) || MARKER_KEYS.includes(key)) continue
        if (key === 'passes') {
            pkg.passes = {}
            for (const { name, ...pass } of declaration.passes) pkg.passes[name] = pass
        } else {
            pkg[key] = declaration[key]
        }
    }
    return pkg
}

/**
 * The shared native catalog reader for Node tooling, and the compatibility
 * modules generated from it.
 *
 * An effect's authored definition is its definition.json. Its definition.js
 * is then a module generated from that JSON (generateWrapper), which keeps
 * the source import path, the export kind and the class or instance shape
 * that consumers of definition.js rely on. Until every effect has its JSON,
 * the repository's own definition.js modules are read as they are, but only
 * when the caller allows it (allowLegacyCatalog) and only for the effects the
 * catalog baseline enumerates. A third party's definition.js is never run.
 *
 * Each entry's `definition` is the effect's complete metadata: every field of
 * the Effect that the runtime builds from it, as definitionSchema() gives it.
 * An effect read from its JSON and the same effect read from its legacy
 * module give the same metadata.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { normalizePortableDefinition } from '../../shaders/src/portable/definition.js'
import { composeCatalogCapabilities } from '../../shaders/src/portable/instantiate.js'
// The engine's capability providers, which the catalog's effects compose.
import '../../shaders/src/portable/providers/index.js'
import { loadPortablePackage } from '../../shaders/src/portable/package.js'
import { Effect } from '../../shaders/src/runtime/effect.js'
import { definitionSchema } from '../../shaders/tests/definition-schema.js'

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const EFFECTS_ROOT = path.join(REPO_ROOT, 'shaders/effects')
const BASELINE = path.join(REPO_ROOT, 'shaders/tests/fixtures/portable/catalog-baseline.json')

// The first line of every generated module, which also marks it as generated.
export const GENERATED_HEADER = '// Generated from definition.json by scripts/migrate-portable-effects.mjs. Do not edit.'

const compareNames = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

/** A package directory's files, by their path from its root, as bytes. */
export function readPackageDirectory(dir) {
    const files = new Map()
    const walk = (folder, prefix) => {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => compareNames(a.name, b.name))) {
            const relative = prefix + entry.name
            const full = path.join(folder, entry.name)
            if (entry.isDirectory()) walk(full, `${relative}/`)
            else if (entry.isFile()) files.set(relative, new Uint8Array(fs.readFileSync(full)))
        }
    }
    walk(dir, '')
    return files
}

/**
 * An effect directory's shader sources by program, as the loaders key them:
 * glsl (or vertex and fragment) and wgsl.
 */
export function readShaderFiles(dir) {
    const shaders = {}
    const stages = { glsl: { '.glsl': 'glsl', '.vert': 'vertex', '.frag': 'fragment' }, wgsl: { '.wgsl': 'wgsl' } }
    for (const [language, extensions] of Object.entries(stages)) {
        const folder = path.join(dir, language)
        if (!fs.existsSync(folder)) continue
        for (const name of fs.readdirSync(folder).sort(compareNames)) {
            const extension = path.extname(name)
            const stage = extensions[extension]
            if (!stage) continue
            const program = name.slice(0, -extension.length)
            ;(shaders[program] ??= {})[stage] = fs.readFileSync(path.join(folder, name), 'utf8')
        }
    }
    return shaders
}

const isAliasMap = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.entries(value).every(([from, to]) => typeof from === 'string' && typeof to === 'string' && to.length > 0)

/**
 * The definition JSON of the effect at `dir`, read and checked as a package
 * through the engine's own loader, in the runtime form that registration
 * gives it (normalizePortableDefinition): { definition, shaders, diagnostics }.
 *
 * With `catalog`, the JSON is one of the engine's own catalog definitions,
 * read in the catalog context: it may carry paramAliases, the deprecated
 * parameter names that keep saved catalog programs working. They are taken
 * out before the package check and carried on the definition, as the catalog
 * registers them. A package from anyone else is refused for them.
 */
export function readDefinitionJson(dir, { catalog = false } = {}) {
    const files = readPackageDirectory(dir)
    let aliases
    if (catalog && files.has('definition.json')) {
        let raw = null
        try {
            raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(files.get('definition.json')))
        } catch {
            // The package loader reports what is wrong with it.
        }
        if (raw && typeof raw === 'object' && !Array.isArray(raw) && Object.hasOwn(raw, 'paramAliases')) {
            aliases = raw.paramAliases
            delete raw.paramAliases
            files.set('definition.json', new TextEncoder().encode(JSON.stringify(raw)))
        }
    }
    const loaded = loadPortablePackage(files)
    if (loaded.diagnostics.length) return { definition: null, shaders: null, diagnostics: loaded.diagnostics }
    const normalized = normalizePortableDefinition(loaded.definition, { loadedShaders: false })
    if (aliases !== undefined) {
        if (!isAliasMap(aliases)) {
            return { definition: null, shaders: null, diagnostics: [{ code: 'invalid-value', path: 'paramAliases', message: 'paramAliases maps each deprecated parameter name to the name of the parameter it stands for' }] }
        }
        normalized.definition.paramAliases = aliases
    }
    return { definition: normalized.definition, shaders: loaded.shaders, diagnostics: normalized.diagnostics }
}

/**
 * The methods an effect's class defines beyond Effect's, by name. They are
 * behavior, which a definition.json does not hold.
 */
export function definedMethods(instance) {
    // The prototypes from the instance's class up to, and not including, its
    // base class: Effect, from whichever copy of the engine defined it.
    const chain = []
    for (let proto = Object.getPrototypeOf(instance); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) chain.push(proto)
    const names = new Set()
    for (const proto of chain.slice(0, -1)) {
        for (const name of Object.getOwnPropertyNames(proto)) {
            if (name !== 'constructor' && typeof Object.getOwnPropertyDescriptor(proto, name).value === 'function') names.add(name)
        }
    }
    return [...names].sort(compareNames)
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/
const LIFECYCLE_HOOKS = ['onInit', 'onUpdate', 'asyncInit', 'onDestroy']
const declaresCapabilities = definition => Array.isArray(definition.capabilities) && definition.capabilities.length > 0
const literal = (value, indent = '') => JSON.stringify(value, null, 4).split('\n').join(`\n${indent}`)

// Whether the module defines a class of its own: for a class export, for an
// effect whose capabilities give it methods, and for an instance of a named
// subclass.
function definesClass({ definition, exportKind, className }) {
    if (exportKind !== 'instance' && exportKind !== 'class') {
        throw new Error(`${definition.func}: unknown export kind ${JSON.stringify(exportKind)}`)
    }
    const named = exportKind === 'class' || declaresCapabilities(definition) || className !== undefined
    if (named && !IDENTIFIER.test(className ?? '')) {
        throw new Error(`${definition.func}: class name ${JSON.stringify(className)} is not an identifier`)
    }
    return named
}

// The lifecycle hooks and methods that a definition's capabilities give its
// class, from the providers in the engine's registry.
function capabilityMembers(definition) {
    const composed = composeCatalogCapabilities(definition)
    return {
        composed,
        hooks: LIFECYCLE_HOOKS.filter(hook => typeof composed.hooks[hook] === 'function'),
        methods: Object.keys(composed.methods).sort(compareNames),
    }
}

/**
 * The Effect that a definition's generated module exports, built the same way
 * that module builds it: an Effect of the definition, or an instance of a class
 * whose fields are the definition's fields and, for an effect that declares
 * capabilities, whose methods are the ones its providers give.
 */
export function instantiateCatalogDefinition(shape) {
    const { definition, className } = shape
    if (!definesClass(shape)) return new Effect(structuredClone(definition))
    let Named
    if (declaresCapabilities(definition)) {
        const { composed, hooks, methods } = capabilityMembers(definition)
        // Registration takes starter out of a package's fields; a catalog
        // effect keeps the starter it declares.
        const starter = starterConfig(definition.starter)
        Named = { [className]: class extends Effect { constructor() { super({ ...structuredClone(composed.fields), ...starter }); composed.attach(this) } } }[className]
        for (const hook of hooks) {
            Object.defineProperty(Named.prototype, hook, { value: function (...args) { return composed.hooks[hook].apply(this, args) }, writable: true, configurable: true })
        }
        for (const method of methods) {
            Object.defineProperty(Named.prototype, method, { value: function (...args) { return composed.methods[method].apply(this, args) }, writable: true, configurable: true })
        }
    } else {
        const { starter, ...fields } = structuredClone(definition)
        const config = starterConfig(starter)
        Named = { [className]: class extends Effect { constructor() { super(config); Object.assign(this, structuredClone(fields)) } } }[className]
    }
    return new Named()
}

// The Effect config that keeps a declared starter, which the Effect holds as a
// property that is not enumerable, so a class field must not declare it.
const starterConfig = starter => (typeof starter === 'boolean' ? { starter } : undefined)

/**
 * The text of the compatibility module generated for a definition: it embeds
 * the definition as a JavaScript literal and imports no JSON module. An effect
 * that declares capabilities composes them from the engine's providers, and
 * its class defines the lifecycle hooks and methods they give.
 */
export function generateWrapper(shape) {
    const { definition, exportKind, className } = shape
    const lines = [GENERATED_HEADER, "import { Effect } from '../../../src/runtime/effect.js'"]
    if (!definesClass(shape)) {
        lines.push('', `export default new Effect(${literal(definition)})`)
        return `${lines.join('\n')}\n`
    }
    if (declaresCapabilities(definition)) {
        const { hooks, methods } = capabilityMembers(definition)
        lines.push("import { composeCatalogCapabilities } from '../../../src/portable/instantiate.js'", "import '../../../src/portable/providers/index.js'", '')
        lines.push(`const capabilities = composeCatalogCapabilities(${literal(definition)})`, '')
        // The declared starter goes to the constructor beside the fields,
        // which registration's composition leaves it out of.
        const starter = starterConfig(definition.starter)
        const config = starter ? `{ ...structuredClone(capabilities.fields), ${JSON.stringify(Object.keys(starter)[0])}: ${starter.starter} }` : 'structuredClone(capabilities.fields)'
        lines.push(`class ${className} extends Effect {`, '    constructor() {', `        super(${config})`, '        capabilities.attach(this)', '    }')
        for (const hook of hooks) {
            lines.push('', `    ${hook}(...args) {`, `        return capabilities.hooks.${hook}.apply(this, args)`, '    }')
        }
        for (const method of methods) {
            const name = IDENTIFIER.test(method) ? method : `[${JSON.stringify(method)}]`
            lines.push('', `    ${name}(...args) {`, `        return capabilities.methods[${JSON.stringify(method)}].apply(this, args)`, '    }')
        }
        lines.push('}')
    } else {
        const { starter, ...fields } = definition
        lines.push('', `class ${className} extends Effect {`)
        if (starterConfig(starter)) lines.push('    constructor() {', `        super(${JSON.stringify(starterConfig(starter))})`, '    }', '')
        for (const [key, value] of Object.entries(fields)) lines.push(`    ${JSON.stringify(key)} = ${literal(value, '    ')}`)
        lines.push('}')
    }
    lines.push('', exportKind === 'class' ? `export default ${className}` : `export default new ${className}()`)
    return `${lines.join('\n')}\n`
}

/**
 * The complete metadata of the effect whose definition.json is in `dir`, as
 * { effectId, definition, shaders, exportKind }. Its export kind and class
 * name come from `exportShapes` (by default the catalog baseline's), by the
 * ID its last two path segments give; an effect the baseline does not list
 * exports an instance.
 */
export function readEffectDefinition(dir, { exportShapes } = {}) {
    const effectId = path.resolve(dir).split(path.sep).slice(-2).join('/')
    const read = readDefinitionJson(dir, { catalog: true })
    if (read.diagnostics.length) throw Object.assign(new Error(`${effectId}: definition.json does not load`), { diagnostics: read.diagnostics })
    const shape = (exportShapes ?? baselineExportShapes().shapes).get(effectId) ?? { exportKind: 'instance' }
    const instance = instantiateCatalogDefinition({ definition: read.definition, ...shape })
    return { effectId, definition: definitionSchema(instance), shaders: read.shaders, exportKind: shape.exportKind, starter: instance.starter }
}

// An effect's schema with the starter it declares, which the Effect holds as a
// property that is not enumerable, so its schema does not carry it.
function withStarter(schema, starter) {
    return typeof starter === 'boolean' ? { ...schema, starter } : schema
}

/**
 * The complete metadata of the catalog effect in `dir`, the same whichever form
 * it is in: read from its definition.json when it has one, and otherwise from
 * the Effect that its legacy definition.js exports. Null when it has neither.
 * Readers of a definition use this, never the text of a definition.js, whose
 * generated form is not the legacy form.
 */
export async function readCatalogMetadata(dir, { exportShapes } = {}) {
    if (fs.existsSync(path.join(dir, 'definition.json'))) {
        const { definition, starter } = readEffectDefinition(dir, { exportShapes })
        return withStarter(definition, starter)
    }
    const file = path.join(dir, 'definition.js')
    if (!fs.existsSync(file)) return null
    const exported = (await import(pathToFileURL(file).href)).default
    const instance = typeof exported === 'function' ? new exported() : exported
    return withStarter(definitionSchema(instance), instance.starter)
}

/** The catalog baseline's export kinds and class names, by effect ID. */
export function baselineExportShapes(baselinePath = BASELINE) {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    const shapes = new Map()
    for (const [id, kind] of baseline.exportKinds) {
        const classes = baseline.metadata?.[id]?.classes ?? []
        // The class the module defines: the class exported, or the named
        // subclass of Effect that an instance export is made from.
        const className = classes[0] && classes[0] !== 'Effect' ? classes[0] : undefined
        shapes.set(id, { exportKind: kind, className })
    }
    return { shapes, effectIds: [...baseline.effectIds] }
}

function effectDirectories(effectsRoot) {
    const found = []
    for (const namespace of fs.readdirSync(effectsRoot, { withFileTypes: true }).sort((a, b) => compareNames(a.name, b.name))) {
        if (!namespace.isDirectory()) continue
        const namespaceDir = path.join(effectsRoot, namespace.name)
        for (const effect of fs.readdirSync(namespaceDir, { withFileTypes: true }).sort((a, b) => compareNames(a.name, b.name))) {
            if (!effect.isDirectory()) continue
            const directory = path.join(namespaceDir, effect.name)
            const hasJson = fs.existsSync(path.join(directory, 'definition.json'))
            const hasJs = fs.existsSync(path.join(directory, 'definition.js'))
            if (hasJson || hasJs) found.push({ effectId: `${namespace.name}/${effect.name}`, directory, hasJson, hasJs })
        }
    }
    return found
}

/**
 * Read the catalog under `effectsRoot`, sorted by effect ID, as
 * [{ effectId, directory, definition, shaders, exportKind, source }].
 *
 * An effect with a definition.json is read from it. Its definition.js, when
 * it has one, must be the module generated from that JSON, or the read
 * fails. An effect with only a definition.js is read only with
 * allowLegacyCatalog, and only when its ID is in `legacyIds` (by default the
 * catalog baseline's IDs): the module is imported, as the runtime imports it.
 * `exportShapes` gives each effect's export kind and class name (by default
 * the catalog baseline's).
 */
export async function readPortableCatalog({ effectsRoot = EFFECTS_ROOT, allowLegacyCatalog = false, legacyIds, exportShapes } = {}) {
    const baseline = (!legacyIds || !exportShapes) ? baselineExportShapes() : null
    const trusted = new Set(legacyIds ?? baseline.effectIds)
    const shapes = exportShapes ?? baseline.shapes
    const entries = []
    for (const { effectId, directory, hasJson, hasJs } of effectDirectories(effectsRoot)) {
        const shape = shapes.get(effectId)
        if (hasJson) {
            const read = readDefinitionJson(directory, { catalog: true })
            if (read.diagnostics.length) {
                throw Object.assign(new Error(`${effectId}: definition.json does not load`), { diagnostics: read.diagnostics })
            }
            if (!shape) throw new Error(`${effectId}: no export kind is recorded for it`)
            const input = { definition: read.definition, ...shape }
            if (hasJs) {
                const module = fs.readFileSync(path.join(directory, 'definition.js'), 'utf8').replace(/\r\n/g, '\n')
                if (module !== generateWrapper(input)) {
                    throw new Error(`${effectId}: definition.js is not the module generated from definition.json; run node scripts/migrate-portable-effects.mjs`)
                }
            }
            const instance = instantiateCatalogDefinition(input)
            entries.push({ effectId, directory, definition: definitionSchema(instance), shaders: read.shaders, exportKind: shape.exportKind, source: 'json' })
            continue
        }
        if (!allowLegacyCatalog) throw new Error(`${effectId}: has no definition.json, and the legacy catalog is not allowed`)
        if (!trusted.has(effectId)) throw new Error(`${effectId}: its definition.js is not one of the catalog's own, so it is not run`)
        const module = await import(pathToFileURL(path.join(directory, 'definition.js')).href)
        const exported = module.default
        const exportKind = typeof exported === 'function' ? 'class' : 'instance'
        const instance = exportKind === 'class' ? new exported() : exported
        entries.push({ effectId, directory, definition: definitionSchema(instance), shaders: readShaderFiles(directory), exportKind, source: 'legacy' })
    }
    return entries
}

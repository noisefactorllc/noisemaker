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

function assertGeneratable(definition) {
    if (Array.isArray(definition.capabilities) && definition.capabilities.length > 0) {
        throw new Error(`${definition.func}: a definition that declares capabilities has no generated module yet`)
    }
}

/**
 * The Effect that a definition's generated module exports, built the same way
 * that module builds it: an Effect of the definition, or an instance of a class
 * whose fields are the definition's fields.
 */
export function instantiateCatalogDefinition({ definition, exportKind, className }) {
    assertGeneratable(definition)
    if (exportKind === 'instance') return new Effect(structuredClone(definition))
    if (exportKind === 'class') {
        const fields = structuredClone(definition)
        const named = { [className]: class extends Effect { constructor() { super(); Object.assign(this, fields) } } }
        return new named[className]()
    }
    throw new Error(`${definition.func}: unknown export kind ${JSON.stringify(exportKind)}`)
}

/**
 * The text of the compatibility module generated for a definition: it embeds
 * the definition as a JavaScript literal and imports no JSON module.
 */
export function generateWrapper({ definition, exportKind, className }) {
    assertGeneratable(definition)
    const lines = [GENERATED_HEADER, "import { Effect } from '../../../src/runtime/effect.js'", '']
    if (exportKind === 'instance') {
        lines.push(`export default new Effect(${JSON.stringify(definition, null, 4)})`)
    } else if (exportKind === 'class') {
        if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(className ?? '')) throw new Error(`${definition.func}: class name ${JSON.stringify(className)} is not an identifier`)
        lines.push(`export default class ${className} extends Effect {`)
        for (const [key, value] of Object.entries(definition)) {
            const field = JSON.stringify(value, null, 4).split('\n').join('\n    ')
            lines.push(`    ${JSON.stringify(key)} = ${field}`)
        }
        lines.push('}')
    } else {
        throw new Error(`${definition.func}: unknown export kind ${JSON.stringify(exportKind)}`)
    }
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
    return { effectId, definition: definitionSchema(instance), shaders: read.shaders, exportKind: shape.exportKind }
}

/** The catalog baseline's export kinds and class names, by effect ID. */
export function baselineExportShapes(baselinePath = BASELINE) {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    const shapes = new Map()
    for (const [id, kind] of baseline.exportKinds) {
        const classes = baseline.metadata?.[id]?.classes ?? []
        shapes.set(id, { exportKind: kind, className: kind === 'class' ? classes[0] : undefined })
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

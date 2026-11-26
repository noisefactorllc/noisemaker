/**
 * Capability providers: the host code that runs a capability a package
 * declares (./descriptor.js describes declarations and descriptors).
 *
 * A host registers a provider with registerPortableCapability({ id, version,
 * descriptor, create }). The descriptor is data, and states what a
 * declaration may give. create({ options, bindings, uniforms, host, signal })
 * runs once for each effect registered with the capability, and returns its
 * lifecycle: any of onInit, onUpdate, asyncInit and onDestroy, and `methods`,
 * one function for each method the descriptor names. Each runs with the
 * registered effect as its receiver, under the one lifecycle contract every
 * effect has (docs/shaders/effects.rst, Section 5):
 *
 *   onInit()        once per effect per pipeline
 *   onUpdate(ctx)   once per effect per frame; returned uniforms bind where a
 *                   pass does not resolve them
 *   asyncInit(ctx)  once per node, again on resize and recompile, when a
 *                   parameter dependency changes value, and when a resource
 *                   dependency's texture is allocated again; ctx carries
 *                   updateTexture, width, height, params, isCancelled, signal
 *                   (this regeneration) and lifetimeSignal (the node)
 *   onDestroy()     when a pipeline is disposed
 *
 * A package's providers compose in the order the package declares them:
 * onInit, onUpdate and asyncInit run in that order, and onDestroy in the
 * reverse order. When two providers return the same uniform from onUpdate,
 * the later one's value binds. Per-node state belongs in a cache keyed by the
 * asyncInit context's lifetimeSignal, which is the same object until the node
 * ends, never on the shared receiver: the context itself is new for each
 * regeneration.
 *
 * Duplicate registration of an ID and version is an error, and a package can
 * never install a provider: its descriptor files are data only.
 */

import { checkCapabilityDeclarations, normalizeCapabilityDescriptor } from './descriptor.js'

function diagnostic(code, path, message) {
    return { code, path, message }
}

function refuse(diagnostics) {
    const error = new Error(`Portable capability: ${diagnostics.map(entry => entry.path ? `${entry.message} (${entry.path})` : entry.message).join('; ')}`)
    error.diagnostics = diagnostics
    return error
}

const keyOf = (id, version) => `${id}@${version}`

/**
 * A registry of providers. The engine has one, which the registration
 * functions below use by default; a host may make its own.
 * @returns {{register: Function, get: Function, versions: Function, list: Function}}
 */
export function createCapabilityRegistry() {
    const providers = new Map()
    return Object.freeze({
        register({ id, version, descriptor, create } = {}) {
            const read = normalizeCapabilityDescriptor(descriptor)
            if (!read.descriptor) throw refuse(read.diagnostics.map(entry => ({ ...entry, path: entry.path ? `descriptor.${entry.path}` : 'descriptor' })))
            const diagnostics = []
            if (read.descriptor.id !== id || read.descriptor.version !== version) {
                diagnostics.push(diagnostic('invalid-descriptor', 'descriptor',
                    `the descriptor describes ${read.descriptor.id} version ${read.descriptor.version}, not ${id} version ${version}`))
            }
            if (typeof create !== 'function') diagnostics.push(diagnostic('invalid-provider', 'create', 'create must be a function'))
            if (providers.has(keyOf(id, version))) {
                diagnostics.push(diagnostic('duplicate-provider', 'id', `a provider of ${id} version ${version} is already registered`))
            }
            if (diagnostics.length > 0) throw refuse(diagnostics)
            const provider = Object.freeze({ id, version, descriptor: Object.freeze(read.descriptor), create })
            providers.set(keyOf(id, version), provider)
            return provider
        },
        get(id, version) {
            return providers.get(keyOf(id, version)) ?? null
        },
        versions(id) {
            return [...providers.values()].filter(provider => provider.id === id).map(provider => provider.version)
        },
        list() {
            return [...providers.values()].map(({ id, version, descriptor }) => ({ id, version, descriptor }))
        },
    })
}

/** The engine's registry. */
export const defaultCapabilityRegistry = createCapabilityRegistry()

/**
 * Register a provider in the engine's registry.
 * @param {{id: string, version: number, descriptor: object, create: Function}} registration
 * @returns {object} The registered provider
 */
export function registerPortableCapability(registration) {
    return defaultCapabilityRegistry.register(registration)
}

/** The provider of a capability ID and version in the engine's registry, or null. */
export function getPortableCapability(id, version) {
    return defaultCapabilityRegistry.get(id, version)
}

/**
 * Find the provider of each capability a normalized definition declares, and
 * check each declaration against its provider's descriptor. Changes nothing.
 * @param {object} definition - A normalized definition
 * @param {object} [registry] - The registry to read; the engine's by default
 * @returns {{resolved: Array<{declaration: object, provider: object}>, diagnostics: Array}}
 */
export function resolvePortableCapabilities(definition, registry = defaultCapabilityRegistry) {
    const declarations = Array.isArray(definition?.capabilities) ? definition.capabilities : []
    const resolved = []
    const diagnostics = []
    declarations.forEach((declaration, index) => {
        const provider = registry.get(declaration.id, declaration.version)
        if (provider) {
            resolved.push({ declaration, provider })
            return
        }
        const versions = registry.versions(declaration.id)
        diagnostics.push(versions.length > 0
            ? diagnostic('incompatible-provider', `capabilities.${index}.version`,
                `${declaration.id} is provided for version ${versions.join(', ')}, not ${declaration.version}`)
            : diagnostic('missing-provider', `capabilities.${index}`,
                `no provider is registered for capability ${declaration.id} version ${declaration.version}`))
    })
    if (diagnostics.length === 0) {
        diagnostics.push(...checkCapabilityDeclarations(definition, resolved.map(entry => entry.provider.descriptor)).diagnostics)
    }
    return { resolved: diagnostics.length === 0 ? resolved : [], diagnostics }
}

// What the pipeline reads about an effect's capabilities, kept off the
// effect itself, so that the registered object keeps the own properties it
// had: the global names whose values start a regeneration.
const capabilityUse = new WeakMap()

/**
 * Record how an effect uses its capabilities.
 * @param {object} effect - The registered effect
 * @param {{dependencies: string[], resources?: string[]}} use - The global
 *   names whose values start a regeneration, and the texture names whose
 *   allocation does
 */
export function setCapabilityUse(effect, { dependencies, resources = [] }) {
    capabilityUse.set(effect, Object.freeze({ dependencies: Object.freeze([...dependencies]), resources: Object.freeze([...resources]) }))
}

/**
 * How an effect uses its capabilities, or null for an effect that declares
 * none: the pipeline then compares every scalar parameter but alpha, as
 * before capabilities existed.
 * @param {object} effect
 * @returns {{dependencies: string[], resources: string[]}|null}
 */
export function capabilityUseOf(effect) {
    return (effect && capabilityUse.get(effect)) ?? null
}

/**
 * A provider's view of an asyncInit context: the same context, with an
 * updateTexture that uploads in the provider's declared orientation.
 * Per-node state belongs in a cache keyed by context.lifetimeSignal, which
 * is the same object for a node until the node ends.
 * @param {object} context - The pipeline's asyncInit context
 * @param {{uploadOrientation?: 'flipY'|'none'}} descriptor
 * @returns {object}
 */
export function providerContext(context, descriptor) {
    const orientation = descriptor.uploadOrientation ?? 'flipY'
    return {
        ...context,
        updateTexture: (name, source) => context.updateTexture(name, source, { orientation }),
    }
}

/**
 * The parameter globals a declaration's dependencies name, through its bindings.
 * @param {object} declaration
 * @param {object} descriptor
 * @returns {string[]}
 */
export function dependencyGlobals(declaration, descriptor) {
    const roles = descriptor.dependencies?.parameters ?? []
    const bound = declaration.bindings?.parameters ?? {}
    return roles.filter(role => Object.hasOwn(bound, role)).map(role => bound[role])
}

/**
 * The texture names a declaration's resource dependencies name, through its bindings.
 * @param {object} declaration
 * @param {object} descriptor
 * @returns {string[]}
 */
export function dependencyTextures(declaration, descriptor) {
    const roles = descriptor.dependencies?.resources ?? []
    const bound = declaration.bindings?.textures ?? {}
    return roles.filter(role => Object.hasOwn(bound, role)).map(role => bound[role])
}

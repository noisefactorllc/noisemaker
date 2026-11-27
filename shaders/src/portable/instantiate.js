/**
 * A normalized Portable definition, as an Effect.
 *
 * instantiatePortableEffect() resolves every capability the definition
 * declares, before it creates anything, and refuses the definition when a
 * provider is missing or incompatible, or a declaration does not fit its
 * provider's descriptor. Then it calls each provider's create() once, in
 * declaration order, and composes their lifecycles onto one Effect
 * (./capabilities.js states the order). It registers nothing: the caller
 * registers the Effect it returns.
 *
 * A public registration is in the user namespace. Another namespace needs the
 * engine's catalog context, which this module keeps out of the public API.
 */

import { Effect } from '../runtime/effect.js'
import {
    capabilityUseOf, defaultCapabilityRegistry, dependencyGlobals, dependencyTextures, providerContext, resolvePortableCapabilities,
    setCapabilityUse
} from './capabilities.js'

// The create() signals of each instantiated effect, which abort when its
// registration fails after create() ran.
const creations = new WeakMap()

/**
 * Abort the create() signals of an effect whose registration failed after
 * instantiatePortableEffect() returned it. Registration calls it; nothing else needs to.
 * @param {object} effect
 */
export function abortPortableEffect(effect) {
    for (const controller of creations.get(effect) ?? []) controller.abort()
    creations.delete(effect)
}

// The engine's own catalog registers in its namespaces with this context.
// It is not exported through the package's public entry point.
export const CATALOG_CONTEXT = Object.freeze({ catalog: true })

const LIFECYCLE = ['onInit', 'onUpdate', 'asyncInit', 'onDestroy']

function refuse(diagnostics) {
    const error = new Error(`Portable effect: ${diagnostics.map(entry => entry.path ? `${entry.message} (${entry.path})` : entry.message).join('; ')}`)
    error.diagnostics = diagnostics
    return error
}

// The lifecycle a provider's create() returned, checked against its descriptor.
function checkLifecycle(lifecycle, provider, index) {
    const path = `capabilities.${index}`
    const name = `${provider.id} version ${provider.version}`
    if (lifecycle === null || typeof lifecycle !== 'object') {
        return [{ code: 'invalid-provider', path, message: `the provider of ${name} returned no lifecycle object` }]
    }
    const diagnostics = []
    for (const hook of LIFECYCLE) {
        if (lifecycle[hook] !== undefined && typeof lifecycle[hook] !== 'function') {
            diagnostics.push({ code: 'invalid-provider', path, message: `the provider of ${name} gave a ${hook} that is not a function` })
        }
    }
    const declared = provider.descriptor.methods ?? []
    const given = lifecycle.methods === undefined ? [] : Object.keys(lifecycle.methods)
    for (const method of declared) {
        if (typeof lifecycle.methods?.[method] !== 'function') {
            diagnostics.push({ code: 'invalid-provider', path, message: `the provider of ${name} does not give the method ${method} that its descriptor names` })
        }
    }
    for (const method of given) {
        if (!declared.includes(method)) {
            diagnostics.push({ code: 'invalid-provider', path, message: `the provider of ${name} gives a method ${method} that its descriptor does not name` })
        }
    }
    return diagnostics
}

/**
 * Instantiate a Portable definition.
 * @param {{definition: object, shaders: object}} packageData - A normalized
 *   definition (normalizePortableDefinition) and its loaded shaders
 * @param {object} [options]
 * @param {object} [options.registrationContext] - CATALOG_CONTEXT for the engine's catalog; absent for every other caller
 * @param {object} [options.capabilities] - The provider registry; the engine's by default
 * @param {object} [options.host] - Host services that providers may use, such as createCanvas(width, height)
 * @returns {Effect}
 */
export function instantiatePortableEffect(packageData, { registrationContext, capabilities = defaultCapabilityRegistry, host = {} } = {}) {
    const { definition, shaders } = packageData ?? {}
    if (definition === null || typeof definition !== 'object') {
        throw refuse([{ code: 'not-an-object', path: '', message: 'a package definition is an object' }])
    }
    const namespace = definition.namespace ?? 'user'
    if (namespace !== 'user' && registrationContext !== CATALOG_CONTEXT) {
        throw refuse([{ code: 'reserved-namespace', path: 'namespace', message: `namespace ${namespace} is the engine's; a package registers in user` }])
    }
    const composed = composeCapabilities(definition, { capabilities, host, recordEmptyUse: true })
    const config = { ...composed.fields, shaders, ...composed.hooks }
    const effect = new Effect(config)
    composed.attach(effect)
    return effect
}

/**
 * The capabilities a catalog definition declares, composed as its generated
 * module uses them: { fields, hooks, methods, attach(effect) }. `fields` is the
 * definition without its capability declarations, `hooks` the composed
 * lifecycle functions that its providers give, `methods` the methods they add,
 * and attach() adds the methods to an effect that does not define them and
 * records its capability use. The providers come from the engine's registry.
 * A catalog effect whose providers depend on no parameter or resource records
 * no use, as its legacy module recorded none. A package always records its
 * use, empty when it depends on nothing (instantiatePortableEffect).
 * @param {object} definition - A catalog definition in the runtime form
 */
export function composeCatalogCapabilities(definition) {
    return composeCapabilities(definition, { capabilities: defaultCapabilityRegistry, host: {}, recordEmptyUse: false })
}

function composeCapabilities(definition, { capabilities, host, recordEmptyUse }) {
    const { resolved, diagnostics } = resolvePortableCapabilities(definition, capabilities)
    if (diagnostics.length > 0) throw refuse(diagnostics)

    // create() runs once for this effect, for each declared capability, in
    // order. A failure aborts the signals of the providers created before it.
    const controllers = []
    const lifecycles = []
    try {
        resolved.forEach(({ declaration, provider }, index) => {
            const controller = new AbortController()
            controllers.push(controller)
            const uniforms = Object.fromEntries(Object.entries(declaration.bindings?.parameters ?? {})
                .map(([role, name]) => [role, definition.globals?.[name]?.uniform ?? name]))
            const lifecycle = provider.create({
                options: structuredClone(declaration.options ?? {}),
                bindings: structuredClone(declaration.bindings ?? {}),
                uniforms,
                host,
                signal: controller.signal,
            })
            const problems = checkLifecycle(lifecycle, provider, index)
            if (problems.length > 0) throw refuse(problems)
            lifecycles.push(lifecycle)
        })
    } catch (error) {
        for (const controller of controllers) controller.abort()
        if (error.diagnostics) throw error
        throw refuse([{ code: 'failed-provider', path: `capabilities.${lifecycles.length}`, message: `a provider failed to create its lifecycle: ${error?.message ?? error}` }])
    }

    const has = hook => lifecycles.some(lifecycle => typeof lifecycle[hook] === 'function')
    const fields = { ...definition }
    delete fields.capabilities
    delete fields.starter
    const config = {}
    if (has('onInit')) {
        config.onInit = function onInit() {
            for (const lifecycle of lifecycles) lifecycle.onInit?.call(this)
        }
    }
    if (has('onUpdate')) {
        config.onUpdate = function onUpdate(context) {
            const uniforms = {}
            for (const lifecycle of lifecycles) {
                const returned = lifecycle.onUpdate?.call(this, context)
                if (returned && typeof returned === 'object') Object.assign(uniforms, returned)
            }
            return uniforms
        }
    }
    if (has('asyncInit')) {
        config.asyncInit = async function asyncInit(context) {
            for (const [index, lifecycle] of lifecycles.entries()) {
                if (context.isCancelled()) return
                if (lifecycle.asyncInit) await lifecycle.asyncInit.call(this, providerContext(context, resolved[index].provider.descriptor))
            }
        }
    }
    if (has('onDestroy')) {
        config.onDestroy = function onDestroy() {
            for (const lifecycle of [...lifecycles].reverse()) lifecycle.onDestroy?.call(this)
        }
    }
    // A method a provider adds is a new name on the effect: never one the
    // effect already has, a private one, or one another provider adds.
    const methods = {}
    const added = new Map()
    const problems = []
    const probe = new Effect({ ...fields, ...config })
    lifecycles.forEach((lifecycle, index) => {
        for (const name of Object.keys(lifecycle.methods ?? {})) {
            if (name.startsWith('_') || name in probe) {
                problems.push({ code: 'invalid-provider', path: `capabilities.${index}`, message: `the method ${name} would replace a member of the effect` })
            } else if (added.has(name)) {
                problems.push({ code: 'duplicate-method', path: `capabilities.${index}`, message: `the method ${name} is also added by capabilities.${added.get(name)}` })
            } else {
                added.set(name, index)
                const method = lifecycle.methods[name]
                methods[name] = function (...args) { return method.apply(this, args) }
            }
        }
    })
    if (problems.length > 0) {
        for (const controller of controllers) controller.abort()
        throw refuse(problems)
    }
    // The parameters and resources whose change draws the effect again. A
    // package records an empty use, which the pipeline reads as no dependency:
    // without one, a change of any parameter draws an asyncInit again. A
    // catalog effect records one only when it depends on something, as its
    // module did before it was generated.
    const dependencies = [...new Set(resolved.flatMap(({ declaration, provider }) => dependencyGlobals(declaration, provider.descriptor)))]
    const resources = [...new Set(resolved.flatMap(({ declaration, provider }) => dependencyTextures(declaration, provider.descriptor)))]
    const use = resolved.length > 0 && (recordEmptyUse || dependencies.length || resources.length) ? { dependencies, resources } : null
    return {
        fields,
        hooks: config,
        methods,
        attach(effect) {
            for (const [name, method] of Object.entries(methods)) {
                if (!(name in effect)) effect[name] = method
            }
            if (use) setCapabilityUse(effect, { dependencies: [...use.dependencies], resources: [...use.resources] })
            creations.set(effect, controllers)
        },
    }
}

export { capabilityUseOf }

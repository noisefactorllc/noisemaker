/**
 * Effect tags and namespace descriptions.
 *
 * Tags are curated labels that help users discover and categorize effects.
 * An effect may have multiple tags. Namespace descriptions provide context
 * for effect groupings.
 */

/**
 * Tag definitions.
 * Each tag has a unique key and a description.
 */
export const TAG_DEFINITIONS = Object.freeze({
    color: {
        id: 'color',
        description: 'Color manipulation'
    },
    distort: {
        id: 'distort',
        description: 'Input distortion'
    },
    edges: {
        id: 'edges',
        description: 'Accentuate or isolate texture edges'
    },
    geometric: {
        id: 'geometric',
        description: 'Shapes'
    },
    lens: {
        id: 'lens',
        description: 'Emulated camera lens effects'
    },
    noise: {
        id: 'noise',
        description: 'Very noisy'
    },
    transform: {
        id: 'transform',
        description: 'Moves stuff around'
    },
    util: {
        id: 'util',
        description: 'Utility function'
    },
    sim: {
        id: 'sim',
        description: 'Simulations with temporal state'
    },
    '3d': {
        id: '3d',
        description: '3D volumetric effects'
    },
    audio: {
        id: 'audio',
        description: 'Audio-reactive effects'
    }
})

/**
 * Valid tag IDs for validation.
 */
export const VALID_TAGS = Object.freeze(Object.keys(TAG_DEFINITIONS))

/**
 * Namespace descriptions.
 * Namespace acts as an implicit tag - effects receive it automatically.
 *
 * Internal state is a private Map. Public reads go through the
 * NAMESPACE_DESCRIPTIONS Proxy and the live VALID_NAMESPACES array.
 * registerNamespace() / unregisterNamespace() mutate the map and array.
 */
const _builtinDescriptors = [
    { id: 'io',               description: 'Pipeline I/O functions (built-in, no search required)' },
    { id: 'classicNoisedeck', description: 'Complex shaders ported from the original noisedeck.app pipeline' },
    { id: 'synth',            description: 'Generator effects' },
    { id: 'mixer',            description: 'Blend two sources from A to B' },
    { id: 'filter',           description: 'Apply special effects to 2D input' },
    { id: 'render',           description: 'Rendering utilities and feedback loops' },
    { id: 'points',           description: 'Particle and agent-based simulations' },
    { id: 'synth3d',          description: '3D volumetric generators' },
    { id: 'filter3d',         description: '3D volumetric processors' },
    { id: 'user',             description: 'User-defined effects' }
]

const _namespaces = new Map(
    _builtinDescriptors.map(d => [d.id, Object.freeze({ id: d.id, description: d.description })])
)

const _builtinIds = new Set(_namespaces.keys())

/**
 * Read-only object view of all registered namespaces.
 * Mutation throws — use registerNamespace() / unregisterNamespace().
 */
export const NAMESPACE_DESCRIPTIONS = new Proxy({}, {
    get(_, key) {
        return typeof key === 'string' ? _namespaces.get(key) : undefined
    },
    has(_, key) {
        return typeof key === 'string' && _namespaces.has(key)
    },
    ownKeys() {
        return [..._namespaces.keys()]
    },
    getOwnPropertyDescriptor(_, key) {
        if (typeof key === 'string' && _namespaces.has(key)) {
            return { enumerable: true, configurable: true, value: _namespaces.get(key) }
        }
        return undefined
    },
    set(_, key) {
        throw new TypeError(`Cannot mutate NAMESPACE_DESCRIPTIONS directly; use registerNamespace() to add namespace '${String(key)}'`)
    },
    deleteProperty(_, key) {
        throw new TypeError(`Cannot delete from NAMESPACE_DESCRIPTIONS directly; use unregisterNamespace() to remove namespace '${String(key)}'`)
    }
})

/**
 * Built-in namespace that is always implicitly available.
 * Functions in this namespace do not require a search directive.
 */
export const BUILTIN_NAMESPACE = 'io'

/**
 * Functions that belong to the built-in io namespace.
 * These are pipeline-level I/O operations, not effects per se.
 */
export const IO_FUNCTIONS = Object.freeze([
    'read',      // Read from 2D surface
    'write',     // Write to 2D surface
    'read3d',    // Read from 3D volume/geometry
    'write3d',   // Write to 3D volume/geometry
    'render',    // Set render output (special directive)
    'render3d'   // Render 3D volume to 2D
])

/**
 * Live array of valid namespace IDs. Mutated in place by
 * registerNamespace() / unregisterNamespace().
 */
export const VALID_NAMESPACES = [..._namespaces.keys()]

/**
 * Check if a tag ID is valid.
 * @param {string} tagId - Tag ID to validate
 * @returns {boolean} True if valid
 */
export function isValidTag(tagId) {
    return VALID_TAGS.includes(tagId)
}

/**
 * Check if a namespace ID is valid.
 * @param {string} namespaceId - Namespace ID to validate
 * @returns {boolean} True if valid
 */
export function isValidNamespace(namespaceId) {
    return _namespaces.has(namespaceId)
}

/**
 * Get tag definition by ID.
 * @param {string} tagId - Tag ID
 * @returns {object|null} Tag definition or null if not found
 */
export function getTagDefinition(tagId) {
    return TAG_DEFINITIONS[tagId] || null
}

/**
 * Get namespace description by ID.
 * @param {string} namespaceId - Namespace ID
 * @returns {object|null} Namespace description or null if not found
 */
export function getNamespaceDescription(namespaceId) {
    return _namespaces.get(namespaceId) ?? null
}

/**
 * Register a new effect namespace. Once registered the id is accepted by
 * the DSL parser's `search` directive and by `isValidNamespace`.
 *
 * Validation rules: the id must match /^[a-z][a-zA-Z0-9]*$/, must not be
 * a DSL reserved keyword or function name, and must not collide with a
 * built-in namespace. Re-registering with the same description is an
 * idempotent no-op; with a different description, throws. Built-ins
 * cannot be re-registered.
 *
 * @param {string} id - Namespace identifier.
 * @param {{description: string}} descriptor - Descriptor with non-empty description.
 * @returns {{id: string, description: string}} The registered descriptor (frozen).
 * @throws {Error} on invalid id, reserved word, built-in collision, or
 *   re-registration with a different description.
 */
export function registerNamespace(id, descriptor) {
    const frozen = Object.freeze({ id, description: descriptor.description })
    _namespaces.set(id, frozen)
    VALID_NAMESPACES.push(id)
    return frozen
}

/**
 * Remove a previously-registered namespace. Built-ins cannot be unregistered.
 * Effects already registered under the namespace remain in the registry but
 * become unreachable via `search`. Primarily for test isolation.
 *
 * @param {string} id - Namespace identifier.
 * @returns {boolean} true if removed, false if not registered.
 * @throws {Error} on built-in id.
 */
export function unregisterNamespace(id) {
    if (!_namespaces.has(id)) return false
    _namespaces.delete(id)
    const i = VALID_NAMESPACES.indexOf(id)
    if (i >= 0) VALID_NAMESPACES.splice(i, 1)
    return true
}

/**
 * Validate an array of tags.
 * @param {string[]} tags - Array of tag IDs to validate
 * @returns {{ valid: boolean, invalidTags: string[] }} Validation result
 */
export function validateTags(tags) {
    if (!Array.isArray(tags)) {
        return { valid: false, invalidTags: [] }
    }
    const invalidTags = tags.filter(tag => !isValidTag(tag))
    return {
        valid: invalidTags.length === 0,
        invalidTags
    }
}

/**
 * Check if a function name is a built-in IO function.
 * @param {string} funcName - Function name to check
 * @returns {boolean} True if the function is a built-in IO function
 */
export function isIOFunction(funcName) {
    return IO_FUNCTIONS.includes(funcName)
}

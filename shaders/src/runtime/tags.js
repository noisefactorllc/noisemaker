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
    geometric: {
        id: 'geometric',
        description: 'Shapes'
    },
    math: {
        id: 'math',
        description: 'Very mathy'
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
    }
})

/**
 * Valid tag IDs for validation.
 */
export const VALID_TAGS = Object.freeze(Object.keys(TAG_DEFINITIONS))

/**
 * Namespace descriptions.
 * Namespace acts as an implicit tag - effects receive it automatically.
 */
export const NAMESPACE_DESCRIPTIONS = Object.freeze({
    classicNoisedeck: {
        id: 'classicNoisedeck',
        description: 'Complex shaders ported from the original noisedeck.app pipeline'
    },
    classicNoisemaker: {
        id: 'classicNoisemaker',
        description: 'Shader implementations of classic noisemaker effects'
    },
    synth: {
        id: 'synth',
        description: 'Generator modules'
    },
    mixer: {
        id: 'mixer',
        description: 'Blend two sources from A to B'
    },
    filter: {
        id: 'filter',
        description: 'Apply special effects to input'
    },
    vol: {
        id: 'vol',
        description: 'Experimental volumetric pipeline'
    }
})

/**
 * Valid namespace IDs.
 */
export const VALID_NAMESPACES = Object.freeze(Object.keys(NAMESPACE_DESCRIPTIONS))

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
    return VALID_NAMESPACES.includes(namespaceId)
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
    return NAMESPACE_DESCRIPTIONS[namespaceId] || null
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

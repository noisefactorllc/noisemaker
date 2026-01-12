/**
 * Base class for all Effects.
 * Represents the runtime embodiment of an Effect Definition.
 *
 * Can be instantiated directly with a config object for data-only effects:
 *   new Effect({ name: "Blur", namespace: "filter", globals: {...}, passes: [...] })
 *
 * Or subclassed for effects needing lifecycle methods:
 *   class Media extends Effect { onInit() {...} onUpdate() {...} }
 *
 * Tags:
 *   Effects can be tagged with curated labels for discovery and categorization.
 *   Valid tags are defined in tags.js. Namespace acts as an implicit tag.
 *   Example: tags: ["color", "distort"]
 *
 * Global (uniform) specification:
 *   Each entry in globals defines a parameter/uniform with:
 *   - type: "float" | "int" | "boolean" | "vec2" | "vec3" | "vec4"
 *   - default: Default value
 *   - uniform: Shader uniform name
 *   - min/max/step: Range constraints for numeric types
 *   - choices: Object mapping names to values for dropdown controls
 *   - ui: UI configuration object
 *     - label: Display label
 *     - control: "slider" | "checkbox" | "dropdown" | "color" | "button" | false
 *     - category: Category for grouping controls (defaults to "general")
 *
 * Example with categories:
 *   globals: {
 *     threshold: {
 *       type: "float", default: 0.5, uniform: "threshold",
 *       ui: { label: "Threshold", control: "slider", category: "effect" }
 *     },
 *     seed: {
 *       type: "int", default: 1, uniform: "seed",
 *       ui: { label: "Seed", control: "slider", category: "util" }
 *     }
 *   }
 */
export class Effect {
    /**
     * @param {object} [config] - Optional configuration object
     * @param {string} [config.name] - Effect display name
     * @param {string} [config.namespace] - Effect namespace (synth, filter, mixer, etc.)
     * @param {string} [config.func] - DSL function name
     * @param {string[]} [config.tags] - Effect tags for categorization (from VALID_TAGS)
     * @param {object} [config.globals] - Effect parameters/uniforms
     * @param {Array} [config.passes] - Render passes
     * @param {object} [config.textures] - Internal texture allocations
     * @param {Function} [config.onInit] - Lifecycle hook: called once on init
     * @param {Function} [config.onUpdate] - Lifecycle hook: called every frame
     * @param {Function} [config.onDestroy] - Lifecycle hook: called on destroy
     */
    constructor(config = {}) {
        this.state = {}
        this.uniforms = {}

        // Apply config properties
        if (config.name) this.name = config.name
        if (config.namespace) this.namespace = config.namespace
        if (config.func) this.func = config.func
        if (config.description) this.description = config.description
        if (config.tags) this.tags = config.tags
        if (config.globals) this.globals = config.globals
        if (config.passes) this.passes = config.passes
        if (config.textures) this.textures = config.textures
        if (config.outputTex3d) this.outputTex3d = config.outputTex3d
        if (config.outputGeo) this.outputGeo = config.outputGeo
        if (config.uniformLayout) this.uniformLayout = config.uniformLayout
        if (config.uniformLayouts) this.uniformLayouts = config.uniformLayouts

        // Allow lifecycle hooks via config
        if (config.onInit) this._configOnInit = config.onInit
        if (config.onUpdate) this._configOnUpdate = config.onUpdate
        if (config.onDestroy) this._configOnDestroy = config.onDestroy
    }

    /**
     * Called once when the effect is initialized.
     */
    onInit() {
        if (this._configOnInit) this._configOnInit.call(this)
    }

    /**
     * Called every frame before rendering.
     * @param {object} context { time, delta, uniforms }
     * @returns {object} Uniforms to bind
     */
    onUpdate(context) {
        if (this._configOnUpdate) return this._configOnUpdate.call(this, context)
        return {}
    }

    /**
     * Called when the effect is destroyed.
     */
    onDestroy() {
        if (this._configOnDestroy) this._configOnDestroy.call(this)
    }
}

/**
 * Default category for uniforms without an explicit category.
 */
export const DEFAULT_CATEGORY = 'general'

/**
 * Get the category for a global/uniform specification.
 * @param {object} spec - The global specification
 * @returns {string} The category name (defaults to 'general')
 */
export function getUniformCategory(spec) {
    return spec?.ui?.category || DEFAULT_CATEGORY
}

/**
 * Group globals by their category.
 * Returns an object mapping category names to arrays of [key, spec] pairs.
 * Categories are returned in order of first occurrence, with 'general' last.
 *
 * @param {object} globals - The globals object from an effect definition
 * @param {object} [options] - Options
 * @param {boolean} [options.includeHidden=false] - Include globals with ui.control === false
 * @returns {Object.<string, Array<[string, object]>>} Categorized globals
 */
export function groupGlobalsByCategory(globals, options = {}) {
    const { includeHidden = false } = options
    const categories = {}
    const categoryOrder = []

    if (!globals) return categories

    for (const [key, spec] of Object.entries(globals)) {
        // Skip hidden controls unless requested
        if (!includeHidden && spec.ui?.control === false) continue

        const category = getUniformCategory(spec)

        if (!categories[category]) {
            categories[category] = []
            // Track order, but defer 'general' to the end
            if (category !== DEFAULT_CATEGORY) {
                categoryOrder.push(category)
            }
        }

        categories[category].push([key, spec])
    }

    // Add 'general' at the beginning if it exists
    if (categories[DEFAULT_CATEGORY]) {
        categoryOrder.unshift(DEFAULT_CATEGORY)
    }

    // Return ordered object
    const ordered = {}
    for (const cat of categoryOrder) {
        ordered[cat] = categories[cat]
    }

    return ordered
}

/**
 * Get all unique category names from globals.
 * @param {object} globals - The globals object from an effect definition
 * @returns {string[]} Array of category names in order of first occurrence
 */
export function getCategories(globals) {
    return Object.keys(groupGlobalsByCategory(globals))
}

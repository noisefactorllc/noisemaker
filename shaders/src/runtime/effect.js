/**
 * Base class for all Effects.
 * Represents the runtime embodiment of an Effect Definition.
 * 
 * Can be instantiated directly with a config object for data-only effects:
 *   new Effect({ name: "Blur", namespace: "filter", globals: {...}, passes: [...] })
 * 
 * Or subclassed for effects needing lifecycle methods:
 *   class Media extends Effect { onInit() {...} onUpdate() {...} }
 */
export class Effect {
    /**
     * @param {object} [config] - Optional configuration object
     * @param {string} [config.name] - Effect display name
     * @param {string} [config.namespace] - Effect namespace (synth, filter, mixer, etc.)
     * @param {string} [config.func] - DSL function name
     * @param {object} [config.globals] - Effect parameters/uniforms
     * @param {Array} [config.passes] - Render passes
     * @param {object} [config.textures] - Internal texture allocations
     * @param {Function} [config.onInit] - Lifecycle hook: called once on init
     * @param {Function} [config.onUpdate] - Lifecycle hook: called every frame
     * @param {Function} [config.onDestroy] - Lifecycle hook: called on destroy
     */
    constructor(config = {}) {
        this.state = {};
        this.uniforms = {};
        
        // Apply config properties
        if (config.name) this.name = config.name;
        if (config.namespace) this.namespace = config.namespace;
        if (config.func) this.func = config.func;
        if (config.globals) this.globals = config.globals;
        if (config.passes) this.passes = config.passes;
        if (config.textures) this.textures = config.textures;
        if (config.outputTex3d) this.outputTex3d = config.outputTex3d;
        if (config.outputGeo) this.outputGeo = config.outputGeo;
        
        // Allow lifecycle hooks via config
        if (config.onInit) this._configOnInit = config.onInit;
        if (config.onUpdate) this._configOnUpdate = config.onUpdate;
        if (config.onDestroy) this._configOnDestroy = config.onDestroy;
    }

    /**
     * Called once when the effect is initialized.
     */
    onInit() {
        if (this._configOnInit) this._configOnInit.call(this);
    }

    /**
     * Called every frame before rendering.
     * @param {object} context { time, delta, uniforms }
     * @returns {object} Uniforms to bind
     */
    onUpdate(context) {
        if (this._configOnUpdate) return this._configOnUpdate.call(this, context);
        return {};
    }

    /**
     * Called when the effect is destroyed.
     */
    onDestroy() {
        if (this._configOnDestroy) this._configOnDestroy.call(this);
    }
}

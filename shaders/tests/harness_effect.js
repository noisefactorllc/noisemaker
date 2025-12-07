import { validateEffectDefinition } from '../src/runtime/effect-validator.js'
// import { Effect } from '../src/runtime/effect.js';

/**
 * Test Harness for individual Effects.
 * Simulates the runtime environment for an effect.
 */
export class EffectHarness {
    constructor(effectDef) {
        this.def = effectDef
        this.instance = null

        // If the definition is a class, we need to instantiate it to access its properties (name, passes, etc.)
        if (typeof this.def === 'function') {
            try {
                this.instance = new this.def()
            } catch (e) {
                console.warn("Could not instantiate effect class for inspection:", e)
            }
        } else {
            this.instance = this.def
        }

        this.context = {
            time: 0,
            delta: 0.016,
            uniforms: {}
        }
    }

    validate() {
        // Validate the instance, not the class constructor
        const target = this.instance || this.def
        const errors = validateEffectDefinition(target)
        if (errors.length > 0) {
            throw new Error(`Effect Validation Failed:\n${errors.join('\n')}`)
        }
        return true
    }

    mount() {
        // Instance already created in constructor if possible
        if (!this.instance && typeof this.def === 'function') {
             this.instance = new this.def()
        }

        // Initialize default uniforms from globals
        if (this.instance.globals) {
            Object.entries(this.instance.globals).forEach(([key, spec]) => {
                this.context.uniforms[key] = spec.default
            })
        }

        if (typeof this.instance.onInit === 'function') {
            this.instance.onInit()
        }
    }

    update(dt = 0.016) {
        this.context.time += dt
        this.context.delta = dt

        let runtimeUniforms = {}
        if (typeof this.instance.onUpdate === 'function') {
            runtimeUniforms = this.instance.onUpdate(this.context)
        }

        // Merge runtime uniforms with global uniforms
        return { ...this.context.uniforms, ...runtimeUniforms }
    }

    destroy() {
        if (typeof this.instance.onDestroy === 'function') {
            this.instance.onDestroy()
        }
    }
}

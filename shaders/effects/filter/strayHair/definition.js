import { Effect } from '../../../src/runtime/effect.js'
import { providerContext, setCapabilityUse } from '../../../src/portable/capabilities.js'
import { WORM_OVERLAY_DESCRIPTOR, WORM_OVERLAY_RECIPES, drawWormOverlay } from '../../../src/portable/providers/worm-overlay.js'

/**
 * Stray Hair - sparse dark curved lines over the image
 *
 * One-shot CPU rendering: traces a few long unruly worms as dark strands.
 * Matches Python reference: single layer, very low density, high kink.
 */
class StrayHair extends Effect {
    constructor() {
        super({
            name: "Stray Hair",
            namespace: "filter",
            func: "strayHair",
            tags: ["noise"],
            description: "Stray hair overlay",
            globals: {
                density: {
                    type: "float", default: 0.5, uniform: "density",
                    min: 0, max: 1, step: 0.01,
                    ui: { label: "density", control: "slider" }
                },
                seed: {
                    type: "int", default: 1, uniform: "seed",
                    min: 1, max: 100, step: 1,
                    ui: { label: "seed", control: "slider" }
                },
                alpha: {
                    type: "float", default: 0.5, uniform: "alpha",
                    min: 0, max: 1, step: 0.01,
                    ui: { label: "alpha", control: "slider" }
                }
            },
            defaultProgram: "search filter, synth\n\nperlin(scale: 100)\n  .strayHair(density: 1, alpha: 1)\n  .write(o0)",
            textures: {
                overlayTex: { width: 'screen', height: 'screen', format: 'rgba8' }
            },
            passes: [
                {
                    name: "blend",
                    program: "strayHairBlend",
                    inputs: {
                        inputTex: "inputTex",
                        overlayTex: "overlayTex"
                    },
                    uniforms: { alpha: "alpha" },
                    outputs: { fragColor: "outputTex" }
                }
            ]
        })
        // The overlay is drawn again when seed or density changes value.
        setCapabilityUse(this, { dependencies: ['seed', 'density'] })
    }

    async asyncInit(context) {
        return drawWormOverlay(WORM_OVERLAY_RECIPES.strayHair, { seed: 'seed', density: 'density' }, 'overlayTex',
            providerContext(context, WORM_OVERLAY_DESCRIPTOR))
    }
}

export default new StrayHair()

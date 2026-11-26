import { Effect } from '../../../src/runtime/effect.js'
import { providerContext, setCapabilityUse } from '../../../src/portable/capabilities.js'
import { WORM_OVERLAY_DESCRIPTOR, WORM_OVERLAY_RECIPES, drawWormOverlay } from '../../../src/portable/providers/worm-overlay.js'

/**
 * Scratches - film scratch overlay
 *
 * One-shot CPU rendering: 4 layers of nearly-straight worm traces,
 * max-blended as bright white lines.
 * Matches Python reference.
 */
class Scratches extends Effect {
    constructor() {
        super({
            name: "Scratches",
            namespace: "filter",
            func: "scratches",
            tags: ["noise"],
            description: "Film scratch overlay",
            globals: {
                density: {
                    type: "float", default: 0.3, uniform: "density",
                    min: 0, max: 1, step: 0.01,
                    ui: { label: "density", control: "slider" }
                },
                alpha: {
                    type: "float", default: 0.75, uniform: "alpha",
                    min: 0, max: 1, step: 0.01,
                    ui: { label: "alpha", control: "slider" }
                },
                seed: {
                    type: "int", default: 1, uniform: "seed",
                    min: 1, max: 100, step: 1,
                    ui: { label: "seed", control: "slider" }
                }
            },
            defaultProgram: "search filter, synth\n\nsolid(color: #2b2b2b)\n.scratches()\n.write(o0)",
            textures: {
                overlayTex: { width: 'screen', height: 'screen', format: 'rgba8' }
            },
            passes: [
                {
                    name: "blend",
                    program: "scratchesBlend",
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
        return drawWormOverlay(WORM_OVERLAY_RECIPES.scratches, { seed: 'seed', density: 'density' }, 'overlayTex',
            providerContext(context, WORM_OVERLAY_DESCRIPTOR))
    }
}

export default new Scratches()

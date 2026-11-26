import { Effect } from '../../../src/runtime/effect.js'
import { providerContext, setCapabilityUse } from '../../../src/portable/capabilities.js'
import { WORM_OVERLAY_DESCRIPTOR, WORM_OVERLAY_RECIPES, drawWormOverlay } from '../../../src/portable/providers/worm-overlay.js'

/**
 * Fibers - chaotic fiber texture overlay
 *
 * One-shot CPU rendering: traces worms on a canvas, uploads as overlay texture.
 * Matches Python reference: 4 layers of chaotic worms with colored strands.
 * The noisemaker/worm-overlay capability draws it, from the fibers recipe.
 */
class Fibers extends Effect {
    constructor() {
        super({
            name: "Fibers",
            namespace: "filter",
            func: "fibers",
            tags: ["noise"],
            description: "Chaotic fiber texture overlay",
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
            defaultProgram: "search filter, synth\n\nsolid(color: #000000)\n.fibers(density: 1)\n.write(o0)",
            textures: {
                overlayTex: { width: 'screen', height: 'screen', format: 'rgba8' }
            },
            passes: [
                {
                    name: "blend",
                    program: "fibersBlend",
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
        return drawWormOverlay(WORM_OVERLAY_RECIPES.fibers, { seed: 'seed', density: 'density' }, 'overlayTex',
            providerContext(context, WORM_OVERLAY_DESCRIPTOR))
    }
}

export default new Fibers()

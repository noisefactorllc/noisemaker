import { Effect } from '../../../src/runtime/effect.js'
import { traceWorms } from '../../../src/cpu/wormTracer.js'

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
            defaultProgram: "search filter, synth\n\nperlin(scale: 100)\n  .strayHair()\n  .write(o0)",
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
    }

    async asyncInit({ updateTexture, width, height, params, isCancelled }) {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, width, height)
        updateTexture('overlayTex', canvas)

        const seed = params.seed || 1
        const density = params.density !== undefined ? params.density : 0.5

        // Python reference: single layer of sparse unruly worms
        // Density param scales hair count: base 0.001 to 0.005
        // High kink: 5-50
        // Dark strands: brightness * 0.333, mask * 0.666
        const layerSeed = seed * 1000 + 42

        await traceWorms(ctx, {
            width, height,
            seed: layerSeed,
            density: 0.001 + density * 0.004,
            kink: 5 + (layerSeed % 45),
            stride: 0.5,
            strideDeviation: 0.25,
            duration: 8 + (layerSeed % 8),
            behavior: 'unruly',
            flowFreq: 4,
            lineWidth: Math.max(1, width / 400),
            colorFn: (rng) => ({
                r: Math.floor(rng.float() * 30),
                g: Math.floor(rng.float() * 30),
                b: Math.floor(rng.float() * 30),
                a: 0.666
            }),
            isCancelled,
            onProgress: (c) => updateTexture('overlayTex', c)
        })
    }
}

export default new StrayHair()

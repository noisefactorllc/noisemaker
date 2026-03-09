import { Effect } from '../../../src/runtime/effect.js'
import { traceWorms } from '../../../src/cpu/wormTracer.js'

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
    }

    async asyncInit({ updateTexture, width, height, params, isCancelled }) {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, width, height)

        const seed = params.seed || 1

        // Python reference: 4 layers, behavior alternates obedient/unruly
        // Low kink (0.125-0.25) for nearly-straight scratches
        // High density (0.25-0.5) for visible coverage
        for (let layer = 0; layer < 4; layer++) {
            if (isCancelled()) return

            const layerSeed = seed * 1000 + layer * 251
            const isObedient = (layerSeed % 2) === 0

            await traceWorms(ctx, {
                width, height,
                seed: layerSeed,
                density: 0.25 + (layerSeed % 100) / 400,
                kink: 0.125 + (layerSeed % 50) / 400,
                stride: 0.75,
                strideDeviation: 0.5,
                duration: 2 + (layerSeed % 3),
                behavior: isObedient ? 'obedient' : 'unruly',
                flowFreq: 2 + (layerSeed % 3),
                lineWidth: Math.max(0.5, width / 1024),
                colorFn: () => ({
                    r: 255, g: 255, b: 255, a: 1.0
                }),
                isCancelled,
                onProgress: (c) => updateTexture('overlayTex', c)
            })
        }
    }
}

export default new Scratches()

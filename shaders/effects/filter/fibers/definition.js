import { Effect } from '../../../src/runtime/effect.js'
import { traceWorms } from '../../../src/cpu/wormTracer.js'

/**
 * Fibers - chaotic fiber texture overlay
 *
 * One-shot CPU rendering: traces worms on a canvas, uploads as overlay texture.
 * Matches Python reference: 4 layers of chaotic worms with colored strands.
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

        // Python reference: 4 layers of chaotic worms
        // Density param scales worm count: 0.5 + density * 2.0
        const baseDensity = 0.5 + density * 2.0
        for (let layer = 0; layer < 4; layer++) {
            if (isCancelled()) return

            const layerSeed = seed * 1000 + layer * 137

            await traceWorms(ctx, {
                width, height,
                seed: layerSeed,
                density: baseDensity,
                kink: 5 + (layerSeed % 5),
                stride: 0.75,
                strideDeviation: 0.125,
                duration: 1,
                behavior: 'chaotic',
                flowFreq: 4,
                lineWidth: Math.max(1.5, width / 384),
                colorFn: (rng) => ({
                    r: Math.floor(rng.float() * 200 + 55),
                    g: Math.floor(rng.float() * 200 + 55),
                    b: Math.floor(rng.float() * 200 + 55),
                    a: 0.5
                }),
                isCancelled,
                onProgress: (c) => updateTexture('overlayTex', c)
            })
        }
    }
}

export default new Fibers()

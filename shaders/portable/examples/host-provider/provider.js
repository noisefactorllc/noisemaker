/**
 * An example of a capability provider that a host registers: example/gradient,
 * version 1. It draws a vertical gradient between two colors on a CPU canvas
 * and uploads it into a texture of the effect, and draws it again when either
 * color changes value.
 *
 * A host registers it before it registers a package that declares it:
 *
 *   import { registerPortableCapability } from 'noisemaker shaders core'
 *   import { gradientProvider } from './provider.js'
 *   registerPortableCapability(gradientProvider)
 *
 * The package in ./package carries the same descriptor as a file, so an editor
 * or a command-line tool can check its declaration without this code.
 */

export const GRADIENT_DESCRIPTOR = Object.freeze({
    id: 'example/gradient',
    version: 1,
    description: 'A vertical gradient from one color at the top to another at the bottom, drawn on a CPU canvas into a texture',
    bindings: {
        parameters: {
            top: { types: ['vec3', 'color'], required: true },
            bottom: { types: ['vec3', 'color'], required: true },
        },
        textures: { target: { required: true } },
    },
    dependencies: { parameters: ['top', 'bottom'], resources: ['target'] },
    uploadOrientation: 'flipY',
})

const channel = value => Math.round(Math.min(1, Math.max(0, value)) * 255)

export const gradientProvider = Object.freeze({
    id: GRADIENT_DESCRIPTOR.id,
    version: GRADIENT_DESCRIPTOR.version,
    descriptor: GRADIENT_DESCRIPTOR,
    // create() runs once for each effect that declares the capability. The
    // host's createCanvas service, when it gives one, makes the canvas.
    create({ bindings, host }) {
        const { top, bottom } = bindings.parameters
        const { target } = bindings.textures
        const createCanvas = host.createCanvas ?? ((width, height) => {
            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height
            return canvas
        })
        return {
            async asyncInit(context) {
                const { width, height, params } = context
                const canvas = createCanvas(width, height)
                const ctx = canvas.getContext('2d')
                const from = params[top] ?? [0, 0, 0]
                const to = params[bottom] ?? [1, 1, 1]
                for (let row = 0; row < height; row++) {
                    if (context.isCancelled()) return
                    const t = height > 1 ? row / (height - 1) : 0
                    const [r, g, b] = from.map((value, index) => channel(value + (to[index] - value) * t))
                    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
                    ctx.fillRect(0, row, width, 1)
                }
                context.updateTexture(target, canvas)
            },
        }
    },
})

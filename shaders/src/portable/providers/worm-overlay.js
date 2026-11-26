/**
 * The noisemaker/worm-overlay capability, version 1.
 *
 * Draws layers of worm traces on a CPU 2D canvas and uploads the canvas into
 * a texture of the effect as it draws. A recipe states, as data, how each
 * layer is traced from the seed and density parameters. filter/fibers,
 * filter/scratches and filter/strayHair are each drawn from a recipe.
 *
 * For layer L (from 0) of a recipe:
 *   layerSeed = seed * layerSeed.multiply + L * layerSeed.step + layerSeed.offset
 *   a formula { base, modulus, divide } is
 *     base + (layerSeed % modulus) / divide   when modulus is given (divide defaults to 1)
 *     base                                    when it is not
 *   density   = density.base + density * density.scale
 *   lineWidth = max(lineWidth.minimum, canvas width / lineWidth.divide)
 *   behavior  is a name, or { even, odd } chosen by layerSeed % 2
 *   color     is { random: { scale, offset }, alpha }, which draws red, green and
 *             blue as floor(random * scale + offset) in that order, or
 *             { rgb: [r, g, b], alpha }, which draws nothing
 *
 * The seed parameter reads as 1 when it is 0 or absent, and the density
 * parameter reads as recipe.densityDefault when it is absent. With
 * checkEachLayer, the overlay stops before each layer if its regeneration was
 * cancelled; the tracer also checks as it draws.
 */

import { traceWorms } from '../../cpu/wormTracer.js'

// The tracer's behaviors (../../cpu/wormTracer.js).
const BEHAVIORS = ['obedient', 'unruly', 'chaotic']

const formula = {
    type: 'object',
    properties: {
        base: { type: 'number', required: true },
        modulus: { type: 'integer', minimum: 1 },
        divide: { type: 'number' },
    },
}

// The duration multiplies the tracer's steps, so it is bounded; the catalog's
// overlays stay well within it.
const durationFormula = {
    type: 'object',
    properties: {
        base: { type: 'number', minimum: 0, maximum: 64, required: true },
        modulus: { type: 'integer', minimum: 1, maximum: 64 },
        divide: { type: 'number', minimum: 1 },
    },
}

/** The descriptor: what a declaration of this capability may give, as data. */
export const WORM_OVERLAY_DESCRIPTOR = Object.freeze({
    id: 'noisemaker/worm-overlay',
    version: 1,
    description: 'Layers of worm traces drawn on a CPU 2D canvas and uploaded into a texture as they are drawn',
    options: {
        recipe: {
            type: 'object',
            required: true,
            properties: {
                layers: { type: 'integer', minimum: 1, maximum: 16, required: true },
                checkEachLayer: { type: 'boolean', required: true },
                layerSeed: {
                    type: 'object',
                    required: true,
                    properties: {
                        multiply: { type: 'number', required: true },
                        step: { type: 'number', required: true },
                        offset: { type: 'number', required: true },
                    },
                },
                densityDefault: { type: 'number', required: true },
                density: {
                    type: 'object',
                    required: true,
                    properties: { base: { type: 'number', minimum: 0, maximum: 4, required: true }, scale: { type: 'number', minimum: 0, maximum: 4, required: true } },
                },
                kink: { ...formula, required: true },
                stride: { type: 'number', required: true },
                strideDeviation: { type: 'number', required: true },
                duration: { ...durationFormula, required: true },
                behavior: {
                    type: 'object',
                    required: true,
                    properties: {
                        name: { type: 'string', enum: BEHAVIORS },
                        even: { type: 'string', enum: BEHAVIORS },
                        odd: { type: 'string', enum: BEHAVIORS },
                    },
                },
                flowFreq: { ...formula, required: true },
                lineWidth: {
                    type: 'object',
                    required: true,
                    properties: { minimum: { type: 'number', required: true }, divide: { type: 'number', required: true } },
                },
                color: {
                    type: 'object',
                    required: true,
                    properties: {
                        random: {
                            type: 'object',
                            properties: { scale: { type: 'number', required: true }, offset: { type: 'number', required: true } },
                        },
                        rgb: { type: 'array', items: { type: 'number', minimum: 0, maximum: 255 } },
                        alpha: { type: 'number', minimum: 0, maximum: 1, required: true },
                    },
                },
            },
        },
    },
    bindings: {
        parameters: {
            seed: { types: ['int', 'float'], required: true },
            density: { types: ['float', 'int'] },
        },
        textures: { overlay: { required: true } },
    },
    dependencies: { parameters: ['seed', 'density'], resources: [] },
    uploadOrientation: 'flipY',
})

function evaluate({ base, modulus, divide = 1 }, layerSeed) {
    return modulus === undefined ? base : base + (layerSeed % modulus) / divide
}

function behaviorOf(behavior, layerSeed) {
    if (behavior.name !== undefined) return behavior.name
    return (layerSeed % 2) === 0 ? behavior.even : behavior.odd
}

function colorFnOf(color) {
    if (color.random) {
        const { scale, offset } = color.random
        return (rng) => ({
            r: Math.floor(rng.float() * scale + offset),
            g: Math.floor(rng.float() * scale + offset),
            b: Math.floor(rng.float() * scale + offset),
            a: color.alpha
        })
    }
    const [r, g, b] = color.rgb
    return () => ({ r, g, b, a: color.alpha })
}

/**
 * The host's 2D canvas, as the overlay draws on it. willReadFrequently pins
 * the canvas to the software rasterizer: GPU-accelerated 2D canvases (Skia
 * Graphite on Metal, Skia Ganesh on GL) rasterize the same strokes
 * differently, so the overlay pixels would depend on the host.
 */
function defaultCreateCanvas(width, height) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
}

/**
 * Draw an overlay from a recipe, in an asyncInit context.
 * @param {object} recipe - The recipe option
 * @param {{seed: string, density?: string}} parameters - The parameter bindings: role to global name
 * @param {string} texture - The bound overlay texture's name
 * @param {object} context - The asyncInit context: { updateTexture, width, height, params, isCancelled }
 * @param {{createCanvas?: Function}} [host] - Host services
 */
export async function drawWormOverlay(recipe, parameters, texture, context, host = {}) {
    const { updateTexture, width, height, params, isCancelled } = context
    const canvas = (host.createCanvas ?? defaultCreateCanvas)(width, height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.clearRect(0, 0, width, height)
    updateTexture(texture, canvas)

    const seed = params[parameters.seed] || 1
    const density = parameters.density !== undefined && params[parameters.density] !== undefined
        ? params[parameters.density]
        : recipe.densityDefault
    const traceDensity = recipe.density.base + density * recipe.density.scale
    const colorFn = colorFnOf(recipe.color)

    for (let layer = 0; layer < recipe.layers; layer++) {
        if (recipe.checkEachLayer && isCancelled()) return

        const layerSeed = seed * recipe.layerSeed.multiply + layer * recipe.layerSeed.step + recipe.layerSeed.offset

        await traceWorms(ctx, {
            width, height,
            seed: layerSeed,
            density: traceDensity,
            kink: evaluate(recipe.kink, layerSeed),
            stride: recipe.stride,
            strideDeviation: recipe.strideDeviation,
            duration: evaluate(recipe.duration, layerSeed),
            behavior: behaviorOf(recipe.behavior, layerSeed),
            flowFreq: evaluate(recipe.flowFreq, layerSeed),
            lineWidth: Math.max(recipe.lineWidth.minimum, width / recipe.lineWidth.divide),
            colorFn,
            isCancelled,
            onProgress: (c) => updateTexture(texture, c)
        })
    }
}

/**
 * What a recipe must hold beyond its descriptor's schema, which a schema of
 * this form cannot state. A recipe that fails is refused when the effect
 * registers, rather than failing on every draw.
 * @param {object} recipe
 */
export function checkWormOverlayRecipe(recipe) {
    const problems = []
    const { color, behavior } = recipe
    if (Boolean(color.random) === Boolean(color.rgb)) problems.push('color gives one of random and rgb')
    if (color.rgb && color.rgb.length !== 3) problems.push('color.rgb holds red, green and blue')
    if (behavior.name === undefined && (behavior.even === undefined || behavior.odd === undefined)) {
        problems.push('behavior gives a name, or both even and odd')
    }
    if (behavior.name !== undefined && (behavior.even !== undefined || behavior.odd !== undefined)) {
        problems.push('behavior gives a name or even and odd, not both')
    }
    for (const field of ['kink', 'duration', 'flowFreq']) {
        if (recipe[field].divide === 0) problems.push(`${field}.divide is not 0`)
    }
    if (recipe.lineWidth.divide === 0) problems.push('lineWidth.divide is not 0')
    if (problems.length) throw new Error(`the worm overlay recipe is refused: ${problems.join('; ')}`)
}

/**
 * The provider: create() runs once per registered effect, and gives the
 * effect its asyncInit.
 * @param {{options: {recipe: object}, bindings: object, host: object}} input
 */
export function createWormOverlay({ options, bindings, host = {} }) {
    const { recipe } = options
    checkWormOverlayRecipe(recipe)
    const parameters = bindings.parameters ?? {}
    const texture = bindings.textures.overlay
    return {
        asyncInit(context) {
            return drawWormOverlay(recipe, parameters, texture, context, host)
        }
    }
}

export const wormOverlayProvider = Object.freeze({
    id: WORM_OVERLAY_DESCRIPTOR.id,
    version: WORM_OVERLAY_DESCRIPTOR.version,
    descriptor: WORM_OVERLAY_DESCRIPTOR,
    create: createWormOverlay,
})

/** The recipes of the catalog's overlays, as their definitions draw them. */
export const WORM_OVERLAY_RECIPES = Object.freeze({
    fibers: {
        layers: 4,
        checkEachLayer: true,
        layerSeed: { multiply: 1000, step: 137, offset: 0 },
        densityDefault: 0.5,
        density: { base: 0.5, scale: 2.0 },
        kink: { base: 5, modulus: 5 },
        stride: 0.75,
        strideDeviation: 0.125,
        duration: { base: 1 },
        behavior: { name: 'chaotic' },
        flowFreq: { base: 4 },
        lineWidth: { minimum: 1.5, divide: 384 },
        color: { random: { scale: 200, offset: 55 }, alpha: 0.5 },
    },
    scratches: {
        layers: 4,
        checkEachLayer: true,
        layerSeed: { multiply: 1000, step: 251, offset: 0 },
        densityDefault: 0.3,
        density: { base: 0.1, scale: 0.4 },
        kink: { base: 0.125, modulus: 50, divide: 400 },
        stride: 0.75,
        strideDeviation: 0.5,
        duration: { base: 2, modulus: 3 },
        behavior: { even: 'obedient', odd: 'unruly' },
        flowFreq: { base: 2, modulus: 3 },
        lineWidth: { minimum: 0.5, divide: 1024 },
        color: { rgb: [255, 255, 255], alpha: 1.0 },
    },
    strayHair: {
        layers: 1,
        checkEachLayer: false,
        layerSeed: { multiply: 1000, step: 0, offset: 42 },
        densityDefault: 0.5,
        density: { base: 0.001, scale: 0.004 },
        kink: { base: 5, modulus: 45 },
        stride: 0.5,
        strideDeviation: 0.25,
        duration: { base: 8, modulus: 8 },
        behavior: { name: 'unruly' },
        flowFreq: { base: 4 },
        lineWidth: { minimum: 1, divide: 400 },
        color: { random: { scale: 30, offset: 0 }, alpha: 0.666 },
    },
})

/**
 * CPU worm tracer for one-shot canvas rendering.
 * Ported from js/noisemaker/effects.js worms() function.
 * Draws worm trails onto a Canvas 2D context with proper alpha.
 */

const TAU = Math.PI * 2

/**
 * Simple seeded PRNG (PCG-based)
 */
export class SeededRNG {
    constructor(seed) {
        this.state = ((seed >>> 0) * 747796405 + 2891336453) >>> 0
    }
    next() {
        this.state = (this.state * 747796405 + 2891336453) >>> 0
        const word = (((this.state >>> ((this.state >>> 28) + 4)) ^ this.state) * 277803737) >>> 0
        return ((word >>> 22) ^ word) >>> 0
    }
    float() {
        return this.next() / 4294967295
    }
    int(min, max) {
        return min + (this.next() % (max - min + 1))
    }
    normal(mean = 0, std = 1) {
        const u1 = Math.max(this.float(), 1e-10)
        const u2 = this.float()
        return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(TAU * u2)
    }
}

/**
 * Generate a low-frequency value noise field for worm flow direction.
 * Returns Float32Array of w*h values in [0, 1].
 */
function valueNoiseField(w, h, freq, rng) {
    const gw = Math.ceil(freq) + 2
    const gh = Math.ceil(freq) + 2
    const grid = new Float32Array(gw * gh)
    for (let i = 0; i < grid.length; i++) grid[i] = rng.float()

    const field = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const fx = (x / w) * freq
            const fy = (y / h) * freq
            const ix = Math.floor(fx)
            const iy = Math.floor(fy)
            const dx = fx - ix
            const dy = fy - iy
            const sx = dx * dx * (3 - 2 * dx)
            const sy = dy * dy * (3 - 2 * dy)
            const tl = grid[iy * gw + ix]
            const tr = grid[iy * gw + ix + 1]
            const bl = grid[(iy + 1) * gw + ix]
            const br = grid[(iy + 1) * gw + ix + 1]
            field[y * w + x] = (tl * (1 - sx) + tr * sx) * (1 - sy) +
                                (bl * (1 - sx) + br * sx) * sy
        }
    }
    return field
}

/**
 * Trace worms onto a canvas 2D context.
 *
 * @param {CanvasRenderingContext2D} ctx - 2D context to draw on
 * @param {Object} opts
 * @param {number} opts.width - Canvas width
 * @param {number} opts.height - Canvas height
 * @param {number} opts.seed - Seed for deterministic PRNG
 * @param {number} opts.density - Worm count scaling (used as: maxDim * density)
 * @param {number} opts.kink - Flow field influence multiplier
 * @param {number} opts.stride - Base stride in normalized units
 * @param {number} opts.strideDeviation - Stride randomness std dev
 * @param {number} opts.duration - Controls iteration count: sqrt(minDim) * duration
 * @param {string} opts.behavior - 'obedient' | 'unruly' | 'chaotic'
 * @param {number} opts.flowFreq - Frequency of the flow noise field
 * @param {number} opts.lineWidth - Trail width in pixels
 * @param {function} opts.colorFn - (rng, wormIndex) => {r, g, b, a}
 * @param {function} opts.isCancelled - () => boolean
 * @param {function} opts.onProgress - (canvas) => void, called for progressive upload
 * @returns {Promise<void>}
 */
export async function traceWorms(ctx, opts) {
    const {
        width, height, seed, density, kink, stride, strideDeviation,
        duration, behavior, flowFreq, colorFn, lineWidth,
        isCancelled, onProgress
    } = opts

    const rng = new SeededRNG(seed)
    const minDim = Math.min(width, height)
    const maxDim = Math.max(width, height)
    const strideScale = maxDim / 1024

    // Generate flow field
    const flowField = valueNoiseField(width, height, flowFreq, new SeededRNG(seed * 31337))

    // Worm count from density
    const count = Math.max(1, Math.floor(maxDim * density))

    // For obedient behavior, all worms share one base rotation
    const sharedRot = rng.float() * TAU

    // Initialize worms
    const worms = []
    for (let i = 0; i < count; i++) {
        worms.push({
            x: rng.float() * width,
            y: rng.float() * height,
            stride: rng.normal(stride, strideDeviation) * strideScale,
            rot: behavior === 'obedient' ? sharedRot : rng.float() * TAU,
            color: colorFn(rng, i)
        })
    }

    const iterations = Math.max(1, Math.floor(Math.sqrt(minDim) * duration))

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = lineWidth

    // Trace each worm
    for (let w = 0; w < count; w++) {
        if (isCancelled()) return

        const worm = worms[w]
        const { r, g, b, a } = worm.color

        let wx = worm.x
        let wy = worm.y

        for (let iter = 0; iter < iterations; iter++) {
            // Exposure ramp: 0 → 1 → 0 over lifetime
            const t = iterations > 1 ? iter / (iterations - 1) : 1
            const exposure = 1 - Math.abs(1 - t * 2)

            // Flow field lookup (wrap coordinates)
            const fx = Math.floor(((wx % width) + width) % width)
            const fy = Math.floor(((wy % height) + height) % height)
            const fieldVal = flowField[fy * width + fx]
            let angle = fieldVal * TAU * kink

            if (behavior === 'obedient') {
                angle += sharedRot
            } else {
                angle += worm.rot
            }

            const newX = wx + Math.sin(angle) * worm.stride
            const newY = wy + Math.cos(angle) * worm.stride

            // Draw segment with alpha modulated by exposure
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${a * exposure})`
            ctx.beginPath()
            ctx.moveTo(wx, wy)
            ctx.lineTo(newX, newY)
            ctx.stroke()

            wx = newX
            wy = newY
        }

        // Yield every few worms for responsiveness
        if (w % 3 === 0) {
            await new Promise(r => setTimeout(r, 0))
            if (onProgress) onProgress(ctx.canvas)
        }
    }

    // Final progress report
    if (onProgress) onProgress(ctx.canvas)
}

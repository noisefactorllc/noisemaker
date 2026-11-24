/**
 * Seeded draws for the language's random constructs.
 *
 * A draw is a function of a seed and a key. The key is a string that names
 * where the draw is written in the program, so adding, removing or skipping
 * one draw never changes another. Every hash and draw is computed in 32-bit
 * unsigned integers; the mappings below fix every remaining float operation,
 * so that every implementation reproduces the same values.
 *
 * shaders/tests/fixtures/seeded-draws.json holds the expected results, for
 * this module and for every other implementation.
 */

const TWO_32 = 4294967296
const TWO_24 = 16777216
const INT32_MIN = -2147483648
const INT32_MAX = 2147483647

/** The constant key of a call that carries its own `seed:`. */
export const PIN_KEY = 'pin'

const encoder = new TextEncoder()

function assertUint32(value, what) {
    if (!Number.isInteger(value) || value < 0 || value >= TWO_32) {
        throw new RangeError(`${what} must be an integer from 0 to 4294967295, got ${value}`)
    }
}

/**
 * The mixer: a splitmix32-style finalizer, a bijection on uint32.
 * @param {number} x uint32
 * @returns {number} uint32
 */
export function mix32(x) {
    let z = ((x >>> 0) + 0x9E3779B9) >>> 0
    z = Math.imul(z ^ (z >>> 16), 0x21F0AAAD) >>> 0
    z = Math.imul(z ^ (z >>> 15), 0x735A2D97) >>> 0
    return (z ^ (z >>> 15)) >>> 0
}

function invertXorShift(y, shift) {
    let x = y
    for (let i = 0; i < 32; i += shift) {
        x = (y ^ (x >>> shift)) >>> 0
    }
    return x
}

function inverseOdd(a) {
    // Newton iteration for the inverse of an odd number modulo 2^32.
    let x = a
    for (let i = 0; i < 5; i++) {
        x = Math.imul(x, (2 - Math.imul(a, x)) >>> 0) >>> 0
    }
    return x
}

const INV_21F0AAAD = inverseOdd(0x21F0AAAD)
const INV_735A2D97 = inverseOdd(0x735A2D97)

/**
 * The inverse of mix32.
 * @param {number} h uint32
 * @returns {number} uint32
 */
export function unmix32(h) {
    let z = invertXorShift(h >>> 0, 15)
    z = Math.imul(z, INV_735A2D97) >>> 0
    z = invertXorShift(z, 15)
    z = Math.imul(z, INV_21F0AAAD) >>> 0
    z = invertXorShift(z, 16)
    return (z - 0x9E3779B9) >>> 0
}

/**
 * FNV-1a, 32 bits, over the UTF-8 bytes of a string.
 * @param {string} text
 * @returns {number} uint32
 */
export function fnv1a32(text) {
    let h = 0x811C9DC5
    for (const byte of encoder.encode(text)) {
        h ^= byte
        h = Math.imul(h, 0x01000193) >>> 0
    }
    return h >>> 0
}

/**
 * The draw for a seed and a key.
 * @param {number} seed uint32
 * @param {string} key
 * @returns {number} uint32
 */
export function drawU32(seed, key) {
    assertUint32(seed, 'seed')
    if (typeof key !== 'string') {
        throw new TypeError('a draw key must be a string')
    }
    return mix32((mix32(seed) ^ fnv1a32(key)) >>> 0)
}

/**
 * The seed that makes a call keyed by PIN_KEY draw `u` again.
 * @param {number} u uint32
 * @returns {number} uint32
 */
export function pinSeed(u) {
    assertUint32(u, 'draw')
    return unmix32((unmix32(u) ^ fnv1a32(PIN_KEY)) >>> 0)
}

function assertInt32Bound(value, what) {
    if (!Number.isInteger(value)) {
        throw new RangeError(`randInt(min, max) requires whole-number bounds, got ${what} ${value}`)
    }
    if (value < INT32_MIN || value > INT32_MAX) {
        throw new RangeError(`randInt(min, max) bounds must be from -2147483648 to 2147483647, got ${what} ${value}`)
    }
}

/**
 * randInt(min, max): an integer from min to max, inclusive. Swapped bounds
 * are put in order. The range and remainder are exact in f64, so a range of
 * 2^32 does not wrap.
 */
export function randIntFrom(u, min, max) {
    assertUint32(u, 'draw')
    assertInt32Bound(min, 'min')
    assertInt32Bound(max, 'max')
    if (max < min) {
        [min, max] = [max, min]
    }
    const range = max - min + 1
    return min + (u % range)
}

/**
 * rand(min, max): the top 24 bits of the draw as a fraction, then three
 * separate f64 operations. Reversed bounds are not swapped.
 */
export function randFrom(u, min = 0, max = 1) {
    assertUint32(u, 'draw')
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        throw new RangeError('rand(min, max) requires numeric arguments')
    }
    const f = (u >>> 8) / TWO_24
    const d = max - min
    const m = f * d
    return min + m
}

/** pick: the index of the chosen item. */
export function pickIndex(u, length) {
    assertUint32(u, 'draw')
    if (!Number.isInteger(length) || length < 1) {
        throw new RangeError('pick needs at least one value')
    }
    return u % length
}

function assertProbability(p, what) {
    if (typeof p !== 'number' || Number.isNaN(p)) {
        throw new RangeError(`${what} requires a numeric probability`)
    }
    if (p < 0 || p > 1) {
        throw new RangeError(`${what}: the probability must be between 0 and 1`)
    }
}

/**
 * chance(p) and maybe(p): the threshold floor(p * 2^32) is exact for every
 * f64 p in [0, 1] and can be 2^32, so it is compared as a number, not as a
 * uint32.
 */
export function chanceFrom(u, p, what = 'chance(p)') {
    assertUint32(u, 'draw')
    assertProbability(p, what)
    return u < Math.floor(p * TWO_32)
}

/** The draw of one randColor component, derived from the call's one draw. */
export function colorComponentDraw(u, name) {
    assertUint32(u, 'draw')
    return mix32((u ^ fnv1a32(name)) >>> 0)
}

function toHexByte(c) {
    const byte = Math.min(255, Math.max(0, Math.floor(255 * c + 0.5)))
    return byte.toString(16).padStart(2, '0')
}

/**
 * randColor(h:, s:, v:): a hex color. A component left out is drawn; h wraps,
 * s and v must be from 0 to 1.
 */
export function randColorFrom(u, { h, s, v } = {}) {
    assertUint32(u, 'draw')
    if (h === undefined) h = randFrom(colorComponentDraw(u, 'h'))
    if (s === undefined) s = randFrom(colorComponentDraw(u, 's'))
    if (v === undefined) v = randFrom(colorComponentDraw(u, 'v'))
    if (!Number.isFinite(h)) {
        throw new RangeError('randColor(): h must be a number')
    }
    for (const [name, value] of [['s', s], ['v', v]]) {
        if (!Number.isFinite(value) || value < 0 || value > 1) {
            throw new RangeError(`randColor(): ${name} must be between 0 and 1`)
        }
    }
    const hw = h - Math.floor(h)
    const channel = (n) => {
        let k = n + 6 * hw
        if (k >= 6) k -= 6
        const m = Math.max(0, Math.min(k, 4 - k, 1))
        return toHexByte(v - (v * s) * m)
    }
    return `#${channel(5)}${channel(3)}${channel(1)}`
}

/**
 * Path segments that locate a call inside a value expression.
 */
export const pathSegment = Object.freeze({
    /** an argument of a call with a known signature, by parameter name */
    named: (name) => `k:${name}`,
    /** an argument of pick or choices, from 0 */
    arg: (index) => `a${index}`,
    /** a vector, array or vec*() component, from 0 */
    component: (index) => `c${index}`,
    /** an operand of an operator: 0 or 1 */
    operand: (index) => `o${index}`
})

/**
 * Join key segments with '/', leaving out empty ones.
 * @param {...string} segments
 * @returns {string}
 */
export function joinKey(...segments) {
    return segments.filter(segment => segment !== undefined && segment !== null && segment !== '').join('/')
}

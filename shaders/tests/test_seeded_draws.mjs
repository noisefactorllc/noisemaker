import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
    PIN_KEY,
    chanceFrom,
    colorComponentDraw,
    drawU32,
    fnv1a32,
    joinKey,
    mix32,
    pickIndex,
    pinSeed,
    randColorFrom,
    randFrom,
    randIntFrom,
    unmix32
} from '../src/lang/draws.js'

const vectors = JSON.parse(readFileSync(new URL('./fixtures/seeded-draws.json', import.meta.url), 'utf8'))

// A second implementation in BigInt arithmetic, written from the rules rather
// than from the module, so that a defect shared by the module and the
// fixture is caught.
const MASK = (1n << 32n) - 1n
const big = {
    mul: (a, b) => (a * b) & MASK,
    xorShift: (z, s) => z ^ (z >> s),
    mix32(x) {
        let z = (BigInt(x) + 0x9E3779B9n) & MASK
        z = big.mul(big.xorShift(z, 16n), 0x21F0AAADn)
        z = big.mul(big.xorShift(z, 15n), 0x735A2D97n)
        return Number(big.xorShift(z, 15n))
    },
    fnv1a32(text) {
        let h = 0x811C9DC5n
        for (const byte of Buffer.from(text, 'utf8')) {
            h = big.mul(h ^ BigInt(byte), 0x01000193n)
        }
        return Number(h)
    },
    draw(seed, key) {
        return big.mix32(Number(BigInt(big.mix32(seed)) ^ BigInt(big.fnv1a32(key))))
    },
    randInt(u, min, max) {
        let lo = BigInt(min)
        let hi = BigInt(max)
        if (hi < lo) [lo, hi] = [hi, lo]
        return Number(lo + (BigInt(u) % (hi - lo + 1n)))
    },
    fraction(u) {
        return Number(BigInt(u) >> 8n) / 2 ** 24
    },
    chance(u, p) {
        // floor(p * 2^32) taken from p's exact binary value.
        const view = new DataView(new ArrayBuffer(8))
        view.setFloat64(0, p)
        const bits = view.getBigUint64(0)
        const exponent = Number((bits >> 52n) & 0x7FFn)
        const mantissa = bits & ((1n << 52n) - 1n)
        if (exponent === 0) return false
        const significand = mantissa | (1n << 52n)
        const shift = exponent - 1075 + 32
        const threshold = shift >= 0 ? significand << BigInt(shift) : significand >> BigInt(-shift)
        return BigInt(u) < threshold
    }
}

test('mix32 and unmix32 match the vectors and invert each other', () => {
    for (const { x, mix32: expected, unmix32: inverse } of vectors.mix32) {
        assert.equal(mix32(x), expected, `mix32(${x})`)
        assert.equal(big.mix32(x), expected, `reference mix32(${x})`)
        assert.equal(unmix32(x), inverse, `unmix32(${x})`)
        assert.equal(mix32(inverse), x, `mix32(unmix32(${x}))`)
        assert.equal(unmix32(mix32(x)), x, `unmix32(mix32(${x}))`)
    }
})

test('fnv1a32 hashes UTF-8 bytes', () => {
    for (const { text, fnv1a32: expected } of vectors.fnv1a32) {
        assert.equal(fnv1a32(text), expected, JSON.stringify(text))
        assert.equal(big.fnv1a32(text), expected, `reference ${JSON.stringify(text)}`)
    }
})

test('draws match the vectors', () => {
    for (const { seed, key, u } of vectors.draws) {
        assert.equal(drawU32(seed, key), u, `${seed} ${key}`)
        assert.equal(big.draw(seed, key), u, `reference ${seed} ${key}`)
    }
})

test('a draw depends only on its own seed and key', () => {
    const before = drawU32(7, 'synth.cell@cell_1/scale')
    drawU32(7, 'synth.cell@cell_1/octaves')
    assert.equal(drawU32(7, 'synth.cell@cell_1/scale'), before)
    assert.notEqual(drawU32(8, 'synth.cell@cell_1/scale'), before)
})

test('randInt matches the vectors, including the full int32 range and swapped bounds', () => {
    for (const { u, min, max, value } of vectors.randInt) {
        assert.equal(randIntFrom(u, min, max), value, `randInt ${u} ${min} ${max}`)
        assert.equal(big.randInt(u, min, max), value, `reference randInt ${u} ${min} ${max}`)
        assert.ok(value >= Math.min(min, max) && value <= Math.max(min, max))
    }
    assert.equal(randIntFrom(4294967295, -2147483648, 2147483647), 2147483647)
    assert.equal(randIntFrom(0, -2147483648, 2147483647), -2147483648)
})

test('rand matches the vectors, with an exact 24-bit fraction', () => {
    const f32 = new Float32Array(1)
    for (const { u, min, max, value } of vectors.rand) {
        assert.equal(randFrom(u, min, max), value, `rand ${u} ${min} ${max}`)
        const f = big.fraction(u)
        f32[0] = f
        assert.equal(f32[0], f, 'the fraction is exact in f32')
        const d = max - min
        const m = f * d
        assert.equal(min + m, value, `reference rand ${u} ${min} ${max}`)
    }
    assert.equal(randFrom(0, 300, 100), 300, 'reversed bounds are not swapped')
})

test('pick matches the vectors', () => {
    for (const { u, length, index } of vectors.pick) {
        assert.equal(pickIndex(u, length), index)
        assert.equal(Number(BigInt(u) % BigInt(length)), index)
    }
})

test('chance matches the vectors at the ends of its range', () => {
    for (const { u, p, value } of vectors.chance) {
        assert.equal(chanceFrom(u, p), value, `chance ${u} ${p}`)
        assert.equal(big.chance(u, p), value, `reference chance ${u} ${p}`)
    }
    assert.equal(chanceFrom(4294967295, 1), true, 'p = 1 is always true')
    assert.equal(chanceFrom(0, 0), false, 'p = 0 is never true')
    assert.equal(chanceFrom(0, 2 ** -32), true)
    assert.equal(chanceFrom(1, 2 ** -32), false)
})

test('randColor matches the vectors and derives its components from one draw', () => {
    for (const { u, given, components, value } of vectors.randColor) {
        for (const name of ['h', 's', 'v']) {
            const expected = big.mix32(Number(BigInt(u) ^ BigInt(big.fnv1a32(name))))
            assert.equal(colorComponentDraw(u, name), expected, `component ${name} of ${u}`)
            assert.equal(components[name], expected)
        }
        assert.equal(randColorFrom(u, given), value, `randColor ${u} ${JSON.stringify(given)}`)
        assert.match(value, /^#[0-9a-f]{6}$/)
    }
    assert.equal(randColorFrom(0, { h: 1.2, s: 1, v: 1 }), randColorFrom(0, { h: 0.2, s: 1, v: 1 }), 'h wraps')
    assert.equal(randColorFrom(0, { h: 0, s: 1, v: 1 }), '#ff0000')
    assert.equal(randColorFrom(0, { h: 1 / 3, s: 1, v: 1 }), '#00ff00')
    assert.equal(randColorFrom(0, { h: 0, s: 0, v: 0 }), '#000000')
})

test('a pin seed reproduces its draw under the constant key', () => {
    for (const { u, seed } of vectors.pin) {
        assert.equal(pinSeed(u), seed)
        assert.equal(drawU32(seed, PIN_KEY), u)
        assert.equal(big.draw(seed, PIN_KEY), u)
    }
})

test('keys join their segments with / and leave out empty ones', () => {
    for (const { segments, key } of vectors.keys) {
        assert.equal(joinKey(...segments), key)
    }
})

test('invalid arguments are errors', () => {
    assert.throws(() => drawU32(-1, 'k'), RangeError)
    assert.throws(() => drawU32(2 ** 32, 'k'), RangeError)
    assert.throws(() => drawU32(1.5, 'k'), RangeError)
    assert.throws(() => drawU32(1, 7), TypeError)
    assert.throws(() => randIntFrom(0, 1.5, 3), RangeError)
    assert.throws(() => randIntFrom(0, -2147483649, 3), RangeError)
    assert.throws(() => randIntFrom(0, 0, 2147483648), RangeError)
    assert.throws(() => randFrom(0, 0, Infinity), RangeError)
    assert.throws(() => pickIndex(0, 0), RangeError)
    assert.throws(() => chanceFrom(0, -0.1), RangeError)
    assert.throws(() => chanceFrom(0, 1.1), RangeError)
    assert.throws(() => chanceFrom(0, NaN), RangeError)
    assert.throws(() => randColorFrom(0, { s: 1.5 }), RangeError)
    assert.throws(() => randColorFrom(0, { v: -0.1 }), RangeError)
    assert.throws(() => randColorFrom(0, { h: NaN }), RangeError)
})

// The present conversion to Display P3: the matrix and the curves against
// reference values, the round trip of pure sRGB colors, alpha, and the shader
// sources made from the same constants.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
    DISPLAY_P3_GLSL, DISPLAY_P3_TO_SRGB, DISPLAY_P3_WGSL, SRGB_TO_DISPLAY_P3,
    decodeSrgb, displayP3ToSrgb, encodeSrgb, presentDisplayP3,
} from '../src/runtime/display-p3-conversion.js'

const close = (actual, expected, tolerance, message) => {
    assert.equal(actual.length, expected.length, message)
    actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= tolerance, `${message}: [${index}] ${value} is not within ${tolerance} of ${expected[index]}`))
}

test('the matrix maps white to white, and its inverse undoes it', () => {
    for (const row of SRGB_TO_DISPLAY_P3) assert.ok(Math.abs(row[0] + row[1] + row[2] - 1) < 1e-6)
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const product = [0, 1, 2].reduce((sum, k) => sum + SRGB_TO_DISPLAY_P3[i][k] * DISPLAY_P3_TO_SRGB[k][j], 0)
            assert.ok(Math.abs(product - (i === j ? 1 : 0)) < 1e-9)
        }
    }
})

test('the curves match the sRGB reference values, mirrored for negative values', () => {
    close([0, 0.04045, 0.5, 1].map(decodeSrgb), [0, 0.04045 / 12.92, 0.2140411, 1], 1e-6, 'decode')
    close([0, 0.0031308, 0.2140411, 1].map(encodeSrgb), [0, 0.0031308 * 12.92, 0.5, 1], 1e-6, 'encode')
    assert.equal(decodeSrgb(-0.5), -decodeSrgb(0.5))
    assert.equal(encodeSrgb(-0.25), -encodeSrgb(0.25))
    assert.ok(decodeSrgb(1.5) > 2, 'over-range values follow the curve, without a clamp')
    for (let v = -1.5; v <= 1.5; v += 0.01) assert.ok(Math.abs(encodeSrgb(decodeSrgb(v)) - v) < 1e-9)
})

test('sRGB primaries convert to their Display P3 reference values', () => {
    // sRGB red, green and blue, in Display P3 with the sRGB curve.
    close(presentDisplayP3([1, 0, 0, 1]).slice(0, 3), [0.9175, 0.2003, 0.1386], 5e-4, 'red')
    close(presentDisplayP3([0, 1, 0, 1]).slice(0, 3), [0.4587, 0.9853, 0.2983], 5e-4, 'green')
    close(presentDisplayP3([0, 0, 1, 1]).slice(0, 3), [0, 0, 0.9596], 5e-4, 'blue')
    close(presentDisplayP3([1, 1, 1, 1]), [1, 1, 1, 1], 1e-6, 'white')
    close(presentDisplayP3([0, 0, 0, 1]), [0, 0, 0, 1], 0, 'black')
})

test('a pure sRGB color comes back from Display P3 unchanged', () => {
    for (let r = 0; r <= 1; r += 0.125) {
        for (let g = 0; g <= 1; g += 0.125) {
            for (let b = 0; b <= 1; b += 0.125) {
                const p3 = presentDisplayP3([r, g, b, 1])
                close(displayP3ToSrgb(p3.slice(0, 3)), [r, g, b], 1e-5, `(${r}, ${g}, ${b})`)
            }
        }
    }
})

test('alpha: 0 keeps its converted color at alpha 0, 1 converts the color, and a translucent pixel converts its unpremultiplied color', () => {
    const glow = presentDisplayP3([0.3, 0.2, 0.1, 0])
    assert.equal(glow[3], 0)
    close(displayP3ToSrgb(glow.slice(0, 3)), [0.3, 0.2, 0.1], 1e-6, 'an alpha 0 color, as an srgb canvas keeps it')
    assert.deepEqual(presentDisplayP3([0, 0, 0, 0]), [0, 0, 0, 0])
    const opaque = presentDisplayP3([0.5, 0.25, 1, 1])
    const half = presentDisplayP3([0.25, 0.125, 0.5, 0.5])
    close(half, [opaque[0] * 0.5, opaque[1] * 0.5, opaque[2] * 0.5, 0.5], 1e-12, 'premultiplied by its alpha')
    close(presentDisplayP3([0.5, 0.5, 0.5, 1.5]), presentDisplayP3([0.5, 0.5, 0.5, 1]), 0, 'alpha clamps to 1')
})

test('the default clamp keeps an over-range value at the edge of sRGB', () => {
    close(presentDisplayP3([1.5, -0.5, 0.25, 1]), presentDisplayP3([1, 0, 0.25, 1]), 0, 'clamped before the conversion')
})

test('a translucent pixel whose color exceeds its alpha keeps it, as an 8-bit srgb canvas shows it', () => {
    // Premultiplied red 0.75 at alpha 0.5: an srgb canvas presents it as written.
    const p3 = presentDisplayP3([0.75, 0, 0, 0.5])
    assert.equal(p3[3], 0.5)
    const back = displayP3ToSrgb(p3.slice(0, 3).map(c => c / p3[3])).map(c => c * p3[3])
    close(back, [0.75, 0, 0], 1e-5, 'converted back, premultiplied')
    for (const c of p3.slice(0, 3)) assert.ok(c >= 0 && c <= 1, 'the premultiplied result is clamped to 0 to 1')
})

test('the GLSL and WGSL sources carry the same matrix, column by column', () => {
    const columns = [0, 1, 2].map(column => SRGB_TO_DISPLAY_P3.map(row => row[column]))
    for (const source of [DISPLAY_P3_GLSL, DISPLAY_P3_WGSL]) {
        const body = source.slice(source.indexOf('NM_SRGB_TO_DISPLAY_P3'), source.indexOf(');'))
        const numbers = body.match(/-?\d+\.\d+/g).map(Number)
        assert.deepEqual(numbers, columns.flat())
        assert.match(source, /nmPresentDisplayP3/)
    }
})

test('a program that declares gamut p3 keeps a color outside sRGB: Display P3 red reaches the display as P3 red', () => {
    // Display P3 red, in extended sRGB: one channel over 1, two below 0.
    const p3Red = displayP3ToSrgb([1, 0, 0])
    assert.ok(p3Red[0] > 1 && p3Red[1] < 0 && p3Red[2] < 0)
    close(presentDisplayP3([...p3Red, 1], { clampToSrgb: false }), [1, 0, 0, 1], 1e-6, 'unclamped')
    close(presentDisplayP3([...p3Red, 1]), presentDisplayP3([1, 0, 0, 1]), 0, 'clamped to sRGB red by default')
    close(presentDisplayP3([1.5, 1.5, 1.5, 1], { clampToSrgb: false }), [1, 1, 1, 1], 0, 'still clamped to the P3 gamut')
    close(presentDisplayP3([0.3, 0.2, 0.1, 1], { clampToSrgb: false }), presentDisplayP3([0.3, 0.2, 0.1, 1]), 0, 'an sRGB color is the same either way')
})

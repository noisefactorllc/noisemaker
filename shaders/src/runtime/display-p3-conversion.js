/**
 * The present conversion from extended sRGB to Display P3.
 *
 * Under 'display-p3', both present shaders run these steps on each pixel:
 * 1. clamp the premultiplied value to 0 to 1, as an 8-bit srgb canvas does;
 * 2. unpremultiply;
 * 3. decode the sRGB transfer function, extended to negative and over-range
 *    values;
 * 4. convert the sRGB primaries to the Display P3 primaries;
 * 5. encode with the sRGB curve, which Display P3 uses too, extended;
 * 6. premultiply;
 * 7. clamp the premultiplied value to 0 to 1.
 *
 * The canvases are premultiplied, and a non-linear curve on premultiplied
 * values would change translucent colors, so the curves run on
 * unpremultiplied values. The clamp of step 1 keeps every color a program
 * shows on an srgb canvas, including a translucent pixel whose color exceeds
 * its alpha, which an srgb canvas presents as it is written: an sRGB color,
 * converted, is a Display P3 color that shows the same. A pixel at alpha 0
 * cannot be unpremultiplied; its clamped color is converted as it is, and
 * keeps alpha 0, as an 8-bit srgb canvas keeps it.
 *
 * A program that declares `gamut p3` skips the clamp of step 1, so its colors
 * outside sRGB reach the display. The clamp of step 7 still keeps the result
 * inside Display P3.
 *
 * The constants are held once, here. The GLSL and WGSL functions are made from
 * them, and presentDisplayP3() is the same conversion in JavaScript, which the
 * tests and the corpus measurements use.
 */

/**
 * Linear sRGB to linear Display P3, row by row. Both spaces have the D65
 * white point, so white maps to white.
 */
export const SRGB_TO_DISPLAY_P3 = Object.freeze([
    Object.freeze([0.8224621, 0.1775380, 0.0]),
    Object.freeze([0.0331941, 0.9668058, 0.0]),
    Object.freeze([0.0170827, 0.0723974, 0.9105199]),
])

/** The sRGB transfer function's constants. */
const DECODE_EDGE = 0.04045
const ENCODE_EDGE = 0.0031308
const LINEAR_SLOPE = 12.92
const OFFSET = 0.055
const SCALE = 1.055
const GAMMA = 2.4

/**
 * Decode the sRGB transfer function, extended to negative and over-range
 * values by its odd mirror: decode(-v) is -decode(v).
 * @param {number} value
 * @returns {number}
 */
export function decodeSrgb(value) {
    const magnitude = Math.abs(value)
    const linear = magnitude <= DECODE_EDGE ? magnitude / LINEAR_SLOPE : ((magnitude + OFFSET) / SCALE) ** GAMMA
    return Math.sign(value) * linear
}

/**
 * Encode with the sRGB transfer function, extended in the same way.
 * @param {number} value
 * @returns {number}
 */
export function encodeSrgb(value) {
    const magnitude = Math.abs(value)
    const encoded = magnitude <= ENCODE_EDGE ? magnitude * LINEAR_SLOPE : SCALE * magnitude ** (1 / GAMMA) - OFFSET
    return Math.sign(value) * encoded
}

/**
 * The inverse of a 3x3 matrix given row by row.
 * @param {number[][]} m
 * @returns {number[][]}
 */
export function invert3(m) {
    const [[a, b, c], [d, e, f], [g, h, i]] = m
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    return [[e * i - f * h, c * h - b * i, b * f - c * e], [f * g - d * i, a * i - c * g, c * d - a * f], [d * h - e * g, b * g - a * h, a * e - b * d]]
        .map(row => row.map(value => value / det))
}

/** Linear Display P3 to linear sRGB, row by row: the inverse of SRGB_TO_DISPLAY_P3. */
export const DISPLAY_P3_TO_SRGB = Object.freeze(invert3(SRGB_TO_DISPLAY_P3).map(row => Object.freeze(row)))

const apply3 = (m, v) => m.map(row => row[0] * v[0] + row[1] * v[1] + row[2] * v[2])
const clamp01 = v => Math.min(1, Math.max(0, v))

/**
 * The present conversion of one premultiplied pixel, in JavaScript.
 * @param {number[]} rgba - Premultiplied, as a surface holds it
 * @param {object} [options]
 * @param {boolean} [options.clampToSrgb=true] - false for a program that declares `gamut p3`
 * @returns {number[]} Premultiplied Display P3
 */
export function presentDisplayP3([r, g, b, a], { clampToSrgb = true } = {}) {
    const alpha = clamp01(a)
    const first = clampToSrgb ? clamp01 : c => c
    if (alpha <= 0) return [...apply3(SRGB_TO_DISPLAY_P3, [r, g, b].map(c => decodeSrgb(first(c)))).map(c => clamp01(encodeSrgb(c))), 0]
    const straight = [r, g, b].map(c => first(c) / alpha)
    const p3 = apply3(SRGB_TO_DISPLAY_P3, straight.map(decodeSrgb)).map(encodeSrgb)
    return [...p3.map(c => clamp01(c * alpha)), alpha]
}

/**
 * A Display P3 color back to sRGB, without a clamp: a color outside the sRGB
 * gamut gives values outside 0 to 1.
 * @param {number[]} rgb - Display P3, unpremultiplied
 * @returns {number[]} sRGB
 */
export function displayP3ToSrgb(rgb) {
    return apply3(DISPLAY_P3_TO_SRGB, rgb.map(decodeSrgb)).map(encodeSrgb)
}

const glslFloat = n => (Number.isInteger(n) ? n.toFixed(1) : String(n))
const wgslFloat = glslFloat

// GLSL and WGSL matrices take columns.
const columns = SRGB_TO_DISPLAY_P3[0].map((_, column) => SRGB_TO_DISPLAY_P3.map(row => row[column]))

// The matrix and the extended curves, in GLSL ES 3.00.
const CURVES_GLSL = `
const mat3 NM_SRGB_TO_DISPLAY_P3 = mat3(
    ${columns.map(column => column.map(glslFloat).join(', ')).join(',\n    ')});
vec3 nmDecodeSrgb(vec3 v) {
    vec3 m = abs(v);
    vec3 lo = m / ${glslFloat(LINEAR_SLOPE)};
    vec3 hi = pow((m + ${glslFloat(OFFSET)}) / ${glslFloat(SCALE)}, vec3(${glslFloat(GAMMA)}));
    return sign(v) * mix(hi, lo, lessThanEqual(m, vec3(${glslFloat(DECODE_EDGE)})));
}
vec3 nmEncodeSrgb(vec3 v) {
    vec3 m = abs(v);
    vec3 lo = m * ${glslFloat(LINEAR_SLOPE)};
    vec3 hi = ${glslFloat(SCALE)} * pow(m, vec3(1.0 / ${glslFloat(GAMMA)})) - ${glslFloat(OFFSET)};
    return sign(v) * mix(hi, lo, lessThanEqual(m, vec3(${glslFloat(ENCODE_EDGE)})));
}
`

/**
 * The conversion in GLSL ES 3.00: nmPresentDisplayP3(vec4) -> vec4, and
 * nmPresentDisplayP3Unclamped(vec4) -> vec4 for a program that declares
 * `gamut p3`.
 */
export const DISPLAY_P3_GLSL = `${CURVES_GLSL}vec4 nmConvertDisplayP3(vec3 premultiplied, float alpha) {
    float a = clamp(alpha, 0.0, 1.0);
    if (a <= 0.0) return vec4(clamp(nmEncodeSrgb(NM_SRGB_TO_DISPLAY_P3 * nmDecodeSrgb(premultiplied)), 0.0, 1.0), 0.0);
    vec3 rgb = nmEncodeSrgb(NM_SRGB_TO_DISPLAY_P3 * nmDecodeSrgb(premultiplied / a));
    return vec4(clamp(rgb * a, 0.0, 1.0), a);
}
vec4 nmPresentDisplayP3(vec4 c) {
    return nmConvertDisplayP3(clamp(c.rgb, 0.0, 1.0), c.a);
}
vec4 nmPresentDisplayP3Unclamped(vec4 c) {
    return nmConvertDisplayP3(c.rgb, c.a);
}
`

// The matrix and the extended curves, in WGSL.
const CURVES_WGSL = `
const NM_SRGB_TO_DISPLAY_P3 = mat3x3<f32>(
    ${columns.map(column => column.map(wgslFloat).join(', ')).join(',\n    ')});
fn nmDecodeSrgb(v: vec3<f32>) -> vec3<f32> {
    let m = abs(v);
    let lo = m / ${wgslFloat(LINEAR_SLOPE)};
    let hi = pow((m + vec3<f32>(${wgslFloat(OFFSET)})) / ${wgslFloat(SCALE)}, vec3<f32>(${wgslFloat(GAMMA)}));
    return sign(v) * select(hi, lo, m <= vec3<f32>(${wgslFloat(DECODE_EDGE)}));
}
fn nmEncodeSrgb(v: vec3<f32>) -> vec3<f32> {
    let m = abs(v);
    let lo = m * ${wgslFloat(LINEAR_SLOPE)};
    let hi = ${wgslFloat(SCALE)} * pow(m, vec3<f32>(1.0 / ${wgslFloat(GAMMA)})) - vec3<f32>(${wgslFloat(OFFSET)});
    return sign(v) * select(hi, lo, m <= vec3<f32>(${wgslFloat(ENCODE_EDGE)}));
}
`

/**
 * The conversion in WGSL: nmPresentDisplayP3(vec4f) -> vec4f, and
 * nmPresentDisplayP3Unclamped(vec4f) -> vec4f for a program that declares
 * `gamut p3`.
 */
export const DISPLAY_P3_WGSL = `${CURVES_WGSL}fn nmConvertDisplayP3(premultiplied: vec3<f32>, alpha: f32) -> vec4<f32> {
    let a = clamp(alpha, 0.0, 1.0);
    if (a <= 0.0) {
        let shown = nmEncodeSrgb(NM_SRGB_TO_DISPLAY_P3 * nmDecodeSrgb(premultiplied));
        return vec4<f32>(clamp(shown, vec3<f32>(0.0), vec3<f32>(1.0)), 0.0);
    }
    let rgb = nmEncodeSrgb(NM_SRGB_TO_DISPLAY_P3 * nmDecodeSrgb(premultiplied / a));
    return vec4<f32>(clamp(rgb * a, vec3<f32>(0.0), vec3<f32>(1.0)), a);
}
fn nmPresentDisplayP3(c: vec4<f32>) -> vec4<f32> {
    return nmConvertDisplayP3(clamp(c.rgb, vec3<f32>(0.0), vec3<f32>(1.0)), c.a);
}
fn nmPresentDisplayP3Unclamped(c: vec4<f32>) -> vec4<f32> {
    return nmConvertDisplayP3(c.rgb, c.a);
}
`

/**
 * The frame export conversion of one straight color, in JavaScript: steps 1,
 * 3, 4 and 5 of the present conversion, then a clamp to 0 to 1. Frame export
 * reads surface values as straight alpha, so nothing is unpremultiplied, and
 * its alpha mode runs after the conversion.
 * @param {number[]} rgb - Straight extended sRGB, as frame export reads a surface
 * @param {object} [options]
 * @param {boolean} [options.clampToSrgb=true] - false for a program that declares `gamut p3`
 * @returns {number[]} Straight Display P3, 0 to 1
 */
export function exportDisplayP3(rgb, { clampToSrgb = true } = {}) {
    const first = clampToSrgb ? clamp01 : c => c
    return apply3(SRGB_TO_DISPLAY_P3, rgb.map(c => decodeSrgb(first(c)))).map(c => clamp01(encodeSrgb(c)))
}

/**
 * The frame export conversion in GLSL ES 3.00: nmExportDisplayP3(vec3, bool)
 * -> vec3, on a straight color. The bool is false for a program that declares
 * `gamut p3`, which skips the sRGB clamp.
 */
export const EXPORT_DISPLAY_P3_GLSL = `${CURVES_GLSL}vec3 nmExportDisplayP3(vec3 straight, bool clampToSrgb) {
    vec3 c = clampToSrgb ? clamp(straight, 0.0, 1.0) : straight;
    return clamp(nmEncodeSrgb(NM_SRGB_TO_DISPLAY_P3 * nmDecodeSrgb(c)), 0.0, 1.0);
}
`

/**
 * The frame export conversion in WGSL: nmExportDisplayP3(vec3f, bool) ->
 * vec3f, on a straight color, as in GLSL.
 */
export const EXPORT_DISPLAY_P3_WGSL = `${CURVES_WGSL}fn nmExportDisplayP3(straight: vec3<f32>, clampToSrgb: bool) -> vec3<f32> {
    let c = select(straight, clamp(straight, vec3<f32>(0.0), vec3<f32>(1.0)), clampToSrgb);
    return clamp(nmEncodeSrgb(NM_SRGB_TO_DISPLAY_P3 * nmDecodeSrgb(c)), vec3<f32>(0.0), vec3<f32>(1.0));
}
`

// Display P3 to extended sRGB, for media that a program declaring `gamut p3`
// decodes in Display P3: decode the sRGB curve, the P3-to-sRGB matrix, and
// encode the sRGB curve without a clamp, so colors outside sRGB stay.
const inverseColumns = DISPLAY_P3_TO_SRGB[0].map((_, column) => DISPLAY_P3_TO_SRGB.map(row => row[column]))

/** The media conversion in GLSL ES 3.00: nmDisplayP3ToSrgb(vec3) -> vec3. */
export const MEDIA_DISPLAY_P3_GLSL = `
const mat3 NM_DISPLAY_P3_TO_SRGB = mat3(
    ${inverseColumns.map(column => column.map(glslFloat).join(', ')).join(',\n    ')});
vec3 nmDecodeSrgb(vec3 v) {
    vec3 m = abs(v);
    vec3 lo = m / ${glslFloat(LINEAR_SLOPE)};
    vec3 hi = pow((m + ${glslFloat(OFFSET)}) / ${glslFloat(SCALE)}, vec3(${glslFloat(GAMMA)}));
    return sign(v) * mix(hi, lo, lessThanEqual(m, vec3(${glslFloat(DECODE_EDGE)})));
}
vec3 nmEncodeSrgb(vec3 v) {
    vec3 m = abs(v);
    vec3 lo = m * ${glslFloat(LINEAR_SLOPE)};
    vec3 hi = ${glslFloat(SCALE)} * pow(m, vec3(1.0 / ${glslFloat(GAMMA)})) - ${glslFloat(OFFSET)};
    return sign(v) * mix(hi, lo, lessThanEqual(m, vec3(${glslFloat(ENCODE_EDGE)})));
}
vec3 nmDisplayP3ToSrgb(vec3 p3) {
    return nmEncodeSrgb(NM_DISPLAY_P3_TO_SRGB * nmDecodeSrgb(p3));
}
`

/** The media conversion in WGSL: nmDisplayP3ToSrgb(vec3f) -> vec3f. */
export const MEDIA_DISPLAY_P3_WGSL = `
const NM_DISPLAY_P3_TO_SRGB = mat3x3<f32>(
    ${inverseColumns.map(column => column.map(wgslFloat).join(', ')).join(',\n    ')});
fn nmDecodeSrgb(v: vec3<f32>) -> vec3<f32> {
    let m = abs(v);
    let lo = m / ${wgslFloat(LINEAR_SLOPE)};
    let hi = pow((m + vec3<f32>(${wgslFloat(OFFSET)})) / ${wgslFloat(SCALE)}, vec3<f32>(${wgslFloat(GAMMA)}));
    return sign(v) * select(hi, lo, m <= vec3<f32>(${wgslFloat(DECODE_EDGE)}));
}
fn nmEncodeSrgb(v: vec3<f32>) -> vec3<f32> {
    let m = abs(v);
    let lo = m * ${wgslFloat(LINEAR_SLOPE)};
    let hi = ${wgslFloat(SCALE)} * pow(m, vec3<f32>(1.0 / ${wgslFloat(GAMMA)})) - vec3<f32>(${wgslFloat(OFFSET)});
    return sign(v) * select(hi, lo, m <= vec3<f32>(${wgslFloat(ENCODE_EDGE)}));
}
fn nmDisplayP3ToSrgb(p3: vec3<f32>) -> vec3<f32> {
    return nmEncodeSrgb(NM_DISPLAY_P3_TO_SRGB * nmDecodeSrgb(p3));
}
`

/**
 * Whether a media source decodes in Display P3 in a program that declares
 * `gamut p3`. Camera VideoFrames keep the default upload (out of scope), and so
 * does a 2D canvas whose context is srgb: it holds only sRGB colors, and its
 * default upload keeps both backends reading the same bytes.
 * @param {object} source
 * @param {CanvasRenderingContext2D} [context2d] - The source canvas's 2D context, when the caller has it
 * @returns {boolean}
 */
export function decodesInDisplayP3(source, context2d) {
    if (typeof VideoFrame === 'function' && source instanceof VideoFrame) return false
    if (context2d && context2d.canvas === source) {
        return context2d.getContextAttributes?.().colorSpace === 'display-p3'
    }
    return true
}

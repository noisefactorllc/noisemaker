/*
 * Morphology - pass A: square shape uses a horizontal-line structuring
 * element (finished by morphB's vertical pass -- min/max over a box is
 * separable into two 1D passes); round shape computes the full disc
 * structuring element here in one pass (min/max over a disc is NOT
 * separable), so morphB is a passthrough copy for that shape.
 * mode selects the op: dilate (0) = max, erode (1) = min.
 *
 * SHAPE is a compile-time const injected by the runtime (see definition.js
 * `globals.shape.define`). Disc (625 taps) and line (64 taps) are fully
 * distinct neighborhood loops; baking the choice lets Dawn constant-fold
 * away the unused loop instead of carrying both bounds behind a branch.
 */

struct Uniforms {
    mode: i32,
    radius: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let texel = 1.0 / texSize;
    var acc = textureSample(inputTex, inputSampler, uv);

    if (SHAPE == 1) {
        // Round: full disc structuring element, capped at radius 12 so the
        // worst case (625 taps) stays bounded regardless of the radius max.
        let r = min(uniforms.radius, 12.0);
        let r2 = r * r;
        for (var y = -12; y <= 12; y++) {
            for (var x = -12; x <= 12; x++) {
                if (x == 0 && y == 0) { continue; }
                let d = vec2<f32>(f32(x), f32(y));
                if (dot(d, d) > r2) { continue; }
                let s = textureSample(inputTex, inputSampler, uv + d * texel);
                let hi = max(acc, s);
                let lo = min(acc, s);
                acc = select(hi, lo, uniforms.mode != 0);
            }
        }
    } else {
        // Square: horizontal-line structuring element over |i| <= radius.
        let r = min(uniforms.radius, 32.0);
        for (var i = 1; i <= 32; i++) {
            if (f32(i) > r) { break; }
            let o = vec2<f32>(f32(i), 0.0) * texel;
            let sL = textureSample(inputTex, inputSampler, uv - o);
            let sR = textureSample(inputTex, inputSampler, uv + o);
            let hi = max(acc, max(sL, sR));
            let lo = min(acc, min(sL, sR));
            acc = select(hi, lo, uniforms.mode != 0);
        }
    }

    return acc;
}

/*
 * Morphology - pass B: square shape finishes the separable box structuring
 * element with a vertical-line pass over morphA's horizontal result; round
 * shape is a passthrough copy since morphA already computed the full disc
 * structuring element (min/max over a disc is not separable).
 * mode selects the op: dilate (0) = max, erode (1) = min.
 *
 * SHAPE is a compile-time const injected by the runtime (see definition.js
 * `globals.shape.define`).
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
    var acc = textureSample(inputTex, inputSampler, uv);

    if (SHAPE == 0) {
        let texel = 1.0 / texSize;
        let r = min(uniforms.radius, 32.0);
        for (var i = 1; i <= 32; i++) {
            if (f32(i) > r) { break; }
            let o = vec2<f32>(0.0, f32(i)) * texel;
            let sD = textureSample(inputTex, inputSampler, uv - o);
            let sU = textureSample(inputTex, inputSampler, uv + o);
            let hi = max(acc, max(sD, sU));
            let lo = min(acc, min(sD, sU));
            acc = select(hi, lo, uniforms.mode != 0);
        }
    }
    // Round shape: acc is already morphA's disc-SE result; passthrough.

    return acc;
}

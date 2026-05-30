/*
 * Temporal Chromatic Aberration - read pass (WGSL).
 * Mirrors glsl/temporalAberration.glsl: samples the live frame (delay 0) and the eight
 * history stages _h1.._h8 (delay 1..8), then builds each output channel from an
 * independently, fractionally delayed frame. Empty history slots (alpha 0) fall back to
 * the live frame for a clean ramp-in.
 */

struct Uniforms {
    // data[0] = (redDelay, greenDelay, blueDelay, unused)
    data : array<vec4<f32>, 1>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var inputTex : texture_2d<f32>;
@group(0) @binding(3) var h1 : texture_2d<f32>;
@group(0) @binding(4) var h2 : texture_2d<f32>;
@group(0) @binding(5) var h3 : texture_2d<f32>;
@group(0) @binding(6) var h4 : texture_2d<f32>;
@group(0) @binding(7) var h5 : texture_2d<f32>;
@group(0) @binding(8) var h6 : texture_2d<f32>;
@group(0) @binding(9) var h7 : texture_2d<f32>;
@group(0) @binding(10) var h8 : texture_2d<f32>;

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    let redDelay = uniforms.data[0].x;
    let greenDelay = uniforms.data[0].y;
    let blueDelay = uniforms.data[0].z;

    let texSize = vec2<f32>(textureDimensions(inputTex, 0));
    let uv = pos.xy / texSize;

    let cur = textureSampleLevel(inputTex, samp, uv, 0.0);

    // slots[0] = live (delay 0); slots[1..8] = history (delay 1..8) with empty -> live.
    var slots : array<vec4<f32>, 9>;
    slots[0] = cur;
    var s : vec4<f32>;
    s = textureSampleLevel(h1, samp, uv, 0.0); slots[1] = select(s, cur, s.a < 0.5);
    s = textureSampleLevel(h2, samp, uv, 0.0); slots[2] = select(s, cur, s.a < 0.5);
    s = textureSampleLevel(h3, samp, uv, 0.0); slots[3] = select(s, cur, s.a < 0.5);
    s = textureSampleLevel(h4, samp, uv, 0.0); slots[4] = select(s, cur, s.a < 0.5);
    s = textureSampleLevel(h5, samp, uv, 0.0); slots[5] = select(s, cur, s.a < 0.5);
    s = textureSampleLevel(h6, samp, uv, 0.0); slots[6] = select(s, cur, s.a < 0.5);
    s = textureSampleLevel(h7, samp, uv, 0.0); slots[7] = select(s, cur, s.a < 0.5);
    s = textureSampleLevel(h8, samp, uv, 0.0); slots[8] = select(s, cur, s.a < 0.5);

    let dr = clamp(redDelay, 0.0, 8.0);
    let ir0 = i32(floor(dr));
    let ir1 = min(ir0 + 1, 8);
    let rOut = mix(slots[ir0], slots[ir1], dr - f32(ir0)).r;

    let dg = clamp(greenDelay, 0.0, 8.0);
    let ig0 = i32(floor(dg));
    let ig1 = min(ig0 + 1, 8);
    let gOut = mix(slots[ig0], slots[ig1], dg - f32(ig0)).g;

    let db = clamp(blueDelay, 0.0, 8.0);
    let ib0 = i32(floor(db));
    let ib1 = min(ib0 + 1, 8);
    let bOut = mix(slots[ib0], slots[ib1], db - f32(ib0)).b;

    return vec4<f32>(rOut, gOut, bOut, cur.a);
}

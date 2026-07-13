/*
 * Oil Paint - flatten pass: 8-sector Kuwahara filter. See
 * glsl/oilFlatten.glsl for the full algorithm description. MODE is a
 * compile-time const injected by the runtime via injectDefines (see
 * definition.js globals.mode.define), same mechanism as filter/texture
 * and filter/grain.
 */

struct Uniforms {
    size: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let px = 1.0 / texSize;

    var radius = uniforms.size;
    if (MODE == 0) {
        radius = min(uniforms.size, 3.0);
    }
    let fr = clamp(radius, 1.0, 12.0);
    let frSq = fr * fr;
    let sample_limit = i32(ceil(fr));

    // Eight octant accumulators in explicit registers -- NOT a dynamically
    // indexed array. Mirrors glsl/oilFlatten.glsl; each sample is added to its
    // own sector in scan order, so the result is bit-identical.
    var m0 = vec3<f32>(0.0); var m1 = vec3<f32>(0.0); var m2 = vec3<f32>(0.0); var m3 = vec3<f32>(0.0);
    var m4 = vec3<f32>(0.0); var m5 = vec3<f32>(0.0); var m6 = vec3<f32>(0.0); var m7 = vec3<f32>(0.0);
    var q0 = vec3<f32>(0.0); var q1 = vec3<f32>(0.0); var q2 = vec3<f32>(0.0); var q3 = vec3<f32>(0.0);
    var q4 = vec3<f32>(0.0); var q5 = vec3<f32>(0.0); var q6 = vec3<f32>(0.0); var q7 = vec3<f32>(0.0);
    var n0 = 0.0; var n1 = 0.0; var n2 = 0.0; var n3 = 0.0;
    var n4 = 0.0; var n5 = 0.0; var n6 = 0.0; var n7 = 0.0;

    for (var y: i32 = -sample_limit; y <= sample_limit; y++) {
        for (var x: i32 = -sample_limit; x <= sample_limit; x++) {
            let d = vec2<f32>(f32(x), f32(y));
            if (abs(d.x) > fr || abs(d.y) > fr || dot(d, d) > frSq) { continue; }
            // Stride-2 outer ring: see glsl/oilFlatten.glsl for the full
            // rationale. fr > 8.0 only when size > 8 (default size = 6
            // keeps fr <= 8 and this branch dead, so output is
            // bit-identical to the pre-optimization version at every
            // size <= 8). Manhattan/checkerboard parity (|x|+|y| even
            // survives) keeps the thinned ring isotropic rather than
            // halving in just one axis.
            if (fr > 8.0 && dot(d, d) > 64.0 && (abs(x) + abs(y)) % 2 != 0) { continue; }

            // Octant classification without atan2 -- see
            // glsl/oilFlatten.glsl for the full derivation, including the
            // proof that a naive independent 3-bit test cannot reproduce
            // the atan2 formula exactly (a joint per-quadrant test is
            // required instead). Verified against the atan2 formula for
            // every integer offset in [-12,12]x[-12,12]. (0,0) has no
            // angle; pin it to sector 4, matching the original atan2
            // guard's result.
            let c = textureSample(inputTex, inputSampler, uv + d * px).rgb;
            let cc = c * c;
            // Octant classification fused with accumulation: no computed array
            // index is ever formed (mirrors glsl/oilFlatten.glsl).
            if (x == 0 && y == 0) {
                m4 += c; q4 += cc; n4 += 1.0;
            } else if (d.x > 0.0 && d.y >= 0.0) {
                if (abs(d.x) <= abs(d.y)) { m5 += c; q5 += cc; n5 += 1.0; }
                else { m4 += c; q4 += cc; n4 += 1.0; }
            } else if (d.x <= 0.0 && d.y > 0.0) {
                if (abs(d.x) < abs(d.y)) { m6 += c; q6 += cc; n6 += 1.0; }
                else { m7 += c; q7 += cc; n7 += 1.0; }
            } else if (d.x < 0.0 && d.y <= 0.0) {
                if (abs(d.x) <= abs(d.y)) { m1 += c; q1 += cc; n1 += 1.0; }
                else { m0 += c; q0 += cc; n0 += 1.0; }
            } else {
                // remaining case: d.x >= 0.0 && d.y < 0.0
                if (abs(d.x) < abs(d.y)) { m2 += c; q2 += cc; n2 += 1.0; }
                else { m3 += c; q3 += cc; n3 += 1.0; }
            }
        }
    }

    var bestC = vec3<f32>(0.0);
    var bestV: f32 = 1e9;
    // Unrolled lowest-variance selection, evaluated 0..7 in the same order as
    // the original loop so ties resolve to the identical sector.
    if (n0 >= 1.0) { let m = m0 / n0; let v = q0 / n0 - m * m; let tv = v.x + v.y + v.z; if (tv < bestV) { bestV = tv; bestC = m; } }
    if (n1 >= 1.0) { let m = m1 / n1; let v = q1 / n1 - m * m; let tv = v.x + v.y + v.z; if (tv < bestV) { bestV = tv; bestC = m; } }
    if (n2 >= 1.0) { let m = m2 / n2; let v = q2 / n2 - m * m; let tv = v.x + v.y + v.z; if (tv < bestV) { bestV = tv; bestC = m; } }
    if (n3 >= 1.0) { let m = m3 / n3; let v = q3 / n3 - m * m; let tv = v.x + v.y + v.z; if (tv < bestV) { bestV = tv; bestC = m; } }
    if (n4 >= 1.0) { let m = m4 / n4; let v = q4 / n4 - m * m; let tv = v.x + v.y + v.z; if (tv < bestV) { bestV = tv; bestC = m; } }
    if (n5 >= 1.0) { let m = m5 / n5; let v = q5 / n5 - m * m; let tv = v.x + v.y + v.z; if (tv < bestV) { bestV = tv; bestC = m; } }
    if (n6 >= 1.0) { let m = m6 / n6; let v = q6 / n6 - m * m; let tv = v.x + v.y + v.z; if (tv < bestV) { bestV = tv; bestC = m; } }
    if (n7 >= 1.0) { let m = m7 / n7; let v = q7 / n7 - m * m; let tv = v.x + v.y + v.z; if (tv < bestV) { bestV = tv; bestC = m; } }

    return vec4<f32>(bestC, 1.0);
}

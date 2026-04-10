// Wormhole Blend
// Normalize accumulated scatter buffer, sqrt, blend with original.
// Uses mean-based normalization (robust to sparse sampling) instead of
// min/max (which flickered due to missing outlier hotspots in the grid).

@group(0) @binding(0) var u_sampler : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var accumTex : texture_2d<f32>;
@group(0) @binding(3) var<uniform> resolution : vec2<f32>;
@group(0) @binding(4) var<uniform> alpha : f32;

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    let uv = position.xy / resolution;

    let src = textureSampleLevel(inputTex, u_sampler, uv, 0.0);
    let accum = textureSampleLevel(accumTex, u_sampler, uv, 0.0);

    // Estimate mean of accum buffer from 32x32 grid (1024 samples).
    // Mean is robust to sparse sampling unlike min/max.
    var sum : f32 = 0.0;
    var count : f32 = 0.0;
    for (var gy : i32 = 0; gy < 32; gy = gy + 1) {
        for (var gx : i32 = 0; gx < 32; gx = gx + 1) {
            let sampleUV = (vec2<f32>(f32(gx), f32(gy)) + 0.5) / 32.0;
            let s = textureSampleLevel(accumTex, u_sampler, sampleUV, 0.0);
            let v = (s.r + s.g + s.b) / 3.0;
            sum = sum + v;
            count = count + 1.0;
        }
    }
    let mean = sum / count;

    // Normalize: scale so that mean maps to ~0.25 (after sqrt -> ~0.5)
    var normalized : vec3<f32>;
    if (mean > 0.0) {
        normalized = clamp(accum.rgb / (mean * 4.0), vec3<f32>(0.0), vec3<f32>(1.0));
    } else {
        normalized = accum.rgb;
    }

    let sqrtVal = sqrt(normalized);

    return vec4<f32>(mix(src.rgb, sqrtVal, alpha), src.a);
}

// Wormhole Blend
// JS: normalize(out) across RGB only -> sqrt -> blend(tensor, out, alpha)

@group(0) @binding(0) var u_sampler : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var accumTex : texture_2d<f32>;
@group(0) @binding(3) var<uniform> resolution : vec2<f32>;
@group(0) @binding(4) var<uniform> alpha : f32;

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    let uv = position.xy / resolution;

    let src = textureSample(inputTex, u_sampler, uv);
    let accum = textureSample(accumTex, u_sampler, uv);

    // JS: find single global min/max across all RGB values
    // GPU approximation: sample 64x64 grid (4096 samples)
    var minVal : f32 = 1e10;
    var maxVal : f32 = -1e10;
    for (var gy : i32 = 0; gy < 64; gy = gy + 1) {
        for (var gx : i32 = 0; gx < 64; gx = gx + 1) {
            let sampleUV = (vec2<f32>(f32(gx), f32(gy)) + 0.5) / 64.0;
            let s = textureSample(accumTex, u_sampler, sampleUV);
            minVal = min(minVal, min(min(s.r, s.g), s.b));
            maxVal = max(maxVal, max(max(s.r, s.g), s.b));
        }
    }

    let range = maxVal - minVal;
    var normalized : vec3<f32>;
    if (range > 0.0) {
        normalized = (accum.rgb - minVal) / range;
    } else {
        normalized = accum.rgb;
    }

    let sqrtVal = sqrt(max(normalized, vec3<f32>(0.0)));

    // RGB blend only, preserve original alpha
    return vec4<f32>(mix(src.rgb, sqrtVal, alpha), src.a);
}

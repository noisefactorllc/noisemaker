@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> resolution: vec2<f32>;
@group(0) @binding(3) var<uniform> aspect: f32;
@group(0) @binding(4) var<uniform> blend: f32;
@group(0) @binding(5) var<uniform> repeatCount: f32;
@group(0) @binding(6) var<uniform> curve: i32;

fn edgeWeight(t: f32, width: f32, c: i32) -> f32 {
    if (width <= 0.0) { return 0.0; }
    let d = min(t, 1.0 - t);
    let w = 1.0 - clamp(d / width, 0.0, 1.0);
    if (c == 0) {
        return w;
    } else if (c == 2) {
        return 0.5 - 0.5 * cos(w * 3.14159265);
    }
    return w * w * (3.0 - 2.0 * w);
}

fn fract2(v: vec2<f32>) -> vec2<f32> {
    return v - floor(v);
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = position.xy / texSize;

    let st = fract2(uv * repeatCount);

    let wx = edgeWeight(st.x, blend, curve);
    let wy = edgeWeight(st.y, blend, curve);

    let c00 = textureSample(inputTex, samp, st);
    let c10 = textureSample(inputTex, samp, fract2(st + vec2<f32>(0.5, 0.0)));
    let c01 = textureSample(inputTex, samp, fract2(st + vec2<f32>(0.0, 0.5)));
    let c11 = textureSample(inputTex, samp, fract2(st + vec2<f32>(0.5, 0.5)));

    let mx0 = mix(c00, c10, wx);
    let mx1 = mix(c01, c11, wx);
    let result = mix(mx0, mx1, wy);

    return vec4<f32>(result.rgb, 1.0);
}

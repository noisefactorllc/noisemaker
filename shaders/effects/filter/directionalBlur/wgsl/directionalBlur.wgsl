/*
 * Directional Blur - linear motion blur along a fixed angle. Averages a
 * fixed N-tap comb stepped along
 * dir = (cos(angle), sin(angle)), spanning blurDistance px total
 * (t ranges over [-blurDistance/2, blurDistance/2]). A per-pixel hash
 * shifts the whole tap comb by up to half a tap-step to hide banding
 * from the fixed tap count.
 */

struct Uniforms {
    angle: f32,
    blurDistance: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const N: i32 = 32;

fn hash12(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
    p3 = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
    return fract((p3.x + p3.y) * p3.z);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let a = radians(uniforms.angle);
    let dir = vec2<f32>(cos(a), sin(a));

    let tapStep = uniforms.blurDistance / f32(N - 1);
    let jitter = (hash12(pos.xy) - 0.5) * tapStep;

    var sum = vec4<f32>(0.0);
    for (var i: i32 = 0; i < N; i++) {
        let t = (f32(i) / f32(N - 1) - 0.5) * uniforms.blurDistance + jitter;
        let offset = dir * t;
        sum = sum + textureSample(inputTex, inputSampler, (pos.xy + offset) / texSize);
    }
    return sum / f32(N);
}

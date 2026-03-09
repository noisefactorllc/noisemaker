struct Uniforms {
    resolution: vec2<f32>,
    time: f32,
    speed: f32,
    seed: f32,
    alpha: f32,
    _pad0: f32,
    _pad1: f32,
};

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var trailTex: texture_2d<f32>;
@group(0) @binding(2) var inputSampler: sampler;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

// Simple hash for brightness variation
fn hash13(p: vec3<f32>) -> f32 {
    var q = fract(p * vec3<f32>(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yxz + 33.33);
    return fract((q.x + q.y) * q.z);
}

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = (fragCoord.xy - 0.5) / texSize;

    let base = textureSampleLevel(inputTex, inputSampler, uv, 0.0);
    let trail = textureSampleLevel(trailTex, inputSampler, uv, 0.0);

    // Trail mask: how much fiber is at this pixel
    var mask = max(trail.r, max(trail.g, trail.b));
    mask = clamp(mask, 0.0, 1.0);

    // Generate brightness noise per-pixel
    let seedF = uniforms.seed;
    let brightness = vec3<f32>(
        hash13(vec3<f32>(fragCoord.xy * 0.73, seedF * 1.17 + uniforms.time * uniforms.speed * 0.1)),
        hash13(vec3<f32>(fragCoord.xy * 0.79, seedF * 1.31 + uniforms.time * uniforms.speed * 0.1)),
        hash13(vec3<f32>(fragCoord.xy * 0.83, seedF * 1.43 + uniforms.time * uniforms.speed * 0.1)),
    );

    // Blend fibers over input at controlled opacity
    let blendAmt = mask * uniforms.alpha;
    let result = mix(base.rgb, brightness, blendAmt);

    return vec4<f32>(result, base.a);
}

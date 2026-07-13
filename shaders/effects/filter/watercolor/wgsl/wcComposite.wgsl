/*
 * Watercolor - composite pass: pigment pooling, paper granulation, warm
 * paper tint, and a flat-wash lift. See glsl/wcComposite.glsl for the full
 * algorithm description. The paper-granulation hash is seeded from the
 * tile-aware global pixel coordinate (floor(pos.xy) + uniforms.tileOffset),
 * matching GLSL's floor(gl_FragCoord.xy) + tileOffset exactly, so the grain
 * pattern stays seamless across CLI render tiles instead of restarting at
 * each tile's local origin.
 */

struct Uniforms {
    shadowIntensity: f32,
    paperTexture: f32,
    tileOffset: vec2<f32>,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var simplifiedTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

fn hash12(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
    p3 = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
    return fract((p3.x + p3.y) * p3.z);
}

fn vnoise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2<f32>(1.0, 0.0)), u.x),
               mix(hash12(i + vec2<f32>(0.0, 1.0)), hash12(i + vec2<f32>(1.0, 1.0)), u.x), u.y);
}

fn lum(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

// Sobel gradient gradient, applied to the SIMPLIFIED texture (pigment pooling edges).
fn lumGradientSimplified(uv: vec2<f32>) -> vec2<f32> {
    let texSize = vec2<f32>(textureDimensions(simplifiedTex));
    let px = 1.0 / texSize;
    let tl = lum(textureSample(simplifiedTex, inputSampler, uv + px * vec2<f32>(-1.0,  1.0)).rgb);
    let l  = lum(textureSample(simplifiedTex, inputSampler, uv + px * vec2<f32>(-1.0,  0.0)).rgb);
    let bl = lum(textureSample(simplifiedTex, inputSampler, uv + px * vec2<f32>(-1.0, -1.0)).rgb);
    let tr = lum(textureSample(simplifiedTex, inputSampler, uv + px * vec2<f32>( 1.0,  1.0)).rgb);
    let r  = lum(textureSample(simplifiedTex, inputSampler, uv + px * vec2<f32>( 1.0,  0.0)).rgb);
    let br = lum(textureSample(simplifiedTex, inputSampler, uv + px * vec2<f32>( 1.0, -1.0)).rgb);
    let t  = lum(textureSample(simplifiedTex, inputSampler, uv + px * vec2<f32>( 0.0,  1.0)).rgb);
    let b  = lum(textureSample(simplifiedTex, inputSampler, uv + px * vec2<f32>( 0.0, -1.0)).rgb);
    return vec2<f32>(tr + 2.0 * r + br - tl - 2.0 * l - bl,
                      tl + 2.0 * t + tr - bl - 2.0 * b - br);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let src = textureSample(inputTex, inputSampler, uv);
    let simplified = textureSample(simplifiedTex, inputSampler, uv).rgb;

    let edge = length(lumGradientSimplified(uv));

    // Pigment pooling: darken along simplified-region boundaries, the way
    // watercolor pigment collects and dries darker at the edge of a wet wash.
    let pool = uniforms.shadowIntensity / 100.0 * 0.7 * smoothstep(0.05, 0.4, edge);
    var c = simplified * (1.0 - pool);

    // Paper granulation: hash/noise coordinate is the integer, tile-aware
    // global pixel index so the grain
    // aligns across GL/WGPU and across render tiles. Both the grain
    // strength and the warm paper tint are gated by paperTexture, so
    // paperTexture=0 yields a smooth, untinted wash and paperTexture=100
    // is full grain plus full tint.
    let gc = floor(pos.xy) + uniforms.tileOffset;
    c *= mix(1.0, 0.92 + 0.08 * vnoise(gc / 3.5), clamp(uniforms.paperTexture, 0.0, 100.0) / 100.0);
    c = mix(c, c * vec3<f32>(1.02, 1.0, 0.95), uniforms.paperTexture / 100.0);

    // Wash lift: on flat washes (edge near 0) lift the color very slightly
    // toward its own luminance (desaturate) and brighten a touch, as if the
    // pigment thinned out there and let the white paper glow through --
    // complement of the pooling darkening above, same `edge` field with an
    // inverted falloff.
    let flatness = 1.0 - smoothstep(0.0, 0.15, edge);
    c = mix(c, vec3<f32>(lum(c)), flatness * 0.12);
    c *= 1.0 + flatness * 0.05;

    return vec4<f32>(clamp(c, vec3<f32>(0.0), vec3<f32>(1.0)), src.a);
}

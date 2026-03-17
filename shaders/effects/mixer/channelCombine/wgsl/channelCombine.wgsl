@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var rTex : texture_2d<f32>;
@group(0) @binding(2) var gTex : texture_2d<f32>;
@group(0) @binding(3) var bTex : texture_2d<f32>;
@group(0) @binding(4) var<uniform> resolution : vec2<f32>;
@group(0) @binding(5) var<uniform> rLevel : f32;
@group(0) @binding(6) var<uniform> gLevel : f32;
@group(0) @binding(7) var<uniform> bLevel : f32;

fn luminance(c: vec4<f32>) -> f32 {
    return dot(c.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let st = position.xy / resolution;

    let r = luminance(textureSample(rTex, samp, st)) * rLevel / 100.0;
    let g = luminance(textureSample(gTex, samp, st)) * gLevel / 100.0;
    let b = luminance(textureSample(bTex, samp, st)) * bLevel / 100.0;

    return vec4<f32>(r, g, b, 1.0);
}

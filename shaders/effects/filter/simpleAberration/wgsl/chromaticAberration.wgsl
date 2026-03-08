/*
 * Chromatic aberration effect.
 */

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;

struct Uniforms {
    time: f32,
    deltaTime: f32,
    frame: i32,
    _pad0: f32,
    resolution: vec2f,
    aspect: f32,
    displacement: f32,
}

@group(0) @binding(2) var<uniform> u: Uniforms;

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    var uv = fragCoord.xy / u.resolution;
    uv.y = 1.0 - uv.y;

    let redOffset = clamp(uv.x + u.displacement, 0.0, 1.0);
    let red = textureSample(inputTex, samp, vec2f(redOffset, uv.y));

    let green = textureSample(inputTex, samp, uv);

    let blueOffset = clamp(uv.x - u.displacement, 0.0, 1.0);
    let blue = textureSample(inputTex, samp, vec2f(blueOffset, uv.y));

    // chromatic aberration
    return vec4f(red.r, green.g, blue.b, green.a);
}

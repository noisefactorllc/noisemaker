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
    aberrationAmt: f32,
    passthru: f32,
}

@group(0) @binding(2) var<uniform> u: Uniforms;

const PI: f32 = 3.14159265359;

fn mapVal(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let aspectRatio = u.resolution.x / u.resolution.y;
    var uv = fragCoord.xy / u.resolution;
    uv.y = 1.0 - uv.y;

    let diff = vec2f(0.5 * aspectRatio, 0.5) - vec2f(uv.x * aspectRatio, uv.y);
    let centerDist = length(diff);

    let aberrationOffset = mapVal(u.aberrationAmt, 0.0, 100.0, 0.0, 0.05) * centerDist * PI * 0.5;

    let redOffset = mix(clamp(uv.x + aberrationOffset, 0.0, 1.0), uv.x, uv.x);
    let red = textureSample(inputTex, samp, vec2f(redOffset, uv.y));

    let green = textureSample(inputTex, samp, uv);

    let blueOffset = mix(uv.x, clamp(uv.x - aberrationOffset, 0.0, 1.0), uv.x);
    let blue = textureSample(inputTex, samp, vec2f(blueOffset, uv.y));

    // chromatic aberration - extract color fringing edges only
    let aberrated = vec3f(red.r, green.g, blue.b);
    let edges = aberrated - green.rgb;

    // scale original by passthru and add to edges
    let original = green.rgb * mapVal(u.passthru, 0.0, 100.0, 0.0, 2.0);

    return vec4f(min(edges + original, vec3f(1.0)), green.a);
}

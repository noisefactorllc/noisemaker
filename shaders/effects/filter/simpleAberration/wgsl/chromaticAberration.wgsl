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
    tileOffset: vec2f,
    fullResolution: vec2f,
}

@group(0) @binding(2) var<uniform> u: Uniforms;

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let texSize = vec2f(textureDimensions(inputTex));
    let globalPixel = fragCoord.xy + u.tileOffset;
    let globalUV = globalPixel / u.fullResolution;

    let maxDisplacementUV = 256.0 / u.fullResolution.x;
    let boundedDisplacement = clamp(u.displacement, -maxDisplacementUV, maxDisplacementUV);

    let redGlobalUV = globalUV + vec2f(boundedDisplacement, 0.0);
    let redLocalUV = (redGlobalUV * u.fullResolution - u.tileOffset) / texSize;
    let redOffset = clamp(redLocalUV.x, 0.0, 1.0);
    let red = textureSample(inputTex, samp, vec2f(redOffset, redLocalUV.y));

    let greenLocalUV = (globalUV * u.fullResolution - u.tileOffset) / texSize;
    let green = textureSample(inputTex, samp, greenLocalUV);

    let blueGlobalUV = globalUV - vec2f(boundedDisplacement, 0.0);
    let blueLocalUV = (blueGlobalUV * u.fullResolution - u.tileOffset) / texSize;
    let blueOffset = clamp(blueLocalUV.x, 0.0, 1.0);
    let blue = textureSample(inputTex, samp, vec2f(blueOffset, blueLocalUV.y));

    // chromatic aberration
    return vec4f(red.r, green.g, blue.b, green.a);
}

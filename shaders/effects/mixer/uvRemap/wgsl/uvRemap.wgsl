@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var tex : texture_2d<f32>;
@group(0) @binding(3) var<uniform> mapSource : i32;
@group(0) @binding(4) var<uniform> channel : i32;
@group(0) @binding(5) var<uniform> scale : f32;
@group(0) @binding(6) var<uniform> offset : f32;
@group(0) @binding(7) var<uniform> wrap : i32;
@group(0) @binding(8) var<uniform> invert : i32;

fn modulo(a: f32, b: f32) -> f32 {
    return a - b * floor(a / b);
}

fn mirrorWrap(t: f32) -> f32 {
    let m = modulo(t, 2.0);
    if (m > 1.0) {
        return 2.0 - m;
    }
    return m;
}

fn applyWrap(uv: vec2<f32>, wrapMode: i32) -> vec2<f32> {
    if (wrapMode == 0) {
        // Clamp
        return clamp(uv, vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0));
    } else if (wrapMode == 1) {
        // Mirror
        return vec2<f32>(mirrorWrap(uv.x), mirrorWrap(uv.y));
    } else {
        // Repeat
        return fract(uv);
    }
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    let st = pos.xy / dims;

    let colorA = textureSample(inputTex, samp, st);
    let colorB = textureSample(tex, samp, st);

    // Choose map and sample sources
    var mapColor: vec4<f32>;
    var sampleFromB: i32;

    if (invert == 0) {
        if (mapSource == 0) {
            mapColor = colorA;
            sampleFromB = 1;
        } else {
            mapColor = colorB;
            sampleFromB = 0;
        }
    } else {
        if (mapSource == 0) {
            mapColor = colorB;
            sampleFromB = 0;
        } else {
            mapColor = colorA;
            sampleFromB = 1;
        }
    }

    // Extract UV channels
    var rawUV: vec2<f32>;
    if (channel == 0) {
        rawUV = mapColor.rg;
    } else if (channel == 1) {
        rawUV = vec2<f32>(mapColor.r, mapColor.b);
    } else {
        rawUV = vec2<f32>(mapColor.g, mapColor.b);
    }

    // Apply scale (percentage: 100 = identity) and offset
    let s = scale / 100.0;
    var remappedUV = rawUV * s + offset;

    // Apply wrap mode
    remappedUV = applyWrap(remappedUV, wrap);

    // Sample the other texture at remapped UVs
    var result: vec4<f32>;
    if (sampleFromB == 1) {
        result = textureSample(tex, samp, remappedUV);
    } else {
        result = textureSample(inputTex, samp, remappedUV);
    }

    return result;
}

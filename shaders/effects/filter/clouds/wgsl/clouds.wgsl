/*
 * Clouds - Cloud texture overlay
 *
 * Ridged multi-octave 2D simplex noise shaped into clouds,
 * composited with offset shadow onto the input.
 */

struct Uniforms {
    seed: f32,
    scale: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

// Simplex 2D - MIT License (Ashima Arts)
fn mod289v3(x: vec3<f32>) -> vec3<f32> { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn mod289v2(x: vec2<f32>) -> vec2<f32> { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn permute3(x: vec3<f32>) -> vec3<f32> { return mod289v3(((x * 34.0) + 1.0) * x); }

fn simplex2d(v: vec2<f32>) -> f32 {
    let C = vec4<f32>(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);

    let i = floor(v + dot(v, C.yy));
    let x0 = v - i + dot(i, C.xx);
    var i1: vec2<f32>;
    if (x0.x > x0.y) { i1 = vec2<f32>(1.0, 0.0); } else { i1 = vec2<f32>(0.0, 1.0); }
    var x12 = x0.xyxy + C.xxzz;
    x12 = vec4<f32>(x12.xy - i1, x12.zw);

    let im = mod289v2(i);
    let p = permute3(permute3(im.y + vec3<f32>(0.0, i1.y, 1.0)) + im.x + vec3<f32>(0.0, i1.x, 1.0));
    var m = max(0.5 - vec3<f32>(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), vec3<f32>(0.0));
    m = m * m;
    m = m * m;

    let x = 2.0 * fract(p * C.www) - 1.0;
    let h = abs(x) - 0.5;
    let ox = floor(x + 0.5);
    let a0 = x - ox;
    m = m * (1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h));

    var g: vec3<f32>;
    g.x = a0.x * x0.x + h.x * x0.y;
    g = vec3<f32>(g.x, a0.yz * x12.xz + h.yz * x12.yw);

    return 130.0 * dot(m, g);
}

fn cloudNoise(uv: vec2<f32>, baseFreq: f32, octaves: i32) -> f32 {
    var accum: f32 = 0.0;
    var totalAmp: f32 = 0.0;

    for (var i: i32 = 0; i < 8; i = i + 1) {
        if (i >= octaves) { break; }
        let freq = baseFreq * pow(2.0, f32(i));
        let amp = 1.0 / pow(2.0, f32(i));

        var n = simplex2d(uv * freq + vec2<f32>(f32(i) * 37.0, f32(i) * 53.0));
        n = n * 0.5 + 0.5;

        accum = accum + n * amp;
        totalAmp = totalAmp + amp;
    }

    return accum / totalAmp;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;

    let inputColor = textureSample(inputTex, inputSampler, uv);

    let aspect = texSize.x / texSize.y;
    let cloudUV = uv * vec2<f32>(aspect, 1.0) / uniforms.scale + vec2<f32>(uniforms.seed * 17.31, uniforms.seed * 23.71);

    let cloud = cloudNoise(cloudUV, 1.0, 7);
    let cloudMask = smoothstep(0.45, 0.65, cloud);

    // Cloud shading: vary brightness within cloud for depth
    let cloudDepth = smoothstep(0.45, 0.85, cloud);
    let cloudBrightness = mix(0.75, 1.0, cloudDepth);

    // Shadow: sample cloud at offset (light from upper-right)
    let shadowDist = min(texSize.x, texSize.y) * 0.008;
    let shadowOffset = vec2<f32>(-shadowDist, shadowDist) / texSize;
    let shadowUV = (uv + shadowOffset) * vec2<f32>(aspect, 1.0) / uniforms.scale + vec2<f32>(uniforms.seed * 17.31, uniforms.seed * 23.71);
    let shadowCloud = cloudNoise(shadowUV, 1.0, 7);
    let shadowMask = smoothstep(0.45, 0.65, shadowCloud);

    let shadow = max(shadowMask - cloudMask, 0.0) * 0.5;

    var result = inputColor.rgb * (1.0 - shadow);
    result = mix(result, vec3<f32>(cloudBrightness), cloudMask);

    return vec4<f32>(result, inputColor.a);
}

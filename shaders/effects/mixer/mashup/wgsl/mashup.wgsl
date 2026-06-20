/*
 * Mashup — WGSL fragment shader
 *
 * Posterize the control input (source) by luminance into `layers` equal
 * bands and route each band to its layerN_tex source. Mirrors mashup.glsl.
 * Starter effect: output size comes from the packed `resolution` uniform.
 * Uniforms are packed into a single vec4 array to match the JS uniformLayout:
 *   slot 0: layers, smoothness, resolution.x, resolution.y
 *   slot 1: layer0_active..layer3_active (xyzw)
 *   slot 2: layer4_active..layer7_active (xyzw)
 */

struct Uniforms {
    data: array<vec4<f32>, 3>,
}

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;
@group(0) @binding(2) var source: texture_2d<f32>;
@group(0) @binding(3) var layer0_tex: texture_2d<f32>;
@group(0) @binding(4) var layer1_tex: texture_2d<f32>;
@group(0) @binding(5) var layer2_tex: texture_2d<f32>;
@group(0) @binding(6) var layer3_tex: texture_2d<f32>;
@group(0) @binding(7) var layer4_tex: texture_2d<f32>;
@group(0) @binding(8) var layer5_tex: texture_2d<f32>;
@group(0) @binding(9) var layer6_tex: texture_2d<f32>;
@group(0) @binding(10) var layer7_tex: texture_2d<f32>;

const MAX_LAYERS: i32 = 8;

// RGB -> luminosity (shared codebase weights).
fn getLuminosity(color: vec3<f32>) -> f32 {
    return dot(color, vec3<f32>(0.299, 0.587, 0.114));
}

fn sampleLayer(i: i32, uv: vec2<f32>) -> vec4<f32> {
    // textureSampleLevel (explicit LOD 0): sampleLayer is called from the
    // per-pixel, data-dependent band loop (non-uniform control flow), which
    // disqualifies plain textureSample. Layer surfaces are non-mipmapped
    // render targets, so LOD 0 matches GLSL texture(). Mirrors synth/remap.
    if (i == 0) { return textureSampleLevel(layer0_tex, samp, uv, 0.0); }
    if (i == 1) { return textureSampleLevel(layer1_tex, samp, uv, 0.0); }
    if (i == 2) { return textureSampleLevel(layer2_tex, samp, uv, 0.0); }
    if (i == 3) { return textureSampleLevel(layer3_tex, samp, uv, 0.0); }
    if (i == 4) { return textureSampleLevel(layer4_tex, samp, uv, 0.0); }
    if (i == 5) { return textureSampleLevel(layer5_tex, samp, uv, 0.0); }
    if (i == 6) { return textureSampleLevel(layer6_tex, samp, uv, 0.0); }
    return textureSampleLevel(layer7_tex, samp, uv, 0.0);
}

// Active flags are packed as f32 (0.0 / 1.0); threshold at 0.5 like remap.
fn layerActive(i: i32) -> f32 {
    if (i == 0) { return uniforms.data[1].x; }
    if (i == 1) { return uniforms.data[1].y; }
    if (i == 2) { return uniforms.data[1].z; }
    if (i == 3) { return uniforms.data[1].w; }
    if (i == 4) { return uniforms.data[2].x; }
    if (i == 5) { return uniforms.data[2].y; }
    if (i == 6) { return uniforms.data[2].z; }
    return uniforms.data[2].w;
}

// Band-boundary weight: 0 below the boundary, 1 above, with a symmetric
// smoothstep feather of half-width `smoothness`. smoothness <= 0 is a hard step.
fn bandWeight(lum: f32, boundary: f32, smoothness: f32) -> f32 {
    if (smoothness <= 0.0) { return step(boundary, lum); }
    return smoothstep(boundary - smoothness, boundary + smoothness, lum);
}

@fragment
fn main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let resolution = uniforms.data[0].zw;
    let uv = position.xy / resolution;
    let controlColor = textureSample(source, samp, uv);
    let lum = getLuminosity(controlColor.rgb);

    let layers = i32(uniforms.data[0].x);
    let smoothness = uniforms.data[0].y;
    let n = clamp(layers, 2, MAX_LAYERS);

    // Base = darkest band's source (or the control input when unwired).
    var result = select(controlColor, sampleLayer(0, uv), layerActive(0) >= 0.5);

    // Each subsequent boundary at k/n cross-fades toward that band's source.
    for (var k: i32 = 1; k < MAX_LAYERS; k = k + 1) {
        if (k >= n) { break; }
        let src = select(controlColor, sampleLayer(k, uv), layerActive(k) >= 0.5);
        let boundary = f32(k) / f32(n);
        let w = bandWeight(lum, boundary, smoothness);
        result = mix(result, src, w);
    }

    return result;
}

/*
 * Pseudo-3D perspective shift driven by a height map
 * Ray-marched parallax occlusion mapping with a configurable pivot height
 */

struct Uniforms {
    direction: vec3f,
    pivot: f32,
    // No renderScale: the GLSL sibling declares none (parallax has no
    // pixel-fixed-size elements), and the tails must stay matched.
    tileOffset: vec2f,
    fullResolution: vec2f,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var heightMap: texture_2d<f32>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

const MARCH_STEPS: i32 = 32;
const SHIFT_SCALE: f32 = 0.15;

// Convert RGB to luminosity
fn getLuminosity(color: vec3f) -> f32 {
    return dot(color, vec3f(0.299, 0.587, 0.114));
}

fn getHeight(uv: vec2f) -> f32 {
    let mapSize = vec2<f32>(textureDimensions(heightMap));
    let localUV = (uv * uniforms.fullResolution - uniforms.tileOffset) / mapSize;
    return getLuminosity(textureSampleLevel(heightMap, inputSampler, localUV, 0.0).rgb);
}

fn getInput(uv: vec2f) -> vec4f {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let localUV = (uv * uniforms.fullResolution - uniforms.tileOffset) / texSize;
    return textureSampleLevel(inputTex, inputSampler, localUV, 0.0);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let globalCoord = pos.xy + uniforms.tileOffset;
    let uv = globalCoord / uniforms.fullResolution;

    var v = vec3f(0.0, 0.0, 1.0);
    if (length(uniforms.direction) > 0.0) {
        v = normalize(uniforms.direction);
    }
    var shift = v.xy * SHIFT_SCALE;

    // Tile rendering: clamp the ray-march shift to the tile overlap budget
    // (absolute pixels in fullResolution space) so displaced samples never
    // leave the tile's rendered region. No-op when tileOffset is zero.
    let isTileRendering = length(uniforms.tileOffset) > 0.0;
    if (isTileRendering) {
        let maxDispPixels: f32 = 256.0;
        let dispPixels = length(shift * uniforms.fullResolution);
        if (dispPixels > maxDispPixels) {
            shift = shift * (maxDispPixels / dispPixels);
        }
    }

    // View ray crosses this fragment's UV at height == pivot
    var t: f32 = 1.0;
    var rayUV = uv + shift * (1.0 - uniforms.pivot);
    var f = t - getHeight(rayUV);

    if (f > 0.0) {
        let stepSize = 1.0 / f32(MARCH_STEPS);
        for (var i: i32 = 1; i <= MARCH_STEPS; i = i + 1) {
            let prevF = f;
            let prevUV = rayUV;
            t = 1.0 - f32(i) * stepSize;
            rayUV = uv + shift * (t - uniforms.pivot);
            f = t - getHeight(rayUV);
            if (f <= 0.0) {
                // Refine: interpolate between the straddling samples
                let w = f / (f - prevF);
                rayUV = mix(rayUV, prevUV, vec2f(w));
                break;
            }
        }
    }

    return getInput(rayUV);
}

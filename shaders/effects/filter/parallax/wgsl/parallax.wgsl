/*
 * Pseudo-3D perspective shift driven by a height map
 * Ray-marched parallax occlusion mapping with a configurable pivot height
 */

struct Uniforms {
    direction: vec3f,
    pivot: f32,
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
    return getLuminosity(textureSampleLevel(heightMap, inputSampler, uv, 0.0).rgb);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;

    var v = vec3f(0.0, 0.0, 1.0);
    if (length(uniforms.direction) > 0.0) {
        v = normalize(uniforms.direction);
    }
    let shift = v.xy * SHIFT_SCALE;

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

    return textureSampleLevel(inputTex, inputSampler, rayUV, 0.0);
}

/*
 * Sketch - Pencil sketch with crosshatch shading
 *
 * Converts input to luminance, applies contrast, detects edges via
 * derivative kernels, generates crosshatch patterns modulated by
 * darkness, applies vignette, and outputs grayscale sketch.
 */

struct Uniforms {
    contrast: f32,
    hatchDensity: f32,
    alpha: f32,
    _pad3: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const PI: f32 = 3.14159265358979;
const SQRT_TWO: f32 = 1.4142135623730951;

fn luminance(rgb: vec3<f32>) -> f32 {
    return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
}

fn hash21(p: vec2<f32>) -> f32 {
    let h = dot(p, vec2<f32>(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
}

fn triangleWave(x: f32) -> f32 {
    let f = fract(x);
    return 1.0 - abs(f * 2.0 - 1.0);
}

fn rotate2d(p: vec2<f32>, angle: f32) -> vec2<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
}

fn hatchPattern(uv: vec2<f32>, angle: f32, density: f32, phase: f32) -> f32 {
    let rotated = rotate2d(uv - vec2<f32>(0.5), angle) + vec2<f32>(0.5);
    return triangleWave(rotated.x * density + phase);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;
    let texelSize = 1.0 / texSize;

    let origColor = textureSample(inputTex, inputSampler, uv);

    // Convert to luminance and boost contrast
    let rawLum = luminance(origColor.rgb);
    let lum = clamp((rawLum - 0.5) * uniforms.contrast + 0.5, 0.0, 1.0);

    // --- Edge detection (derivative on luminance and inverted luminance) ---
    let offsets = array<vec2<f32>, 9>(
        vec2<f32>(-1.0, -1.0), vec2<f32>(0.0, -1.0), vec2<f32>(1.0, -1.0),
        vec2<f32>(-1.0,  0.0), vec2<f32>(0.0,  0.0), vec2<f32>(1.0,  0.0),
        vec2<f32>(-1.0,  1.0), vec2<f32>(0.0,  1.0), vec2<f32>(1.0,  1.0)
    );

    // Derivative kernels (forward difference, matching Python reference)
    let kx = array<f32, 9>(0.0, 0.0, 0.0, 0.0, 1.0, -1.0, 0.0, 0.0, 0.0);
    let ky = array<f32, 9>(0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, -1.0, 0.0);

    // Sample neighborhood and compute contrasted luminances
    var gx: f32 = 0.0;
    var gy: f32 = 0.0;
    var gxi: f32 = 0.0;
    var gyi: f32 = 0.0;

    for (var i = 0; i < 9; i = i + 1) {
        let sampleUv = uv + offsets[i] * texelSize;
        let s = luminance(textureSample(inputTex, inputSampler, sampleUv).rgb);
        let cs = clamp((s - 0.5) * uniforms.contrast + 0.5, 0.0, 1.0);
        let inv = 1.0 - cs;

        gx = gx + cs * kx[i];
        gy = gy + cs * ky[i];
        gxi = gxi + inv * kx[i];
        gyi = gyi + inv * ky[i];
    }

    let grad = sqrt(gx * gx + gy * gy);
    let gradInv = sqrt(gxi * gxi + gyi * gyi);

    // Combine outlines: min of both, reduce contrast, normalize
    var outline = min(1.0 - grad, 1.0 - gradInv);
    outline = (outline - 0.5) * 0.25 + 0.5;  // adjust_contrast with 0.25
    outline = clamp(outline, 0.0, 1.0);

    // --- Vignette on luminance ---
    let center = vec2<f32>(0.5);
    let dist = distance(uv, center);
    let maxDist = 0.5 * SQRT_TWO;
    let vigWeight = pow(clamp(dist / maxDist, 0.0, 1.0), 2.0);
    let vigLum = mix(lum, mix(lum, 1.0, vigWeight), 0.875);

    // --- Crosshatch ---
    let darkness = clamp(1.0 - vigLum, 0.0, 1.0);
    let densityBase = mix(32.0, 220.0, pow(darkness, 0.85)) * uniforms.hatchDensity;

    // Noise seed for texture variation
    let noiseSeed = uv * texSize * 0.5;
    let jitter = hash21(noiseSeed);

    let p0 = hatchPattern(uv, 0.0, densityBase, jitter * 2.0);
    let p1 = hatchPattern(uv, PI * 0.25, densityBase * 0.85, jitter * 1.3);
    let p2 = hatchPattern(uv, -PI * 0.25, densityBase * 0.9, jitter * 3.7);

    let hatch = min(p0, min(p1, p2));
    let texNoise = hash21(noiseSeed * 1.75);
    let modulated = mix(hatch, texNoise, 0.25);
    let attenuated = mix(1.0, modulated, clamp(pow(darkness, 1.4), 0.0, 1.0));
    let crosshatch = clamp(1.0 - attenuated, 0.0, 1.0);

    // --- Combine ---
    var blended = mix(crosshatch, outline, 0.75);

    // Subtle warp
    let warpA = hash21(uv * texSize * 0.125);
    let warpB = hash21(uv * texSize * 0.125 * 1.37 + vec2<f32>(0.19, 0.0));
    blended = clamp(blended + (warpA - warpB) * 0.0025, 0.0, 1.0);

    // Darken
    let combined = blended * blended;

    // Blend with original using alpha
    let sketchColor = vec3<f32>(combined);
    let result = mix(origColor.rgb, sketchColor, uniforms.alpha);

    return vec4<f32>(result, origColor.a);
}

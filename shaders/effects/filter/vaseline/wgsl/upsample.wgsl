// Vaseline - N-tap blur with edge-weighted blending
// Uses golden angle spiral kernel for smooth, non-blocky blur

struct Params {
    resolution: vec2f,
    alpha: f32,
    _pad0: f32,
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;

const TAP_COUNT: i32 = 32;
const RADIUS: f32 = 48.0;
const GOLDEN_ANGLE: f32 = 2.39996323;
const BRIGHTNESS_ADJUST: f32 = 0.15;

fn clamp01v(v: vec3f) -> vec3f {
    return clamp(v, vec3f(0.0), vec3f(1.0));
}

fn chebyshev_mask(uv: vec2f) -> f32 {
    let centered = abs(uv - vec2f(0.5)) * 2.0;
    return max(centered.x, centered.y);
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let coord = vec2i(fragCoord.xy);
    let fullSize = params.resolution;
    let uv = (vec2f(coord) + 0.5) / fullSize;

    let original = textureLoad(inputTex, coord, 0);
    let a = clamp(params.alpha, 0.0, 1.0);

    if (a <= 0.0) {
        return vec4f(clamp01v(original.rgb), original.a);
    }

    let texelSize = 1.0 / fullSize;
    let radiusUV = RADIUS * texelSize;

    // N-tap gather using golden angle spiral
    var blurAccum = vec3f(0.0);
    var weightSum: f32 = 0.0;

    for (var i: i32 = 0; i < TAP_COUNT; i = i + 1) {
        let t = f32(i) / f32(TAP_COUNT);
        let r = sqrt(t);
        let theta = f32(i) * GOLDEN_ANGLE;
        let offset = vec2f(cos(theta), sin(theta)) * r;

        let sigma: f32 = 0.4;
        let weight = exp(-0.5 * (r * r) / (sigma * sigma));

        let sampleUV = clamp(uv + offset * radiusUV, vec2f(0.0), vec2f(1.0));
        blurAccum = blurAccum + textureSample(inputTex, inputSampler, sampleUV).rgb * weight;
        weightSum = weightSum + weight;
    }

    let blurred = blurAccum / weightSum;
    let boosted = clamp01v(blurred + vec3f(BRIGHTNESS_ADJUST));

    // Edge mask - more effect at edges
    var edgeMask = chebyshev_mask(uv);
    edgeMask = smoothstep(0.0, 0.8, edgeMask);

    let sourceClamped = clamp01v(original.rgb);
    let bloomed = clamp01v((sourceClamped + boosted) * 0.5);
    let edgeBlended = mix(sourceClamped, bloomed, edgeMask);
    let finalRgb = clamp01v(mix(sourceClamped, edgeBlended, a));

    return vec4f(finalRgb, original.a);
}

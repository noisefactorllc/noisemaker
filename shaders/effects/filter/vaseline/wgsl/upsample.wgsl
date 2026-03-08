// Vaseline upsample pass - N-tap bloom at edges, blending to original toward center
// Uses 9-tap tent filter with Chebyshev edge mask

struct Params {
    resolution: vec2f,
    alpha: f32,
    _pad0: f32,
}

@group(0) @binding(0) var inputTex: texture_2d<f32>;
// inputSampler removed - not used (textureLoad for inputTex)
@group(0) @binding(1) var downsampleBuffer: texture_2d<f32>;
@group(0) @binding(2) var downsampleSampler: sampler;
@group(0) @binding(3) var<uniform> params: Params;

const BRIGHTNESS_ADJUST: f32 = 0.25;
const DOWNSAMPLE_SIZE: vec2f = vec2f(64.0, 64.0);

fn clamp01(v: vec3f) -> vec3f {
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
    let downSize = DOWNSAMPLE_SIZE;
    
    let original = textureLoad(inputTex, coord, 0);
    let a = clamp(params.alpha, 0.0, 1.0);
    
    if (a <= 0.0) {
        return vec4f(clamp01(original.rgb), original.a);
    }
    
    let uv = (vec2f(coord) + 0.5) / fullSize;
    let texelSize = 1.0 / downSize;
    
    var sum = vec3f(0.0);
    
    // Center tap (weight 4)
    sum += textureSample(downsampleBuffer, downsampleSampler, uv).rgb * 4.0;
    
    // Edge taps (weight 2 each)
    sum += textureSample(downsampleBuffer, downsampleSampler, uv + vec2f(-texelSize.x, 0.0)).rgb * 2.0;
    sum += textureSample(downsampleBuffer, downsampleSampler, uv + vec2f( texelSize.x, 0.0)).rgb * 2.0;
    sum += textureSample(downsampleBuffer, downsampleSampler, uv + vec2f(0.0, -texelSize.y)).rgb * 2.0;
    sum += textureSample(downsampleBuffer, downsampleSampler, uv + vec2f(0.0,  texelSize.y)).rgb * 2.0;
    
    // Corner taps (weight 1 each)
    sum += textureSample(downsampleBuffer, downsampleSampler, uv + vec2f(-texelSize.x, -texelSize.y)).rgb;
    sum += textureSample(downsampleBuffer, downsampleSampler, uv + vec2f( texelSize.x, -texelSize.y)).rgb;
    sum += textureSample(downsampleBuffer, downsampleSampler, uv + vec2f(-texelSize.x,  texelSize.y)).rgb;
    sum += textureSample(downsampleBuffer, downsampleSampler, uv + vec2f( texelSize.x,  texelSize.y)).rgb;
    
    let bloomSample = sum / 16.0;
    let boosted = clamp01(bloomSample + vec3f(BRIGHTNESS_ADJUST));
    
    // Edge mask - more bloom at edges
    var edgeMask = chebyshev_mask(uv);
    edgeMask = smoothstep(0.0, 0.8, edgeMask);
    
    let sourceClamped = clamp01(original.rgb);
    let bloomed = clamp01((sourceClamped + boosted) * 0.5);
    
    // Edge-weighted blend
    let edgeBlended = mix(sourceClamped, bloomed, edgeMask);
    let finalRgb = clamp01(mix(sourceClamped, edgeBlended, a));
    
    return vec4f(finalRgb, original.a);
}

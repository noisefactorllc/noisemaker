/*
 * Spin Blur - rotational blur around a center point (Radial
 * Blur, Spin mode). Averages a fixed N-tap comb; each tap resamples the
 * input after rotating the pixel's offset-from-center by
 * theta_i = (i/(N-1) - 0.5) * radians(amount) around (centerX, centerY),
 * aspect-corrected exactly the way filter/pinch's WGSL port corrects its
 * own distortion. A per-pixel hash shifts the whole tap comb by up to
 * half an angular step to hide banding from the fixed tap count.
 */

struct Uniforms {
    amount: f32,
    centerX: f32,
    centerY: f32,
    tileOffset: vec2<f32>,
    fullResolution: vec2<f32>,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const N: i32 = 32;

fn hash12(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
    p3 = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
    return fract((p3.x + p3.y) * p3.z);
}

// The symmetric tap arc is invariant to the backend coordinate
// handedness. Its per-pixel jitter is normalized separately below so
// corresponding presented pixels use the same angular offset.
fn rotateAround(uv: vec2<f32>, center: vec2<f32>, angle: f32, aspectRatio: f32) -> vec2<f32> {
    var p = uv;
    p.x = p.x * aspectRatio;
    var c = center;
    c.x = c.x * aspectRatio;
    p = p - c;
    let s = sin(angle);
    let co = cos(angle);
    p = vec2<f32>(co * p.x - s * p.y, s * p.x + co * p.y);
    p = p + c;
    p.x = p.x / aspectRatio;
    return p;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    var fullDims = texSize;
    if (uniforms.fullResolution.x > 0.0) { fullDims = uniforms.fullResolution; }
    let aspectRatio = fullDims.x / fullDims.y;
    let globalCoord = pos.xy + uniforms.tileOffset;
    let uv = globalCoord / fullDims;
    // Center coordinates are expressed in the effect's normalized
    // sampling frame and therefore stay unchanged between backends.
    let center = vec2<f32>(uniforms.centerX, uniforms.centerY);

    let arc = radians(uniforms.amount);
    let angularStep = arc / f32(N - 1);
    // Mirror-invariant global coordinates match glsl/spinBlur.glsl and
    // remain continuous across tiles. The sign is reversed because
    // reflecting the symmetric tap arc maps theta to -theta, including
    // the sub-step offset.
    let jitterCoord = vec2<f32>(globalCoord.x,
        abs(globalCoord.y - fullDims.y * 0.5));
    let jitter = -(hash12(jitterCoord) - 0.5) * angularStep;

    var sum = vec4<f32>(0.0);
    for (var i: i32 = 0; i < N; i++) {
        let theta = (f32(i) / f32(N - 1) - 0.5) * arc + jitter;
        let distorted = clamp(rotateAround(uv, center, theta, aspectRatio), vec2<f32>(0.0), vec2<f32>(1.0));
        let sampleUV = clamp((distorted * fullDims - uniforms.tileOffset) / texSize, vec2<f32>(0.0), vec2<f32>(1.0));
        sum = sum + textureSample(inputTex, inputSampler, sampleUV);
    }
    return sum / f32(N);
}

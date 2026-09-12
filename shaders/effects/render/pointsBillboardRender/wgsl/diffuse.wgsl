// Diffuse Pass - Decay existing trail

struct Uniforms {
    resolution: vec2<f32>,
    intensity: f32,
    aperture: f32,
    viewMode: i32,
    blendMode: i32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var trailTex: texture_2d<f32>;
@group(0) @binding(2) var trailSampler: sampler;
@group(0) @binding(3) var defocusTex: texture_2d<f32>;

fn sampleDefocus(uv: vec2f) -> vec4f {
    let dims = vec2i(textureDimensions(defocusTex));
    let p = uv * vec2f(dims) - 0.5;
    let lo = vec2i(floor(p));
    let f = fract(p);
    let a = clamp(lo, vec2i(0), dims - 1);
    let b = clamp(lo + 1, vec2i(0), dims - 1);
    return mix(mix(textureLoad(defocusTex, a, 0), textureLoad(defocusTex, vec2i(b.x, a.y), 0), f.x),
        mix(textureLoad(defocusTex, vec2i(a.x, b.y), 0), textureLoad(defocusTex, b, 0), f.x), f.y);
}

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = fragCoord.xy / u.resolution;
    
    // Sample the trail texture directly (no blur)
    let trailColor = textureSample(trailTex, trailSampler, uv);
    
    // Apply intensity decay (persistence)
    // intensity=100 means no decay, intensity=0 means instant fade
    let decay = clamp(u.intensity / 100.0, 0.0, 1.0);
    let decayed = clamp(trailColor * decay, vec4<f32>(0.0), vec4<f32>(1.0));
    if (u.blendMode != 0 || u.aperture <= 0.0 || u.viewMode == 0) { return decayed; }
    return decayed + sampleDefocus(uv);
}

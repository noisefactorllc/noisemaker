/*
 * Spatter: Multi-layer procedural paint spatter effect.
 * Large warped smears, medium dots, fine specks, minus ridged breaks.
 * Matches Python reference: exp-distributed noise with aggressive thresholding.
 */

struct Uniforms {
    density: f32,
    alpha: f32,
    color_r: f32,
    color_g: f32,
    seed: i32,
    color_b: f32,
    _pad0: f32,
    _pad1: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;
@group(0) @binding(3) var<uniform> time: f32;

fn pcg3(seed: vec3<u32>) -> vec3<u32> {
    var v = seed * 1664525u + 1013904223u;
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    v = v ^ (v >> vec3<u32>(16u));
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    return v;
}

fn pcg(v_in: u32) -> u32 {
    return pcg3(vec3<u32>(v_in, 0u, 0u)).x;
}

fn hashf(h: u32) -> f32 {
    return f32(pcg3(vec3<u32>(h, 0u, 0u)).x) / f32(0xffffffffu);
}

fn hash31(p: vec3<f32>) -> f32 {
    let v = pcg3(vec3<u32>(
        u32(select(-p.x * 2.0 + 1.0, p.x * 2.0, p.x >= 0.0)),
        u32(select(-p.y * 2.0 + 1.0, p.y * 2.0, p.y >= 0.0)),
        u32(select(-p.z * 2.0 + 1.0, p.z * 2.0, p.z >= 0.0)),
    ));
    return f32(v.x) / f32(0xffffffffu);
}

fn fade(t: f32) -> f32 {
    return t * t * (3.0 - 2.0 * t);
}

fn vnoise(p: vec2<f32>, s: f32) -> f32 {
    let c: vec2<f32> = floor(p);
    let f: vec2<f32> = fract(p);
    let u: vec2<f32> = vec2<f32>(fade(f.x), fade(f.y));
    return mix(
        mix(hash31(vec3<f32>(c, s)), hash31(vec3<f32>(c + vec2<f32>(1.0, 0.0), s)), u.x),
        mix(hash31(vec3<f32>(c + vec2<f32>(0.0, 1.0), s)), hash31(vec3<f32>(c + vec2<f32>(1.0, 1.0), s)), u.x),
        u.y);
}

// 3-octave exp FBM — fixed loop count for fast compilation
fn expFbm3(uv: vec2<f32>, freq: vec2<f32>, s: f32) -> f32 {
    var a: f32 = 0.0;
    a = a + pow(vnoise(uv * freq, s), 4.0) * 0.5;
    a = a + pow(vnoise(uv * freq * 2.0, s + 37.17), 4.0) * 0.25;
    a = a + pow(vnoise(uv * freq * 4.0, s + 74.34), 4.0) * 0.125;
    return a;
}

// 2-octave exp FBM
fn expFbm2(uv: vec2<f32>, freq: vec2<f32>, s: f32) -> f32 {
    var a: f32 = 0.0;
    a = a + pow(vnoise(uv * freq, s), 4.0) * 0.5;
    a = a + pow(vnoise(uv * freq * 2.0, s + 37.17), 4.0) * 0.25;
    return a;
}

// 2-octave ridged FBM
fn ridgedFbm2(uv: vec2<f32>, freq: vec2<f32>, s: f32) -> f32 {
    var a: f32 = 0.0;
    let n0: f32 = vnoise(uv * freq, s);
    a = a + pow(abs(n0 * 2.0 - 1.0), 4.0) * 0.5;
    let n1: f32 = vnoise(uv * freq * 2.0, s + 37.17);
    a = a + pow(abs(n1 * 2.0 - 1.0), 4.0) * 0.25;
    return a / 0.75;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let dims: vec2<f32> = vec2<f32>(textureDimensions(inputTex));
    let uv: vec2<f32> = pos.xy / dims;
    let base: vec4<f32> = textureSample(inputTex, inputSampler, uv);

    let s: f32 = f32(uniforms.seed) * 17.3;
    let user_color: vec3<f32> = vec3<f32>(uniforms.color_r, uniforms.color_g, uniforms.color_b);
    let d: f32 = uniforms.density;

    // Seed-derived random frequencies
    let smearFreq: f32 = mix(3.0, 6.0, hashf(pcg(u32(s + 10.0))));
    let dotFreq: f32 = mix(24.0, 48.0, hashf(pcg(u32(s + 50.0))));
    let speckFreq: f32 = mix(64.0, 96.0, hashf(pcg(u32(s + 90.0))));
    let ridgeFreq: f32 = mix(2.0, 3.0, hashf(pcg(u32(s + 130.0))));

    // -- Layer 1: Large smear (low-freq domain-warped noise) --
    let warpX: f32 = vnoise(uv * vec2<f32>(2.0, 1.0), s + 200.0);
    let warpY: f32 = vnoise(uv * vec2<f32>(3.0, 2.0), s + 300.0);
    let disp: f32 = 1.0 + hashf(pcg(u32(s + 150.0)));
    let warpedUV: vec2<f32> = uv + (vec2<f32>(warpX, warpY) - 0.5) * disp * 0.12;
    var smear: f32 = expFbm3(warpedUV, vec2<f32>(smearFreq), s + 100.0);
    smear = clamp(smear * 5.0, 0.0, 1.0);

    // -- Layer 2: Medium dots --
    var dots: f32 = expFbm2(uv, vec2<f32>(dotFreq), s + 43.0);
    dots = clamp((dots - 0.08) * 8.0, 0.0, 1.0);

    // -- Layer 3: Fine specks --
    var specks: f32 = expFbm2(uv, vec2<f32>(speckFreq), s + 71.0);
    specks = clamp((specks - 0.06) * 10.0, 0.0, 1.0);

    // Combine: max of layers (Python uses tf.maximum)
    var combined: f32 = max(smear, max(dots, specks));

    // Subtract ridged noise for breaks
    let ridge: f32 = ridgedFbm2(uv, vec2<f32>(ridgeFreq), s + 89.0);
    combined = max(0.0, combined - ridge);

    // Density controls overall amount
    combined = combined * (0.1 + d * 1.6);

    // Hard threshold blend (Python blend_layers with 0.005 threshold)
    let mask: f32 = step(0.005, combined) * clamp(combined, 0.0, 1.0);

    // Color: where mask > 0, show color * input; else show input
    let colored: vec3<f32> = mix(base.rgb, base.rgb * user_color, mask);
    let result: vec3<f32> = mix(base.rgb, colored, uniforms.alpha);

    return vec4<f32>(result, base.a);
}

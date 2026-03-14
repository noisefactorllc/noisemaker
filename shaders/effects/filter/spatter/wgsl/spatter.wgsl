/*
 * Spatter: Multi-layer procedural paint spatter effect.
 * Grid-based hash noise with explicit interpolation.
 * Exp-distributed FBM with brightness/contrast thresholding,
 * blend_layers with feather=0.005 (sharp step at 0.5).
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

// --- PCG PRNG ---

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

// --- Grid value: hash at integer grid point ---

fn gridVal(p: vec2<i32>, sd: u32) -> f32 {
    let h = pcg3(vec3<u32>(u32(p.x + 32768), u32(p.y + 32768), sd));
    return f32(h.x) / f32(0xffffffffu);
}

// --- Catmull-Rom cubic interpolation helper ---

fn cubic(a: f32, b: f32, c: f32, d: f32, t: f32) -> f32 {
    let t2 = t * t;
    let t3 = t2 * t;
    return 0.5 * ((2.0 * b) + (-a + c) * t + (2.0 * a - 5.0 * b + 4.0 * c - d) * t2 + (-a + 3.0 * b - 3.0 * c + d) * t3);
}

// --- Bicubic exp grid (Catmull-Rom, 4x4 neighborhood) ---
// pow(x,4) applied at grid points, then bicubic interpolation

fn bicubicExpGrid(pos: vec2<f32>, sd: u32) -> f32 {
    let ip = vec2<i32>(floor(pos));
    let fp = fract(pos);

    // Evaluate 4x4 grid with exp distribution at grid points
    var row0: f32; var row1: f32; var row2: f32; var row3: f32;

    // Row -1
    let g00 = pow(gridVal(vec2<i32>(ip.x - 1, ip.y - 1), sd), 4.0);
    let g10 = pow(gridVal(vec2<i32>(ip.x,     ip.y - 1), sd), 4.0);
    let g20 = pow(gridVal(vec2<i32>(ip.x + 1, ip.y - 1), sd), 4.0);
    let g30 = pow(gridVal(vec2<i32>(ip.x + 2, ip.y - 1), sd), 4.0);
    row0 = cubic(g00, g10, g20, g30, fp.x);

    // Row 0
    let g01 = pow(gridVal(vec2<i32>(ip.x - 1, ip.y), sd), 4.0);
    let g11 = pow(gridVal(vec2<i32>(ip.x,     ip.y), sd), 4.0);
    let g21 = pow(gridVal(vec2<i32>(ip.x + 1, ip.y), sd), 4.0);
    let g31 = pow(gridVal(vec2<i32>(ip.x + 2, ip.y), sd), 4.0);
    row1 = cubic(g01, g11, g21, g31, fp.x);

    // Row +1
    let g02 = pow(gridVal(vec2<i32>(ip.x - 1, ip.y + 1), sd), 4.0);
    let g12 = pow(gridVal(vec2<i32>(ip.x,     ip.y + 1), sd), 4.0);
    let g22 = pow(gridVal(vec2<i32>(ip.x + 1, ip.y + 1), sd), 4.0);
    let g32 = pow(gridVal(vec2<i32>(ip.x + 2, ip.y + 1), sd), 4.0);
    row2 = cubic(g02, g12, g22, g32, fp.x);

    // Row +2
    let g03 = pow(gridVal(vec2<i32>(ip.x - 1, ip.y + 2), sd), 4.0);
    let g13 = pow(gridVal(vec2<i32>(ip.x,     ip.y + 2), sd), 4.0);
    let g23 = pow(gridVal(vec2<i32>(ip.x + 1, ip.y + 2), sd), 4.0);
    let g33 = pow(gridVal(vec2<i32>(ip.x + 2, ip.y + 2), sd), 4.0);
    row3 = cubic(g03, g13, g23, g33, fp.x);

    return clamp(cubic(row0, row1, row2, row3, fp.y), 0.0, 1.0);
}

// --- Bilinear exp grid (2x2 neighborhood) ---
// pow(x,4) applied at grid points, then bilinear interpolation

fn bilinearExpGrid(pos: vec2<f32>, sd: u32) -> f32 {
    let ip = vec2<i32>(floor(pos));
    let fp = fract(pos);

    let v00 = pow(gridVal(ip, sd), 4.0);
    let v10 = pow(gridVal(vec2<i32>(ip.x + 1, ip.y), sd), 4.0);
    let v01 = pow(gridVal(vec2<i32>(ip.x, ip.y + 1), sd), 4.0);
    let v11 = pow(gridVal(vec2<i32>(ip.x + 1, ip.y + 1), sd), 4.0);

    let mx0 = mix(v00, v10, fp.x);
    let mx1 = mix(v01, v11, fp.x);
    return mix(mx0, mx1, fp.y);
}

// --- Cosine exp grid (2x2 neighborhood with cosine interpolation) ---
// pow(x,4) applied at grid points, cosine-smoothed interpolation

fn cosineExpGrid(pos: vec2<f32>, sd: u32) -> f32 {
    let ip = vec2<i32>(floor(pos));
    let fp = fract(pos);

    let tx = (1.0 - cos(fp.x * 3.14159265358979)) * 0.5;
    let ty = (1.0 - cos(fp.y * 3.14159265358979)) * 0.5;

    let v00 = pow(gridVal(ip, sd), 4.0);
    let v10 = pow(gridVal(vec2<i32>(ip.x + 1, ip.y), sd), 4.0);
    let v01 = pow(gridVal(vec2<i32>(ip.x, ip.y + 1), sd), 4.0);
    let v11 = pow(gridVal(vec2<i32>(ip.x + 1, ip.y + 1), sd), 4.0);

    let mx0 = mix(v00, v10, tx);
    let mx1 = mix(v01, v11, tx);
    return mix(mx0, mx1, ty);
}

// --- FBM functions ---

// 6-octave exp FBM with bicubic interpolation (smear layer)
fn expFbm6Bicubic(uv: vec2<f32>, freq: vec2<f32>, sd: u32) -> f32 {
    var a: f32 = 0.0;
    a = a + bicubicExpGrid(uv * freq,        sd           ) * 0.5;
    a = a + bicubicExpGrid(uv * freq * 2.0,  sd + 10000u  ) * 0.25;
    a = a + bicubicExpGrid(uv * freq * 4.0,  sd + 20000u  ) * 0.125;
    a = a + bicubicExpGrid(uv * freq * 8.0,  sd + 30000u  ) * 0.0625;
    a = a + bicubicExpGrid(uv * freq * 16.0, sd + 40000u  ) * 0.03125;
    a = a + bicubicExpGrid(uv * freq * 32.0, sd + 50000u  ) * 0.015625;
    return a / 0.984375;
}

// 4-octave exp FBM with bilinear interpolation (dots & specks)
fn expFbm4Bilinear(uv: vec2<f32>, freq: vec2<f32>, sd: u32) -> f32 {
    var a: f32 = 0.0;
    a = a + bilinearExpGrid(uv * freq,        sd           ) * 0.5;
    a = a + bilinearExpGrid(uv * freq * 2.0,  sd + 10000u  ) * 0.25;
    a = a + bilinearExpGrid(uv * freq * 4.0,  sd + 20000u  ) * 0.125;
    a = a + bilinearExpGrid(uv * freq * 8.0,  sd + 30000u  ) * 0.0625;
    return a / 0.9375;
}

// 3-octave exp+ridged FBM with cosine interpolation (removal layer)
// Ridge transform applied AFTER interpolation (per-pixel), not at grid points
fn expRidgedFbm3Cosine(uv: vec2<f32>, freq: vec2<f32>, sd: u32) -> f32 {
    var a: f32 = 0.0;
    var v: f32;
    v = cosineExpGrid(uv * freq,        sd          );
    a = a + (1.0 - abs(2.0 * v - 1.0)) * 0.5;
    v = cosineExpGrid(uv * freq * 2.0,  sd + 10000u );
    a = a + (1.0 - abs(2.0 * v - 1.0)) * 0.25;
    v = cosineExpGrid(uv * freq * 4.0,  sd + 20000u );
    a = a + (1.0 - abs(2.0 * v - 1.0)) * 0.125;
    return a / 0.875;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let dims: vec2<f32> = vec2<f32>(textureDimensions(inputTex));
    let uv: vec2<f32> = pos.xy / dims;
    let base: vec4<f32> = textureSample(inputTex, inputSampler, uv);

    // Aspect-corrected UV for noise sampling
    let aspect: f32 = dims.x / dims.y;
    let nUV: vec2<f32> = uv * vec2<f32>(aspect, 1.0);

    let s: u32 = u32(uniforms.seed) * 17u;
    let user_color: vec3<f32> = vec3<f32>(uniforms.color_r, uniforms.color_g, uniforms.color_b);

    // Seed-derived random frequencies (matching Python ranges)
    let smearFreq: f32 = mix(3.0, 6.0, hashf(pcg(s + 10u)));
    let dotFreq: f32   = mix(32.0, 64.0, hashf(pcg(s + 50u)));
    let speckFreq: f32 = mix(150.0, 200.0, hashf(pcg(s + 90u)));
    let ridgeFreq: f32 = mix(2.0, 3.0, hashf(pcg(s + 130u)));

    // -- Layer 1: Large smear (6-oct bicubic exp FBM, domain warped) --
    let warpFreqX: f32 = mix(2.0, 3.0, hashf(pcg(s + 160u)));
    let warpFreqY: f32 = mix(1.0, 3.0, hashf(pcg(s + 170u)));
    let warpX: f32 = bilinearExpGrid(nUV * vec2<f32>(warpFreqX, warpFreqY), s + 200u);
    let warpY: f32 = bilinearExpGrid(nUV * vec2<f32>(warpFreqX, warpFreqY), s + 300u);
    let disp: f32 = 1.0 + hashf(pcg(s + 150u));
    let warpedUV: vec2<f32> = nUV + (vec2<f32>(warpX, warpY) - 0.5) * disp * 0.12;
    let smear: f32 = expFbm6Bicubic(warpedUV, vec2<f32>(smearFreq), s + 100u);

    // -- Layer 2: Medium dots (4-oct bilinear exp FBM + brightness/contrast) --
    var dots: f32 = expFbm4Bilinear(nUV, vec2<f32>(dotFreq), s + 43u);
    dots = clamp(4.0 * dots - 1.6, 0.0, 1.0);

    // -- Layer 3: Fine specks (4-oct bilinear exp FBM + brightness/contrast) --
    var specks: f32 = expFbm4Bilinear(nUV, vec2<f32>(speckFreq), s + 71u);
    specks = clamp(4.0 * specks - 2.0, 0.0, 1.0);

    // Combine: max of layers
    var combined: f32 = max(smear, max(dots, specks));

    // Subtract exp+ridged cosine noise for breaks
    let ridge: f32 = expRidgedFbm3Cosine(nUV, vec2<f32>(ridgeFreq), s + 89u);
    combined = max(0.0, combined - ridge);

    // Density scales before threshold
    combined = combined * (0.5 + uniforms.density * 2.0);

    // Sharp step at 0.5 (Python blend_layers with feather=0.005)
    let mask: f32 = step(0.5, combined);

    // Color blend
    let colored: vec3<f32> = base.rgb * user_color;
    let result: vec3<f32> = mix(base.rgb, mix(base.rgb, colored, mask), uniforms.alpha);

    return vec4<f32>(result, base.a);
}

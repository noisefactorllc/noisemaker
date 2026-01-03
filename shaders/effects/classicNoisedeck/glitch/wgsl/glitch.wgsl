// Glitch processor shader.
// Uses deterministic noise fields to drive scanline shears, snow bursts, and channel offsets.
// Probability controls are remapped before application so glitch bursts remain inspectable during performances.

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;

struct Uniforms {
    resolution: vec2<f32>,
    time: f32,
    seed: i32,
    aspectLens: f32,
    xChonk: f32,
    yChonk: f32,
    glitchiness: f32,
    scanlinesAmt: f32,
    snowAmt: f32,
    vignetteAmt: f32,
    aberrationAmt: f32,
    distortion: f32,
    kernel: f32,
    levels: f32,
    _pad0: f32,
    _pad1: f32,
}

@group(0) @binding(2) var<uniform> u: Uniforms;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

// PCG PRNG - MIT License
fn pcg(v_in: vec3<u32>) -> vec3<u32> {
    var v = v_in * 1664525u + 1013904223u;
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    v = v ^ (v >> vec3<u32>(16u));
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    return v;
}

fn prng(p: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(pcg(vec3<u32>(u32(p.x), u32(p.y), u32(p.z)))) / f32(0xffffffffu);
}

fn f(st: vec2<f32>, seed: i32) -> f32 {
    return prng(vec3<f32>(floor(st), f32(seed))).x;
}

fn bicubic(p: vec2<f32>, seed: i32) -> f32 {
    let x = p.x;
    let y = p.y;
    let x1 = floor(x);
    let y1 = floor(y);
    let x2 = x1 + 1.0;
    let y2 = y1 + 1.0;
    let f11 = f(vec2<f32>(x1, y1), seed);
    let f12 = f(vec2<f32>(x1, y2), seed);
    let f21 = f(vec2<f32>(x2, y1), seed);
    let f22 = f(vec2<f32>(x2, y2), seed);
    let f11x = (f(vec2<f32>(x1 + 1.0, y1), seed) - f(vec2<f32>(x1 - 1.0, y1), seed)) / 2.0;
    let f12x = (f(vec2<f32>(x1 + 1.0, y2), seed) - f(vec2<f32>(x1 - 1.0, y2), seed)) / 2.0;
    let f21x = (f(vec2<f32>(x2 + 1.0, y1), seed) - f(vec2<f32>(x2 - 1.0, y1), seed)) / 2.0;
    let f22x = (f(vec2<f32>(x2 + 1.0, y2), seed) - f(vec2<f32>(x2 - 1.0, y2), seed)) / 2.0;
    let f11y = (f(vec2<f32>(x1, y1 + 1.0), seed) - f(vec2<f32>(x1, y1 - 1.0), seed)) / 2.0;
    let f12y = (f(vec2<f32>(x1, y2 + 1.0), seed) - f(vec2<f32>(x1, y2 - 1.0), seed)) / 2.0;
    let f21y = (f(vec2<f32>(x2, y1 + 1.0), seed) - f(vec2<f32>(x2, y1 - 1.0), seed)) / 2.0;
    let f22y = (f(vec2<f32>(x2, y2 + 1.0), seed) - f(vec2<f32>(x2, y2 - 1.0), seed)) / 2.0;
    let f11xy = (f(vec2<f32>(x1 + 1.0, y1 + 1.0), seed) - f(vec2<f32>(x1 + 1.0, y1 - 1.0), seed) - f(vec2<f32>(x1 - 1.0, y1 + 1.0), seed) + f(vec2<f32>(x1 - 1.0, y1 - 1.0), seed)) / 4.0;
    let f12xy = (f(vec2<f32>(x1 + 1.0, y2 + 1.0), seed) - f(vec2<f32>(x1 + 1.0, y2 - 1.0), seed) - f(vec2<f32>(x1 - 1.0, y2 + 1.0), seed) + f(vec2<f32>(x1 - 1.0, y2 - 1.0), seed)) / 4.0;
    let f21xy = (f(vec2<f32>(x2 + 1.0, y1 + 1.0), seed) - f(vec2<f32>(x2 + 1.0, y1 - 1.0), seed) - f(vec2<f32>(x2 - 1.0, y1 + 1.0), seed) + f(vec2<f32>(x2 - 1.0, y1 - 1.0), seed)) / 4.0;
    let f22xy = (f(vec2<f32>(x2 + 1.0, y2 + 1.0), seed) - f(vec2<f32>(x2 + 1.0, y2 - 1.0), seed) - f(vec2<f32>(x2 - 1.0, y2 + 1.0), seed) + f(vec2<f32>(x2 - 1.0, y2 - 1.0), seed)) / 4.0;
    
    let Q = mat4x4<f32>(
        vec4<f32>(f11, f21, f11x, f21x),
        vec4<f32>(f12, f22, f12x, f22x),
        vec4<f32>(f11y, f21y, f11xy, f21xy),
        vec4<f32>(f12y, f22y, f12xy, f22xy)
    );
    let S = mat4x4<f32>(
        vec4<f32>(1.0, 0.0, 0.0, 0.0),
        vec4<f32>(0.0, 0.0, 1.0, 0.0),
        vec4<f32>(-3.0, 3.0, -2.0, -1.0),
        vec4<f32>(2.0, -2.0, 1.0, 1.0)
    );
    let T = mat4x4<f32>(
        vec4<f32>(1.0, 0.0, -3.0, 2.0),
        vec4<f32>(0.0, 0.0, 3.0, -2.0),
        vec4<f32>(0.0, 1.0, -2.0, 1.0),
        vec4<f32>(0.0, 0.0, -1.0, 1.0)
    );
    let A = T * Q * S;
    let t = fract(p.x);
    let uu = fract(p.y);
    let tv = vec4<f32>(1.0, t, t * t, t * t * t);
    let uv = vec4<f32>(1.0, uu, uu * uu, uu * uu * uu);
    return dot(tv * A, uv);
}

fn map(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn periodicFunction(p: f32) -> f32 {
    return map(sin(p * TAU), -1.0, 1.0, 0.0, 1.0);
}

fn scanlines(color: vec4<f32>, st: vec2<f32>, resolution: vec2<f32>, scanlinesAmt: f32, time: f32, seed: i32) -> vec4<f32> {
    let centerDistance = length(vec2<f32>(0.5) - st) * PI * 0.5;
    let noise = periodicFunction(bicubic(st * 4.0, seed) - time) * map(scanlinesAmt, 0.0, 100.0, 0.0, 0.5);
    let hatch = (sin(mix(st.y, st.y + noise, pow(centerDistance, 8.0)) * resolution.y * 1.5) + 1.0) * 0.5;
    var result = color;
    result = vec4<f32>(mix(color.rgb, color.rgb * hatch, map(scanlinesAmt, 0.0, 100.0, 0.0, 0.5)), color.a);
    return result;
}

fn snow(color: vec4<f32>, fragCoord: vec2<f32>, snowAmt: f32, time: f32) -> vec4<f32> {
    let amt = snowAmt / 100.0;
    let noise = prng(vec3<f32>(fragCoord, time * 1000.0)).x;
    
    let maskNoise = prng(vec3<f32>(fragCoord + 10.0, time * 1000.0)).x;
    let maskNoiseSparse = clamp(maskNoise - 0.93875, 0.0, 0.06125) * 16.0;
    
    var mask: f32;
    if (amt < 0.5) {
        mask = mix(0.0, maskNoiseSparse, amt * 2.0);
    } else {
        mask = mix(maskNoiseSparse, maskNoise * maskNoise, map(amt, 0.5, 1.0, 0.0, 1.0));
        if (amt > 0.75) {
            mask = mix(mask, 1.0, map(amt, 0.75, 1.0, 0.0, 1.0));
        }
    }
    
    return vec4<f32>(mix(color.rgb, vec3<f32>(noise), mask), color.a);
}

fn offsets(st: vec2<f32>) -> f32 {
    return prng(vec3<f32>(floor(st), 0.0)).x;
}

fn glitch(st_in: vec2<f32>, aspectRatio: f32, time: f32, xChonk: f32, yChonk: f32, glitchiness: f32, aspectLens: f32, distortion: f32, aberrationAmt: f32) -> vec4<f32> {
    var st = st_in;
    var freq = vec2<f32>(1.0);
    freq.x = freq.x * map(xChonk, 1.0, 100.0, 50.0, 1.0);
    freq.y = freq.y * map(yChonk, 1.0, 100.0, 50.0, 1.0);
    
    freq = freq * vec2<f32>(periodicFunction(prng(vec3<f32>(floor(st * freq), 0.0)).x - time));
    
    let g = map(glitchiness, 0.0, 100.0, 0.0, 1.0);
    
    // get drift value from somewhere far away
    let xDrift = prng(vec3<f32>(floor(st * freq) + 10.0, 0.0)).x * g;
    let yDrift = prng(vec3<f32>(floor(st * freq) - 10.0, 0.0)).x * g;
    
    let sparseness = map(glitchiness, 0.0, 100.0, 8.0, 2.0);
    
    // clamp for sparseness
    let rand = prng(vec3<f32>(floor(st * freq), 0.0)).x;
    let xOffset = clamp((periodicFunction(rand + xDrift - time) - periodicFunction(xDrift - time) * sparseness) * 4.0, 0.0, 1.0);
    let yOffset = clamp((periodicFunction(rand + yDrift - time) - periodicFunction(yDrift - time) * sparseness) * 4.0, 0.0, 1.0);
    
    let refract = g * 0.125;
    
    st.x = (st.x + sin(xOffset * TAU) * refract) % 1.0;
    st.y = (st.y + sin(yOffset * TAU) * refract) % 1.0;
    
    // aberration and lensing
    var diff = vec2<f32>(0.5 - st.x, 0.5 - st.y);
    if (aspectLens > 0.5) {
        diff = vec2<f32>(0.5 * aspectRatio, 0.5) - vec2<f32>(st.x * aspectRatio, st.y);
    }
    let centerDist = length(diff);
    
    var distort: f32 = 0.0;
    var zoom: f32 = 1.0;
    if (distortion < 0.0) {
        distort = map(distortion, -100.0, 0.0, -0.5, 0.0);
        zoom = map(distortion, -100.0, 0.0, 0.01, 0.0);
    } else {
        distort = map(distortion, 0.0, 100.0, 0.0, 0.5);
        zoom = map(distortion, 0.0, 100.0, 0.0, -0.25);
    }
    
    let lensedCoords = fract((st - diff * zoom) - diff * centerDist * centerDist * distort);
    
    let aberrationOffset = map(aberrationAmt, 0.0, 100.0, 0.0, 0.05) * centerDist * PI * 0.5;
    
    let redOffset = mix(clamp(lensedCoords.x + aberrationOffset, 0.0, 1.0), lensedCoords.x, lensedCoords.x);
    let red = textureSample(inputTex, samp, vec2<f32>(redOffset, lensedCoords.y));
    
    let green = textureSample(inputTex, samp, lensedCoords);
    
    let blueOffset = mix(lensedCoords.x, clamp(lensedCoords.x - aberrationOffset, 0.0, 1.0), lensedCoords.x);
    let blue = textureSample(inputTex, samp, vec2<f32>(blueOffset, lensedCoords.y));
    
    return vec4<f32>(red.r, green.g, blue.b, green.a);
}

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let resolution = u.resolution;
    let aspectRatio = resolution.x / resolution.y;
    
    var uv = fragCoord.xy / resolution;
    uv.y = 1.0 - uv.y;
    
    var color = glitch(uv, aspectRatio, u.time, u.xChonk, u.yChonk, u.glitchiness, u.aspectLens, u.distortion, u.aberrationAmt);
    color = scanlines(color, uv, resolution, u.scanlinesAmt, u.time, u.seed);
    color = snow(color, fragCoord.xy, u.snowAmt, u.time);
    
    // vignette
    if (u.vignetteAmt < 0.0) {
        color = vec4<f32>(
            mix(color.rgb * (1.0 - pow(length(vec2<f32>(0.5) - uv) * 1.125, 2.0)), color.rgb, map(u.vignetteAmt, -100.0, 0.0, 0.0, 1.0)),
            max(color.a, length(vec2<f32>(0.5) - uv) * map(u.vignetteAmt, -100.0, 0.0, 1.0, 0.0))
        );
    } else {
        color = vec4<f32>(
            mix(color.rgb, 1.0 - (1.0 - color.rgb * (1.0 - pow(length(vec2<f32>(0.5) - uv) * 1.125, 2.0))), map(u.vignetteAmt, 0.0, 100.0, 0.0, 1.0)),
            max(color.a, length(vec2<f32>(0.5) - uv) * map(u.vignetteAmt, -100.0, 0.0, 1.0, 0.0))
        );
    }
    
    return color;
}

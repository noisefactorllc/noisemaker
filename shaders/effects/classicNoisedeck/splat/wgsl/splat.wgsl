// Splat compositor overlay shader.
// Builds deterministic multi-octave splat and speck masks from PCG-backed Perlin noise.
// Ported from GLSL to WGSL

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;

struct Uniforms {
    time: f32,
    useSplats: i32,
    useSpecks: i32,
    splatScale: f32,
    splatCutoff: f32,
    splatSpeed: f32,
    splatSeed: f32,
    splatColor: vec3<f32>,
    splatMode: i32,
    speckScale: f32,
    speckCutoff: f32,
    speckSpeed: f32,
    speckSeed: f32,
    speckColor: vec3<f32>,
    speckMode: i32,
}

@group(0) @binding(2) var<uniform> u : Uniforms;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

fn getAspectRatio() -> f32 {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    return dims.x / dims.y;
}

fn mapRange(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

// PCG PRNG
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

fn prng(p_in: vec3<f32>) -> vec3<f32> {
    var p = p_in;
    if (p.x >= 0.0) { p.x = p.x * 2.0; } else { p.x = -p.x * 2.0 + 1.0; }
    if (p.y >= 0.0) { p.y = p.y * 2.0; } else { p.y = -p.y * 2.0 + 1.0; }
    if (p.z >= 0.0) { p.z = p.z * 2.0; } else { p.z = -p.z * 2.0 + 1.0; }
    return vec3<f32>(pcg(vec3<u32>(u32(p.x), u32(p.y), u32(p.z)))) / f32(0xffffffffu);
}

fn smootherstep(x: f32) -> f32 {
    return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

fn smoothlerp(x: f32, a: f32, b: f32) -> f32 {
    return a + smootherstep(x) * (b - a);
}

fn grid(st: vec2<f32>, cell: vec2<f32>, speed: f32) -> f32 {
    var angle = prng(vec3<f32>(cell, 1.0)).r * TAU;
    angle = angle + u.time * TAU * speed;
    let gradient = vec2<f32>(cos(angle), sin(angle));
    let dist = st - cell;
    return dot(gradient, dist);
}

fn perlin(st_in: vec2<f32>, scale: vec2<f32>, speed: f32) -> f32 {
    var st = st_in - 0.5;
    st = st * scale;
    st = st + 0.5;
    let cell = floor(st);
    let tl = grid(st, cell, speed);
    let tr = grid(st, vec2<f32>(cell.x + 1.0, cell.y), speed);
    let bl = grid(st, vec2<f32>(cell.x, cell.y + 1.0), speed);
    let br = grid(st, cell + 1.0, speed);
    let upper = smoothlerp(st.x - cell.x, tl, tr);
    let lower = smoothlerp(st.x - cell.x, bl, br);
    let val = smoothlerp(st.y - cell.y, upper, lower);
    return val * 0.5 + 0.5;
}

fn splat(st_in: vec2<f32>, scale: vec2<f32>) -> f32 {
    var st = st_in;
    st.x = st.x + perlin(st + u.splatSeed + 50.0, vec2<f32>(2.0, 3.0), 0.0) * 0.5 - 0.5;
    st.y = st.y + perlin(st + u.splatSeed + 60.0, vec2<f32>(2.0, 3.0), 0.0) * 0.5 - 0.5;
    let d = perlin(st, vec2<f32>(4.0) * scale, u.splatSpeed) + 
            (perlin(st + 10.0, vec2<f32>(8.0) * scale, u.splatSpeed) * 0.5) + 
            (perlin(st + 20.0, vec2<f32>(16.0) * scale, u.splatSpeed) * 0.25);
    return step(mapRange(u.splatCutoff, 0.0, 100.0, 0.85, 0.99), d);
}

fn speckle(st: vec2<f32>, scale: vec2<f32>) -> f32 {
    var d = perlin(st, scale, u.speckSpeed) + (perlin(st + 10.0, scale * 2.0, u.speckSpeed) * 0.5);
    d = d / 1.5;
    return step(mapRange(u.speckCutoff, 0.0, 100.0, 0.6, 0.7), d);
}

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    let aspectRatio = dims.x / dims.y;
    var uv = fragCoord.xy / dims;

    var color = textureSample(inputTex, samp, uv);
    
    let noiseCoord = uv * vec2<f32>(aspectRatio, 1.0);
    
    if (u.useSpecks != 0) {
        let speckMask = speckle(noiseCoord + u.speckSeed, vec2<f32>(32.0) * mapRange(u.speckScale, 1.0, 5.0, 2.0, 0.5));
        
        if (u.speckMode == 0) {
            color = vec4<f32>(mix(color.rgb, u.speckColor, speckMask), color.a); // color
        } else if (u.speckMode == 1) {
            color = textureSample(inputTex, samp, uv + speckMask * 0.1); // displace
        } else if (u.speckMode == 2) {
            color = vec4<f32>(mix(color.rgb, 1.0 - color.rgb, speckMask), color.a); // invert
        } else if (u.speckMode == 3) {
            color = vec4<f32>(color.rgb * speckMask, color.a); // negative
        }
    }
    
    if (u.useSplats != 0) {
        let splatMask = splat(noiseCoord + u.splatSeed, vec2<f32>(mapRange(u.splatScale, 1.0, 5.0, 2.0, 0.5)));
        
        if (u.splatMode == 0) {
            color = vec4<f32>(mix(color.rgb, u.splatColor, splatMask), color.a); // color
        } else if (u.splatMode == 1) {
            let texColor = textureSample(inputTex, samp, uv + splatMask * 0.1); // displace
            color = mix(color, texColor, splatMask);
        } else if (u.splatMode == 2) {
            color = vec4<f32>(mix(color.rgb, 1.0 - color.rgb, splatMask), color.a); // invert
        } else if (u.splatMode == 3) {
            color = vec4<f32>(color.rgb * mapRange(splatMask * 0.5 - 0.5, -0.25, 0.0, 0.0, 1.0), color.a); // negative
        }
    }
    
    return color;
}

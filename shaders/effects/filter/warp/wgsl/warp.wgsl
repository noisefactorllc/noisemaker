/*
 * Perlin noise-based warp distortion
 */

struct Uniforms {
    strength: f32,
    scale: f32,
    seed: i32,
    speed: i32,
    wrap: i32,
    antialias: i32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;
@group(0) @binding(3) var<uniform> time: f32;

const TAU: f32 = 6.28318530718;

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
    p.x = select(-p.x * 2.0 + 1.0, p.x * 2.0, p.x >= 0.0);
    p.y = select(-p.y * 2.0 + 1.0, p.y * 2.0, p.y >= 0.0);
    p.z = select(-p.z * 2.0 + 1.0, p.z * 2.0, p.z >= 0.0);
    return vec3<f32>(pcg(vec3<u32>(p))) / f32(0xffffffff);
}

fn smootherstep(x: f32) -> f32 {
    return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

fn smoothlerp(x: f32, a: f32, b: f32) -> f32 {
    return a + smootherstep(x) * (b - a);
}

fn grid(st: vec2<f32>, cell: vec2<f32>, t: f32) -> f32 {
    var angle = prng(vec3<f32>(cell, 1.0)).r * TAU;
    angle = angle + t * TAU * f32(uniforms.speed);
    let gradient = vec2<f32>(cos(angle), sin(angle));
    let dist = st - cell;
    return dot(gradient, dist);
}

fn perlinNoise(st_in: vec2<f32>, noiseScale: vec2<f32>, t: f32) -> f32 {
    let st = st_in * noiseScale;
    let cell = floor(st);
    let tl = grid(st, cell, t);
    let tr = grid(st, vec2<f32>(cell.x + 1.0, cell.y), t);
    let bl = grid(st, vec2<f32>(cell.x, cell.y + 1.0), t);
    let br = grid(st, cell + 1.0, t);
    let upper = smoothlerp(st.x - cell.x, tl, tr);
    let lower = smoothlerp(st.x - cell.x, bl, br);
    let val = smoothlerp(st.y - cell.y, upper, lower);
    return val * 0.5 + 0.5;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let aspectRatio = texSize.x / texSize.y;
    var uv = pos.xy / texSize;

    let strength = uniforms.strength;
    let scale = uniforms.scale;
    let seed = uniforms.seed;
    let t = time;

    // Perlin warp — sample both axes before applying either
    let noiseCoord = uv * vec2<f32>(aspectRatio, 1.0);
    let noiseScale = vec2<f32>(abs(scale * 3.0));
    let dx = (perlinNoise(noiseCoord + f32(seed), noiseScale, t) - 0.5) * strength * 0.01;
    let dy = (perlinNoise(noiseCoord + f32(seed) + 10.0, noiseScale, t) - 0.5) * strength * 0.01;
    uv.x = uv.x + dx;
    uv.y = uv.y + dy;

    // Apply wrap mode
    if (uniforms.wrap == 0) {
        // mirror
        uv = abs((uv % 2.0 + 2.0) % 2.0 - 1.0);
    } else if (uniforms.wrap == 1) {
        // repeat
        uv = (uv % 1.0 + 1.0) % 1.0;
    } else {
        // clamp
        uv = clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0));
    }

    if (uniforms.antialias != 0) {
        let dx = dpdx(uv);
        let dy = dpdy(uv);
        var col = vec4<f32>(0.0);
        col += textureSample(inputTex, inputSampler, uv + dx * -0.375 + dy * -0.125);
        col += textureSample(inputTex, inputSampler, uv + dx *  0.125 + dy * -0.375);
        col += textureSample(inputTex, inputSampler, uv + dx *  0.375 + dy *  0.125);
        col += textureSample(inputTex, inputSampler, uv + dx * -0.125 + dy *  0.375);
        return col * 0.25;
    } else {
        return textureSample(inputTex, inputSampler, uv);
    }
}

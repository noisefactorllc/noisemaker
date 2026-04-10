/*
 * Scanline-based data corruption.
 * All corruption operates along horizontal scanlines, simulating linear
 * byte-stream corruption: pixel sorting, horizontal shifting, bit manipulation,
 * and channel separation.
 */

struct Uniforms {
    data: array<vec4<f32>, 3>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var inputTex: texture_2d<f32>;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

// PCG PRNG - MIT License
fn pcg(seed: vec3<u32>) -> vec3<u32> {
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

fn prng(p0: vec3<f32>) -> vec3<f32> {
    var p = p0;
    if (p.x >= 0.0) { p.x = p.x * 2.0; } else { p.x = -p.x * 2.0 + 1.0; }
    if (p.y >= 0.0) { p.y = p.y * 2.0; } else { p.y = -p.y * 2.0 + 1.0; }
    if (p.z >= 0.0) { p.z = p.z * 2.0; } else { p.z = -p.z * 2.0 + 1.0; }
    let u = pcg(vec3<u32>(p));
    return vec3<f32>(u) / f32(0xffffffffu);
}

fn rowTime(row: f32, sd: f32, t: f32) -> f32 {
    let phase = prng(vec3<f32>(row, sd + 777.0, 0.0)).x;
    return floor((t + phase) * 8.0);
}

fn lineHash(line: f32, sd: f32, rt: f32) -> vec3<f32> {
    return prng(vec3<f32>(line, sd, rt));
}

fn pixelSort(uv_in: vec2<f32>, row: f32, sortAmt: f32, rt: f32, sd: f32, resX: f32) -> vec2<f32> {
    var uv = uv_in;
    let rh = lineHash(row, sd, rt);
    let threshold = mix(0.8, 0.2, sortAmt);
    let regionSize = 3.0 + rh.y * 20.0;
    let region = floor(uv.x * resX / regionSize);
    let regionHash = prng(vec3<f32>(region, row, sd + rt));
    let regionPos = fract(uv.x * resX / regionSize);
    let sortShift = regionPos * regionHash.x * sortAmt * 0.15;
    if (regionHash.y > threshold) {
        uv.x = fract(uv.x + sortShift);
    }
    return uv;
}

fn byteShift(uv_in: vec2<f32>, row: f32, shiftAmt: f32, rt: f32, sd: f32, resX: f32) -> vec2<f32> {
    var uv = uv_in;
    let rh = lineHash(row, sd, rt);
    let chunkWidth = 8.0 + rh.x * 80.0;
    let chunk = floor(uv.x * resX / chunkWidth);
    let ch = prng(vec3<f32>(chunk, row + 200.0, sd + rt));
    let shiftPx = (ch.x - 0.5) * 2.0 * shiftAmt * resX * 0.15;
    let sparsity = mix(0.85, 0.3, shiftAmt);
    if (ch.y > sparsity) {
        uv.x = fract(uv.x + shiftPx / resX);
    }
    return uv;
}

fn bitCorrupt(color_in: vec3<f32>, uv: vec2<f32>, row: f32, bitAmt: f32, rt: f32, sd: f32, resX: f32) -> vec3<f32> {
    var color = color_in;
    let bh = lineHash(row + 400.0, sd, rt);
    let levels = mix(256.0, 2.0, bitAmt * bitAmt);
    color = floor(color * levels + 0.5) / levels;
    if (bitAmt > 0.3) {
        let xorStrength = (bitAmt - 0.3) / 0.7;
        let px = floor(uv.x * resX);
        let xorHash = prng(vec3<f32>(px, row, sd + rt + 500.0));
        let mask = step(vec3<f32>(1.0 - xorStrength * 0.5), xorHash);
        color = mix(color, 1.0 - color, mask);
    }
    if (bitAmt > 0.6) {
        let shiftStr = (bitAmt - 0.6) / 0.4;
        let bitShift = floor(bh.x * 4.0) + 1.0;
        let scale = pow(2.0, bitShift);
        color = fract(color * mix(1.0, scale, shiftStr));
    }
    return color;
}

fn meltDisplace(uv_in: vec2<f32>, meltAmt: f32, t: f32, sd: f32, resX: f32) -> vec2<f32> {
    var uv = uv_in;
    let col = floor(uv.x * resX / 3.0);
    let colPhase = prng(vec3<f32>(col, sd + 601.0, 0.0)).x;
    let dripHash = prng(vec3<f32>(col, sd + 600.0, floor((t + colPhase) * 8.0)));
    let gravity = (1.0 - uv.y) * (1.0 - uv.y);
    let dripAmt = dripHash.x * meltAmt * gravity * 0.4;
    let dripProb = mix(0.9, 0.2, meltAmt);
    if (dripHash.y > dripProb) {
        let wobble = sin(uv.y * 20.0 + dripHash.z * TAU + t) * meltAmt * 0.02;
        uv.y = clamp(uv.y + dripAmt, 0.0, 1.0);
        uv.x = fract(uv.x + wobble);
    }
    return uv;
}

fn scatterDisplace(uv_in: vec2<f32>, scatterAmt: f32, t: f32, sd: f32, fragCoord: vec2<f32>) -> vec2<f32> {
    var uv = uv_in;
    let phaseHash = prng(vec3<f32>(floor(fragCoord), sd + 700.0));
    let pixTime = floor((t + phaseHash.x) * 8.0);
    let pixHash = prng(vec3<f32>(floor(fragCoord), pixTime + sd));
    let threshold = mix(0.98, 0.1, scatterAmt * scatterAmt);
    if (pixHash.x > threshold) {
        let dirHash = prng(vec3<f32>(floor(fragCoord) + vec2<f32>(1000.0), pixTime + sd));
        let dist = scatterAmt * 0.15 * (0.5 + pixHash.y * 0.5);
        uv.x = fract(uv.x + (dirHash.x - 0.5) * dist);
        uv.y = clamp(uv.y + (dirHash.y - 0.5) * dist, 0.0, 1.0);
    }
    return uv;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let time = uniforms.data[0].x;
    let seed = uniforms.data[0].y;
    let intensity = uniforms.data[0].z;
    let sort = uniforms.data[0].w;

    let shift = uniforms.data[1].x;
    let bits = uniforms.data[1].y;
    let channelShift = uniforms.data[1].z;
    let speed = uniforms.data[1].w;

    let melt = uniforms.data[2].x;
    let scatter = uniforms.data[2].y;
    let bandHeight = uniforms.data[2].z;

    let resolution = vec2<f32>(textureDimensions(inputTex));
    let resX = resolution.x;
    let uv = pos.xy / resolution;
    let spd = floor(speed);
    let t = time * TAU * spd;

    // Scanline grouping
    let rawRow = pos.y;
    let bh = max(1.0, floor(bandHeight * 0.32));
    let row = floor(rawRow / bh);

    // Per-row staggered time
    let rt = rowTime(row, seed, t);

    // Per-scanline corruption probability
    let rowHash = lineHash(row, seed, rt);
    let prob = intensity / 100.0;
    let isCorrupt = rowHash.x < prob;

    var sampleUv = uv;

    // 2D effects (not band-based)
    let meltAmt = melt / 100.0;
    if (meltAmt > 0.0) {
        sampleUv = meltDisplace(sampleUv, meltAmt, t, seed, resX);
    }
    let scatterAmt = scatter / 100.0;
    if (scatterAmt > 0.0) {
        sampleUv = scatterDisplace(sampleUv, scatterAmt, t, seed, pos.xy);
    }

    // Band-based corruption to UV
    if (isCorrupt) {
        let sortAmt = sort / 100.0;
        let shiftAmt = shift / 100.0;
        if (sortAmt > 0.0) {
            sampleUv = pixelSort(sampleUv, row, sortAmt, rt, seed, resX);
        }
        if (shiftAmt > 0.0) {
            sampleUv = byteShift(sampleUv, row, shiftAmt, rt, seed, resX);
        }
    }

    // Sample color from input. Use textureSampleLevel because the channel-shift
    // and bit-corruption branches below depend on per-pixel values, which
    // disqualifies plain textureSample (which requires uniform control flow
    // for implicit derivatives). textureSampleLevel takes an explicit mip
    // level, no derivatives needed. These shaders don't use mipmaps anyway.
    var color = textureSampleLevel(inputTex, samp, sampleUv, 0.0).rgb;

    // Channel separation
    if (channelShift > 0.0 && isCorrupt) {
        let chAmt = channelShift / 100.0;
        let chHash = lineHash(row + 300.0, seed, rt);
        let rShift = (chHash.x - 0.5) * chAmt * 0.08;
        let bShift = (chHash.y - 0.5) * chAmt * 0.08;
        let rUv = vec2<f32>(fract(sampleUv.x + rShift), sampleUv.y);
        let bUv = vec2<f32>(fract(sampleUv.x + bShift), sampleUv.y);
        color.r = textureSampleLevel(inputTex, samp, rUv, 0.0).r;
        color.b = textureSampleLevel(inputTex, samp, bUv, 0.0).b;
    }

    // Bit corruption
    if (bits > 0.0 && isCorrupt) {
        color = bitCorrupt(color, uv, row, bits / 100.0, rt, seed, resX);
    }

    return vec4<f32>(color, 1.0);
}

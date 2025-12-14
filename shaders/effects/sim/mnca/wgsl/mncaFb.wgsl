/*
 * Multi-neighbourhood cellular automata feedback pass.
 *
 * Evolves the automaton by sampling two concentric neighbourhoods and mapping
 * their averages through UI-configurable threshold windows. The luminance
 * blend mirrors the single-neighbourhood shader so modulation rules stay
 * consistent across module variants.
 */

struct Uniforms {
    data : array<vec4<f32>, 6>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var bufTex: texture_2d<f32>;
@group(0) @binding(3) var seedTex: texture_2d<f32>;

fn map(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn lum(color: vec3<f32>) -> f32 {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

fn random(st: vec2<f32>) -> f32 {
    return fract(sin(dot(st, vec2<f32>(12.9898, 78.233))) * 43758.5453123);
}

// Clamp a texel coordinate to the valid texture bounds
fn clampCoord(p: vec2<i32>, size: vec2<i32>) -> vec2<i32> {
    let cx = clamp(p.x, 0, size.x - 1);
    let cy = clamp(p.y, 0, size.y - 1);
    return vec2<i32>(cx, cy);
}

// Fetch a single cell value using integer coordinates to avoid filtering
fn cellAt(base: vec2<i32>, offset: vec2<i32>, size: vec2<i32>) -> f32 {
    let pc = clampCoord(base + offset, size);
    return textureLoad(bufTex, pc, 0).r;
}

// Neighbourhood 1 = circle with r = 3.
fn neighborsAvgCircle(base: vec2<i32>, size: vec2<i32>) -> f32 {
    var total: f32 = 0.0;
    for (var y: i32 = -3; y <= 3; y++) {
        for (var x: i32 = -3; x <= 3; x++) {
            if (x == 0 && y == 0) { continue; }
            if (abs(x) == 3 && abs(y) > 1) { continue; }
            if (abs(y) == 3 && abs(x) > 1) { continue; }
            total += cellAt(base, vec2<i32>(x, y), size);
        }
    }
    return total / 36.0;
}

// Neighbourhood 2 = ring with inner r = 4 and outer r = 7.
fn neighborsAvgRing(base: vec2<i32>, size: vec2<i32>) -> f32 {
    var total: f32 = 0.0;
    for (var y: i32 = -7; y <= 7; y++) {
        for (var x: i32 = -7; x <= 7; x++) {
            // ignore inner area
            if (abs(x) <= 3 && abs(y) <= 3) { continue; }
            if (abs(x) == 4 && abs(y) <= 2) { continue; }
            if (abs(y) == 4 && abs(x) <= 2) { continue; }
            // ignore outer corners 
            if (abs(x) == 7 && abs(y) > 2) { continue; }
            if (abs(x) == 6 && abs(y) > 4) { continue; }
            if (abs(x) == 5 && abs(y) > 5) { continue; }
            if (abs(x) > 2 && abs(y) > 6) { continue; }
            total += cellAt(base, vec2<i32>(x, y), size);
        }
    }
    return total / 108.0;
}

fn getState(avg1: f32, avg2: f32, state: f32,
            n1v1: f32, n1r1: f32, n1v2: f32, n1r2: f32,
            n1v3: f32, n1r3: f32, n1v4: f32, n1r4: f32,
            n2v1: f32, n2r1: f32, n2v2: f32, n2r2: f32) -> f32 {
    var newState: f32 = state;
    if (avg1 >= n1v1 * 0.01 && avg1 <= n1v1 * 0.01 + n1r1 * 0.01) { newState = 1.0; }
    if (avg1 >= n1v2 * 0.01 && avg1 <= n1v2 * 0.01 + n1r2 * 0.01) { newState = 0.0; }
    if (avg1 >= n1v3 * 0.01 && avg1 <= n1v3 * 0.01 + n1r3 * 0.01) { newState = 0.0; }
    if (avg2 >= n2v1 * 0.01 && avg2 <= n2v1 * 0.01 + n2r1 * 0.01) { newState = 0.0; }
    if (avg2 >= n2v2 * 0.01 && avg2 <= n2v2 * 0.01 + n2r2 * 0.01) { newState = 1.0; }
    if (avg1 >= n1v4 * 0.01 && avg1 <= n1v4 * 0.01 + n1r4 * 0.01) { newState = 0.0; }
    return newState;
}

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let texSizeI: vec2<i32> = vec2<i32>(textureDimensions(bufTex, 0));
    let texSize: vec2<f32> = vec2<f32>(f32(texSizeI.x), f32(texSizeI.y));
    let uv: vec2<f32> = fragCoord.xy / texSize;

    // Extract parameters from uniforms
    // Slot 0: resolution, time, deltaTime
    let deltaTime: f32 = uniforms.data[0].w;

    // Slot 1: speed, smoothing, weight, seed
    let speed: f32 = uniforms.data[1].x;
    let weight: f32 = uniforms.data[1].z;
    let seed: f32 = uniforms.data[1].w;

    // Slot 2: resetState, n1v1, n1r1, n1v2
    let resetState: bool = uniforms.data[2].x > 0.5;
    let n1v1: f32 = uniforms.data[2].y;
    let n1r1: f32 = uniforms.data[2].z;
    let n1v2: f32 = uniforms.data[2].w;

    // Slot 3: n1r2, n1v3, n1r3, n1v4
    let n1r2: f32 = uniforms.data[3].x;
    let n1v3: f32 = uniforms.data[3].y;
    let n1r3: f32 = uniforms.data[3].z;
    let n1v4: f32 = uniforms.data[3].w;

    // Slot 4: n1r4, n2v1, n2r1, n2v2
    let n1r4: f32 = uniforms.data[4].x;
    let n2v1: f32 = uniforms.data[4].y;
    let n2r1: f32 = uniforms.data[4].z;
    let n2v2: f32 = uniforms.data[4].w;

    // Slot 5: n2r2
    let n2r2: f32 = uniforms.data[5].x;

    // Sample textures unconditionally to satisfy uniform control flow requirement
    let prevFrame: vec3<f32> = textureSample(seedTex, samp, uv).rgb;
    let prevLum: f32 = lum(prevFrame);

    // Use UV-derived coordinates (not fragCoord) to handle resolution mismatch between output and feedback texture
    let base: vec2<i32> = vec2<i32>(i32(uv.x * texSize.x), i32(uv.y * texSize.y));
    let bufState: vec4<f32> = textureLoad(bufTex, clampCoord(base, texSizeI), 0);
    let state: f32 = bufState.r;
    let bufferIsEmpty: bool = (bufState.r == 0.0 && bufState.g == 0.0 && bufState.b == 0.0 && bufState.a == 0.0);

    // Initialize when reset button pressed or when buffer is completely empty (first load)
    if (resetState || bufferIsEmpty) {
        let r: f32 = random(uv + vec2<f32>(seed, seed));
        let alive: f32 = step(0.5, r);
        return vec4<f32>(alive, alive, alive, 1.0);
    }

    let n1: f32 = neighborsAvgCircle(base, texSizeI);
    let n2: f32 = neighborsAvgRing(base, texSizeI);
    var newState: f32 = getState(n1, n2, state, n1v1, n1r1, n1v2, n1r2, n1v3, n1r3, n1v4, n1r4, n2v1, n2r1, n2v2, n2r2);

    if (weight > 0.0) {
        newState = mix(newState, prevLum, weight * 0.01);
    }

    // The speed knob expresses human-friendly BPM-style values; remapping keeps
    // the integration step numerically stable across refresh rates.
    let animSpeed: f32 = map(speed, 1.0, 100.0, 0.1, 100.0);
    let currentState: vec4<f32> = vec4<f32>(state, state, state, 1.0);
    let nextState: vec4<f32> = vec4<f32>(newState, newState, newState, 1.0);
    return mix(currentState, nextState, min(1.0, deltaTime * animSpeed));
}

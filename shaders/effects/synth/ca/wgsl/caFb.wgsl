/*
 * Cellular automata feedback pass.
 *
 * This shader advances the ping-pong buffer by evaluating a neighbourhood
 * count against a curated ruleset or custom birth/survival tables provided
 * by the UI.  When `source` is set, the previous compositing stage is sampled
 * and luminance blended into the automata to support audio/video driven
 * perturbations without breaking the automata's binary storage format.
 */

struct Uniforms {
    data : array<vec4<f32>, 7>,
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

/*
Rulesets

Name                    Born                Survive
-----------------------------------------------------
Classic Life            3                   23
Highlife                36                  23
Seeds                   2                   -
Coral                   38                  23
Day & Night             3678                34678
Life Without Death      3                   012345678
Replicator              1357                1357
Amoeba                  357                 1358
Maze                    3                   12345
Glider Walk             25                  4
Diamoeba                35678               5678
2x2                     36                  125
Morley                  368                 245
Anneal                  4678                35678
34 Life                 34                  34

Simple Replicator       368                 12578       
Waffles                 36                  245
Pond Life               37                  23
*/

// Determine if cell should be born based on state of neighbors (n)
fn shouldBeBorn(n: i32, ruleIndex: i32) -> bool {
    var should: bool = false;

    if (ruleIndex == 0 || ruleIndex == 5 || ruleIndex == 8) {
        should = n == 3;                                        // Classic Life, Life w/o Death, Maze: B3
    } else if (ruleIndex == 1 || ruleIndex == 11 || ruleIndex == 16) {
        should = n == 3 || n == 6;                              // Highlife, 2x2, Waffles: B36
    } else if (ruleIndex == 2) {
        should = n == 2;                                        // Seeds: B2
    } else if (ruleIndex == 3) {
        should = n == 3 || n == 8;                              // Coral: B38 
    } else if (ruleIndex == 4) {
        should = n == 3 || n == 6 || n == 7 || n == 8;          // Day & Night: B3678  
    } else if (ruleIndex == 6) {
        should = n == 1 || n == 3 || n == 5 || n == 7;          // Replicator: B1357
    } else if (ruleIndex == 7) {
        should = n == 3 || n == 5 || n == 7;                    // Amoeba: B357
    } else if (ruleIndex == 9) {
        should = n == 2 || n == 5;                              // Glider Walk: B25 
    } else if (ruleIndex == 10) {
        should = n == 3 || n >= 5;                              // Diamoeba: B35678
    } else if (ruleIndex == 12) {
        should = n == 3 || n == 6 || n == 8;                    // Morley: B368 
    } else if (ruleIndex == 13) {
        should = n == 4 || n == 6 || n == 7 || n == 8;          // Anneal: B4678 
    } else if (ruleIndex == 14) {
        should = n == 3 || n == 4;                              // 34 Life: B34
    } else if (ruleIndex == 15) {
        should = n == 3 || n == 6 || n == 8;                    // Simple Replicator: B368
    } else if (ruleIndex == 17) {
        should = n == 3 || n == 7;                              // Pond Life: B37
    }

    return should;
}

// Determine if cell should survive based on state of neighbors (n)
fn shouldSurvive(n: i32, current: f32, ruleIndex: i32) -> bool {
    var should: bool = false;

    if (ruleIndex == 0 || ruleIndex == 1 || ruleIndex == 3 || ruleIndex == 17) {
        should = n == 2 || n == 3;                              // Classic Life, Highlife, Coral, Pond Life: S23
    } else if (ruleIndex == 2) {
        should = false;                                         // Seeds: no survival
    } else if (ruleIndex == 4) {
        should = n == 3 || n == 4 || n == 6 || n == 7 || n == 8;  // Day & Night: S34678
    } else if (ruleIndex == 5) {
        should = true;                                          // Life w/o Death: S012345678
    } else if (ruleIndex == 6) {
        should = n == 1 || n == 3 || n == 5 || n == 7;          // Replicator: S1357
    } else if (ruleIndex == 7) {
        should = n == 1 || n == 3 || n == 5 || n == 8;          // Amoeba: S1358
    } else if (ruleIndex == 8) {
        should = n >= 1 && n <= 5;                              // Maze: S12345
    } else if (ruleIndex == 9) {
        should = n == 4;                                        // Glider Walk: S4
    } else if (ruleIndex == 10) {
        should = n >= 5;                                        // Diamoeba: S5678
    } else if (ruleIndex == 11) {
        should = n == 1 || n == 2 || n == 5;                    // 2x2: S125
    } else if (ruleIndex == 12 || ruleIndex == 16) {
        should = n == 2 || n == 4 || n == 5;                    // Morley, Waffles: S245
    } else if (ruleIndex == 13) {
        should = n == 3 || n >= 5;                              // Anneal: S35678
    } else if (ruleIndex == 14) {
        should = n == 3 || n == 4;                              // 34 Life: S34
    } else if (ruleIndex == 15) {
        should = n == 1 || n == 2 || n == 5 || n >= 7;          // Simple Replicator: S12578
    }

    if (current < 0.5) { should = false; }

    return should;
}

fn shouldBeBornCustom(n: i32, bornMask0: vec4<f32>, bornMask1: vec4<f32>, bornMask2: f32) -> bool {
    if (n == 0) { return bornMask0.x > 0.5; }
    else if (n == 1) { return bornMask0.y > 0.5; }
    else if (n == 2) { return bornMask0.z > 0.5; }
    else if (n == 3) { return bornMask0.w > 0.5; }
    else if (n == 4) { return bornMask1.x > 0.5; }
    else if (n == 5) { return bornMask1.y > 0.5; }
    else if (n == 6) { return bornMask1.z > 0.5; }
    else if (n == 7) { return bornMask1.w > 0.5; }
    else if (n == 8) { return bornMask2 > 0.5; }
    return false;
}

fn shouldSurviveCustom(n: i32, current: f32, surviveMask0: vec3<f32>, surviveMask1: vec4<f32>, surviveMask2: vec2<f32>) -> bool {
    var should: bool = false;
    if (n == 0) { should = surviveMask0.x > 0.5; }
    else if (n == 1) { should = surviveMask0.y > 0.5; }
    else if (n == 2) { should = surviveMask0.z > 0.5; }
    else if (n == 3) { should = surviveMask1.x > 0.5; }
    else if (n == 4) { should = surviveMask1.y > 0.5; }
    else if (n == 5) { should = surviveMask1.z > 0.5; }
    else if (n == 6) { should = surviveMask1.w > 0.5; }
    else if (n == 7) { should = surviveMask2.x > 0.5; }
    else if (n == 8) { should = surviveMask2.y > 0.5; }

    if (current < 0.5) { should = false; }
    return should;
}

// Clamp a texel coordinate to the valid texture bounds
fn clampCoord(p: vec2<i32>, size: vec2<i32>) -> vec2<i32> {
    let cx = clamp(p.x, 0, size.x - 1);
    let cy = clamp(p.y, 0, size.y - 1);
    return vec2<i32>(cx, cy);
}

// Fetch a single cell value using integer coordinates to avoid filtering
fn cellAt(p: vec2<i32>, size: vec2<i32>) -> f32 {
    let pc = clampCoord(p, size);
    return textureLoad(bufTex, pc, 0).r;
}

// Count Moore-neighbourhood alive cells around base pixel
fn countNeighbors(base: vec2<i32>, size: vec2<i32>) -> i32 {
    var count: i32 = 0;
    for (var dy: i32 = -1; dy <= 1; dy++) {
        for (var dx: i32 = -1; dx <= 1; dx++) {
            if (dx == 0 && dy == 0) { continue; }
            let n: f32 = cellAt(base + vec2<i32>(dx, dy), size);
            count += i32(n > 0.5);
        }
    }
    return count;
}

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize: vec2<f32> = vec2<f32>(textureDimensions(bufTex, 0));
    let texSizeI: vec2<i32> = vec2<i32>(textureDimensions(bufTex, 0));
    let uv: vec2<f32> = fragCoord.xy / texSize;

    // Extract parameters from uniforms - precise mapping from hooks.js and
    // the framebuffer layout in uniforms.json. Slots 0-2 mirror the runtime's
    // timing metadata, slot 1 stores the primary CA controls, and slots 2-6
    // pack the custom rule masks alongside the input source selector.
    let deltaTime: f32 = uniforms.data[0].y;
    let seed: f32 = uniforms.data[0].z;
    let resetState: bool = uniforms.data[0].w > 0.5;
    let ruleIndex: i32 = i32(uniforms.data[1].x);
    let speed: f32 = uniforms.data[1].y;
    let weight: f32 = uniforms.data[1].z;
    let useCustom: bool = uniforms.data[1].w > 0.5;

    let bornMask0: vec4<f32> = uniforms.data[2];
    let bornMask1: vec4<f32> = uniforms.data[3];
    let bornMask2: f32 = uniforms.data[4].x;
    let surviveMask0: vec3<f32> = uniforms.data[4].yzw;
    let surviveMask1: vec4<f32> = uniforms.data[5];
    let surviveMask2: vec2<f32> = uniforms.data[6].xy;
    let source: i32 = i32(uniforms.data[6].z);

    // Sample all 4 channels to check if buffer is truly empty
    let base: vec2<i32> = vec2<i32>(i32(fragCoord.x), i32(fragCoord.y));
    let bufState: vec4<f32> = textureLoad(bufTex, clampCoord(base, texSizeI), 0);
    let state: f32 = bufState.r;
    let bufferIsEmpty: bool = (bufState.r == 0.0 && bufState.g == 0.0 && bufState.b == 0.0 && bufState.a == 0.0);

    // Sample previous frame for luminance-based perturbation (must be before early return for uniform control flow)
    let prevFrame: vec3<f32> = textureSample(seedTex, samp, uv).rgb;
    let prevLum: f32 = lum(prevFrame);

    // Initialize when reset button pressed or when buffer is completely empty (first load)
    if (resetState || bufferIsEmpty) {
        let r: f32 = random(uv + vec2<f32>(seed, seed));
        let alive: f32 = step(0.5, r);
        return vec4<f32>(alive, alive, alive, 1.0);
    }

    let prevFrameCoord: vec2<f32> = vec2<f32>(fragCoord.x / texSize.x, 1.0 - fragCoord.y / texSize.y);

    let neighbors: i32 = countNeighbors(base, texSizeI);

    var newState: f32 = state;

    if (useCustom) {
        if (shouldBeBornCustom(neighbors, bornMask0, bornMask1, bornMask2)) {
            newState = 1.0;
        } else if (shouldSurviveCustom(neighbors, state, surviveMask0, surviveMask1, surviveMask2)) {
            newState = 1.0;
        } else {
            newState = 0.0;
        }
    } else {
        if (shouldBeBorn(neighbors, ruleIndex)) {
            newState = 1.0;
        } else if (shouldSurvive(neighbors, state, ruleIndex)) {
            newState = 1.0;
        } else {
            newState = 0.0;
        }
    }

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

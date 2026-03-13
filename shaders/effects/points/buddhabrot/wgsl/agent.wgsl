// Buddhabrot Agent Shader
// 3 MRT outputs — matches pointsEmit layout

struct Uniforms {
    time: f32,
    resolution: vec2<f32>,
    seed: i32,
    maxIter: i32,
    minIter: i32,
    mode: i32,
    zoom: f32,
    centerX: f32,
    centerY: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var xyzTex: texture_2d<f32>;
@group(0) @binding(3) var velTex: texture_2d<f32>;
@group(0) @binding(5) var rgbaTex: texture_2d<f32>;

struct Outputs {
    @location(0) outXYZ: vec4<f32>,
    @location(1) outVel: vec4<f32>,
    @location(2) outRGBA: vec4<f32>,
};

fn hash_uint(seed: u32) -> u32 {
    var state = seed * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn hash(seed: u32) -> f32 {
    return f32(hash_uint(seed)) / 4294967295.0;
}

fn complexToScreen(z: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(
        (z.y - u.centerY) * u.zoom * u.zoom * 0.2 + 0.5,
        (u.centerX - z.x) * u.zoom * u.zoom * 0.2 + 0.5,
    );
}

fn inMandelbrotInterior(cRe: f32, cIm: f32) -> bool {
    let y2 = cIm * cIm;
    let q = (cRe - 0.25) * (cRe - 0.25) + y2;
    if (q * (q + (cRe - 0.25)) <= 0.25 * y2) { return true; }
    let xp1 = cRe + 1.0;
    return xp1 * xp1 + y2 <= 0.0625;
}

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> Outputs {
    let coord = vec2<i32>(fragCoord.xy);
    let texSize = textureDimensions(xyzTex, 0);
    let stateSize = i32(texSize.x);

    let pos = textureLoad(xyzTex, coord, 0);
    let vel = textureLoad(velTex, coord, 0);
    let col = textureLoad(rgbaTex, coord, 0);

    if (pos.w < 0.5) {
        return Outputs(pos, vel, col);
    }

    let agentSeed = hash_uint(u32(coord.x + coord.y * stateSize))
                  ^ u32(u.time * 65536.0)
                  ^ u32(vel.z * 137.0);

    let needsInit = pos.z < 0.25;

    if (needsInit) {
        let cRe = hash(agentSeed) * 3.5 - 2.5;
        let cIm = hash(agentSeed + 1u) * 3.0 - 1.5;

        if (u.mode == 0 && inMandelbrotInterior(cRe, cIm)) {
            return Outputs(
                vec4<f32>(pos.xy, 0.0, 0.0),
                vel,
                vec4<f32>(0.0, 0.0, 0.0, 0.0),
            );
        }

        var z = vec2<f32>(0.0, 0.0);
        var escapeAt: i32 = 0;
        let iterCap = min(u.maxIter, 2048);

        for (var i: i32 = 0; i < 2048; i = i + 1) {
            if (i >= iterCap) { break; }
            let zr = z.x * z.x - z.y * z.y + cRe;
            let zi = 2.0 * z.x * z.y + cIm;
            z = vec2<f32>(zr, zi);
            if (dot(z, z) > 4.0) {
                escapeAt = i + 1;
                break;
            }
        }

        let escaped = escapeAt > 0;
        var escapeStep: f32 = 0.0;
        var brightness: f32 = 0.0;

        if (u.mode == 0) {
            if (escaped && escapeAt >= u.minIter) {
                escapeStep = f32(escapeAt);
                brightness = 0.03;
            }
        } else {
            if (!escaped) {
                escapeStep = f32(iterCap);
                brightness = 0.03;
            }
        }

        if (brightness == 0.0) {
            return Outputs(
                vec4<f32>(pos.xy, 0.0, 0.0),
                vel,
                vec4<f32>(0.0, 0.0, 0.0, 0.0),
            );
        }

        // Start deposit at z₁ = c
        let screen = complexToScreen(vec2<f32>(cRe, cIm));

        return Outputs(
            vec4<f32>(screen, 0.5, 1.0),
            vec4<f32>(cRe, cIm, 1.0, escapeStep),
            vec4<f32>(brightness, brightness, brightness, 1.0),
        );
    }

    // ---- Active deposit phase ----
    // Recompute z from scratch using c and step count (no texture dependency)

    let cRe = vel.x;
    let cIm = vel.y;
    var step = vel.z;
    let escapeStep = vel.w;

    // Recompute z to current step from z₀ = 0
    var z = vec2<f32>(0.0, 0.0);
    let currentStep = i32(step);
    for (var i: i32 = 0; i < 2048; i = i + 1) {
        if (i >= currentStep) { break; }
        let zr = z.x * z.x - z.y * z.y + cRe;
        let zi = 2.0 * z.x * z.y + cIm;
        z = vec2<f32>(zr, zi);
    }

    // Advance 8 more steps
    for (var s: i32 = 0; s < 8; s = s + 1) {
        step = step + 1.0;

        if (step >= escapeStep) {
            return Outputs(
                vec4<f32>(pos.xy, 0.0, 0.0),
                vec4<f32>(0.0, 0.0, step, 0.0),
                vec4<f32>(0.0, 0.0, 0.0, 0.0),
            );
        }

        let zr = z.x * z.x - z.y * z.y + cRe;
        let zi = 2.0 * z.x * z.y + cIm;
        z = vec2<f32>(zr, zi);
    }

    let screen = complexToScreen(z);

    return Outputs(
        vec4<f32>(screen, 0.5, 1.0),
        vec4<f32>(cRe, cIm, step, escapeStep),
        col,
    );
}

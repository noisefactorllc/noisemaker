/*
 * Scratches - film scratch overlay using worm tracing (single-pass)
 *
 * 4 layers of worm traces, each max-blended.
 * Low kink produces nearly-straight scratches.
 * Subtractive noise creates breaks/gaps.
 * Bright white scratches (mask * 8.0, clamped).
 */

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var<uniform> time : f32;
@group(0) @binding(3) var<uniform> density : f32;
@group(0) @binding(4) var<uniform> alpha : f32;
@group(0) @binding(5) var<uniform> seed : f32;
@group(0) @binding(6) var<uniform> speed : f32;

const TAU : f32 = 6.283185307179586;

fn pcg(v : u32) -> u32 {
    let state : u32 = v * 747796405u + 2891336453u;
    let word : u32 = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn hashf(n : u32) -> f32 {
    return f32(pcg(n)) / 4294967295.0;
}

fn glsl_mod(x : f32, y : f32) -> f32 {
    return x - y * floor(x / y);
}

fn valueNoise(uv : vec2<f32>, freq : f32, nSeed : u32) -> f32 {
    let p : vec2<f32> = uv * freq;
    let cell : vec2<f32> = floor(p);
    var f : vec2<f32> = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    let tl : f32 = hashf(pcg(u32(cell.x * 73.0 + cell.y * 157.0) + nSeed));
    let tr : f32 = hashf(pcg(u32((cell.x + 1.0) * 73.0 + cell.y * 157.0) + nSeed));
    let bl : f32 = hashf(pcg(u32(cell.x * 73.0 + (cell.y + 1.0) * 157.0) + nSeed));
    let br : f32 = hashf(pcg(u32((cell.x + 1.0) * 73.0 + (cell.y + 1.0) * 157.0) + nSeed));
    return mix(mix(tl, tr, f.x), mix(bl, br, f.x), f.y);
}

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    let dims : vec2<u32> = textureDimensions(inputTex, 0);
    if (dims.x == 0u || dims.y == 0u) {
        return vec4<f32>(0.0);
    }

    let resolution : vec2<f32> = vec2<f32>(f32(dims.x), f32(dims.y));
    let uv : vec2<f32> = position.xy / resolution;
    let coord : vec2<i32> = vec2<i32>(i32(position.x), i32(position.y));
    let base : vec4<f32> = textureLoad(inputTex, coord, 0);

    let maxDim : f32 = max(resolution.x, resolution.y);
    let seedBase : u32 = u32(seed) * 99991u;

    // Time-varying seed for animation
    let timeSeed : u32 = u32(floor(time * speed * 2.0));

    var scratchMask : f32 = 0.0;

    // 4 layers of scratches
    for (var layer : i32 = 0; layer < 4; layer = layer + 1) {
        let lSeed : u32 = pcg(seedBase + u32(layer) * 77773u + timeSeed * 33331u);

        // Worm count: 2-6 worms per layer (kept low for fragment shader perf)
        let wormCount : i32 = i32(2.0 + hashf(lSeed) * 4.0);

        // Low kink: 0.125 + rand * 0.125
        let kink : f32 = 0.125 + hashf(lSeed + 1u) * 0.125;

        // Duration: 18-25 steps
        let steps : i32 = 18 + i32(hashf(lSeed + 2u) * 7.0);

        // Stride (longer per step to maintain scratch length)
        let baseStride : f32 = maxDim * 1.0 / f32(steps);

        // Behavior: obedient (0) or chaotic (1)
        let behavior : i32 = i32(hashf(lSeed + 3u) * 2.0);

        // Obedient: all worms share one heading
        let sharedAngle : f32 = hashf(lSeed + 4u) * TAU;

        // Subtractive noise freq 2-4
        let subFreq : f32 = 2.0 + hashf(lSeed + 7u) * 2.0;
        let subSeed : u32 = pcg(lSeed + 8u);

        // Trail width: ~6px at 1024 (wider to compensate for fewer worms)
        let trailWidth : f32 = maxDim / 170.0;

        var layerMask : f32 = 0.0;

        for (var w : i32 = 0; w < 6; w = w + 1) {
            if (w >= wormCount) { break; }

            let wSeed : u32 = lSeed + u32(w) * 13337u + 10000u;

            // Random start position
            var wx : f32 = hashf(wSeed) * resolution.x;
            var wy : f32 = hashf(wSeed + 1u) * resolution.y;

            // Per-worm stride deviation
            let wStride : f32 = baseStride + (hashf(wSeed + 2u) - 0.5) * baseStride * 0.5;

            // Per-worm angle (chaotic mode)
            let wormAngle : f32 = hashf(wSeed + 3u) * TAU;

            for (var s : i32 = 0; s < 25; s = s + 1) {
                if (s >= steps) { break; }

                // Distance check with wrapping
                var diff : vec2<f32> = position.xy - vec2<f32>(wx, wy);
                if (diff.x > resolution.x * 0.5) { diff.x = diff.x - resolution.x; }
                if (diff.x < -resolution.x * 0.5) { diff.x = diff.x + resolution.x; }
                if (diff.y > resolution.y * 0.5) { diff.y = diff.y - resolution.y; }
                if (diff.y < -resolution.y * 0.5) { diff.y = diff.y + resolution.y; }

                let dist : f32 = length(diff);
                if (dist < trailWidth) {
                    layerMask = layerMask + 1.0 - dist / trailWidth;
                }

                // Cheap per-step angle perturbation (no texture/noise lookup)
                let perturbation : f32 = (hashf(wSeed + u32(s) * 7919u) - 0.5) * kink * TAU;

                var angle : f32;
                if (behavior == 0) {
                    angle = sharedAngle + perturbation;
                } else {
                    angle = wormAngle + perturbation;
                }

                wx = glsl_mod(wx + cos(angle) * wStride, resolution.x);
                wy = glsl_mod(wy + sin(angle) * wStride, resolution.y);
            }
        }

        // Subtractive noise creates breaks
        let subNoise : f32 = valueNoise(uv, subFreq, subSeed) * 2.0;
        layerMask = max(layerMask - subNoise, 0.0);

        // Bright: mask * 8.0, clamped — max-blend across layers
        scratchMask = max(scratchMask, min(layerMask * 8.0, 1.0));
    }

    // Density controls scratch intensity, alpha controls blend with input
    let scratchStrength : f32 = scratchMask * density;
    let scratched : vec3<f32> = max(base.rgb, vec3<f32>(scratchStrength));
    let finalResult : vec3<f32> = mix(base.rgb, scratched, alpha);

    return vec4<f32>(finalResult, base.a);
}

/*
 * Stray Hair - sparse dark worm traces over the image (single-pass)
 *
 * Traces worms through a procedural low-freq noise flow field.
 * Unruly behavior: base rotation + per-worm variation.
 * Dark strands, like hairs on a camera lens.
 */

@group(0) @binding(0) var inputSampler : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;

struct Uniforms {
    time : f32,
    density : f32,
    seed : f32,
    alpha : f32,
}
@group(0) @binding(2) var<uniform> uniforms : Uniforms;

const TAU : f32 = 6.283185307179586;

fn glsl_mod(x : f32, y : f32) -> f32 {
    return x - y * floor(x / y);
}

fn pcg(v : u32) -> u32 {
    let state = v * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn hashf(n : u32) -> f32 {
    return f32(pcg(n)) / 4294967295.0;
}

@fragment
fn main(@builtin(position) fragCoord : vec4<f32>, @location(0) v_texCoord : vec2<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    let uv = fragCoord.xy / dims;
    let base = textureSample(inputTex, inputSampler, uv);

    let maxDim = max(dims.x, dims.y);
    let seedBase = u32(uniforms.seed) * 99991u;

    // Density: 2..5 worms, trail width scales
    let wormCount = 2 + i32(uniforms.density * 3.0);
    let kink = 3.0 + hashf(seedBase + 600u) * 7.0;
    let trailWidth = maxDim / 48.0 * (0.5 + uniforms.density);
    let baseRot = hashf(seedBase + 700u) * TAU;
    let noiseSeed = pcg(seedBase + 800u);

    var totalMask : f32 = 0.0;

    for (var w : i32 = 0; w < 5; w = w + 1) {
        if (w >= wormCount) {
            break;
        }

        let wSeed = seedBase + u32(w) * 13337u;
        var wy = hashf(wSeed) * dims.y;
        var wx = hashf(wSeed + 1u) * dims.x;
        let wormVar = (hashf(wSeed + 2u) - 0.5) * 0.25;

        // Large stride for long sweeping trails
        let wStride = maxDim / 40.0 + (hashf(wSeed + 3u) - 0.5) * maxDim / 80.0;

        for (var step : i32 = 0; step < 40; step = step + 1) {
            let t = f32(step) / 39.0;
            let exposure = 1.0 - abs(1.0 - t * 2.0);

            var diff = fragCoord.xy - vec2<f32>(wx, wy);
            if (diff.x > dims.x * 0.5) { diff.x = diff.x - dims.x; }
            if (diff.x < -dims.x * 0.5) { diff.x = diff.x + dims.x; }
            if (diff.y > dims.y * 0.5) { diff.y = diff.y - dims.y; }
            if (diff.y < -dims.y * 0.5) { diff.y = diff.y + dims.y; }

            let dist = length(diff);
            if (dist < trailWidth) {
                totalMask = totalMask + exposure * (1.0 - dist / trailWidth);
            }

            // Flow field: 8x8 grid hash for gentle direction changes
            let wormUv = vec2<f32>(glsl_mod(wx, dims.x), glsl_mod(wy, dims.y)) / dims;
            let cell = floor(wormUv * 8.0);
            let field = hashf(noiseSeed + u32(cell.x * 73.0 + cell.y * 157.0));
            let flowAngle = field * TAU * kink + baseRot + wormVar;

            wy = glsl_mod(wy + cos(flowAngle) * wStride, dims.y);
            wx = glsl_mod(wx + sin(flowAngle) * wStride, dims.x);
        }
    }

    var mask = sqrt(clamp(totalMask, 0.0, 1.0));

    // Brightness noise (freq=32), multiply by 0.333 for dark strands
    let quantized = floor(fragCoord.xy / (dims / 32.0));
    let bSeed = seedBase + 999983u;
    let brightness = vec3<f32>(
        hashf(bSeed + u32(quantized.x * 73.0 + quantized.y * 157.0)),
        hashf(bSeed + u32(quantized.x * 79.0 + quantized.y * 311.0)),
        hashf(bSeed + u32(quantized.x * 83.0 + quantized.y * 191.0))
    ) * 0.333;

    // Python: blend(tensor, brightness * 0.333, mask * 0.666)
    let blendAmt = mask * 0.666 * uniforms.alpha;

    // Subtle global lens grime — density affects overall darkening
    let grime = 1.0 - uniforms.density * 0.05 * uniforms.alpha;
    let result = mix(base.rgb * grime, brightness, vec3<f32>(blendAmt));

    return vec4<f32>(result, base.a);
}

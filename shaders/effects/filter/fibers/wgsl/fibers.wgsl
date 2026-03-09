/*
 * Fibers - Chaotic fiber texture overlay (single-pass)
 *
 * Traces worms through a flow field derived from input luminance.
 * 4 layers, each with ~13 chaotic worms, ~25 iterations.
 * Each pixel checks proximity to all worm trails and accumulates exposure.
 */

struct Uniforms {
    density: f32,
    seed: i32,
    alpha: f32,
    _pad0: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const TAU: f32 = 6.283185307179586;
const PI: f32 = 3.14159265358979;

// PCG hash
fn pcg(v: u32) -> u32 {
    let state = v * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn hashf(n: u32) -> f32 {
    return f32(pcg(n)) / 4294967295.0;
}

fn luminance(rgb: vec3<f32>) -> f32 {
    return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
}

fn glsl_mod(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
}

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = fragCoord.xy / texSize;
    let base = textureSample(inputTex, inputSampler, uv);

    let maxDim = max(texSize.x, texSize.y);
    let minDim = min(texSize.x, texSize.y);
    let iterations = i32(sqrt(minDim));  // ~25 for 640px
    let density = uniforms.density;
    let trailWidth = maxDim / 64.0 * (0.5 + density);  // scale with resolution and density

    // Worm count per layer: density maps 0..1 to ~5..25 worms
    let wormCount = max(3, i32(mix(5.0, 25.0, density)));

    let seedBase = u32(uniforms.seed) * 99991u;
    var totalMask: f32 = 0.0;
    var totalBrightness: vec3<f32> = vec3<f32>(0.0);

    // 4 layers (matching Python's for i in range(4))
    for (var layer = 0; layer < 4; layer = layer + 1) {
        let layerSeed = seedBase + u32(layer) * 77773u;
        var layerMask: f32 = 0.0;

        for (var w = 0; w < 25; w = w + 1) {  // max worm count
            if (w >= wormCount) { break; }

            let wSeed = layerSeed + u32(w) * 13337u;

            // Spawn position (random across canvas)
            var wy = hashf(wSeed) * texSize.y;
            var wx = hashf(wSeed + 1u) * texSize.x;

            // Chaotic: random initial heading
            let wRot = hashf(wSeed + 2u) * TAU;

            // Stride with deviation
            let strideMean = 0.75 * (maxDim / 1024.0);
            let strideVal = strideMean + (hashf(wSeed + 3u) - 0.5) * 2.0 * 0.125 * (maxDim / 1024.0);

            // Kink: random 5-10
            let kink = 5.0 + hashf(wSeed + 4u) * 5.0;

            // Walk the worm and check distance to this pixel
            for (var step = 0; step < 50; step = step + 1) {  // max iterations
                if (step >= iterations) { break; }

                // Exposure ramp: 0 -> 1 -> 0 over lifetime
                let t = f32(step) / f32(iterations - 1);
                let exposure = 1.0 - abs(1.0 - t * 2.0);

                // Distance from pixel to worm position (with wrapping)
                var diff = fragCoord.xy - vec2<f32>(wx, wy);

                // Handle wrapping
                if (diff.x > texSize.x * 0.5) { diff.x -= texSize.x; }
                if (diff.x < -texSize.x * 0.5) { diff.x += texSize.x; }
                if (diff.y > texSize.y * 0.5) { diff.y -= texSize.y; }
                if (diff.y < -texSize.y * 0.5) { diff.y += texSize.y; }

                let dist = length(diff);

                // Accumulate if within trail width
                if (dist < trailWidth) {
                    let falloff = 1.0 - dist / trailWidth;
                    layerMask += exposure * falloff;
                }

                // Advance worm: sample flow field at current position
                let wormUv = vec2<f32>(glsl_mod(wx, texSize.x), glsl_mod(wy, texSize.y)) / texSize;
                let lum = luminance(textureSampleLevel(inputTex, inputSampler, wormUv, 0.0).rgb);
                let flowAngle = lum * TAU * kink + wRot;

                wy = glsl_mod(wy + cos(flowAngle) * strideVal, texSize.y);
                wx = glsl_mod(wx + sin(flowAngle) * strideVal, texSize.x);
            }
        }

        // Per-layer brightness (quantized for spatial coherence, approximating values(freq=128))
        let bSeed = layerSeed + 999983u;
        let quantized = floor(fragCoord.xy / 8.0);
        let layerBright = vec3<f32>(
            hashf(bSeed + u32(quantized.x * 73.0 + quantized.y * 157.0) + u32(layer) * 31u),
            hashf(bSeed + u32(quantized.x * 79.0 + quantized.y * 311.0) + u32(layer) * 37u),
            hashf(bSeed + u32(quantized.x * 83.0 + quantized.y * 191.0) + u32(layer) * 41u),
        );

        // Normalize and sqrt the mask (matching Python's sqrt(normalize(out)))
        var mask = clamp(layerMask, 0.0, 1.0);
        mask = sqrt(mask);
        let blendAmt = mask * 0.5;

        totalMask += blendAmt;
        totalBrightness += layerBright * blendAmt;
    }

    // Composite all layers
    var result = base.rgb;
    if (totalMask > 0.0) {
        let fiberColor = totalBrightness / max(totalMask, 0.001);
        result = mix(base.rgb, fiberColor, clamp(totalMask, 0.0, 1.0) * uniforms.alpha);
    }

    return vec4<f32>(result, base.a);
}

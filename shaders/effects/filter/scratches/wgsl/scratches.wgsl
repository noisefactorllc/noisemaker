// Scratches: procedural film scratch overlay.
// Generates thin, mostly-vertical bright lines with breaks,
// additively blended onto the input image.

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;
@group(0) @binding(2) var<uniform> time : f32;
@group(0) @binding(3) var<uniform> density : f32;
@group(0) @binding(4) var<uniform> alpha : f32;
@group(0) @binding(5) var<uniform> seed : f32;
@group(0) @binding(6) var<uniform> speed : f32;

// Hash function for deterministic pseudo-random values
fn hash(n : f32) -> f32 {
    return fract(sin(n * 127.1) * 43758.5453123);
}

fn hash2(p : vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453123);
}

// 1D noise for break patterns
fn breakNoise(y : f32, freq : f32, seedVal : f32) -> f32 {
    let scaled : f32 = y * freq;
    let i : f32 = floor(scaled);
    var f : f32 = fract(scaled);
    f = f * f * (3.0 - 2.0 * f);  // smoothstep
    let a : f32 = hash(i + seedVal * 17.3);
    let b : f32 = hash(i + 1.0 + seedVal * 17.3);
    return mix(a, b, f);
}

@fragment
fn main(@builtin(position) position : vec4<f32>) -> @location(0) vec4<f32> {
    let dims : vec2<u32> = textureDimensions(inputTex, 0);
    if (dims.x == 0u || dims.y == 0u) {
        return vec4<f32>(0.0);
    }

    let resolution : vec2<f32> = vec2<f32>(f32(dims.x), f32(dims.y));
    let pixelPos : vec2<f32> = position.xy;
    let uv : vec2<f32> = pixelPos / resolution;

    let coord : vec2<i32> = vec2<i32>(i32(position.x), i32(position.y));
    let base : vec4<f32> = textureLoad(inputTex, coord, 0);

    // Number of scratch lines based on density
    let numScratches : i32 = max(i32(density * 20.0), 1);

    var totalScratch : f32 = 0.0;

    for (var i : i32 = 0; i < 20; i = i + 1) {
        if (i >= numScratches) { break; }

        let fi : f32 = f32(i);
        let seedBase : f32 = fi + seed * 13.7;

        // Random x position for this scratch (0..1)
        let scratchX : f32 = hash(seedBase);

        // Slight angle: small deviation from vertical
        let angle : f32 = (hash(seedBase + 3.1) - 0.5) * 0.08;

        // Low-frequency sine wobble for slight curvature
        let wobbleFreq : f32 = 1.0 + hash(seedBase + 7.7) * 2.0;
        let wobblePhase : f32 = hash(seedBase + 11.3) * 6.2832;
        let wobbleAmp : f32 = 0.002 + hash(seedBase + 5.5) * 0.006;

        // Vertical scrolling for animation
        let scrollSpeed : f32 = (0.5 + hash(seedBase + 9.9) * 1.0) * speed;
        let yOffset : f32 = time * scrollSpeed;

        // Compute line center x at this y position
        let y : f32 = uv.y + yOffset;
        let lineX : f32 = scratchX + angle * (uv.y - 0.5) + sin(y * wobbleFreq * 6.2832 + wobblePhase) * wobbleAmp;

        // Distance from pixel to line in pixels
        let dist : f32 = abs(uv.x - lineX) * resolution.x;

        // Line thickness: 1-2 pixels
        let thickness : f32 = 0.8 + hash(seedBase + 2.2) * 0.7;
        let line : f32 = smoothstep(thickness, 0.0, dist);

        // Create breaks using noise
        let breakSeed : f32 = seedBase + 100.0;
        let breakVal : f32 = breakNoise(y * 3.0, 4.0 + hash(breakSeed) * 4.0, breakSeed);
        // Threshold: only show where noise > ~0.5, creating gaps
        let breakMask : f32 = smoothstep(0.35, 0.55, breakVal);

        // Brightness variation per scratch
        let brightness : f32 = 0.6 + hash(seedBase + 4.4) * 0.4;

        totalScratch = totalScratch + line * breakMask * brightness;
    }

    // Apply alpha and additive blend
    let scratchColor : vec3<f32> = vec3<f32>(totalScratch * alpha);
    let result : vec3<f32> = min(base.rgb + scratchColor, vec3<f32>(1.0));

    return vec4<f32>(result, base.a);
}

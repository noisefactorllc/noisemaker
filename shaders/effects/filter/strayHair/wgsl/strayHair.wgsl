// Stray Hair - sparse dark curved lines over the image.
// Procedural bezier-curve hairs with anti-aliased thin lines.

@group(0) @binding(0) var inputSampler : sampler;
@group(0) @binding(1) var inputTex : texture_2d<f32>;

struct Uniforms {
    time : f32,
    density : f32,
    seed : f32,
    alpha : f32,
}
@group(0) @binding(2) var<uniform> uniforms : Uniforms;

// Integer-based hash for seed-driven randomness
fn hash(n : f32) -> f32 {
    return fract(sin(n) * 43758.5453123);
}

fn hash2(n : f32) -> vec2<f32> {
    return vec2<f32>(hash(n), hash(n + 71.37));
}

// Minimum distance from point p to cubic bezier (a, b, c, d)
// Approximated by sampling along the curve
fn bezierDist(p : vec2<f32>, a : vec2<f32>, b : vec2<f32>, c : vec2<f32>, d : vec2<f32>) -> f32 {
    var minDist : f32 = 1e10;
    let STEPS : i32 = 16;
    for (var j : i32 = 0; j <= STEPS; j = j + 1) {
        let t = f32(j) / f32(STEPS);
        let it = 1.0 - t;
        let q = it * it * it * a
              + 3.0 * it * it * t * b
              + 3.0 * it * t * t * c
              + t * t * t * d;
        let dist = length(p - q);
        minDist = min(minDist, dist);
    }
    return minDist;
}

@fragment
fn main(@location(0) v_texCoord : vec2<f32>) -> @location(0) vec4<f32> {
    let baseColor = textureSample(inputTex, inputSampler, v_texCoord);
    let dims = vec2<f32>(textureDimensions(inputTex, 0));
    let aspect = dims.x / dims.y;

    // Work in aspect-corrected UV space
    var uv = v_texCoord;
    uv.x = uv.x * aspect;

    let seedF = uniforms.seed * 7.919;
    let numHairs = 2 + i32(floor(uniforms.density * 6.0));

    var hairMask : f32 = 0.0;

    // Line width in UV space (~1.5 pixels)
    let lineWidth = 1.5 / dims.y;

    for (var i : i32 = 0; i < 8; i = i + 1) {
        if (i >= numHairs) {
            break;
        }

        let idx = seedF + f32(i) * 137.31;

        // Start position
        var p0 = hash2(idx + 11.0);
        p0.x = p0.x * aspect;

        // Direction angle and length
        let angle = hash(idx + 99.0) * 6.28318;
        let len = 0.25 + hash(idx + 55.0) * 0.35;

        // End position
        let p3 = p0 + vec2<f32>(cos(angle), sin(angle)) * len;

        // Control points with kink (perpendicular offsets for curvature)
        let kink1 = (hash(idx + 33.0) - 0.5) * 0.15;
        let kink2 = (hash(idx + 77.0) - 0.5) * 0.15;
        let perp = vec2<f32>(-sin(angle), cos(angle));
        let along = vec2<f32>(cos(angle), sin(angle));

        let p1 = p0 + along * len * 0.33 + perp * kink1;
        let p2 = p0 + along * len * 0.66 + perp * kink2;

        let dist = bezierDist(uv, p0, p1, p2, p3);

        // Anti-aliased thin line
        let strand = 1.0 - smoothstep(0.0, lineWidth, dist);
        hairMask = max(hairMask, strand);
    }

    // Blend: darken input where hair is present
    // Python ref: blend(tensor, brightness * 0.333, mask * 0.666)
    let blendFactor = hairMask * uniforms.alpha;
    let darkened = baseColor.rgb * 0.333;
    let result = mix(baseColor.rgb, darkened, vec3<f32>(blendFactor));

    return vec4<f32>(result, baseColor.a);
}

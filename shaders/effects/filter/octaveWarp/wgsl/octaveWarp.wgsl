/*
 * Octave Warp - per-octave noise warp distortion
 * For each octave i, generates noise at frequency×2^i, uses it to
 * displace UV coordinates, samples input at displaced position.
 * Displacement decreases with each octave (displacement / 2^i).
 */

struct Uniforms {
    frequency: f32,
    octaves: f32,
    displacement: f32,
    speed: f32,
    wrap: f32,
    antialias: i32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;
@group(0) @binding(3) var<uniform> time: f32;

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

fn hash21(p: vec2<f32>) -> f32 {
    let v = pcg(vec3<u32>(
        u32(select(-p.x * 2.0 + 1.0, p.x * 2.0, p.x >= 0.0)),
        u32(select(-p.y * 2.0 + 1.0, p.y * 2.0, p.y >= 0.0)),
        0u,
    ));
    return f32(v.x) / f32(0xffffffffu);
}

fn noise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let ff = f * f * (3.0 - 2.0 * f);

    let a = hash21(i);
    let b = hash21(i + vec2<f32>(1.0, 0.0));
    let c = hash21(i + vec2<f32>(0.0, 1.0));
    let d = hash21(i + vec2<f32>(1.0, 1.0));

    return mix(mix(a, b, ff.x), mix(c, d, ff.x), ff.y);
}

const TAU: f32 = 6.28318530717959;

// Multi-octave noise - circular path through noise space so t=0 and t=1 are seamless
// phase offsets the angle per octave, radius scales the circular path
fn simplexNoise(p: vec2<f32>, t: f32, phase: f32, radius: f32) -> f32 {
    let angle = t * TAU + phase;
    let cx = cos(angle) * radius;
    let cy = sin(angle) * radius;
    var n = noise(p + vec2<f32>(cx, cy));
    n = n + noise(p * 2.0 + vec2<f32>(-cy, cx) * 0.75) * 0.5;
    n = n + noise(p * 4.0 + vec2<f32>(cx, -cy) * 0.5) * 0.25;
    return n / 1.75;
}

fn wrapFloat(value: f32, limit: f32, mode: i32) -> f32 {
    if (limit <= 0.0) {
        return 0.0;
    }
    let norm = value / limit;
    if (mode == 0) {
        // Mirror: abs(mod(norm + 1, 2) - 1)
        let m = (norm + 1.0) - floor((norm + 1.0) * 0.5) * 2.0;
        return abs(m - 1.0) * limit;
    } else if (mode == 1) {
        // Repeat
        return (norm - floor(norm)) * limit;
    }
    // Clamp
    return clamp(value, 0.0, limit);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let width = texSize.x;
    let height = texSize.y;

    // Adjust frequency for aspect ratio
    let baseFreq = 11.0 - uniforms.frequency;
    let aspect = width / height;
    var freq = vec2<f32>(baseFreq);
    if (aspect > 1.0) {
        freq.y = freq.y * aspect;
    } else {
        freq.x = freq.x / aspect;
    }

    let uv = pos.xy / texSize;
    var sampleCoord = uv * texSize;

    let numOctaves = max(i32(uniforms.octaves), 1);
    let displaceBase = uniforms.displacement;

    // Per-octave warping
    for (var octave: i32 = 1; octave <= 10; octave = octave + 1) {
        if (octave > numOctaves) {
            break;
        }

        let multiplier = pow(2.0, f32(octave));
        let freqScaled = freq * 0.5 * multiplier;

        if (freqScaled.x >= width || freqScaled.y >= height) {
            break;
        }

        // Per-octave phase and radius break up uniform circular motion
        let phase = f32(octave) * 2.399;  // golden angle
        let radius = 0.5 / sqrt(multiplier);

        // Compute reference angles from noise
        let noiseCoord = (sampleCoord / texSize) * freqScaled;
        let refX = simplexNoise(noiseCoord + vec2<f32>(17.0, 29.0), time * uniforms.speed, phase, radius) * 2.0 - 1.0;
        let refY = simplexNoise(noiseCoord + vec2<f32>(23.0, 31.0), time * uniforms.speed, phase, radius) * 2.0 - 1.0;

        // Calculate displacement (decreases with each octave)
        let displaceScale = displaceBase / multiplier;
        let offset = vec2<f32>(refX * displaceScale * width, refY * displaceScale * height);

        sampleCoord = sampleCoord + offset;
        sampleCoord = vec2<f32>(
            wrapFloat(sampleCoord.x, width, i32(uniforms.wrap)),
            wrapFloat(sampleCoord.y, height, i32(uniforms.wrap)),
        );
    }

    let finalUV = vec2<f32>(
        wrapFloat(sampleCoord.x, width, i32(uniforms.wrap)),
        wrapFloat(sampleCoord.y, height, i32(uniforms.wrap)),
    ) / texSize;
    if (uniforms.antialias != 0) {
        let dx = dpdx(finalUV);
        let dy = dpdy(finalUV);
        var col = vec4<f32>(0.0);
        col += textureSample(inputTex, inputSampler, finalUV + dx * -0.375 + dy * -0.125);
        col += textureSample(inputTex, inputSampler, finalUV + dx *  0.125 + dy * -0.375);
        col += textureSample(inputTex, inputSampler, finalUV + dx *  0.375 + dy *  0.125);
        col += textureSample(inputTex, inputSampler, finalUV + dx * -0.125 + dy *  0.375);
        return col * 0.25;
    } else {
        return textureSample(inputTex, inputSampler, finalUV);
    }
}

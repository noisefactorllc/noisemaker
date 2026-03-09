/*
 * Spatter: Multi-layer procedural paint spatter effect.
 * Low-freq warped noise for large splatter shapes, medium-freq dots,
 * high-freq specks, minus ridged noise for breaks.
 */

struct Uniforms {
    density: f32,
    alpha: f32,
    color_r: f32,
    color_g: f32,
    seed: i32,
    color_b: f32,
    _pad0: f32,
    _pad1: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;
@group(0) @binding(3) var<uniform> time: f32;

fn hash21(p : vec2<f32>) -> f32 {
    let h : f32 = dot(p, vec2<f32>(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
}

fn hash31(p : vec3<f32>) -> f32 {
    let h : f32 = dot(p, vec3<f32>(127.1, 311.7, 74.7));
    return fract(sin(h) * 43758.5453123);
}

fn fade(t : f32) -> f32 {
    return t * t * (3.0 - 2.0 * t);
}

fn value_noise(p : vec2<f32>, s : f32) -> f32 {
    let cell : vec2<f32> = floor(p);
    let f : vec2<f32> = fract(p);
    let tl : f32 = hash31(vec3<f32>(cell, s));
    let tr : f32 = hash31(vec3<f32>(cell + vec2<f32>(1.0, 0.0), s));
    let bl : f32 = hash31(vec3<f32>(cell + vec2<f32>(0.0, 1.0), s));
    let br : f32 = hash31(vec3<f32>(cell + vec2<f32>(1.0, 1.0), s));
    let st : vec2<f32> = vec2<f32>(fade(f.x), fade(f.y));
    return mix(mix(tl, tr, st.x), mix(bl, br, st.x), st.y);
}

fn fbm(uv : vec2<f32>, freq : vec2<f32>, octaves : i32, s : f32) -> f32 {
    var amp : f32 = 0.5;
    var accum : f32 = 0.0;
    var weight : f32 = 0.0;
    var f : vec2<f32> = freq;
    for (var i : i32 = 0; i < octaves; i = i + 1) {
        let os : f32 = s + f32(i) * 37.17;
        accum = accum + pow(value_noise(uv * f, os), 4.0) * amp;
        weight = weight + amp;
        f = f * 2.0;
        amp = amp * 0.5;
    }
    if (weight > 0.0) {
        return clamp(accum / weight, 0.0, 1.0);
    }
    return 0.0;
}

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    let dims : vec2<f32> = vec2<f32>(textureDimensions(inputTex));
    let uv : vec2<f32> = pos.xy / dims;
    let base : vec4<f32> = textureSample(inputTex, inputSampler, uv);

    let s : f32 = f32(uniforms.seed) * 17.3;
    let aspect : f32 = dims.x / dims.y;
    let d : f32 = uniforms.density;
    let user_color : vec3<f32> = vec3<f32>(uniforms.color_r, uniforms.color_g, uniforms.color_b);

    // Layer 1: Low-freq warped noise for large splatter shapes
    let smearFreq : f32 = mix(3.0, 6.0, hash21(vec2<f32>(s + 3.0, s + 29.0)));
    let smearF : vec2<f32> = vec2<f32>(smearFreq, smearFreq * aspect);
    let smear0 : f32 = fbm(uv, smearF, 6, s + 23.0);

    // Self-warp: offset UV by noise value, re-sample
    let warpAmt : f32 = 0.08 * d;
    let warpedUV : vec2<f32> = uv + (smear0 - 0.5) * warpAmt;
    let smear : f32 = fbm(warpedUV, smearF, 6, s + 23.0);

    // Layer 2: Medium-freq spatter dots (32-64), threshold for sparse dots
    let dotFreq : f32 = mix(32.0, 64.0, hash21(vec2<f32>(s + 5.0, s + 59.0)));
    let dotF : vec2<f32> = vec2<f32>(dotFreq, dotFreq * aspect);
    let dots_raw : f32 = fbm(uv, dotF, 4, s + 43.0);
    let dots : f32 = smoothstep(0.6 - d * 0.3, 0.8, dots_raw);

    // Layer 3: High-freq fine specks (150-200)
    let speckFreq : f32 = mix(150.0, 200.0, hash21(vec2<f32>(s + 13.0, s + 97.0)));
    let speckF : vec2<f32> = vec2<f32>(speckFreq, speckFreq * aspect);
    let specks_raw : f32 = fbm(uv, speckF, 4, s + 71.0);
    let specks : f32 = smoothstep(0.6 - d * 0.2, 0.85, specks_raw);

    // Subtract ridged noise to create breaks
    let ridgeFreq : f32 = mix(2.0, 3.0, hash21(vec2<f32>(s + 31.0, s + 149.0)));
    let ridgeF : vec2<f32> = vec2<f32>(ridgeFreq, ridgeFreq * aspect);
    let ridgeNoise : f32 = fbm(uv, ridgeF, 3, s + 89.0);
    let ridgeMask : f32 = abs(ridgeNoise * 2.0 - 1.0);

    // Combine layers
    let combined : f32 = max(smear, max(dots, specks));
    let mask : f32 = clamp(max(combined - ridgeMask, 0.0) * (0.5 + d), 0.0, 1.0);

    // Color: mix spatter color with input, weighted by mask
    let colored : vec3<f32> = mix(base.rgb, user_color, mask);
    let result : vec3<f32> = mix(base.rgb, colored, mask * uniforms.alpha);

    return vec4<f32>(result, base.a);
}

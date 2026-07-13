/*
 * Scatter - jitter pass (Diffuse / Spatter / frosted glass).
 * See scatterJitter.glsl for the full mode-dispatch description. The jitter
 * hash is seeded by the global (tile-aware) coordinate pos.xy + tileOffset so
 * the scatter field stays continuous across CLI render tiles instead of
 * restarting at each tile's local origin. tileOffset is runtime-provided.
 */

// MODE is a runtime-injected module-scope const (injectDefines); Dawn/naga
// constant-fold the mode dispatch so only the active arm survives compilation.
struct Uniforms {
    radius: f32,
    seed: i32,
    tileOffset: vec2<f32>,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

fn hash22(p: vec2<f32>) -> vec2<f32> {
    var p3 = fract(vec3<f32>(p.xyx) * vec3<f32>(0.1031, 0.1030, 0.0973));
    p3 = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
    return fract((p3.xx + p3.yz) * p3.zy);
}

fn lum(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

// Sobel gradient of luminance; used by anisotropic mode to find the local
// edge direction (perpendicular to the gradient = along the edge).
fn lumGradient(uv: vec2<f32>) -> vec2<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let px = 1.0 / texSize;
    let tl = lum(textureSample(inputTex, inputSampler, uv + px * vec2<f32>(-1.0,  1.0)).rgb);
    let l  = lum(textureSample(inputTex, inputSampler, uv + px * vec2<f32>(-1.0,  0.0)).rgb);
    let bl = lum(textureSample(inputTex, inputSampler, uv + px * vec2<f32>(-1.0, -1.0)).rgb);
    let tr = lum(textureSample(inputTex, inputSampler, uv + px * vec2<f32>( 1.0,  1.0)).rgb);
    let r  = lum(textureSample(inputTex, inputSampler, uv + px * vec2<f32>( 1.0,  0.0)).rgb);
    let br = lum(textureSample(inputTex, inputSampler, uv + px * vec2<f32>( 1.0, -1.0)).rgb);
    let t  = lum(textureSample(inputTex, inputSampler, uv + px * vec2<f32>( 0.0,  1.0)).rgb);
    let b  = lum(textureSample(inputTex, inputSampler, uv + px * vec2<f32>( 0.0, -1.0)).rgb);
    return vec2<f32>(tr + 2.0 * r + br - tl - 2.0 * l - bl,
                      tl + 2.0 * t + tr - bl - 2.0 * b - br);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let uv = pos.xy / texSize;

    // Seed with the global (tile-aware) coordinate, not pos.xy alone, so the
    // scatter field is continuous across CLI render tiles.
    let globalCoord = pos.xy + uniforms.tileOffset;

    // Clumped mode: quantize the hash coordinate to 3px blocks BEFORE
    // hashing so every pixel in a block shares the same random offset.
    var hashCoord = globalCoord;
    if (MODE == 4) {
        hashCoord = floor(globalCoord / 3.0) * 3.0;
    }

    let rnd = hash22(hashCoord + f32(uniforms.seed) * 101.7) - 0.5;
    var offset = rnd * 2.0 * uniforms.radius;

    if (MODE == 3) {
        // Anisotropic: project the offset onto the direction perpendicular
        // to the local luminance gradient (edge-following smear).
        let grad = lumGradient(uv);
        let gradLen = length(grad);
        if (gradLen > 1e-5) {
            let perp = vec2<f32>(-grad.y, grad.x) / gradLen;
            offset = dot(offset, perp) * perp;
        }
        // else: gradient ~zero (flat region) -- fall back to raw offset.
    }

    let sampleUV = clamp((pos.xy + offset) / texSize, vec2<f32>(0.0), vec2<f32>(1.0));

    let src = textureSample(inputTex, inputSampler, uv);
    let samp = textureSample(inputTex, inputSampler, sampleUV);

    var result = samp;
    if (MODE == 1) {
        result = min(src, samp);
    } else if (MODE == 2) {
        result = max(src, samp);
    }

    return result;
}

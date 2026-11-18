/*
 * Scatter - jitter pass (Diffuse / Spatter / frosted glass).
 * See scatterJitter.glsl for the full mode-dispatch description. The jitter
 * hash (PCG3D, integer, so it matches WebGL2 exactly) is seeded by the
 * global (tile-aware) coordinate pos.xy + tileOffset so the scatter field
 * stays continuous across CLI render tiles instead of restarting at each
 * tile's local origin. tileOffset is runtime-provided.
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

// PCG3D integer hash (Jarzynski & Olano 2020); see scatterJitter.glsl.
fn pcg3d(v_in: vec3<u32>) -> vec3<u32> {
    var v = v_in * 1664525u + 1013904223u;
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    v = v ^ (v >> vec3<u32>(16u));
    v.x = v.x + v.y * v.z;
    v.y = v.y + v.z * v.x;
    v.z = v.z + v.x * v.y;
    return v;
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
    let texel = vec2<i32>(pos.xy);
    let texSizeI = vec2<i32>(textureDimensions(inputTex));

    // Seed with the global (tile-aware) coordinate, not pos.xy alone, so the
    // scatter field is continuous across CLI render tiles.
    let globalCoord = pos.xy + uniforms.tileOffset;

    // Clumped mode: quantize the hash coordinate to 3px blocks BEFORE
    // hashing so every pixel in a block shares the same random offset.
    var hashCoord = globalCoord;
    if (MODE == 4) {
        hashCoord = floor(globalCoord / 3.0) * 3.0;
    }

    let h = pcg3d(vec3<u32>(vec2<u32>(vec2<i32>(floor(hashCoord))), u32(uniforms.seed)));

    // Offset in 1/256 px steps, in [-radius, radius) on each axis; see
    // scatterJitter.glsl.
    let r256 = u32(min(abs(uniforms.radius), 128.0) * 256.0);
    let steps = ((h.xy >> vec2<u32>(16u)) * (2u * r256)) >> vec2<u32>(16u);
    var offset = vec2<f32>(vec2<i32>(steps) - i32(r256)) / 256.0;

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

    // Read the texel nearest the offset sample position, clamped to the edge.
    let sampleTexel = clamp(texel + vec2<i32>(floor(offset + 0.5)), vec2<i32>(0), texSizeI - 1);

    let src = textureLoad(inputTex, texel, 0);
    let samp = textureLoad(inputTex, sampleTexel, 0);

    var result = samp;
    if (MODE == 1) {
        result = min(src, samp);
    } else if (MODE == 2) {
        result = max(src, samp);
    }

    return result;
}

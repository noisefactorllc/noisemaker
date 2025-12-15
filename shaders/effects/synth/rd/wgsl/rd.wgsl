/*
 * WGSL reaction-diffusion display shader (mono only).
 * Formats the simulation state into grayscale output.
 */

struct Uniforms {
    // data[0] = (resolution.x, resolution.y, time, unused)
    // data[1] = (unused, unused, unused, unused)
    // data[2] = (unused, unused, unused, unused)
    // data[3] = (unused, unused, unused, smoothing)
    data : array<vec4<f32>, 4>,
};
@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var fbTex : texture_2d<f32>;

const PI : f32 = 3.14159265359;

fn modulo(a: f32, b: f32) -> f32 {
    return a - b * floor(a / b);
}

fn cubic(x: f32) -> f32 {
    let ax = abs(x);
    if (ax <= 1.0) {
        return 1.5 * ax * ax * ax - 2.5 * ax * ax + 1.0;
    } else if (ax < 2.0) {
        return -0.5 * ax * ax * ax + 2.5 * ax * ax - 4.0 * ax + 2.0;
    }
    return 0.0;
}

fn quadratic3(p0: vec4<f32>, p1: vec4<f32>, p2: vec4<f32>, t: f32) -> vec4<f32> {
    // Quadratic B-spline basis functions
    let t2 = t * t;
    
    let B0 = 0.5 * (1.0 - t) * (1.0 - t);
    let B1 = 0.5 * (-2.0 * t2 + 2.0 * t + 1.0);
    let B2 = 0.5 * t2;
    
    return p0 * B0 + p1 * B1 + p2 * B2;
}

fn catmullRom3(p0: vec4<f32>, p1: vec4<f32>, p2: vec4<f32>, t: f32) -> vec4<f32> {
    // Catmull-Rom cubic interpolation for 3 points
    // Uses endpoint tangents estimated from neighbors
    let t2 = t * t;
    let t3 = t2 * t;
    
    // Tangent at p1 estimated as (p2 - p0) / 2
    let m = 0.5 * (p2 - p0);
    
    // Hermite basis functions with tangent m at both endpoints
    return (2.0*t3 - 3.0*t2 + 1.0) * p1 + 
           (t3 - 2.0*t2 + t) * m +
           (-2.0*t3 + 3.0*t2) * p2 + 
           (t3 - t2) * m;
}

fn catmullRom4(p0: vec4<f32>, p1: vec4<f32>, p2: vec4<f32>, p3: vec4<f32>, t: f32) -> vec4<f32> {
    // Catmull-Rom 4-point interpolation
    return p1 + 0.5 * t * (p2 - p0 + t * (2.0 * (p0 - p1) + (p2 - p1) + t * (3.0 * (p1 - p2) + p3 - p0)));
}

fn quadratic(tex: texture_2d<f32>, uv: vec2<f32>, texelSize: vec2<f32>) -> vec4<f32> {
    let uv2 = uv + texelSize;
    let texCoord = uv2 / texelSize;
    let baseCoord = floor(texCoord - 0.5);
    let f = fract(texCoord - 0.5);
    
    // Sample 3x3 grid centered on the interpolation point
    let v00 = textureSampleLevel(tex, samp, (baseCoord + vec2<f32>(-0.5, -0.5)) * texelSize, 0.0);
    let v10 = textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 0.5, -0.5)) * texelSize, 0.0);
    let v20 = textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 1.5, -0.5)) * texelSize, 0.0);
    
    let v01 = textureSampleLevel(tex, samp, (baseCoord + vec2<f32>(-0.5,  0.5)) * texelSize, 0.0);
    let v11 = textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 0.5,  0.5)) * texelSize, 0.0);
    let v21 = textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 1.5,  0.5)) * texelSize, 0.0);
    
    let v02 = textureSampleLevel(tex, samp, (baseCoord + vec2<f32>(-0.5,  1.5)) * texelSize, 0.0);
    let v12 = textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 0.5,  1.5)) * texelSize, 0.0);
    let v22 = textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 1.5,  1.5)) * texelSize, 0.0);
    
    // Interpolate rows using quadratic B-spline
    let y0 = quadratic3(v00, v10, v20, f.x);
    let y1 = quadratic3(v01, v11, v21, f.x);
    let y2 = quadratic3(v02, v12, v22, f.x);
    
    // Interpolate columns
    return quadratic3(y0, y1, y2, f.y);
}

fn catmullRom3x3(tex: texture_2d<f32>, uv: vec2<f32>, texelSize: vec2<f32>) -> vec4<f32> {
    let uv2 = uv + texelSize;
    let texCoord = uv2 / texelSize;
    let baseCoord = floor(texCoord - 0.5);
    let f = fract(texCoord - 0.5);
    
    // Sample 3x3 grid
    let v00 = textureSampleLevel(tex, samp, (baseCoord + vec2<f32>(-0.5, -0.5)) * texelSize, 0.0);
    let v10 = textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 0.5, -0.5)) * texelSize, 0.0);
    let v20 = textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 1.5, -0.5)) * texelSize, 0.0);
    
    let v01 = textureSampleLevel(tex, samp, (baseCoord + vec2<f32>(-0.5,  0.5)) * texelSize, 0.0);
    let v11 = textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 0.5,  0.5)) * texelSize, 0.0);
    let v21 = textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 1.5,  0.5)) * texelSize, 0.0);
    
    let v02 = textureSampleLevel(tex, samp, (baseCoord + vec2<f32>(-0.5,  1.5)) * texelSize, 0.0);
    let v12 = textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 0.5,  1.5)) * texelSize, 0.0);
    let v22 = textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 1.5,  1.5)) * texelSize, 0.0);
    
    // Interpolate rows using Catmull-Rom
    let y0 = catmullRom3(v00, v10, v20, f.x);
    let y1 = catmullRom3(v01, v11, v21, f.x);
    let y2 = catmullRom3(v02, v12, v22, f.x);
    
    // Interpolate columns
    return catmullRom3(y0, y1, y2, f.y);
}

fn bicubic(tex: texture_2d<f32>, uv: vec2<f32>, texelSize: vec2<f32>) -> vec4<f32> {
    let uv2 = uv + texelSize;
    let texCoord = uv2 / texelSize;
    let baseCoord = floor(texCoord) - 0.5 * texelSize;
    let fractional = texCoord - baseCoord;

    var totalWeight = 0.0;
    var result = vec4<f32>(0.0);
    for (var j: i32 = -2; j <= 3; j = j + 1) {
        for (var i: i32 = -2; i <= 3; i = i + 1) {
            let offset = vec2<f32>(f32(i), f32(j));
            let sampleCoord = (baseCoord + offset) * texelSize;
            let weight = cubic(offset.x - fractional.x) * cubic(offset.y - fractional.y);
            totalWeight = totalWeight + weight;
            result = result + textureSampleLevel(tex, samp, sampleCoord, 0.0) * weight;
        }
    }
    return result / totalWeight;
}

fn catmullRom4x4(tex: texture_2d<f32>, uv: vec2<f32>, texelSize: vec2<f32>) -> vec4<f32> {
    let uv2 = uv + texelSize;
    let texCoord = uv2 / texelSize;
    let baseCoord = floor(texCoord - 0.5);
    let f = fract(texCoord - 0.5);
    
    // Sample 4x4 grid
    var samples: array<array<vec4<f32>, 4>, 4>;
    for (var y: i32 = 0; y < 4; y++) {
        for (var x: i32 = 0; x < 4; x++) {
            let offset = vec2<f32>(f32(x) - 1.5, f32(y) - 1.5);
            samples[y][x] = textureSampleLevel(tex, samp, (baseCoord + offset) * texelSize, 0.0);
        }
    }
    
    // Interpolate rows
    var rows: array<vec4<f32>, 4>;
    for (var y: i32 = 0; y < 4; y++) {
        rows[y] = catmullRom4(samples[y][0], samples[y][1], samples[y][2], samples[y][3], f.x);
    }
    
    // Interpolate columns
    return catmullRom4(rows[0], rows[1], rows[2], rows[3], f.y);
}

fn cosineMix(a: f32, b: f32, t: f32) -> f32 {
    let amount = (1.0 - cos(t * 3.141592653589793)) * 0.5;
    return mix(a, b, amount);
}

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    let resolution = uniforms.data[0].xy;
    let smoothing = i32(uniforms.data[3].w);

    var intensity = 1.0;

    if (smoothing == 0) {
        let texSizeI = vec2<i32>(textureDimensions(fbTex, 0));
        let texSizeF = vec2<f32>(f32(texSizeI.x), f32(texSizeI.y));
        let coord = vec2<i32>(floor(pos.xy * texSizeF / resolution));
        let clamped = clamp(coord, vec2<i32>(0), texSizeI - vec2<i32>(1));
        intensity = clamp(textureLoad(fbTex, clamped, 0).g, 0.0, 1.0);
    } else if (smoothing == 2) {
        // hermite (smoothstep)
        let texSize = vec2<f32>(textureDimensions(fbTex, 0));
        let texelPos = (pos.xy * texSize / resolution) - vec2<f32>(0.5);
        let base = floor(texelPos);
        let weights = fract(texelPos);
        let next = base + vec2<f32>(1.0);

        let texSizeI = vec2<i32>(textureDimensions(fbTex, 0));
        let minIdx = vec2<i32>(0);
        let maxIdx = texSizeI - vec2<i32>(1);

        let baseIdx = clamp(vec2<i32>(base), minIdx, maxIdx);
        let nextIdx = clamp(vec2<i32>(next), minIdx, maxIdx);

        let v00 = textureLoad(fbTex, baseIdx, 0).g;
        let v10 = textureLoad(fbTex, vec2<i32>(nextIdx.x, baseIdx.y), 0).g;
        let v01 = textureLoad(fbTex, vec2<i32>(baseIdx.x, nextIdx.y), 0).g;
        let v11 = textureLoad(fbTex, nextIdx, 0).g;

        let smoothWeights = smoothstep(vec2<f32>(0.0), vec2<f32>(1.0), weights);
        let v0 = mix(v00, v10, smoothWeights.x);
        let v1 = mix(v01, v11, smoothWeights.x);
        intensity = clamp(mix(v0, v1, smoothWeights.y), 0.0, 1.0);
    } else if (smoothing == 3) {
        // quadratic B-spline (3x3, 9 taps)
        let texSize = vec2<f32>(textureDimensions(fbTex, 0));
        let texelSize = 1.0 / texSize;
        let scaling = resolution / texSize;
        let uv = (pos.xy - scaling * 0.5) / resolution;
        let sample = quadratic(fbTex, uv, texelSize);
        intensity = clamp(sample.g, 0.0, 1.0);
    } else if (smoothing == 4) {
        // cubic B-spline (4×4, 16 taps)
        let texSize = vec2<f32>(textureDimensions(fbTex, 0));
        let texelSize = 1.0 / texSize;
        let scaling = resolution / texSize;
        let uv = (pos.xy - scaling * 0.5) / resolution;
        let sample = bicubic(fbTex, uv, texelSize);
        intensity = clamp(sample.g, 0.0, 1.0);
    } else if (smoothing == 5) {
        // catmull-rom 3x3 (9 taps, interpolating)
        let texSize = vec2<f32>(textureDimensions(fbTex, 0));
        let texelSize = 1.0 / texSize;
        let scaling = resolution / texSize;
        let uv = (pos.xy - scaling * 0.5) / resolution;
        let sample = catmullRom3x3(fbTex, uv, texelSize);
        intensity = clamp(sample.g, 0.0, 1.0);
    } else if (smoothing == 6) {
        // catmull-rom 4x4 (16 taps, interpolating)
        let texSize = vec2<f32>(textureDimensions(fbTex, 0));
        let texelSize = 1.0 / texSize;
        let scaling = resolution / texSize;
        let uv = (pos.xy - scaling * 0.5) / resolution;
        let sample = catmullRom4x4(fbTex, uv, texelSize);
        intensity = clamp(sample.g, 0.0, 1.0);
    } else {
        let texSize = vec2<f32>(textureDimensions(fbTex, 0));
        let texelPos = (pos.xy * texSize / resolution) - vec2<f32>(0.5, 0.5);
        let base = floor(texelPos);
        let weights = fract(texelPos);
        let next = base + vec2<f32>(1.0, 1.0);

        let texSizeI = vec2<i32>(textureDimensions(fbTex, 0));
        let minIdx = vec2<i32>(0, 0);
        let maxIdx = texSizeI - vec2<i32>(1, 1);
        let baseI = clamp(vec2<i32>(base), minIdx, maxIdx);
        let nextI = clamp(vec2<i32>(next), minIdx, maxIdx);

        let v00 = textureLoad(fbTex, baseI, 0).g;
        let v10 = textureLoad(fbTex, vec2<i32>(nextI.x, baseI.y), 0).g;
        let v01 = textureLoad(fbTex, vec2<i32>(baseI.x, nextI.y), 0).g;
        let v11 = textureLoad(fbTex, nextI, 0).g;

        if (smoothing == 1) {
            let v0 = mix(v00, v10, weights.x);
            let v1 = mix(v01, v11, weights.x);
            intensity = clamp(mix(v0, v1, weights.y), 0.0, 1.0);
        } else {
            let v0 = cosineMix(v00, v10, weights.x);
            let v1 = cosineMix(v01, v11, weights.x);
            intensity = clamp(cosineMix(v0, v1, weights.y), 0.0, 1.0);
        }
    }

    return vec4<f32>(intensity, intensity, intensity, 1.0);
}

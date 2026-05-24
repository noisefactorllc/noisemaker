// Cellular automata display pass (WGSL).

struct Uniforms {
    data : array<vec4<f32>, 6>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var fbTex: texture_2d<f32>;
@group(0) @binding(2) var mySampler: sampler;

fn quadratic3(p0: vec4<f32>, p1: vec4<f32>, p2: vec4<f32>, t: f32) -> vec4<f32> {
    let t2 = t * t;

    return p0 * 0.5 * (1.0 - t) * (1.0 - t) +
           p1 * 0.5 * (-2.0 * t2 + 2.0 * t + 1.0) +
           p2 * 0.5 * t2;
}

fn bicubic4(p0: vec4<f32>, p1: vec4<f32>, p2: vec4<f32>, p3: vec4<f32>, t: f32) -> vec4<f32> {
    let t2 = t * t;
    let t3 = t2 * t;

    let b0 = (1.0 - t) * (1.0 - t) * (1.0 - t) / 6.0;
    let b1 = (3.0 * t3 - 6.0 * t2 + 4.0) / 6.0;
    let b2 = (-3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0) / 6.0;
    let b3 = t3 / 6.0;

    return p0 * b0 + p1 * b1 + p2 * b2 + p3 * b3;
}

fn catmullRom3(p0: vec4<f32>, p1: vec4<f32>, p2: vec4<f32>, t: f32) -> vec4<f32> {
    let t2 = t * t;
    let t3 = t2 * t;

    let m = 0.5 * (p2 - p0);

    return (2.0*t3 - 3.0*t2 + 1.0) * p1 +
           (t3 - 2.0*t2 + t) * m +
           (-2.0*t3 + 3.0*t2) * p2 +
           (t3 - t2) * m;
}

fn catmullRom4(p0: vec4<f32>, p1: vec4<f32>, p2: vec4<f32>, p3: vec4<f32>, t: f32) -> vec4<f32> {
    return p1 + 0.5 * t * (p2 - p0 + t * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3 + t * (3.0 * (p1 - p2) + p3 - p0)));
}

fn quadraticSample(tex: texture_2d<f32>, samp: sampler, uv: vec2<f32>, texelSize: vec2<f32>) -> vec4<f32> {
    // Match GLSL: offset uv by one texel to accommodate texel centering
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

fn catmullRom3x3Sample(tex: texture_2d<f32>, samp: sampler, uv: vec2<f32>, texelSize: vec2<f32>) -> vec4<f32> {
    // Match GLSL: offset uv by one texel to accommodate texel centering
    let uv2 = uv + texelSize;
    let texCoord = uv2 / texelSize;
    let baseCoord = floor(texCoord - 1.0);
    let f = fract(texCoord - 1.0);
    
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

fn bicubicSample(tex: texture_2d<f32>, samp: sampler, uv: vec2<f32>, texelSize: vec2<f32>) -> vec4<f32> {
    let uv2 = uv + texelSize;
    let texCoord = uv2 / texelSize;
    let baseCoord = floor(texCoord - 1.0);
    let f = fract(texCoord - 1.0);

    let row0 = bicubic4(
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>(-0.5, -0.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 0.5, -0.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 1.5, -0.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 2.5, -0.5)) * texelSize, 0.0),
        f.x
    );

    let row1 = bicubic4(
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>(-0.5,  0.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 0.5,  0.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 1.5,  0.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 2.5,  0.5)) * texelSize, 0.0),
        f.x
    );

    let row2 = bicubic4(
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>(-0.5,  1.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 0.5,  1.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 1.5,  1.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 2.5,  1.5)) * texelSize, 0.0),
        f.x
    );

    let row3 = bicubic4(
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>(-0.5,  2.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 0.5,  2.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 1.5,  2.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 2.5,  2.5)) * texelSize, 0.0),
        f.x
    );

    return bicubic4(row0, row1, row2, row3, f.y);
}

fn catmullRom4x4Sample(tex: texture_2d<f32>, samp: sampler, uv: vec2<f32>, texelSize: vec2<f32>) -> vec4<f32> {
    let uv2 = uv + texelSize;
    let texCoord = uv2 / texelSize;
    let baseCoord = floor(texCoord - 1.0);
    let f = fract(texCoord - 1.0);

    let row0 = catmullRom4(
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>(-0.5, -0.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 0.5, -0.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 1.5, -0.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 2.5, -0.5)) * texelSize, 0.0),
        f.x
    );

    let row1 = catmullRom4(
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>(-0.5,  0.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 0.5,  0.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 1.5,  0.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 2.5,  0.5)) * texelSize, 0.0),
        f.x
    );

    let row2 = catmullRom4(
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>(-0.5,  1.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 0.5,  1.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 1.5,  1.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 2.5,  1.5)) * texelSize, 0.0),
        f.x
    );

    let row3 = catmullRom4(
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>(-0.5,  2.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 0.5,  2.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 1.5,  2.5)) * texelSize, 0.0),
        textureSampleLevel(tex, samp, (baseCoord + vec2<f32>( 2.5,  2.5)) * texelSize, 0.0),
        f.x
    );

    return catmullRom4(row0, row1, row2, row3, f.y);
}

fn cosineMix(a: f32, b: f32, t: f32) -> f32 {
    let amount = (1.0 - cos(t * 3.141592653589793)) * 0.5;
    return mix(a, b, amount);
}

@fragment fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let resolution = uniforms.data[0].xy;
    let smoothing = i32(uniforms.data[1].y);

    var state: f32 = 0.0;
    if (smoothing == 0) {
        // constant - use textureLoad for exact nearest-neighbor sampling
        let texSizeI = vec2<i32>(textureDimensions(fbTex, 0));
        let texSizeF = vec2<f32>(f32(texSizeI.x), f32(texSizeI.y));
        let pixelCoord = vec2<i32>(floor(fragCoord.xy * texSizeF / resolution));
        state = textureLoad(fbTex, clamp(pixelCoord, vec2<i32>(0), texSizeI - vec2<i32>(1)), 0).g;
    } else if (smoothing == 3) {
        // catmull-rom 3x3 (9 taps)
        let texSize = vec2<f32>(textureDimensions(fbTex, 0));
        let texelSize = 1.0 / texSize;
        let scaling = resolution / texSize;
        let uv = (fragCoord.xy - scaling * 0.5) / resolution;
        state = catmullRom3x3Sample(fbTex, mySampler, uv, texelSize).g;
    } else if (smoothing == 4) {
        // catmull-rom 4x4 (16 taps)
        let texSize = vec2<f32>(textureDimensions(fbTex, 0));
        let texelSize = 1.0 / texSize;
        let scaling = resolution / texSize;
        let uv = (fragCoord.xy - scaling * 0.5) / resolution;
        state = catmullRom4x4Sample(fbTex, mySampler, uv, texelSize).g;
    } else if (smoothing == 5) {
        // b-spline 3x3 (9 taps)
        let texSize = vec2<f32>(textureDimensions(fbTex, 0));
        let texelSize = 1.0 / texSize;
        let scaling = resolution / texSize;
        let uv = (fragCoord.xy - scaling * 0.5) / resolution;
        state = quadraticSample(fbTex, mySampler, uv, texelSize).g;
    } else if (smoothing == 6) {
        // b-spline 4x4 (16 taps)
        let texSize = vec2<f32>(textureDimensions(fbTex, 0));
        let texelSize = 1.0 / texSize;
        let scaling = resolution / texSize;
        let uv = (fragCoord.xy - scaling * 0.5) / resolution;
        state = bicubicSample(fbTex, mySampler, uv, texelSize).g;
    } else {
        // linear-style smoothing — sample texel centres explicitly to avoid seams.
        let texSize = vec2<f32>(textureDimensions(fbTex, 0));
        let texelPos = (fragCoord.xy * texSize / resolution) - vec2<f32>(0.5, 0.5);
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
            state = mix(v0, v1, weights.y);
        } else {
            let v0 = cosineMix(v00, v10, weights.x);
            let v1 = cosineMix(v01, v11, weights.x);
            state = cosineMix(v0, v1, weights.y);
        }
    }

    return vec4<f32>(state, state, state, 1.0);
}

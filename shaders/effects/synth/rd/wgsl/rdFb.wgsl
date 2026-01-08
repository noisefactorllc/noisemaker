/*
 * WGSL reaction-diffusion feedback shader.
 * Implements the Gray-Scott solver in WGSL to match the GLSL pass for deterministic evolution.
 * Feed and kill coefficients are clamped to stability thresholds before integration.
 */

struct Uniforms {
    // data[0] = (resolution.x, resolution.y, time, zoom)
    // data[1] = (feed, kill, rate1, rate2)
    // data[2] = (speed, weight, sourceF, sourceK)
    // data[3] = (sourceR1, sourceR2, resetState, seed)
    data : array<vec4<f32>, 4>,
};
@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var bufTex : texture_2d<f32>;
@group(0) @binding(3) var inputTex : texture_2d<f32>;

fn lp(tex: texture_2d<f32>, uv: vec2<f32>, size: vec2<f32>) -> vec3<f32> {
    // Fixed 1px neighbourhood sampling (matches GLSL behavior)
    let pixelStep = 1.0;

    var val = vec3<f32>(0.0);
    val = val + textureSampleLevel(tex, samp, (uv + vec2<f32>(-pixelStep, -pixelStep)) / size, 0.0).rgb * 0.05;
    val = val + textureSampleLevel(tex, samp, (uv + vec2<f32>(0.0, -pixelStep)) / size, 0.0).rgb * 0.2;
    val = val + textureSampleLevel(tex, samp, (uv + vec2<f32>(pixelStep, -pixelStep)) / size, 0.0).rgb * 0.05;
    val = val + textureSampleLevel(tex, samp, (uv + vec2<f32>(-pixelStep, 0.0)) / size, 0.0).rgb * 0.2;
    val = val + textureSampleLevel(tex, samp, (uv + vec2<f32>(0.0, 0.0)) / size, 0.0).rgb * -1.0;
    val = val + textureSampleLevel(tex, samp, (uv + vec2<f32>(pixelStep, 0.0)) / size, 0.0).rgb * 0.2;
    val = val + textureSampleLevel(tex, samp, (uv + vec2<f32>(-pixelStep, pixelStep)) / size, 0.0).rgb * 0.05;
    val = val + textureSampleLevel(tex, samp, (uv + vec2<f32>(0.0, pixelStep)) / size, 0.0).rgb * 0.2;
    val = val + textureSampleLevel(tex, samp, (uv + vec2<f32>(pixelStep, pixelStep)) / size, 0.0).rgb * 0.05;
    return val;
}

fn map(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn lum(color: vec3<f32>) -> f32 {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

fn hash(p: vec2<f32>) -> f32 {
    var p2 = fract(p * vec2<f32>(0.1031, 0.1030));
    p2 = p2 + dot(p2, p2.yx + 33.33);
    return fract((p2.x + p2.y) * p2.x);
}

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    let resolution = uniforms.data[0].xy;
    let time = uniforms.data[0].z; // unused
    let zoom = uniforms.data[0].w;
    let seed = uniforms.data[3].w;

    let texSize = vec2<f32>(textureDimensions(bufTex, 0));
    let tex = textureSampleLevel(bufTex, samp, pos.xy / texSize, 0.0);
    var a = tex.r;
    var b = tex.g;

    // Check if buffer is empty (first frame initialization) or reset requested
    let bufferIsEmpty = (tex.r == 0.0 && tex.g == 0.0 && tex.b == 0.0 && tex.a == 0.0);
    let resetState = uniforms.data[3].z > 0.5;

    if (bufferIsEmpty || resetState) {
        // Initialize: A=1 everywhere, B=1 at sparse random locations
        a = 1.0;
        b = 0.0;
        if (hash(pos.xy + vec2<f32>(seed, seed)) > 0.99) {
            b = 1.0;
        }
        // Return initial state without running update step
        return vec4<f32>(a, b, 0.0, 1.0);
    }

    var color = lp(bufTex, pos.xy, texSize);

    var prevFrameCoord = pos.xy / texSize;
    prevFrameCoord.y = 1.0 - prevFrameCoord.y;

    let prevFrame = textureSampleLevel(inputTex, samp, prevFrameCoord, 0.0).rgb;

    let prevLum = lum(prevFrame);

    var f = uniforms.data[1].x * 0.001;
    var k = uniforms.data[1].y * 0.001;
    var r1 = uniforms.data[1].z * 0.01;
    var r2 = uniforms.data[1].w * 0.01;
    let s = uniforms.data[2].x * 0.01;
    let weight = uniforms.data[2].y * 0.01;
    let sourceF = i32(uniforms.data[2].z);
    let sourceK = i32(uniforms.data[2].w);
    let sourceR1 = i32(uniforms.data[3].x);
    let sourceR2 = i32(uniforms.data[3].y);

    if (sourceF > 0) {
        var val = prevLum;
        if (sourceF == 2) {
            val = 1.0 - prevLum;
        } else if (sourceF == 3) {
            val = prevFrame.r;
        } else if (sourceF == 4) {
            val = prevFrame.g;
        } else if (sourceF == 5) {
            val = prevFrame.b;
        }
        val = map(val, 0.0, 1.0, 0.01, 0.11);
        f = mix(f, val, weight);
    }

    if (sourceK > 0) {
        var val = prevLum;
        if (sourceK == 2) {
            val = 1.0 - prevLum;
        } else if (sourceK == 3) {
            val = prevFrame.r;
        } else if (sourceK == 4) {
            val = prevFrame.g;
        } else if (sourceK == 5) {
            val = prevFrame.b;
        }
        val = map(val, 0.0, 1.0, 0.045, 0.07);
        k = mix(k, val, weight);
    }

    if (sourceR1 > 0) {
        var val = prevLum;
        if (sourceR1 == 2) {
            val = 1.0 - prevLum;
        } else if (sourceR1 == 3) {
            val = prevFrame.r;
        } else if (sourceR1 == 4) {
            val = prevFrame.g;
        } else if (sourceR1 == 5) {
            val = prevFrame.b;
        }
        val = map(val, 0.0, 1.0, 0.5, 1.2);
        r1 = mix(r1, val, weight);
    }

    if (sourceR2 > 0) {
        var val = prevLum;
        if (sourceR2 == 2) {
            val = 1.0 - prevLum;
        } else if (sourceR2 == 3) {
            val = prevFrame.r;
        } else if (sourceR2 == 4) {
            val = prevFrame.g;
        } else if (sourceR2 == 5) {
            val = prevFrame.b;
        }
        val = map(val, 0.0, 1.0, 0.2, 0.5);
        r2 = mix(r2, val, weight);
    }

    let a2 = clamp(a + (r1 * color.r - a * b * b + f * (1.0 - a)) * s, 0.0, 1.0);
    let b2 = clamp(b + (r2 * color.g + a * b * b - (k + f) * b) * s, 0.0, 1.0);

    return vec4<f32>(a2, b2, 0.0, 1.0);
}

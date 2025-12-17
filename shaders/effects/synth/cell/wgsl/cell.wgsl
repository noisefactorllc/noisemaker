/*
 * WGSL cell noise shader (simplified - mono only).
 * Implements Worley distance evaluation with deterministic jitter identical to the GLSL path.
 * Metric selection maps to safe ranges so seeds produce seamless tiles.
 */

struct Uniforms {
    data : array<vec4<f32>, 4>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var tex : texture_2d<f32>;

const PI : f32 = 3.14159265359;
const TAU : f32 = 6.28318530718;

fn modulo(a: f32, b: f32) -> f32 {
    return a - b * floor(a / b);
}

fn map(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

// PCG PRNG - MIT License
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

fn prng(p0: vec3<f32>) -> vec3<f32> {
    var p = p0;
    if (p.x >= 0.0) { p.x = p.x * 2.0; } else { p.x = -p.x * 2.0 + 1.0; }
    if (p.y >= 0.0) { p.y = p.y * 2.0; } else { p.y = -p.y * 2.0 + 1.0; }
    if (p.z >= 0.0) { p.z = p.z * 2.0; } else { p.z = -p.z * 2.0 + 1.0; }
    let u = pcg(vec3<u32>(p));
    return vec3<f32>(u) / f32(0xffffffffu);
}

fn luminance(color: vec3<f32>) -> f32 {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

fn polarShape(st: vec2<f32>, sides: i32) -> f32 {
    let a = atan2(st.x, st.y) + PI;
    let r = TAU / f32(sides);
    return cos(floor(0.5 + a / r) * r - a) * length(st);
}

fn shape(st0: vec2<f32>, offset: vec2<f32>, kind: i32, scale: f32) -> f32 {
    var st = st0 + offset;
    var d = 1.0;
    if (kind == 0) {
        d = length(st * 1.2);
    } else if (kind == 2) {
        d = polarShape(st * 1.2, 6);
    } else if (kind == 3) {
        d = polarShape(st * 1.2, 8);
    } else if (kind == 4) {
        d = polarShape(st * 1.5, 4);
    } else if (kind == 6) {
        var st2 = st;
        st2.y = st2.y + 0.05;
        d = polarShape(st2 * 1.5, 3);
    }
    return d * scale;
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
    if (k == 0.0) { return min(a, b); }
    let h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
}

fn cells(st0: vec2<f32>, freq: f32, cellSize: f32, metric: i32, seed: f32, loopAmp: f32, cellVariation: f32, cellSmooth: f32, time: f32, aspect: f32) -> f32 {
    var st = st0;
    st = st - vec2<f32>(0.5 * aspect, 0.5);
    st = st * freq;
    st = st + vec2<f32>(0.5 * aspect, 0.5);
    st = st + prng(vec3<f32>(seed)).xy;

    var i = floor(st);
    var f = fract(st);

    var d = 1.0;
    for (var y: i32 = -2; y <= 2; y = y + 1) {
        for (var x: i32 = -2; x <= 2; x = x + 1) {
            let n = vec2<f32>(f32(x), f32(y));
            var wrap = i + n;
            var point = prng(vec3<f32>(wrap, seed)).xy;

            let r1 = prng(vec3<f32>(seed, wrap)) * 0.5 - vec3<f32>(0.25);
            let r2 = prng(vec3<f32>(wrap, seed)) * 2.0 - vec3<f32>(1.0);
            let speed = floor(loopAmp);
            point = point + vec2<f32>(
                sin(time * TAU * speed + r2.x) * r1.x,
                cos(time * TAU * speed + r2.y) * r1.y
            );

            let diff = n + point - f;
            var dist = shape(vec2<f32>(diff.x, -diff.y), vec2<f32>(0.0), metric, cellSize);
            if (metric == 1) {
                dist = abs(n.x + point.x - f.x) + abs(n.y + point.y - f.y);
                dist = dist * cellSize;
            }

            dist = dist + r1.z * (cellVariation * 0.01);
            d = smin(d, dist, cellSmooth * 0.01);
        }
    }
    return d;
}

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    let resolution = uniforms.data[0].xy;
    let time = uniforms.data[0].z;
    let seed = uniforms.data[0].w;

    let metric = i32(uniforms.data[1].x);
    var scale = uniforms.data[1].y;
    var cellScale = uniforms.data[1].z;
    let cellSmooth = uniforms.data[1].w;

    let cellVariation = uniforms.data[2].x;
    let loopAmp = uniforms.data[2].y;
    let texInfluence = i32(uniforms.data[2].z);
    let texIntensity = uniforms.data[2].w;

    let aspect = resolution.x / resolution.y;

    var color = vec4<f32>(0.0, 0.0, 1.0, 1.0);
    var st = pos.xy / resolution.y;

    var freq = map(scale, 1.0, 100.0, 20.0, 1.0);
    var cellSize = map(cellScale, 1.0, 100.0, 3.0, 0.75);

    var texLuminosity = 0.0;
    let texFactor = texIntensity * 0.01;
    var texCoord = pos.xy / resolution;
    texCoord.y = 1.0 - texCoord.y; // Flip renderer-supplied textures to align with screen space.

    if (texInfluence > 0) {
        let texRGB = textureSample(tex, samp, texCoord).rgb;

        texLuminosity = luminance(texRGB);

        if (texInfluence == 1) {
            cellSize = cellSize - texLuminosity * texFactor;
        } else if (texInfluence == 2) {
            freq = freq - texLuminosity * (texFactor * 5.0);
        }
    }

    var d = cells(st, freq, cellSize, metric, seed, loopAmp, cellVariation, cellSmooth, time, aspect);

    if (texInfluence >= 10) {
        if (texInfluence == 10) {
            d = d + texLuminosity * texFactor;
        } else if (texInfluence == 11) {
            d = mix(d, d / max(0.1, texLuminosity), texFactor);
        } else if (texInfluence == 12) {
            d = mix(d, min(d, texLuminosity), texFactor);
        } else if (texInfluence == 13) {
            d = mix(d, max(d, texLuminosity), texFactor);
        } else if (texInfluence == 14) {
            d = mix(d, modulo(d, max(0.1, texLuminosity)), texFactor);
        } else if (texInfluence == 15) {
            d = mix(d, d * texLuminosity, texFactor);
        } else if (texInfluence == 16) {
            d = d - texLuminosity * texFactor;
        }
    }

    // Mono output only
    color = vec4<f32>(vec3<f32>(d, d, d), color.a);

    var st2 = pos.xy / resolution;

    return color;
}

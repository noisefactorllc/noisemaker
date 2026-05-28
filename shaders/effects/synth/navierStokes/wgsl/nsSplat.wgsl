/*
 * WGSL Navier-Stokes external-force / source pass.
 * Mirrors glsl/nsSplat.glsl: seeds initial vortices on reset/first frame, applies input-driven
 * force and dye on subsequent frames. State is rgba16f so velocity is stored unencoded.
 */

struct Uniforms {
    // data[0] = (resolution.x, resolution.y, _, seed)
    // data[1] = (speed, inputForce, inputDye, resetState)
    data : array<vec4<f32>, 2>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var bufTex : texture_2d<f32>;
@group(0) @binding(3) var inputTex : texture_2d<f32>;

const NUM_INIT_VORTICES : i32 = 9;

fn hash11(x: f32) -> f32 {
    return fract(sin(x * 12.9898) * 43758.5453);
}

fn hash22(p: vec2<f32>) -> vec2<f32> {
    let q = vec2<f32>(dot(p, vec2<f32>(127.1, 311.7)), dot(p, vec2<f32>(269.5, 183.3)));
    return fract(sin(q) * 43758.5453);
}

fn lum(c: vec3<f32>) -> f32 {
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    let seedF = uniforms.data[0].w;
    let speed = uniforms.data[1].x;
    let inputForce = uniforms.data[1].y;
    let inputDye = uniforms.data[1].z;
    let resetState = uniforms.data[1].w > 0.5;

    let texSizeI = vec2<i32>(textureDimensions(bufTex, 0));
    let texSize = vec2<f32>(texSizeI);
    let fragCoord = pos.xy;
    let uv = fragCoord / texSize;

    // State is rgba16f — read with textureLoad on integer texel coords (sampler-filterable
    // float textures aren't guaranteed in WebGPU).
    let prev = textureLoad(bufTex, clamp(vec2<i32>(fragCoord), vec2<i32>(0), texSizeI - vec2<i32>(1)), 0);

    let bufferEmpty = (prev.a == 0.0);
    if (resetState || bufferEmpty) {
        var vel = vec2<f32>(0.0);
        var dye = 0.0;
        for (var i: i32 = 0; i < NUM_INIT_VORTICES; i = i + 1) {
            let idf = f32(i);
            let c = hash22(vec2<f32>(idf * 7.31 + 1.0, seedF * 13.7 + idf));
            var sign = -1.0;
            if (hash11(idf * 4.17 + seedF * 5.9) > 0.5) { sign = 1.0; }
            let radius = 0.10 + 0.06 * hash11(idf * 2.11 + seedF);

            let d = uv - c;
            let r2 = dot(d, d);
            let falloff = exp(-r2 / (2.0 * radius * radius));
            let tangent = vec2<f32>(-d.y, d.x);
            vel = vel + tangent * sign * falloff * 12.0;
            dye = dye + falloff;
        }
        return vec4<f32>(vel, clamp(dye, 0.0, 1.0), 1.0);
    }

    var vel = prev.rg;
    var dye = prev.b;

    let dt = clamp(speed, 0.0, 200.0) * 0.0001;

    let iForce = clamp(inputForce, 0.0, 100.0) * 0.01;
    let iDye = clamp(inputDye, 0.0, 100.0) * 0.01;
    if (iForce > 0.0 || iDye > 0.0) {
        let texel = vec2<f32>(1.0, 1.0) / texSize;
        let lc = lum(textureSampleLevel(inputTex, samp, uv, 0.0).rgb);
        let lr = lum(textureSampleLevel(inputTex, samp, uv + vec2<f32>(texel.x, 0.0), 0.0).rgb);
        let lu = lum(textureSampleLevel(inputTex, samp, uv + vec2<f32>(0.0, texel.y), 0.0).rgb);
        let grad = vec2<f32>(lr - lc, lu - lc);
        vel = vel + grad * iForce * 50.0;
        dye = dye + lc * iDye * dt * 60.0;
    }

    dye = clamp(dye, 0.0, 2.0);

    return vec4<f32>(vel, dye, 1.0);
}

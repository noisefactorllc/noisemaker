/*
 * WGSL Navier-Stokes advection pass (semi-Lagrangian).
 * Mirrors glsl/nsAdvect.glsl: canonical bilinear backtrace sample, decay applied. No kernel
 * choice here — smoothing lives in the dedicated nsSmooth pass between sim and display so the
 * compute canvas never receives blended pixels.
 */

struct Uniforms {
    // data[0] = (resolution.x, resolution.y, _, speed)
    // data[1] = (dyeDecay, velocityDecay, _, _)
    data : array<vec4<f32>, 2>,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var bufTex : texture_2d<f32>;

fn fetchTex(idx: vec2<i32>, minIdx: vec2<i32>, maxIdx: vec2<i32>) -> vec4<f32> {
    return textureLoad(bufTex, clamp(idx, minIdx, maxIdx), 0);
}

fn sampleBilinear(uv: vec2<f32>, texSize: vec2<i32>) -> vec4<f32> {
    let minIdx = vec2<i32>(0);
    let maxIdx = texSize - vec2<i32>(1);
    let texSizeF = vec2<f32>(texSize);
    let texelPos = uv * texSizeF - vec2<f32>(0.5);
    let baseI = vec2<i32>(floor(texelPos));
    let f = fract(texelPos);

    let v00 = fetchTex(baseI,                            minIdx, maxIdx);
    let v10 = fetchTex(baseI + vec2<i32>(1, 0),          minIdx, maxIdx);
    let v01 = fetchTex(baseI + vec2<i32>(0, 1),          minIdx, maxIdx);
    let v11 = fetchTex(baseI + vec2<i32>(1, 1),          minIdx, maxIdx);
    let v0 = mix(v00, v10, vec4<f32>(f.x));
    let v1 = mix(v01, v11, vec4<f32>(f.x));
    return mix(v0, v1, vec4<f32>(f.y));
}

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    let speed = uniforms.data[0].w;
    let dyeDecay = uniforms.data[1].x;
    let velocityDecay = uniforms.data[1].y;

    let texSize = vec2<i32>(textureDimensions(bufTex, 0));
    let texSizeF = vec2<f32>(texSize);
    let fragCoord = pos.xy;
    let uv = fragCoord / texSizeF;

    let here = textureLoad(bufTex, clamp(vec2<i32>(fragCoord), vec2<i32>(0), texSize - vec2<i32>(1)), 0);
    let u = here.rg;

    let dt = clamp(speed, 0.0, 200.0) * 0.0001;
    let backUv = clamp(uv - u * dt, vec2<f32>(0.0), vec2<f32>(1.0));

    let advected = sampleBilinear(backUv, texSize);
    var newVel = advected.rg;
    var newDye = advected.b;

    let vDecay = pow(clamp(velocityDecay, 0.0, 100.0) * 0.01, dt * 60.0);
    let dDecay = pow(clamp(dyeDecay, 0.0, 100.0) * 0.01, dt * 60.0);

    newVel = newVel * vDecay;
    newDye = newDye * dDecay;

    return vec4<f32>(newVel, newDye, 1.0);
}

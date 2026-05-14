/*
 * Sine wave distortion
 */

struct Uniforms {
    strength: f32,
    scale: f32,
    speed: i32,
    wrap: i32,
    rotation: f32,
    antialias: i32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;
@group(0) @binding(3) var<uniform> time: f32;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

fn rotate2D(st_in: vec2<f32>, rot: f32, aspectRatio: f32) -> vec2<f32> {
    var st = st_in;
    st.x = st.x * aspectRatio;
    let angle = rot * PI;
    st = st - vec2<f32>(0.5 * aspectRatio, 0.5);
    let c = cos(angle);
    let s = sin(angle);
    st = vec2<f32>(c * st.x - s * st.y, s * st.x + c * st.y);
    st = st + vec2<f32>(0.5 * aspectRatio, 0.5);
    st.x = st.x / aspectRatio;
    return st;
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let aspectRatio = texSize.x / texSize.y;
    var uv = pos.xy / texSize;

    let strength = uniforms.strength;
    let scale = uniforms.scale;
    let speed = uniforms.speed;
    let t = time;

    // Apply rotation before distortion
    uv = rotate2D(uv, uniforms.rotation / 180.0, aspectRatio);

    // Sine wave distortion
    uv.y = uv.y + sin(uv.x * scale * 10.0 + t * TAU * f32(speed)) * (strength * 0.01);

    // Apply wrap mode
    if (uniforms.wrap == 0) {
        // mirror
        uv = abs((uv % 2.0 + 2.0) % 2.0 - 1.0);
    } else if (uniforms.wrap == 1) {
        // repeat
        uv = (uv % 1.0 + 1.0) % 1.0;
    } else {
        // clamp
        uv = clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0));
    }

    // Reverse rotation after distortion
    uv = rotate2D(uv, -uniforms.rotation / 180.0, aspectRatio);

    if (uniforms.antialias != 0) {
        let dx = dpdx(uv);
        let dy = dpdy(uv);
        var col = vec4<f32>(0.0);
        col += textureSample(inputTex, inputSampler, uv + dx * -0.375 + dy * -0.125);
        col += textureSample(inputTex, inputSampler, uv + dx *  0.125 + dy * -0.375);
        col += textureSample(inputTex, inputSampler, uv + dx *  0.375 + dy *  0.125);
        col += textureSample(inputTex, inputSampler, uv + dx * -0.125 + dy *  0.375);
        return col * 0.25;
    } else {
        return textureSample(inputTex, inputSampler, uv);
    }
}

/*
 * Spiral distortion
 */

struct Uniforms {
    strength: f32,
    speed: i32,
    aspectLens: i32,
    wrap: i32,
    rotation: f32,
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
    let speed = uniforms.speed;
    let t = time;

    // Apply rotation before distortion
    uv = rotate2D(uv, uniforms.rotation / 180.0, aspectRatio);

    uv = uv - 0.5;

    if (uniforms.aspectLens != 0) {
        uv.x = uv.x * aspectRatio;
    }

    // Convert to polar coordinates
    let r = length(uv);
    var a = atan2(uv.y, uv.x);

    // Apply spiral distortion
    let spiralAmt = (strength * 0.05) * r;
    a = a + spiralAmt - (t * TAU * f32(speed) * sign(strength));

    // Convert back to cartesian coordinates
    uv = vec2<f32>(cos(a), sin(a)) * r;

    if (uniforms.aspectLens != 0) {
        uv.x = uv.x / aspectRatio;
    }

    uv = uv + 0.5;

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

    return textureSample(inputTex, inputSampler, uv);
}

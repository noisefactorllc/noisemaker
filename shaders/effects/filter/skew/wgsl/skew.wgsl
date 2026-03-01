/*
 * Skew and rotate transform
 */

struct Uniforms {
    skewAmt: f32,
    rotation: f32,
    wrap: f32,
    _pad0: f32,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u: Uniforms;

const PI: f32 = 3.14159265359;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    var st = pos.xy / texSize;
    let aspect = texSize.x / texSize.y;

    // Center, aspect-correct, rotate, skew, undo aspect, uncenter
    st = st - 0.5;
    st.x = st.x * aspect;

    let angle = u.rotation * PI / 180.0;
    let c = cos(angle);
    let s = sin(angle);
    st = vec2<f32>(c * st.x - s * st.y, s * st.x + c * st.y);

    st.x = st.x + st.y * -u.skewAmt;

    st.x = st.x / aspect;
    st = st + 0.5;

    // Wrap mode
    let wrapMode = i32(u.wrap);
    if (wrapMode == 0) {
        // clamp
        st = clamp(st, vec2<f32>(0.0), vec2<f32>(1.0));
    } else if (wrapMode == 1) {
        // mirror
        st = abs((st % 2.0 + 2.0) % 2.0 - 1.0);
    } else {
        // repeat
        st = (st % 1.0 + 1.0) % 1.0;
    }

    return textureSample(inputTex, inputSampler, st);
}

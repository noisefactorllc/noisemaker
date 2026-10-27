/*
 * Skew and rotate transform
 */

struct Uniforms {
    skewAmt: f32,
    rotation: f32,
    wrap: f32,
    _pad0: f32,
    tileOffset: vec2<f32>,
    fullResolution: vec2<f32>,
}

@group(0) @binding(0) var inputSampler: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u: Uniforms;

const PI: f32 = 3.14159265359;

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(inputTex));
    let resolution = texSize;

    // Compute global pixel coordinate and global UV
    let globalPixel = pos.xy + u.tileOffset;
    let globalUV = globalPixel / u.fullResolution;

    // Use full image aspect ratio for consistent transformation across tiles
    let aspect = u.fullResolution.x / u.fullResolution.y;

    // Center, aspect-correct, rotate, skew, undo aspect, uncenter (global UV space)
    var st = globalUV;
    st = st - 0.5;
    st.x = st.x * aspect;

    let angle = u.rotation * PI / 180.0;
    let c = cos(angle);
    let s = sin(angle);
    st = mat2x2<f32>(c, -s, s, c) * st;

    // Bound skew to prevent displacement beyond overlap region
    let maxSkew = 512.0 / u.fullResolution.y;
    let effectiveSkewAmt = clamp(u.skewAmt, -maxSkew, maxSkew);
    st.x = st.x + st.y * -effectiveSkewAmt;

    st.x = st.x / aspect;
    st = st + 0.5;

    // Convert from global UV to tile-local UV for sampling
    var localUV = (st * u.fullResolution - u.tileOffset) / resolution;

    // Wrap mode in local UV space
    let wrapMode = i32(u.wrap);
    if (wrapMode == 0) {
        // clamp
        localUV = clamp(localUV, vec2<f32>(0.0), vec2<f32>(1.0));
    } else if (wrapMode == 1) {
        // mirror
        localUV = abs((localUV + 1.0) - 2.0 * floor((localUV + 1.0) / 2.0) - 1.0);
    } else {
        // repeat
        localUV = fract(localUV);
    }

    return textureSample(inputTex, inputSampler, localUV);
}

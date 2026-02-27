/*
 * WGSL media input shader with motion blur support.
 * Mirrors the GLSL normalization and crop logic for camera feeds.
 */

struct Uniforms {
    data : array<vec4<f32>, 5>,
};
@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var imageTex : texture_2d<f32>;

var<private> resolution : vec2<f32>;
var<private> time : f32;
var<private> seed : f32;
var<private> posIndex : i32;
var<private> rotation : f32;
var<private> scaleAmt : f32;
var<private> offsetX : f32;
var<private> offsetY : f32;
var<private> tiling : i32;
var<private> flip : i32;
var<private> bgColor : vec3<f32>;
var<private> bgAlpha : f32;
var<private> imageSize : vec2<f32>;

const PI : f32 = 3.14159265359;
const TAU : f32 = 6.28318530718;

fn map(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn rotate2D(st: vec2<f32>) -> vec2<f32> {
    var st2 = st;
    let rot = map(rotation, -180.0, 180.0, 0.5, -0.5);
    let angle = rot * TAU * -1.0;

    let aspect = imageSize.x / imageSize.y;
    st2 = st2 - vec2<f32>(0.5 * aspect, 0.5);
    let c = cos(angle);
    let s = sin(angle);
    st2 = mat2x2<f32>(c, -s, s, c) * st2;
    st2 = st2 + vec2<f32>(0.5 * aspect, 0.5);
    return st2;
}

fn tile(st: vec2<f32>) -> vec2<f32> {
    if (tiling == 0) {
        return st;
    } else if (tiling == 1) {
        return fract(st);
    } else if (tiling == 2) {
        return vec2<f32>(fract(st.x), st.y);
    } else if (tiling == 3) {
        return vec2<f32>(st.x, fract(st.y));
    }
    return st;
}

fn getImage(pos: vec2<f32>) -> vec4<f32> {
    var st = pos / imageSize;
    st.y = 1.0 - st.y;

    var scale = 100.0 / scaleAmt;
    if (scale == 0.0) { scale = 1.0; }
    st = st * scale;

    if (posIndex == 0) {
        st.y = st.y + (resolution.y / imageSize.y * scale) - (scale - (1.0 / imageSize.y * scale));
    } else if (posIndex == 1) {
        st.x = st.x - (resolution.x / imageSize.x * scale * 0.5) + (0.5 - (1.0 / imageSize.x * scale));
        st.y = st.y + (resolution.y / imageSize.y * scale) - (scale - (1.0 / imageSize.y * scale));
    } else if (posIndex == 2) {
        st.x = st.x - (resolution.x / imageSize.x * scale) + (1.0 - (1.0 / imageSize.x * scale));
        st.y = st.y + (resolution.y / imageSize.y * scale) - (scale - (1.0 / imageSize.y * scale));
    } else if (posIndex == 3) {
        st.y = st.y + (resolution.y / imageSize.y * scale * 0.5) + (0.5 - (1.0 / imageSize.y * scale)) - scale;
    } else if (posIndex == 4) {
        st.x = st.x - (resolution.x / imageSize.x * scale * 0.5) + (0.5 - (1.0 / imageSize.x * scale));
        st.y = st.y + (resolution.y / imageSize.y * scale * 0.5) + (0.5 - (1.0 / imageSize.y * scale)) - scale;
    } else if (posIndex == 5) {
        st.x = st.x - (resolution.x / imageSize.x * scale) + (1.0 - (1.0 / imageSize.x * scale));
        st.y = st.y + (resolution.y / imageSize.y * scale * 0.5) + (0.5 - (1.0 / imageSize.y * scale)) - scale;
    } else if (posIndex == 6) {
        st.y = st.y + 1.0 - (scale - (1.0 / imageSize.y * scale));
    } else if (posIndex == 7) {
        st.x = st.x - (resolution.x / imageSize.x * scale * 0.5) + (0.5 - (1.0 / imageSize.x * scale));
        st.y = st.y + 1.0 - (scale - (1.0 / imageSize.y * scale));
    } else if (posIndex == 8) {
        st.x = st.x - (resolution.x / imageSize.x * scale) + (1.0 - (1.0 / imageSize.x * scale));
        st.y = st.y + 1.0 - (scale - (1.0 / imageSize.y * scale));
    }

    st.x = st.x - map(offsetX, -100.0, 100.0, -resolution.x / imageSize.x * scale, resolution.x / imageSize.x * scale) * 1.5;
    st.y = st.y - map(offsetY, -100.0, 100.0, -resolution.y / imageSize.y * scale, resolution.y / imageSize.y * scale) * 1.5;

    st.x = st.x * (imageSize.x / imageSize.y);
    st = rotate2D(st);
    st.x = st.x / (imageSize.x / imageSize.y);

    st = tile(st);

    st = st + 1.0 / imageSize;

    if (flip == 1) {
        st.x = 1.0 - st.x;
        st.y = 1.0 - st.y;
    } else if (flip == 2) {
        st.x = 1.0 - st.x;
    } else if (flip == 3) {
        st.y = 1.0 - st.y;
    } else if (flip == 11) {
        if (st.x > 0.5) { st.x = 1.0 - st.x; }
    } else if (flip == 12) {
        if (st.x < 0.5) { st.x = 1.0 - st.x; }
    } else if (flip == 13) {
        if (st.y > 0.5) { st.y = 1.0 - st.y; }
    } else if (flip == 14) {
        if (st.y < 0.5) { st.y = 1.0 - st.y; }
    } else if (flip == 15) {
        if (st.x > 0.5) { st.x = 1.0 - st.x; }
        if (st.y > 0.5) { st.y = 1.0 - st.y; }
    } else if (flip == 16) {
        if (st.x > 0.5) { st.x = 1.0 - st.x; }
        if (st.y < 0.5) { st.y = 1.0 - st.y; }
    } else if (flip == 17) {
        if (st.x < 0.5) { st.x = 1.0 - st.x; }
        if (st.y > 0.5) { st.y = 1.0 - st.y; }
    } else if (flip == 18) {
        if (st.x < 0.5) { st.x = 1.0 - st.x; }
        if (st.y < 0.5) { st.y = 1.0 - st.y; }
    }

    var text = textureSample(imageTex, samp, st);

    if (st.x < 0.0 || st.x > 1.0 || st.y < 0.0 || st.y > 1.0) {
        return vec4<f32>(bgColor, bgAlpha);
    }

    // Un-premultiply to compensate for linear filtering on straight-alpha textures
    // Linear filtering averages with black (0,0,0,0) transparent pixels, darkening edges
    // Dividing by alpha restores the original RGB values
    if (text.a > 0.0) {
        text = vec4<f32>(text.rgb / text.a, text.a);
    }

    return text;
}

@fragment
fn main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
    // Unpack uniforms from packed array
    resolution = uniforms.data[0].xy;
    time = uniforms.data[0].z;
    seed = uniforms.data[0].w;

    posIndex = i32(uniforms.data[1].x);
    rotation = uniforms.data[1].y;
    scaleAmt = uniforms.data[1].z;
    offsetX = uniforms.data[1].w;

    offsetY = uniforms.data[2].x;
    tiling = i32(uniforms.data[2].y);
    flip = i32(uniforms.data[2].z);
    bgAlpha = uniforms.data[2].w;

    bgColor = uniforms.data[3].xyz;

    imageSize = uniforms.data[4].xy;

    // Get current frame image
    return getImage(pos.xy);
}

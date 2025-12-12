/*
 * Media mixer shader (WGSL port).
 * Samples the configured media texture as a luminance mask for interpolating between two synth inputs.
 */

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var tex: texture_2d<f32>;
@group(0) @binding(3) var imageTex: texture_2d<f32>;
@group(0) @binding(4) var<uniform> u: Uniforms;

struct Uniforms {
    time: f32,
    deltaTime: f32,
    frame: i32,
    _pad0: f32,
    resolution: vec2f,
    aspect: f32,
    // Effect params in definition.js globals order:
    seed: i32,
    source: i32,
    mixDirection: i32,
    cutoff: f32,
    position: i32,
    tiling: i32,
    scaleAmt: f32,
    rotation: f32,
    offsetX: f32,
    offsetY: f32,
}

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

fn mapRange(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn rotate2D(st_in: vec2f, rot: f32, size: vec2f) -> vec2f {
    var st = st_in;
    let r = mapRange(rot, -180.0, 180.0, 0.5, -0.5);
    let angle = r * TAU * -1.0;
    let aspect = size.x / size.y;
    st -= vec2f(0.5 * aspect, 0.5);
    let c = cos(angle);
    let s = sin(angle);
    st = vec2f(c * st.x - s * st.y, s * st.x + c * st.y);
    st += vec2f(0.5 * aspect, 0.5);
    return st;
}

fn tile(st: vec2f) -> vec2f {
    if (u.tiling == 0) { return st; }
    else if (u.tiling == 1) { return fract(st); }
    else if (u.tiling == 2) { return vec2f(fract(st.x), st.y); }
    else if (u.tiling == 3) { return vec2f(st.x, fract(st.y)); }
    return st;
}

fn getImage(fragCoord: vec4f) -> vec4f {
    // Use resolution as image size since imageSize not in globals
    let size = u.resolution;
    var st = fragCoord.xy / size;
    st.x += 1.0 / u.resolution.x;
    st.y -= 1.0 / u.resolution.y;
    st.y = 1.0 - st.y;

    var scale = 100.0 / u.scaleAmt;
    if (scale == 0.0) { scale = 1.0; }
    st *= scale;

    if (u.position == 0) {
        st.y += (u.resolution.y / size.y * scale) - (scale - (1.0 / size.y * scale));
    } else if (u.position == 1) {
        st.x -= (u.resolution.x / size.x * scale * 0.5) - (0.5 - (1.0 / size.x * scale));
        st.y += (u.resolution.y / size.y * scale) - (scale - (1.0 / size.y * scale));
    } else if (u.position == 2) {
        st.x -= (u.resolution.x / size.x * scale) - (1.0 - (1.0 / size.x * scale));
        st.y += (u.resolution.y / size.y * scale) - (scale - (1.0 / size.y * scale));
    } else if (u.position == 3) {
        st.y += (u.resolution.y / size.y * scale * 0.5) + (0.5 - (1.0 / size.y * scale)) - scale;
    } else if (u.position == 4) {
        st.x -= (u.resolution.x / size.x * scale * 0.5) - (0.5 - (1.0 / size.x * scale));
        st.y += (u.resolution.y / size.y * scale * 0.5) + (0.5 - (1.0 / size.y * scale)) - scale;
    } else if (u.position == 5) {
        st.x -= (u.resolution.x / size.x * scale) - (1.0 - (1.0 / size.x * scale));
        st.y += (u.resolution.y / size.y * scale * 0.5) + (0.5 - (1.0 / size.y * scale)) - scale;
    } else if (u.position == 6) {
        st.y += 1.0 - (scale - (1.0 / size.y * scale));
    } else if (u.position == 7) {
        st.x -= (u.resolution.x / size.x * scale * 0.5) - (0.5 - (1.0 / size.x * scale));
        st.y += 1.0 - (scale - (1.0 / size.y * scale));
    } else if (u.position == 8) {
        st.x -= (u.resolution.x / size.x * scale) - (1.0 - (1.0 / size.x * scale));
        st.y += 1.0 - (scale - (1.0 / size.y * scale));
    }

    st.x -= mapRange(u.offsetX, -100.0, 100.0, -u.resolution.x / size.x * scale, u.resolution.x / size.x * scale) * 1.5;
    st.y -= mapRange(u.offsetY, -100.0, 100.0, -u.resolution.y / size.y * scale, u.resolution.y / size.y * scale) * 1.5;

    st.x *= size.x / size.y;
    st = rotate2D(st, u.rotation, size);
    st.x /= size.x / size.y;

    st = tile(st);
    let text = textureSample(imageTex, samp, st);

    if (st.x < 0.0 || st.x > 1.0 || st.y < 0.0 || st.y > 1.0) {
        return vec4f(0.0);
    }

    return text;
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    var st = fragCoord.xy / u.resolution;
    st.y = 1.0 - st.y;

    let color1 = textureSample(inputTex, samp, st);
    let color2 = textureSample(tex, samp, st);
    let mixer = getImage(fragCoord);

    let luminosity = (0.2126 * mixer.r + 0.7152 * mixer.g + 0.0722 * mixer.b) * (u.cutoff * 0.01);

    var color: vec4f;
    if (u.mixDirection == 0) {
        color = mix(color1, color2, luminosity);
    } else {
        color = mix(color2, color1, luminosity);
    }

    return color;
}

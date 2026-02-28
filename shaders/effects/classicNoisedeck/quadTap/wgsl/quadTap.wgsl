/*
 * WGSL Quad Tap shader.
 * Four-corner color gradient with animated hue shift.
 */

// Packed uniforms layout:
//   data[0]: resolution.xy, time, speed
//   data[1]: intensity, _pad, _pad, _pad
//   data[2]: color1
//   data[3]: color2
//   data[4]: color3
//   data[5]: color4
struct Uniforms {
    data: array<vec4<f32>, 6>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

var<private> resolution: vec2<f32>;
var<private> time: f32;
var<private> speed: f32;
var<private> intensity: f32;
var<private> color1: vec4<f32>;
var<private> color2: vec4<f32>;
var<private> color3: vec4<f32>;
var<private> color4: vec4<f32>;

fn unpackUniforms() {
    resolution = uniforms.data[0].xy;
    time = uniforms.data[0].z;
    speed = uniforms.data[0].w;
    intensity = uniforms.data[1].x;
    color1 = uniforms.data[2].xyzw;
    color2 = uniforms.data[3].xyzw;
    color3 = uniforms.data[4].xyzw;
    color4 = uniforms.data[5].xyzw;
}

const TAU: f32 = 6.28318530718;

fn modulo(a: f32, b: f32) -> f32 {
    return a - b * floor(a / b);
}

fn map(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn brightnessContrast(color: vec3<f32>) -> vec3<f32> {
    let bright: f32 = map(intensity, -100.0, 100.0, -0.4, 0.4);
    var cont: f32 = 1.0;
    if (intensity < 0.0) {
        cont = map(intensity, -100.0, 0.0, 0.5, 1.0);
    } else {
        cont = map(intensity, 0.0, 100.0, 1.0, 1.5);
    }

    return (color - 0.5) * cont + 0.5 + bright;
}

fn hsv2rgb(hsv: vec3<f32>) -> vec3<f32> {
    var h: f32 = fract(hsv.x);
    var s: f32 = hsv.y;
    var v: f32 = hsv.z;
    
    var c: f32 = v * s;
    var x: f32 = c * (1.0 - abs(modulo(h * 6.0, 2.0) - 1.0));
    var m: f32 = v - c;

    var rgb: vec3<f32>;

    if (0.0 <= h && h < 1.0/6.0) {
        rgb = vec3<f32>(c, x, 0.0);
    } else if (1.0/6.0 <= h && h < 2.0/6.0) {
        rgb = vec3<f32>(x, c, 0.0);
    } else if (2.0/6.0 <= h && h < 3.0/6.0) {
        rgb = vec3<f32>(0.0, c, x);
    } else if (3.0/6.0 <= h && h < 4.0/6.0) {
        rgb = vec3<f32>(0.0, x, c);
    } else if (4.0/6.0 <= h && h < 5.0/6.0) {
        rgb = vec3<f32>(x, 0.0, c);
    } else if (5.0/6.0 <= h && h < 1.0) {
        rgb = vec3<f32>(c, 0.0, x);
    } else {
        rgb = vec3<f32>(0.0, 0.0, 0.0);
    }

    return rgb + vec3<f32>(m, m, m);
}

fn rgb2hsv(rgb: vec3<f32>) -> vec3<f32> {
    var r: f32 = rgb.r;
    var g: f32 = rgb.g;
    var b: f32 = rgb.b;
    
    var maxc: f32 = max(r, max(g, b));
    var minc: f32 = min(r, min(g, b));
    var delta: f32 = maxc - minc;

    var h: f32 = 0.0;
    if (delta != 0.0) {
        if (maxc == r) {
            h = modulo((g - b) / delta, 6.0) / 6.0;
        } else if (maxc == g) {
            h = ((b - r) / delta + 2.0) / 6.0;
        } else if (maxc == b) {
            h = ((r - g) / delta + 4.0) / 6.0;
        }
    }

    var s: f32 = select(delta / maxc, 0.0, maxc == 0.0);
    var v: f32 = maxc;

    return vec3<f32>(h, s, v);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    unpackUniforms();

    var color: vec4<f32> = vec4<f32>(0.0, 0.0, 1.0, 1.0);
    var st: vec2<f32> = pos.xy / resolution.y;
    st -= vec2<f32>(resolution.x / resolution.y * 0.5, 0.5);

    // Shift to 0-1 range for gradient
    st += vec2<f32>(resolution.x / resolution.y * 0.5, 0.5);
    
    var animSpeed: f32 = speed * 0.02;
    var x0: vec3<f32> = vec3<f32>(1.0);
    var x1: vec3<f32> = vec3<f32>(1.0);

    var c1: vec3<f32> = rgb2hsv(color1.rgb);
    var c2: vec3<f32> = rgb2hsv(color2.rgb);
    var c3: vec3<f32> = rgb2hsv(color3.rgb);
    var c4: vec3<f32> = rgb2hsv(color4.rgb);

    c1[0] += (sin(time * TAU * animSpeed) + 1.0) * 0.05;
    c2[0] += (sin((0.25 - time) * TAU * animSpeed) + 1.0) * 0.05;
    c3[0] += (sin((0.5 - time) * TAU * animSpeed) + 1.0) * 0.05;
    c4[0] += (sin((0.75 + time) * TAU * animSpeed) + 1.0) * 0.05;

    c1 = hsv2rgb(c1);
    c2 = hsv2rgb(c2);
    c3 = hsv2rgb(c3);
    c4 = hsv2rgb(c4);

    x0 = mix(c1, c2, st.x);
    x1 = mix(c3, c4, st.x);

    color = vec4<f32>(mix(x0, x1, 1.0 - st.y), 1.0);
    color = vec4<f32>(brightnessContrast(color.rgb), 1.0);

    return color;
}

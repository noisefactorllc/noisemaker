/*
 * Prismatic aberration effect.
 * Ported from classicNoisedeck/lensDistortion.
 */

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;

struct Uniforms {
    time: f32,
    deltaTime: f32,
    frame: i32,
    _pad0: f32,
    resolution: vec2f,
    aspect: f32,
    aberrationAmt: f32,
    modulate: i32,
    hueRotation: f32,
    hueRange: f32,
    saturation: f32,
    passthru: f32,
}

@group(0) @binding(2) var<uniform> u: Uniforms;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

// Floored modulo (matches GLSL mod behavior for negative values)
fn floorMod(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
}

fn mapVal(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn hsv2rgb(hsv: vec3f) -> vec3f {
    let h = fract(hsv.x);
    let s = hsv.y;
    let v = hsv.z;
    
    let c = v * s;
    let x = c * (1.0 - abs((h * 6.0) % 2.0 - 1.0));
    let m = v - c;

    var rgb: vec3f;

    if (h < 1.0/6.0) {
        rgb = vec3f(c, x, 0.0);
    } else if (h < 2.0/6.0) {
        rgb = vec3f(x, c, 0.0);
    } else if (h < 3.0/6.0) {
        rgb = vec3f(0.0, c, x);
    } else if (h < 4.0/6.0) {
        rgb = vec3f(0.0, x, c);
    } else if (h < 5.0/6.0) {
        rgb = vec3f(x, 0.0, c);
    } else {
        rgb = vec3f(c, 0.0, x);
    }

    return rgb + vec3f(m, m, m);
}

fn rgb2hsv(rgb: vec3f) -> vec3f {
    let r = rgb.r;
    let g = rgb.g;
    let b = rgb.b;
    
    let maxC = max(r, max(g, b));
    let minC = min(r, min(g, b));
    let delta = maxC - minC;

    var h: f32 = 0.0;
    if (delta != 0.0) {
        if (maxC == r) {
            h = floorMod((g - b) / delta, 6.0) / 6.0;
        } else if (maxC == g) {
            h = ((b - r) / delta + 2.0) / 6.0;
        } else {
            h = ((r - g) / delta + 4.0) / 6.0;
        }
    }
    if (h < 0.0) { h = h + 1.0; }
    
    var s: f32 = 0.0;
    if (maxC != 0.0) {
        s = delta / maxC;
    }
    let v = maxC;

    return vec3f(h, s, v);
}

fn saturateColor(color: vec3f) -> vec3f {
    let sat = mapVal(u.saturation, -100.0, 100.0, -1.0, 1.0);
    let avg = (color.r + color.g + color.b) / 3.0;
    return color - (avg - color) * sat;
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let aspectRatio = u.resolution.x / u.resolution.y;
    var uv = fragCoord.xy / u.resolution;
    uv.y = 1.0 - uv.y;

    var color = vec4f(0.0, 0.0, 0.0, 1.0);

    let diff = vec2f(0.5 * aspectRatio, 0.5) - vec2f(uv.x * aspectRatio, uv.y);
    let centerDist = length(diff);

    // No distortion/zoom
    let lensedCoords = uv;

    let aberrationOffset = mapVal(u.aberrationAmt, 0.0, 100.0, 0.0, 0.05) * centerDist * PI * 0.5;

    let redOffset = mix(clamp(lensedCoords.x + aberrationOffset, 0.0, 1.0), lensedCoords.x, lensedCoords.x);
    let red = textureSample(inputTex, samp, vec2f(redOffset, lensedCoords.y));

    let green = textureSample(inputTex, samp, lensedCoords);

    let blueOffset = mix(lensedCoords.x, clamp(lensedCoords.x - aberrationOffset, 0.0, 1.0), lensedCoords.x);
    let blue = textureSample(inputTex, samp, vec2f(blueOffset, lensedCoords.y));

    // from aberration
    var hsv = vec3f(1.0);

    var t: f32 = 0.0;
    if (u.modulate != 0) {
        t = u.time;
    }

    // prismatic - get edges
    color = vec4f(vec3f(length(vec4f(red.r, green.g, blue.b, color.a) - green)) * green.rgb, green.a);

    // boost hue range of edges
    hsv = rgb2hsv(color.rgb);
    hsv = vec3f(fract(((hsv.x + 0.125 + (1.0 - (u.hueRotation / 360.0))) * (2.0 + u.hueRange * 0.05)) + t), 1.0, hsv.z);

    // desaturate original
    var greenMod = saturateColor(green.rgb) * mapVal(u.passthru, 0.0, 100.0, 0.0, 2.0);

    // recombine (add)
    color = vec4f(min(greenMod + hsv2rgb(hsv), vec3f(1.0)), color.a);

    return color;
}

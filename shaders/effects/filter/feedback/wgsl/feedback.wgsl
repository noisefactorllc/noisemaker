/*
 * Feedback post-processing shader (WGSL).
 * Offers blend modes alongside hue, distortion, and brightness controls for the accumulated feedback buffer.
 */

struct Uniforms {
    resolution: vec2<f32>,
    time: f32,
    seed: i32,
    scaleAmt: f32,
    rotation: f32,
    blendMode: i32,
    mixAmt: f32,
    hueRotation: f32,
    intensity: f32,
    distortion: f32,
    aberrationAmt: f32,
    refractAAmt: f32,
    refractBAmt: f32,
    refractADir: f32,
    refractBDir: f32,
    resetState: i32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var inputTex: texture_2d<f32>;
@group(0) @binding(3) var selfTex: texture_2d<f32>;

const PI: f32 = 3.14159265359;

// Floored modulo (matches GLSL mod behavior for negative values)
fn floorMod(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
}
const TAU: f32 = 6.28318530718;

fn map(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

fn blendOverlay(a: f32, b: f32) -> f32 {
    if (a < 0.5) {
        return 2.0 * a * b;
    } else {
        return 1.0 - 2.0 * (1.0 - a) * (1.0 - b);
    }
}

fn blendSoftLight(base: f32, blend: f32) -> f32 {
    if (blend < 0.5) {
        return 2.0 * base * blend + base * base * (1.0 - 2.0 * blend);
    } else {
        return sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend);
    }
}

fn blend(color1: vec4<f32>, color2: vec4<f32>, mode: i32, factor: f32) -> vec4<f32> {
    var middle: vec4<f32>;
    let amt = map(uniforms.mixAmt, 0.0, 100.0, 0.0, 1.0);

    switch (mode) {
        case 0: { // add
            middle = min(color1 + color2, vec4<f32>(1.0));
        }
        case 2: { // color burn
            if (all(color2 == vec4<f32>(0.0))) {
                middle = color2;
            } else {
                middle = max(1.0 - ((1.0 - color1) / color2), vec4<f32>(0.0));
            }
        }
        case 3: { // color dodge
            if (all(color2 == vec4<f32>(1.0))) {
                middle = color2;
            } else {
                middle = min(color1 / (1.0 - color2), vec4<f32>(1.0));
            }
        }
        case 4: { // darken
            middle = min(color1, color2);
        }
        case 5: { // difference
            middle = abs(color1 - color2);
            middle.a = max(color1.a, color2.a);
        }
        case 6: { // exclusion
            middle = color1 + color2 - 2.0 * color1 * color2;
            middle.a = max(color1.a, color2.a);
        }
        case 7: { // glow
            if (all(color2 == vec4<f32>(1.0))) {
                middle = color2;
            } else {
                middle = min(color1 * color1 / (1.0 - color2), vec4<f32>(1.0));
            }
        }
        case 8: { // hard light
            middle = vec4<f32>(
                blendOverlay(color2.r, color1.r),
                blendOverlay(color2.g, color1.g),
                blendOverlay(color2.b, color1.b),
                mix(color1.a, color2.a, 0.5)
            );
        }
        case 9: { // lighten
            middle = max(color1, color2);
        }
        case 10: { // mix
            middle = mix(color1, color2, 0.5);
        }
        case 11: { // multiply
            middle = color1 * color2;
        }
        case 12: { // negation
            middle = vec4<f32>(1.0) - abs(vec4<f32>(1.0) - color1 - color2);
            middle.a = max(color1.a, color2.a);
        }
        case 13: { // overlay
            middle = vec4<f32>(
                blendOverlay(color1.r, color2.r),
                blendOverlay(color1.g, color2.g),
                blendOverlay(color1.b, color2.b),
                mix(color1.a, color2.a, 0.5)
            );
        }
        case 14: { // phoenix
            middle = min(color1, color2) - max(color1, color2) + vec4<f32>(1.0);
        }
        case 15: { // reflect
            if (all(color1 == vec4<f32>(1.0))) {
                middle = color1;
            } else {
                middle = min(color2 * color2 / (1.0 - color1), vec4<f32>(1.0));
            }
        }
        case 16: { // screen
            middle = 1.0 - ((1.0 - color1) * (1.0 - color2));
        }
        case 17: { // soft light
            middle = vec4<f32>(
                blendSoftLight(color1.r, color2.r),
                blendSoftLight(color1.g, color2.g),
                blendSoftLight(color1.b, color2.b),
                mix(color1.a, color2.a, 0.5)
            );
        }
        case 18: { // subtract
            middle = max(color1 + color2 - 1.0, vec4<f32>(0.0));
        }
        default: {
            middle = mix(color1, color2, 0.5);
        }
    }

    var color: vec4<f32>;
    if (factor == 0.5) {
        color = middle;
    } else if (factor < 0.5) {
        let f = map(amt, 0.0, 0.5, 0.0, 1.0);
        color = mix(color1, middle, f);
    } else {
        let f = map(amt, 0.5, 1.0, 0.0, 1.0);
        color = mix(middle, color2, f);
    }

    return color;
}

fn brightnessContrast(color: vec3<f32>) -> vec3<f32> {
    let bright = map(uniforms.intensity * 0.1, -100.0, 100.0, -0.5, 0.5);
    let cont = map(uniforms.intensity * 0.1, -100.0, 100.0, 0.5, 1.5);
    return (color - 0.5) * cont + 0.5 + bright;
}

fn rotate2D(st_in: vec2<f32>, rot: f32) -> vec2<f32> {
    let aspectRatio = uniforms.resolution.x / uniforms.resolution.y;
    var st = st_in;
    st.x *= aspectRatio;
    let rotNorm = map(rot, 0.0, 360.0, 0.0, 2.0);
    let angle = rotNorm * PI;
    st -= vec2<f32>(0.5 * aspectRatio, 0.5);
    let c = cos(angle);
    let s = sin(angle);
    st = vec2<f32>(c * st.x - s * st.y, s * st.x + c * st.y);
    st += vec2<f32>(0.5 * aspectRatio, 0.5);
    st.x /= aspectRatio;
    return st;
}

fn hsv2rgb(hsv: vec3<f32>) -> vec3<f32> {
    let h = fract(hsv.x);
    let s = hsv.y;
    let v = hsv.z;
    
    let c = v * s;
    let x = c * (1.0 - abs((h * 6.0) % 2.0 - 1.0));
    let m = v - c;

    var rgb: vec3<f32>;
    if (h < 1.0/6.0) {
        rgb = vec3<f32>(c, x, 0.0);
    } else if (h < 2.0/6.0) {
        rgb = vec3<f32>(x, c, 0.0);
    } else if (h < 3.0/6.0) {
        rgb = vec3<f32>(0.0, c, x);
    } else if (h < 4.0/6.0) {
        rgb = vec3<f32>(0.0, x, c);
    } else if (h < 5.0/6.0) {
        rgb = vec3<f32>(x, 0.0, c);
    } else {
        rgb = vec3<f32>(c, 0.0, x);
    }

    return rgb + vec3<f32>(m);
}

fn rgb2hsv(rgb: vec3<f32>) -> vec3<f32> {
    let maxC = max(rgb.r, max(rgb.g, rgb.b));
    let minC = min(rgb.r, min(rgb.g, rgb.b));
    let delta = maxC - minC;

    var h = 0.0;
    if (delta != 0.0) {
        if (maxC == rgb.r) {
            h = floorMod((rgb.g - rgb.b) / delta, 6.0) / 6.0;
        } else if (maxC == rgb.g) {
            h = ((rgb.b - rgb.r) / delta + 2.0) / 6.0;
        } else {
            h = ((rgb.r - rgb.g) / delta + 4.0) / 6.0;
        }
    }
    
    let s = select(delta / maxC, 0.0, maxC == 0.0);
    let v = maxC;

    return vec3<f32>(h, s, v);
}

fn getImage(st_in: vec2<f32>) -> vec4<f32> {
    var st = rotate2D(st_in, uniforms.rotation);

    // aberration and lensing
    let diff = vec2<f32>(0.5) - st;
    let centerDist = length(diff);

    var distort = 0.0;
    var zoom = 0.0;
    if (uniforms.distortion < 0.0) {
        distort = map(uniforms.distortion, -100.0, 0.0, -2.0, 0.0);
        zoom = map(uniforms.distortion, -100.0, 0.0, 0.04, 0.0);
    } else {
        distort = map(uniforms.distortion, 0.0, 100.0, 0.0, 2.0);
        zoom = map(uniforms.distortion, 0.0, 100.0, 0.0, -1.0);
    }

    st = (st - diff * zoom) - diff * centerDist * centerDist * distort;

    // scale
    var scale = 100.0 / uniforms.scaleAmt;
    if (scale == 0.0) {
        scale = 1.0;
    }
    st *= scale;
    
    // center
    st.x -= (scale * 0.5) - (0.5 - (1.0 / uniforms.resolution.x * scale));
    st.y += (scale * 0.5) + (0.5 - (1.0 / uniforms.resolution.y * scale)) - (scale);

    // nudge
    st += 1.0 / uniforms.resolution;

    // tile
    st = fract(st);

    // chromatic aberration
    let aberrationOffset = map(uniforms.aberrationAmt, 0.0, 100.0, 0.0, 0.1) * centerDist * PI * 0.5;

    // Sample selfTex directly - no Y flip needed in WGSL since input.uv
    // coordinate space already matches texture storage orientation

    let redOffset = mix(clamp(st.x + aberrationOffset, 0.0, 1.0), st.x, st.x);
    let red = textureSample(selfTex, texSampler, vec2<f32>(redOffset, st.y));

    let green = textureSample(selfTex, texSampler, st);

    let blueOffset = mix(st.x, clamp(st.x - aberrationOffset, 0.0, 1.0), st.x);
    let blue = textureSample(selfTex, texSampler, vec2<f32>(blueOffset, st.y));

    var tex = vec4<f32>(red.r, green.g, blue.b, 1.0);
    tex = vec4<f32>(tex.rgb * tex.a, tex.a);
    
    return tex;
}

fn cloak(st: vec2<f32>) -> vec4<f32> {
    let m = map(uniforms.mixAmt, 0.0, 100.0, 0.0, 1.0);
    let ra = map(uniforms.refractAAmt, 0.0, 100.0, 0.0, 0.125);
    let rb = map(uniforms.refractBAmt, 0.0, 100.0, 0.0, 0.125);

    let leftColor = textureSample(inputTex, texSampler, st);
    let rightColor = textureSample(selfTex, texSampler, st);

    var leftUV = st;
    let rightLen = length(rightColor.rgb);
    leftUV.x += cos(rightLen * TAU) * ra;
    leftUV.y += sin(rightLen * TAU) * ra;
    let leftRefracted = textureSample(inputTex, texSampler, fract(leftUV));

    var rightUV = st;
    let leftLen = length(leftColor.rgb);
    rightUV.x += cos(leftLen * TAU) * rb;
    rightUV.y += sin(leftLen * TAU) * rb;
    let rightRefracted = textureSample(selfTex, texSampler, fract(rightUV));

    let leftReflected = min(rightRefracted * rightColor / (1.0 - leftRefracted * leftColor), vec4<f32>(1.0));
    let rightReflected = min(leftRefracted * leftColor / (1.0 - rightRefracted * rightColor), vec4<f32>(1.0));

    var left: vec4<f32>;
    var right: vec4<f32>;
    if (uniforms.mixAmt < 50.0) {
        left = mix(leftRefracted, leftReflected, map(uniforms.mixAmt, 0.0, 50.0, 0.0, 1.0));
        right = rightReflected;
    } else {
        left = leftReflected;
        right = mix(rightReflected, rightRefracted, map(uniforms.mixAmt, 50.0, 100.0, 0.0, 1.0));
    }

    return mix(left, right, m);
}

@fragment
fn main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = pos.xy / uniforms.resolution;
    
    // If resetState is true, bypass feedback and return input directly
    if (uniforms.resetState != 0) {
        return textureSample(inputTex, texSampler, uv);
    }

    var color: vec4<f32>;

    if (uniforms.blendMode == 100) {
        color = cloak(uv);
    } else {
        let ra = map(uniforms.refractAAmt, 0.0, 100.0, 0.0, 0.125);
        let rb = map(uniforms.refractBAmt, 0.0, 100.0, 0.0, 0.125);

        let leftColor = textureSample(inputTex, texSampler, uv);
        let rightColor = textureSample(selfTex, texSampler, uv);

        var leftUV = uv;
        let rightLen = length(rightColor.rgb) + uniforms.refractADir / 360.0;
        leftUV.x += cos(rightLen * TAU) * ra;
        leftUV.y += sin(rightLen * TAU) * ra;

        var rightUV = uv;
        let leftLen = length(leftColor.rgb) + uniforms.refractBDir / 360.0;
        rightUV.x += cos(leftLen * TAU) * rb;
        rightUV.y += sin(leftLen * TAU) * rb;

        color = blend(textureSample(inputTex, texSampler, leftUV), getImage(rightUV), uniforms.blendMode, uniforms.mixAmt * 0.01);
    }

    // hue rotation
    var hsv = rgb2hsv(color.rgb);
    hsv.x = fract(hsv.x + map(uniforms.hueRotation, -180.0, 180.0, -0.05, 0.05));
    color = vec4<f32>(hsv2rgb(hsv), color.a);

    // brightness/contrast
    color = vec4<f32>(brightnessContrast(color.rgb), color.a);

    return color;
}

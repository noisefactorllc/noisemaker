/*
 * Lens distortion shader.
 * Applies barrel, pincushion, and chromatic aberration warps using calibrated coefficients.
 * Strength controls are normalized so the warp stays invertible even under automation.
 */

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;

// Uniform struct ordered to match runtime uniform packing:
// 1. globalUniforms: time, deltaTime, frame, resolution, aspect
// 2. pass.uniforms in definition globals order
struct Uniforms {
    time: f32,           // global
    deltaTime: f32,      // global
    frame: i32,          // global
    _pad0: f32,          // padding for alignment before vec2
    resolution: vec2f,   // global (8-byte aligned)
    aspect: f32,         // global
    // effect params from definition order:
    shape: i32,
    distortion: f32,
    loopScale: f32,
    speed: f32,
    aspectLens: i32,
    mode: i32,
    aberration: f32,
    blendMode: i32,
    modulate: i32,
    _pad1: f32,          // padding before vec4
    _pad2: f32,
    _pad3: f32,
    tint: vec4f,         // 16-byte aligned
    alpha: f32,
    hueRotation: f32,
    hueRange: f32,
    saturation: f32,
    passthru: f32,
    vignetteAmt: f32,
}

@group(0) @binding(2) var<uniform> u: Uniforms;

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

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
            h = ((g - b) / delta) % 6.0 / 6.0;
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

fn _distance(diff: vec2f, uv: vec2f) -> f32 {
    let aspectRatio = u.resolution.x / u.resolution.y;
    let uvx = uv.x * aspectRatio;
    var dist: f32 = 1.0;

    if (u.shape == 0) {
        // Euclidean
        dist = length(diff);
    } else if (u.shape == 1) {
        // Manhattan
        dist = abs(uvx - 0.5 * aspectRatio) + abs(uv.y - 0.5);
    } else if (u.shape == 2) {
        // hexagon
        dist = max(max(abs(diff.x) - diff.y * -0.5, -1.0 * diff.y), max(abs(diff.x) - diff.y * 0.5, 1.0 * diff.y));
    } else if (u.shape == 3) {
        // octagon
        dist = max((abs(uvx - 0.5 * aspectRatio) + abs(uv.y - 0.5)) / sqrt(2.0), max(abs(uvx - 0.5 * aspectRatio), abs(uv.y - 0.5)));
    } else if (u.shape == 4) {
        // Chebychev
        dist = max(abs(uvx - 0.5 * aspectRatio), abs(uv.y - 0.5));
    } else if (u.shape == 6) {
        // Triangle
        dist = max(abs(diff.x) - diff.y * -0.5, -1.0 * diff.y);
    } else if (u.shape == 10) {
        // Cosine
        dist = 1.0 - length(vec2f((cos(diff.x * TAU) + 1.0) * 0.5, (cos(diff.y * TAU) + 1.0) * 0.5));
    }

    let lf = mapVal(u.loopScale, 1.0, 100.0, 6.0, 1.0);

    var t: f32 = 1.0;
    if (u.speed < 0.0) {
        t = dist * lf + u.time;
    } else {
        t = dist * lf - u.time;
    }
    return mix(dist,
               (sin(t * TAU) + 1.0 * 0.5) * abs(u.speed) * 0.005,
               abs(u.speed) * 0.01);
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let aspectRatio = u.resolution.x / u.resolution.y;
    var uv = fragCoord.xy / u.resolution;

    var color = vec4f(0.0, 0.0, 0.0, 1.0);

    var diff = vec2f(0.5) - uv;
    if (u.aspectLens != 0) {
        diff = vec2f(0.5 * aspectRatio, 0.5) - vec2f(uv.x * aspectRatio, uv.y);
    }
    let centerDist = _distance(diff, uv);

    var distort: f32 = 0.0;
    var zoom: f32 = 1.0;
    if (u.distortion < 0.0) {
        distort = mapVal(u.distortion, -100.0, 0.0, -2.0, 0.0);
        zoom = mapVal(u.distortion, -100.0, 0.0, 0.04, 0.0);
    } else {
        distort = mapVal(u.distortion, 0.0, 100.0, 0.0, 2.0);
        zoom = mapVal(u.distortion, 0.0, 100.0, 0.0, -1.0);
    }

    // aberration and lensing
    let lensedCoords = fract((uv - diff * zoom) - diff * centerDist * centerDist * distort);

    let aberrationOffset = mapVal(u.aberration, 0.0, 100.0, 0.0, 0.05) * centerDist * PI * 0.5;

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

    if (u.mode == 0) {
        // chromatic
        color = vec4f(red.r, green.g, blue.b, color.a) - green;
        color = vec4f(color.rgb, green.a);

        // tweak hue of edges
        hsv = rgb2hsv(color.rgb);
        hsv = vec3f(fract(hsv.x + (1.0 - (u.hueRotation / 360.0)) + hsv.x * u.hueRange * 0.01 + t), 1.0, hsv.z);
    } else {
        // prismatic
        // get edges
        color = vec4f(vec3f(length(vec4f(red.r, green.g, blue.b, color.a) - green)) * green.rgb, green.a);

        // boost hue range of edges
        hsv = rgb2hsv(color.rgb);
        hsv = vec3f(fract(((hsv.x + 0.125 + (1.0 - (u.hueRotation / 360.0))) * (2.0 + u.hueRange * 0.05)) + t), 1.0, hsv.z);
    }

    // desaturate original
    var greenMod = saturateColor(green.rgb) * mapVal(u.passthru, 0.0, 100.0, 0.0, 2.0);

    // recombine
    if (u.blendMode == 0) {
        // add
        color = vec4f(min(greenMod + hsv2rgb(hsv), vec3f(1.0)), color.a);
    } else if (u.blendMode == 1) {
        // alpha
        color = vec4f(min(max(greenMod - vec3f(hsv.z), vec3f(0.0)) + hsv2rgb(hsv), vec3f(1.0)), color.a);
    }
    // end aberration

    // apply tint (this was the "reflect" mode from blendo)
    var tintResult: vec3f;
    if (all(color.rgb == vec3f(1.0))) {
        tintResult = color.rgb;
    } else {
        tintResult = min(u.tint.rgb * u.tint.rgb / (vec3f(1.0) - color.rgb), vec3f(1.0));
    }
    color = vec4f(mix(color.rgb, tintResult, u.alpha * 0.01), max(color.a, u.alpha * 0.01));

    // vignette
    if (u.vignetteAmt < 0.0) {
        let vigFactor = 1.0 - pow(length(vec2f(0.5) - uv) * 1.125, 2.0);
        color = vec4f(
            mix(color.rgb * vigFactor, color.rgb, mapVal(u.vignetteAmt, -100.0, 0.0, 0.0, 1.0)),
            max(color.a, length(vec2f(0.5) - uv) * mapVal(u.vignetteAmt, -100.0, 0.0, 1.0, 0.0))
        );
    } else {
        let vigFactor = 1.0 - pow(length(vec2f(0.5) - uv) * 1.125, 2.0);
        color = vec4f(
            mix(color.rgb, vec3f(1.0) - (vec3f(1.0) - color.rgb * vigFactor), mapVal(u.vignetteAmt, 0.0, 100.0, 0.0, 1.0)),
            max(color.a, length(vec2f(0.5) - uv) * mapVal(u.vignetteAmt, -100.0, 0.0, 1.0, 0.0))
        );
    }

    return color;
}

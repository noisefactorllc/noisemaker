/*
 * General effects shader (WGSL port).
 * Provides color inversion, emboss, edge, blur, and other effects.
 */

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u: Uniforms;

struct Uniforms {
    time: f32,
    deltaTime: f32,
    frame: i32,
    _pad0: f32,
    resolution: vec2f,
    aspect: f32,
    // Effect params in definition.js globals order:
    seed: i32,
    effect: i32,
    effectAmt: f32,
    flip: i32,
    scaleAmt: f32,
    rotation: f32,
    offsetX: f32,
    offsetY: f32,
    intensity: f32,
    saturation: f32,
}

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

fn aspectRatio() -> f32 {
    return u.resolution.x / u.resolution.y;
}

fn mapRange(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
    return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}

// PCG PRNG
fn pcg(v_in: vec3u) -> vec3u {
    var v = v_in * 1664525u + 1013904223u;
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    v ^= v >> vec3u(16u);
    v.x += v.y * v.z;
    v.y += v.z * v.x;
    v.z += v.x * v.y;
    return v;
}

fn prng(p: vec3f) -> vec3f {
    return vec3f(pcg(vec3u(p))) / f32(0xffffffffu);
}

fn random(p: vec2f) -> f32 {
    let p2 = vec3f(p, 0.0);
    return f32(pcg(vec3u(p2)).x) / f32(0xffffffffu);
}

fn rotate2D(st_in: vec2f, rot: f32) -> vec2f {
    var st = st_in;
    st.x *= aspectRatio();
    let r = mapRange(rot, 0.0, 360.0, 0.0, 2.0);
    let angle = r * PI;
    st -= vec2f(0.5 * aspectRatio(), 0.5);
    let c = cos(angle);
    let s = sin(angle);
    st = vec2f(c * st.x - s * st.y, s * st.x + c * st.y);
    st += vec2f(0.5 * aspectRatio(), 0.5);
    st.x /= aspectRatio();
    return st;
}

fn brightnessContrast(color: vec3f) -> vec3f {
    let bright = mapRange(u.intensity, -100.0, 100.0, -0.4, 0.4);
    var cont = 1.0;
    if (u.intensity < 0.0) {
        cont = mapRange(u.intensity, -100.0, 0.0, 0.5, 1.0);
    } else {
        cont = mapRange(u.intensity, 0.0, 100.0, 1.0, 1.5);
    }
    return (color - 0.5) * cont + 0.5 + bright;
}

fn saturateFn(color: vec3f) -> vec3f {
    let sat = mapRange(u.saturation, -100.0, 100.0, -1.0, 1.0);
    let avg = (color.r + color.g + color.b) / 3.0;
    return color - (avg - color) * sat;
}

fn hsv2rgb(hsv: vec3f) -> vec3f {
    let h = fract(hsv.x);
    let s = hsv.y;
    let v = hsv.z;
    let c = v * s;
    let x = c * (1.0 - abs(fract(h * 6.0) * 2.0 - 1.0));
    let m = v - c;
    var rgb: vec3f;
    if (h < 1.0/6.0) { rgb = vec3f(c, x, 0.0); }
    else if (h < 2.0/6.0) { rgb = vec3f(x, c, 0.0); }
    else if (h < 3.0/6.0) { rgb = vec3f(0.0, c, x); }
    else if (h < 4.0/6.0) { rgb = vec3f(0.0, x, c); }
    else if (h < 5.0/6.0) { rgb = vec3f(x, 0.0, c); }
    else { rgb = vec3f(c, 0.0, x); }
    return rgb + vec3f(m);
}

fn rgb2hsv(rgb: vec3f) -> vec3f {
    let maxC = max(rgb.r, max(rgb.g, rgb.b));
    let minC = min(rgb.r, min(rgb.g, rgb.b));
    let delta = maxC - minC;
    var h = 0.0;
    if (delta != 0.0) {
        if (maxC == rgb.r) { h = ((rgb.g - rgb.b) / delta) % 6.0 / 6.0; }
        else if (maxC == rgb.g) { h = ((rgb.b - rgb.r) / delta + 2.0) / 6.0; }
        else { h = ((rgb.r - rgb.g) / delta + 4.0) / 6.0; }
    }
    let s = select(0.0, delta / maxC, maxC != 0.0);
    return vec3f(h, s, maxC);
}

fn posterize(color: vec3f, levIn: f32) -> vec3f {
    var lev = levIn;
    if (lev == 0.0) { return color; }
    else if (lev == 1.0) { return step(vec3f(0.5), color); }
    let gamma = 0.65;
    var c = pow(color, vec3f(gamma));
    c = floor(c * lev) / lev;
    return pow(c, vec3f(1.0 / gamma));
}

fn pixellate(uv_in: vec2f, sizeIn: f32) -> vec3f {
    var size = sizeIn;
    if (size < 1.0) { return textureSample(inputTex, samp, uv_in).rgb; }
    size *= 4.0;
    let dx = size / u.resolution.x;
    let dy = size / u.resolution.y;
    var uv = uv_in - 0.5;
    let coord = vec2f(dx * floor(uv.x / dx), dy * floor(uv.y / dy)) + 0.5;
    return textureSample(inputTex, samp, coord).rgb;
}

fn desaturate(color: vec3f) -> vec3f {
    let avg = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    return vec3f(avg);
}

fn convolve(uv: vec2f, kernel: array<f32, 9>, divide: bool) -> vec3f {
    let steps = 1.0 / u.resolution;
    let offsets = array<vec2f, 9>(
        vec2f(-steps.x, -steps.y), vec2f(0.0, -steps.y), vec2f(steps.x, -steps.y),
        vec2f(-steps.x, 0.0), vec2f(0.0, 0.0), vec2f(steps.x, 0.0),
        vec2f(-steps.x, steps.y), vec2f(0.0, steps.y), vec2f(steps.x, steps.y)
    );
    var kernelWeight = 0.0;
    var conv = vec3f(0.0);
    for (var i = 0; i < 9; i++) {
        let color = textureSample(inputTex, samp, uv + offsets[i] * u.effectAmt).rgb;
        conv += color * kernel[i];
        kernelWeight += kernel[i];
    }
    if (divide && kernelWeight != 0.0) { conv /= kernelWeight; }
    return clamp(conv, vec3f(0.0), vec3f(1.0));
}

fn derivatives(color: vec3f, uv: vec2f, divide: bool) -> vec3f {
    let deriv_x = array<f32, 9>(0.0, 0.0, 0.0, 0.0, 1.0, -1.0, 0.0, 0.0, 0.0);
    let deriv_y = array<f32, 9>(0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, -1.0, 0.0);
    let s1 = convolve(uv, deriv_x, divide);
    let s2 = convolve(uv, deriv_y, divide);
    return color * distance(s1, s2);
}

fn sobel(color: vec3f, uv: vec2f) -> vec3f {
    let sobel_x = array<f32, 9>(1.0, 0.0, -1.0, 2.0, 0.0, -2.0, 1.0, 0.0, -1.0);
    let sobel_y = array<f32, 9>(1.0, 2.0, 1.0, 0.0, 0.0, 0.0, -1.0, -2.0, -1.0);
    let s1 = convolve(uv, sobel_x, false);
    let s2 = convolve(uv, sobel_y, false);
    return color * distance(s1, s2);
}

fn outline(color: vec3f, uv: vec2f) -> vec3f {
    let sobel_x = array<f32, 9>(1.0, 0.0, -1.0, 2.0, 0.0, -2.0, 1.0, 0.0, -1.0);
    let sobel_y = array<f32, 9>(1.0, 2.0, 1.0, 0.0, 0.0, 0.0, -1.0, -2.0, -1.0);
    let s1 = convolve(uv, sobel_x, false);
    let s2 = convolve(uv, sobel_y, false);
    return max(color - distance(s1, s2), vec3f(0.0));
}

fn shadow(color_in: vec3f, uv: vec2f) -> vec3f {
    let sobel_x = array<f32, 9>(1.0, 0.0, -1.0, 2.0, 0.0, -2.0, 1.0, 0.0, -1.0);
    let sobel_y = array<f32, 9>(1.0, 2.0, 1.0, 0.0, 0.0, 0.0, -1.0, -2.0, -1.0);
    var color = rgb2hsv(color_in);
    let x = convolve(uv, sobel_x, false);
    let y = convolve(uv, sobel_y, false);
    let shade_dist = distance(x, y);
    let highlight = shade_dist * shade_dist;
    let shade = (1.0 - ((1.0 - color.z) * (1.0 - highlight))) * shade_dist;
    color = vec3f(color.x, color.y, mix(color.z, shade, 0.75));
    return hsv2rgb(color);
}

fn convolution(kernel: i32, color: vec3f, uv: vec2f) -> vec3f {
    let emboss = array<f32, 9>(-2.0, -1.0, 0.0, -1.0, 1.0, 1.0, 0.0, 1.0, 2.0);
    let sharpen = array<f32, 9>(-1.0, 0.0, -1.0, 0.0, 5.0, 0.0, -1.0, 0.0, -1.0);
    let blur = array<f32, 9>(1.0, 2.0, 1.0, 2.0, 4.0, 2.0, 1.0, 2.0, 1.0);
    let edge2 = array<f32, 9>(-1.0, 0.0, -1.0, 0.0, 4.0, 0.0, -1.0, 0.0, -1.0);
    let edge3 = array<f32, 9>(-0.875, -0.75, -0.875, -0.75, 5.0, -0.75, -0.875, -0.75, -0.875);
    let sharpenBlur = array<f32, 9>(-2.0, 2.0, -2.0, 2.0, 1.0, 2.0, -2.0, 2.0, -2.0);

    if (kernel == 0) { return color; }
    else if (kernel == 1) { return convolve(uv, blur, true); }
    else if (kernel == 2) { return derivatives(color, uv, true); }
    else if (kernel == 120) { return clamp(derivatives(color, uv, false) * 2.5, vec3f(0.0), vec3f(1.0)); }
    else if (kernel == 3) { return color * convolve(uv, edge2, true); }
    else if (kernel == 4) { return convolve(uv, emboss, false); }
    else if (kernel == 5) { return outline(color, uv); }
    else if (kernel == 6) { return shadow(color, uv); }
    else if (kernel == 7) { return convolve(uv, sharpen, false); }
    else if (kernel == 8) { return sobel(color, uv); }
    else if (kernel == 9) { return max(color, convolve(uv, edge2, true)); }
    else if (kernel == 300) { return convolve(uv, sharpenBlur, true); }
    else if (kernel == 301) { return convolve(uv, edge3, true); }
    return color;
}

fn cga(color: vec4f, st: vec2f) -> vec3f {
    let amt = mapRange(u.effectAmt, 0.0, 20.0, 0.0, 5.0);
    if (amt < 0.01) { return color.rgb; }
    let pixelDensity = amt;
    let size = 2.0 * pixelDensity;
    let dSize = 2.0 * size;
    let amount = u.resolution.x / size;
    var d = 1.0 / amount;
    let ar = u.resolution.x / u.resolution.y;
    let sx = floor(st.x / d) * d;
    d = ar / amount;
    let sy = floor(st.y / d) * d;
    let base = textureSample(inputTex, samp, vec2f(sx, sy));
    let lum = 0.2126 * base.r + 0.7152 * base.g + 0.0722 * base.b;
    let o = floor(6.0 * lum);
    let black = vec3f(0.0);
    let light = vec3f(85.0, 255.0, 255.0) / 255.0;
    let dark = vec3f(254.0, 84.0, 255.0) / 255.0;
    let white = vec3f(1.0);
    var c1 = black;
    var c2 = black;
    if (o == 0.0) { c1 = black; c2 = black; }
    else if (o == 1.0) { c1 = black; c2 = dark; }
    else if (o == 2.0) { c1 = dark; c2 = dark; }
    else if (o == 3.0) { c1 = dark; c2 = light; }
    else if (o == 4.0) { c1 = light; c2 = light; }
    else if (o == 5.0) { c1 = light; c2 = white; }
    else { c1 = white; c2 = white; }
    let fx = st.x * u.resolution.x;
    let fy = st.y * u.resolution.y;
    var result = c1;
    if ((fx % dSize) > size) {
        if ((fy % dSize) > size) { result = c1; } else { result = c2; }
    } else {
        if ((fy % dSize) > size) { result = c2; } else { result = c1; }
    }
    return result;
}

fn subpixel(st: vec2f, scaleIn: f32) -> vec3f {
    let scale = mapRange(scaleIn, 0.0, 100.0, 0.0, 10.0);
    let orig = pixellate(st, scale);
    var color = orig;
    let coord = floor(st * u.resolution);
    let m = coord.x % (4.0 * scale);
    if ((coord.y % (4.0 * scale)) <= scale) {
        color *= vec3f(0.0);
    } else if (m <= scale) {
        color *= vec3f(1.0, 0.0, 0.0);
    } else if (m <= 2.0 * scale) {
        color *= vec3f(0.0, 1.0, 0.0);
    } else if (m <= 3.0 * scale) {
        color *= vec3f(0.0, 0.0, 1.0);
    } else {
        color *= vec3f(0.0);
    }
    let factor = clamp(scale * 0.25, 0.0, 1.0);
    return mix(orig, color, factor);
}

fn bloom(st: vec2f) -> vec3f {
    var sum = vec3f(0.0);
    let orig = textureSample(inputTex, samp, st).rgb;
    let strength = mapRange(u.effectAmt, 0.0, 20.0, 0.0, 0.25);
    for (var i = -4; i < 4; i++) {
        for (var j = -3; j < 3; j++) {
            sum += textureSample(inputTex, samp, st + vec2f(f32(j), f32(i)) * 0.004).rgb * strength;
        }
    }
    var color: vec3f;
    if (orig.r < 0.3) { color = sum * sum * 0.012 + orig; }
    else if (orig.r < 0.5) { color = sum * sum * 0.009 + orig; }
    else { color = sum * sum * 0.0075 + orig; }
    return clamp(color, vec3f(0.0), vec3f(1.0));
}

fn zoomBlur(st: vec2f) -> vec3f {
    var color = vec3f(0.0);
    var total = 0.0;
    let toCenter = st - 0.5;
    let offset = prng(vec3f(12.9898, 78.233, 151.7182)).x;
    for (var t = 0.0; t <= 40.0; t += 1.0) {
        let percent = (t + offset) / 40.0;
        let weight = 4.0 * (percent - percent * percent);
        let strength = mapRange(u.effectAmt, 0.0, 20.0, 0.0, 1.0);
        let tex = textureSample(inputTex, samp, st + toCenter * percent * strength);
        color += tex.rgb * weight;
        total += weight;
    }
    return color / total;
}

fn periodicFunction(p: f32) -> f32 {
    return mapRange(sin(p * TAU), -1.0, 1.0, 0.0, 1.0);
}

fn offsets(st: vec2f) -> f32 {
    return distance(st, vec2f(0.5));
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    var uv = fragCoord.xy / u.resolution;

    var scale = 100.0 / u.scaleAmt;
    if (scale == 0.0) { scale = 1.0; }

    uv = rotate2D(uv, u.rotation);
    uv -= 0.5;
    uv *= scale;
    uv += 0.5;

    let imageSize = u.resolution;
    uv.x -= ceil((u.resolution.x / imageSize.x * scale * 0.5) - (0.5 - (1.0 / imageSize.x * scale)));
    uv.y += ceil((u.resolution.y / imageSize.y * scale * 0.5) + (0.5 - (1.0 / imageSize.y * scale)) - scale);
    uv.x -= mapRange(u.offsetX, -100.0, 100.0, -u.resolution.x / imageSize.x * scale, u.resolution.x / imageSize.x * scale) * 1.5;
    uv.y -= mapRange(u.offsetY, -100.0, 100.0, -u.resolution.y / imageSize.y * scale, u.resolution.y / imageSize.y * scale) * 1.5;
    uv = fract(uv);

    // flip/mirror
    if (u.flip == 1) { uv = 1.0 - uv; }
    else if (u.flip == 2) { uv.x = 1.0 - uv.x; }
    else if (u.flip == 3) { uv.y = 1.0 - uv.y; }
    else if (u.flip == 11) { if (uv.x > 0.5) { uv.x = 1.0 - uv.x; } }
    else if (u.flip == 12) { if (uv.x < 0.5) { uv.x = 1.0 - uv.x; } }
    else if (u.flip == 13) { if (uv.y > 0.5) { uv.y = 1.0 - uv.y; } }
    else if (u.flip == 14) { if (uv.y < 0.5) { uv.y = 1.0 - uv.y; } }
    else if (u.flip == 15) { if (uv.x > 0.5) { uv.x = 1.0 - uv.x; } if (uv.y > 0.5) { uv.y = 1.0 - uv.y; } }
    else if (u.flip == 16) { if (uv.x > 0.5) { uv.x = 1.0 - uv.x; } if (uv.y < 0.5) { uv.y = 1.0 - uv.y; } }
    else if (u.flip == 17) { if (uv.x < 0.5) { uv.x = 1.0 - uv.x; } if (uv.y > 0.5) { uv.y = 1.0 - uv.y; } }
    else if (u.flip == 18) { if (uv.x < 0.5) { uv.x = 1.0 - uv.x; } if (uv.y < 0.5) { uv.y = 1.0 - uv.y; } }

    var color = textureSample(inputTex, samp, uv);

    if (u.effectAmt != 0.0 && u.effect != 0) {
        if (u.effect == 100) { color = vec4f(pixellate(uv, u.effectAmt), color.a); }
        else if (u.effect == 110) { color = vec4f(posterize(color.rgb, u.effectAmt), color.a); }
        else if (u.effect == 200) { color = vec4f(cga(color, uv), color.a); }
        else if (u.effect == 210) { color = vec4f(subpixel(uv, u.effectAmt), color.a); }
        else if (u.effect == 220) { color = vec4f(bloom(uv), color.a); }
        else if (u.effect == 230) { color = vec4f(zoomBlur(uv), color.a); }
        else { color = vec4f(convolution(u.effect, color.rgb, uv), color.a); }
    }

    var c = brightnessContrast(color.rgb);
    c = saturateFn(c);

    return vec4f(c, color.a);
}
